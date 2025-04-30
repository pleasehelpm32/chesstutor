// src/server.ts
import express, { Request, Response, RequestHandler } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import OpenAI from "openai";
import { Chess } from "chess.js";
import { subDays } from "date-fns"; // Import date-fns for easy date calculation

dotenv.config();

// --- OpenAI Client Initialization ---
if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "!!! WARNING: OPENAI_API_KEY environment variable not set. /api/explain endpoint will not work. !!!"
  );
}
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
// --- End OpenAI Client Initialization ---

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 3001;

// --- Stockfish Engine Setup ---
const stockfishPath =
  process.env.STOCKFISH_PATH || path.join(__dirname, "../bin/stockfish");

let engineProcess: ChildProcessWithoutNullStreams | null = null;
let isEngineReady = false;
let stdoutBuffer = "";

function initializeStockfish() {
  if (engineProcess) {
    // console.log("Stockfish process already exists."); // Keep console clean
    return;
  }
  isEngineReady = false;
  stdoutBuffer = "";
  try {
    console.log(`Attempting to spawn Stockfish from: ${stockfishPath}`);
    engineProcess = spawn(stockfishPath);

    engineProcess.on("error", (err) => {
      console.error("!!! Failed to spawn Stockfish process !!!", err.message);
      engineProcess = null;
      isEngineReady = false;
    });

    engineProcess.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdoutBuffer += chunk;
      let newlineIndex;
      while ((newlineIndex = stdoutBuffer.indexOf("\n")) >= 0) {
        const line = stdoutBuffer.substring(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.substring(newlineIndex + 1);
        if (line) {
          if (line === "uciok") {
            console.log("Stockfish UCI OK.");
            sendCommand("isready");
          } else if (line === "readyok") {
            console.log("Stockfish engine ready.");
            isEngineReady = true;
          }
        }
      }
    });

    engineProcess.stderr.on("data", (data: Buffer) => {
      console.error(`Stockfish stderr: ${data.toString().trim()}`);
    });

    engineProcess.on("close", (code) => {
      console.log(`Stockfish process exited with code ${code}`);
      engineProcess = null;
      isEngineReady = false;
    });

    if (engineProcess) {
      sendCommand("uci");
      console.log("Stockfish process spawned, waiting for uciok/readyok...");
    }
  } catch (error) {
    console.error("!!! Exception during Stockfish initialization !!!", error);
    engineProcess = null;
    isEngineReady = false;
  }
}

function sendCommand(command: string) {
  if (engineProcess?.stdin?.writable) {
    engineProcess.stdin.write(command + "\n");
  } else {
    console.error(
      `Cannot send command "${command}": Stockfish process stdin not writable or process not running.`
    );
    if (!engineProcess) {
      console.log("Attempting to re-initialize Stockfish...");
      initializeStockfish();
    }
  }
}

initializeStockfish();
// --- End Stockfish Setup ---
const allowedOrigins = [
  "http://localhost:5173", // Your local frontend dev URL (Vite default)
  "https://chesslearnings.netlify.app/", // Your deployed frontend URL
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
  })
);
app.use(express.json());
// --- API Routes ---

app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/test-db", async (req: Request, res: Response) => {
  try {
    const count = await prisma.analysis.count();
    res.json({ status: "db ok", analysis_count: count });
  } catch (error) {
    console.error("Database test failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ status: "db error", error: message });
  }
});

const ANALYSIS_DEPTH = 5;
const ANALYSIS_TIMEOUT_MS = 15000;

