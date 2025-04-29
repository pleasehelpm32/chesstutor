// src/server.ts
import express, { Request, Response, RequestHandler } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import OpenAI from "openai";
import { Chess } from "chess.js";

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

app.use(cors());
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
                  const moveResult = tempGame.move(move); // Use sloppy for e2e4 format
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

// --- Explain Endpoint (with Conditional Prompting) ---
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

  if (!openai.apiKey) {
    console.error("Explain request failed: OpenAI API key not configured.");
    return res
      .status(500)
      .json({ error: "OpenAI API key not configured on server." });
  }

  console.log(
    `Received explanation request for FEN: ${fen}, Moves data:`,
    movesToExplain
  );

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
    // --- Prompt for when CHECKMATE is found (Stricter) ---
    const otherMoves = movesToExplain.filter((m) => !m.isCheckmate);
    // Dynamically create the required format string for other moves
    const otherMovesFormat = otherMoves
      .map(
        (m) =>
          `*   **${m.move}:** The [Piece Type identified from FEN] on [Start Square] moves to [End Square]. [1 sentence idea], but this is inferior as it doesn't deliver checkmate.`
      )
      .join("\n");

    prompt = `You are a factual and expert chess tutor delivering critical information. **Provide only the requested analysis, formatted exactly as specified below. Do not include any introductory or concluding remarks like "Sure!" or "Let's break down...".**

**FEN:** ${fen}
**Stockfish Top Moves:**
${moveListForPrompt}

**CRITICAL ALERT: Move ${checkmatingMove.move} delivers CHECKMATE!**

**Instructions:**
1.  **For the checkmating move (${checkmatingMove.move}):**
    *   Determine the starting square (e.g., 'a6' from 'a6a8').
    *   **CRITICAL:** Identify the exact piece type (Pawn, Knight, Bishop, Rook, Queen, King) located on that starting square according to the provided FEN string.
    *   Explain HOW *that specific piece* delivers checkmate (e.g., "attacks the king which has no escape squares..."). Emphasize the immediate win.
2.  **For any other listed moves (if they exist):**
    *   Determine the starting square.
    *   **CRITICAL:** Identify the exact piece type on that starting square using the FEN.
    *   Briefly state the move's minor idea (1 sentence) and explicitly mention it's inferior as it doesn't win immediately.

**Required Output Format (Use Markdown, EXACTLY as shown):**
*   **${checkmatingMove.move} (CHECKMATE!):** The [Piece Type identified from FEN] on [Start Square] moves to [End Square]. [Explanation of how *this piece* delivers checkmate and wins].
${otherMovesFormat}

**Constraint Checklist (MUST FOLLOW):**
*   Output ONLY the bulleted list of explanations, starting directly with the first bullet point.
*   Base piece identification STRICTLY on the FEN for ALL moves.
*   No conversational introductions or conclusions.
*   Adhere precisely to the specified output format.`;
  } else {
    // --- Prompt for when NO checkmate is found (Stricter) ---
    // Dynamically create the required format string
    const moveExamplesFormat = movesToExplain
      .map(
        (m) =>
          `*   **${m.move}:** The [Piece Type identified from FEN] on [Start Square] moves to [End Square]. [1-2 sentence explanation of the move's idea].`
      )
      .join("\n");

    prompt = `You are a factual and expert chess tutor. **Provide only the requested analysis, formatted exactly as specified below. Do not include any introductory or concluding remarks like "Sure!" or "Let's break down...".**

**FEN:** ${fen}
**Stockfish Top Moves:**
${moveListForPrompt}

**Instructions:** For EACH move listed above:
1.  Determine the starting square (e.g., for 'e5g7', the start square is 'e5').
2.  **CRITICAL:** Identify the exact piece type (Pawn, Knight, Bishop, Rook, Queen, King) located on that starting square according to the provided FEN string.
3.  Explain the primary strategic or tactical idea behind moving *that specific piece* to the destination square (1-2 concise sentences). Consider relevant concepts like center control, development, threats, king safety, or pawn structure.

**Required Output Format (Use Markdown, EXACTLY as shown):**
${moveExamplesFormat}

**Constraint Checklist (MUST FOLLOW):**
*   Output ONLY the bulleted list of explanations, starting directly with the first bullet point.
*   Base piece identification STRICTLY on the FEN.
*   Keep explanations concise (1-2 sentences per move).
*   No conversational filler.
*   Adhere precisely to the specified output format.`;
  }

  // --- End Prompt Construction ---

  try {
    console.log("Sending request to OpenAI...");
    const maxTokens = checkmatingMove ? 200 : 250; // Adjust tokens based on prompt type
    const temperature = checkmatingMove ? 0.4 : 0.5; // Adjust temp based on prompt type

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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
    res.json({ explanation });
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