// --- Analyze Endpoint (with Checkmate Detection) ---
app.post("/api/analyze", (async (req: Request, res: Response) => {
  const { fen } = req.body;

  if (!engineProcess || !isEngineReady) {
    console.warn("Analysis request received but engine not ready.");
    return res
      .status(503)
      .json({ error: "Stockfish engine not ready or not running." });
  }

  if (!fen || typeof fen !== "string") {
    return res.status(400).json({ error: "Invalid FEN string provided." });
  }

  console.log(`Received analysis request for FEN: ${fen}`);

  try {
    // --- Modified runStockfishAnalysis ---
    const runStockfishAnalysis = (
      currentFen: string
    ): Promise<{ move: string; isCheckmate: boolean }[]> => {
      // <-- Changed return type
      return new Promise((resolve, reject) => {
        if (!engineProcess || !isEngineReady) {
          return reject(new Error("Stockfish process not ready or available."));
        }

        let analysisOutput = "";
        const topMovesInfo: {
          pvIndex: number;
          move: string;
          score: number | string;
        }[] = [];
        let analysisTimer: NodeJS.Timeout | null = null;

        const cleanup = () => {
          if (analysisTimer) clearTimeout(analysisTimer);
          engineProcess?.stdout.removeListener("data", dataHandler);
        };

        const dataHandler = (data: Buffer) => {
          analysisOutput += data.toString();
          const lines = analysisOutput.split("\n");
          analysisOutput = lines.pop() || "";

          for (const line of lines) {
            if (!line) continue;
            if (line.startsWith("info depth") && line.includes(" multipv ")) {
              const matchPv = line.match(/multipv (\d+)/);
              const matchMove = line.match(/ pv (.+?)(?= score|$)/);
              const matchCp = line.match(/score cp (-?\d+)/);
              const matchMate = line.match(/score mate (-?\d+)/);
              if (matchPv && matchMove) {
                const pvIndex = parseInt(matchPv[1], 10);
                const move = matchMove[1].trim().split(" ")[0];
                let score: number | string = "N/A";
                if (matchCp) score = parseInt(matchCp[1], 10);
                else if (matchMate) score = `M${matchMate[1]}`;
                const existingIndex = topMovesInfo.findIndex(
                  (m) => m.pvIndex === pvIndex
                );
                if (existingIndex !== -1)
                  topMovesInfo[existingIndex] = { pvIndex, move, score };
                else topMovesInfo.push({ pvIndex, move, score });
              }
            } else if (line.startsWith("bestmove")) {
              cleanup();
              const bestMove = line.split(" ")[1];
              topMovesInfo.sort((a, b) => a.pvIndex - b.pvIndex);
              const uniqueMovesStrings: string[] = []; // <-- Get unique move strings first
              const seenMoves = new Set();
              for (const moveInfo of topMovesInfo) {
                if (
                  !seenMoves.has(moveInfo.move) &&
                  uniqueMovesStrings.length < 3
                ) {
                  uniqueMovesStrings.push(moveInfo.move);
                  seenMoves.add(moveInfo.move);
                }
              }
              if (
                bestMove !== "(none)" &&
                !seenMoves.has(bestMove) &&
                uniqueMovesStrings.length < 3
              ) {
                uniqueMovesStrings.push(bestMove);
              }

              // --- Check for Checkmate using Chess.js ---
              let game: Chess | null = null;
              try {
                game = new Chess(currentFen); // Load position
              } catch (e) {
                console.error(
                  `Invalid FEN for checkmate check: ${currentFen}`,
                  e
                );
                // Resolve with moves marked as not checkmate if FEN is invalid
                resolve(
                  uniqueMovesStrings.map((move) => ({
                    move,
                    isCheckmate: false,
                  }))
                );
                return;
              }

              const movesWithCheckmateInfo = uniqueMovesStrings.map((move) => {
                let isCheckmate = false;
                try {
                  // Use a temporary game instance for each move check if undo is complex
                  const tempGame = new Chess(currentFen);
                  const moveResult = tempGame.move(move);
                  if (moveResult && tempGame.isCheckmate()) {
                    isCheckmate = true;
                  }
                  // No need to undo on tempGame
                } catch (e) {
                  console.warn(
                    `Could not validate move ${move} for checkmate check: ${
                      e instanceof Error ? e.message : e
                    }`
                  );
                }
                return { move, isCheckmate };
              });
              // --- End Checkmate Check ---

              console.log(
                `Analysis complete. Moves with checkmate info:`,
                movesWithCheckmateInfo
              );
              resolve(movesWithCheckmateInfo); // <-- Resolve with array of objects
              return;
            }
          }
        };

        analysisTimer = setTimeout(() => {
          console.error(`Stockfish analysis timed out for FEN: ${currentFen}`);
          cleanup();
          sendCommand("stop");
          reject(new Error("Stockfish analysis timed out."));
        }, ANALYSIS_TIMEOUT_MS);

        engineProcess.stdout.on("data", dataHandler);
        sendCommand("ucinewgame");
        sendCommand(`position fen ${currentFen}`);
        sendCommand("setoption name MultiPV value 3");
        sendCommand(`go depth ${ANALYSIS_DEPTH}`);
      });
    };
    // --- End Modified runStockfishAnalysis ---

    // Execute the analysis
    const topMovesAnalysis = await runStockfishAnalysis(fen); // <-- Get array of objects
    res.json({ topMoves: topMovesAnalysis }); // <-- Send array of objects
  } catch (error) {
    console.error(`Stockfish analysis failed for FEN: ${fen}`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Analysis failed.", details: message });
  }
}) as RequestHandler);
// --- End Analyze Endpoint ---

// --- Explain Endpoint (with Caching) ---
const EXPLAIN_ANALYSIS_DEPTH = 5; // MUST match ANALYSIS_DEPTH
const CACHE_DURATION_DAYS = 7;

app.post("/api/explain", (async (req: Request, res: Response) => {
  // Expect 'topMoves' array of objects: { move: string, isCheckmate: boolean }
  const { fen, topMoves } = req.body;

  // --- Input Validation ---
  if (!fen || typeof fen !== "string") {
    return res.status(400).json({ error: "Missing or invalid FEN string." });
  }
  if (
    !Array.isArray(topMoves) ||
    topMoves.length === 0 ||
    topMoves.some(
      (m) =>
        typeof m !== "object" ||
        typeof m.move !== "string" ||
        typeof m.isCheckmate !== "boolean"
    )
  ) {
    return res
      .status(400)
      .json({ error: "Missing or invalid top moves analysis data." });
  }
  const movesToExplain = topMoves.slice(0, 3);
  // --- End Validation ---

  // --- Cache Lookup ---
  const cacheCutoffDate = subDays(new Date(), CACHE_DURATION_DAYS); // Calculate date 7 days ago

  try {
    console.log(
      `Checking cache for FEN: ${fen} at depth ${EXPLAIN_ANALYSIS_DEPTH}`
    );
    const cachedAnalysis = await prisma.analysis.findFirst({
      where: {
        fen: fen,
        depth: EXPLAIN_ANALYSIS_DEPTH,
        createdAt: {
          gte: cacheCutoffDate, // Check if created within the last 7 days
        },
        llm_explanation: {
          // Ensure explanation exists
          not: null,
        },
      },
      orderBy: {
        createdAt: "desc", // Get the most recent entry if multiple somehow exist
      },
    });

    if (cachedAnalysis && cachedAnalysis.llm_explanation) {
      console.log(`Cache HIT for FEN: ${fen}`);
      // Return cached explanation
      return res.json({
        explanation: cachedAnalysis.llm_explanation,
        cacheHit: true,
      });
    } else {
      console.log(`Cache MISS for FEN: ${fen}`);
    }
  } catch (error) {
    console.error("Database cache lookup failed:", error);
    // Proceed without cache, but log the error
  }
  // --- End Cache Lookup ---

  if (!openai.apiKey) {
    console.error("Explain request failed: OpenAI API key not configured.");
    return res
      .status(500)
      .json({ error: "OpenAI API key not configured on server." });
  }

  console.log(`OpenAI call for FEN: ${fen}, Moves data:`, movesToExplain);

  // Find if there's a checkmating move
  const checkmatingMove = movesToExplain.find((m) => m.isCheckmate);

  // --- Construct Conditional Prompt ---
  let prompt = "";
  const moveListForPrompt = movesToExplain
    .map(
      (m, index) =>
        `${index + 1}. ${m.move}${m.isCheckmate ? " (Checkmate!)" : ""}`
    )
    .join("\n");

  if (checkmatingMove) {
    // --- Prompt for when CHECKMATE is found ---
    const otherMoves = movesToExplain.filter((m) => !m.isCheckmate);
    let otherMovesExplanation = "";
    if (otherMoves.length > 0) {
      otherMovesExplanation = `\n*   **Other options (${otherMoves
        .map((m) => m.move)
        .join(
          ", "
        )}):** Briefly explain the idea behind these moves (1 sentence each), but state clearly they are inferior because they don't deliver the immediate win.`;
    }

    prompt = `You are an expert and friendly chess tutor explaining a critical game-winning move to a beginner student.

Analyze the following chess position given in FEN notation:
${fen}

Stockfish identifies the following top moves:
${moveListForPrompt}

**CRITICAL ACTION REQUIRED: The move ${checkmatingMove.move} delivers CHECKMATE and wins the game immediately!** This is the most important move by far.

Please explain the moves like this:
*   **${checkmatingMove.move} (CHECKMATE):** **Emphasize that this move delivers checkmate and instantly wins.** Explain *how* it checkmates (e.g., "attacks the king which has no escape squares and cannot be blocked or captured"). Make this explanation the primary focus.${otherMovesExplanation}

Prioritize explaining the checkmate clearly and urgently.`;
  } else {
    // --- Prompt for when NO checkmate is found ---
    const moveExamples = movesToExplain
      .map(
        (m) =>
          `*   **${m.move}:** [Explanation focusing on the key idea for ${m.move}]`
      )
      .join("\n");

    prompt = `You are an expert and friendly chess tutor explaining Stockfish's top move suggestions to a beginner student.

Analyze the following chess position given in FEN notation:
${fen}

Stockfish identifies the following top moves as strong options (none are immediate checkmate):
${moveListForPrompt}

For **each** of these moves, briefly explain (1-2 sentences) the main strategic or tactical idea behind it, using simple terms. Consider concepts like center control, piece development, threats, king safety, and pawn structure where relevant.

Please format your response clearly, addressing each move separately, like this example:
${moveExamples}

Keep the explanations concise and focused on the most important immediate benefit for a beginner to understand for each move.`;
  }
  // --- End Prompt Construction ---

  try {
    console.log("Sending request to OpenAI...");
    const maxTokens = checkmatingMove ? 200 : 250; // Adjust tokens based on prompt type
    const temperature = checkmatingMove ? 0.4 : 0.5; // Adjust temp based on prompt type

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Or "gpt-4o-mini" etc.
      messages: [{ role: "user", content: prompt }],
      temperature: temperature,
      max_tokens: maxTokens,
    });

    const explanation = completion.choices[0]?.message?.content?.trim();

    if (!explanation) {
      console.error("OpenAI response missing explanation content.");
      return res
        .status(500)
        .json({ error: "Failed to get explanation from AI." });
    }

    console.log("Received explanation from OpenAI.");

    // --- Store result in Cache ---
    try {
      console.log(`Storing explanation in cache for FEN: ${fen}`);
      // Store the original topMoves array (which includes isCheckmate flags) as JSON
      const movesToCache = topMoves; // Use the original array received

      await prisma.analysis.create({
        data: {
          fen: fen,
          depth: EXPLAIN_ANALYSIS_DEPTH,
          llm_explanation: explanation,
          // Ensure Prisma schema's stockfish_best_moves is Json type
          stockfish_best_moves: movesToCache as any, // Store the array of objects
        },
      });
      console.log(`Cache stored successfully for FEN: ${fen}`);
    } catch (dbError) {
      console.error("Failed to store explanation in database cache:", dbError);
      // Don't fail the request, just log the caching error
    }
    // --- End Store result ---

    // Return the newly generated explanation
    res.json({ explanation, cacheHit: false });
  } catch (error: any) {
    console.error("Error calling OpenAI API:", error);
    let errorMessage = "Failed to get explanation due to an internal error.";
    if (error.response) {
      console.error("OpenAI API Error Status:", error.response.status);
      console.error("OpenAI API Error Data:", error.response.data);
      errorMessage = `OpenAI API Error: ${
        error.response.data?.error?.message || error.response.status
      }`;
    } else if (error.request) {
      errorMessage = "No response received from OpenAI API.";
    } else {
      errorMessage = `Error setting up OpenAI request: ${error.message}`;
    }
    res.status(500).json({ error: errorMessage });
  }
}) as RequestHandler);
// --- End Explain Endpoint ---

// --- Server Listen ---
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

// --- Graceful Shutdown ---
process.on("SIGINT", async () => {
  console.log("SIGINT received. Shutting down server...");
  if (engineProcess) {
    console.log("Sending quit command to Stockfish...");
    engineProcess.stdout.removeAllListeners();
    engineProcess.stderr.removeAllListeners();
    sendCommand("quit");
    setTimeout(() => {
      if (engineProcess && !engineProcess.killed) {
        console.log("Forcing Stockfish process kill.");
        engineProcess.kill("SIGKILL");
      }
    }, 1000);
  }
  await prisma.$disconnect();
  console.log("Prisma disconnected. Exiting.");
  process.exit(0);
});
