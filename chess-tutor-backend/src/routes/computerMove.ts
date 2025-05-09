// src/routes/computerMove.ts
import express, { Request, Response, Router, RequestHandler } from "express";
import { stockfishManager } from "../utils/stockfishManager"; // Import the manager

const router: Router = express.Router();

// --- Constants ---
const MIN_SKILL_LEVEL = 0;
const MAX_SKILL_LEVEL = 20;
const BASE_MOVE_TIME_MS = 100; // Minimum thinking time
const MAX_ADDITIONAL_TIME_MS = 1000; // Max time added based on skill

// --- Helper function to get a move from Stockfish ---
const getStockfishMove = (
  fen: string,
  skillLevel: number
): Promise<string | null> => {
  return new Promise((resolve, reject) => {
    const engineProcess = stockfishManager.getProcess();
    if (!engineProcess || !stockfishManager.isReady()) {
      return reject(new Error("Stockfish process not ready or available."));
    }

    let moveOutput = "";
    let bestMoveFound: string | null = null;

    const normalizedSkill = Math.max(
      0,
      Math.min(1, skillLevel / MAX_SKILL_LEVEL)
    );
    const moveTime =
      BASE_MOVE_TIME_MS + Math.round(normalizedSkill * MAX_ADDITIONAL_TIME_MS);
    const moveTimeout = moveTime + 7000; // Add buffer

    console.log(
      `Requesting move for FEN: ${fen}, Skill: ${skillLevel}, MoveTime: ${moveTime}ms`
    );

    const timeoutId = setTimeout(() => {
      console.error(
        `Stockfish move calculation timed out after ${moveTimeout}ms.`
      );
      cleanup();
      stockfishManager.sendCommand("stop");
      reject(new Error("Stockfish move calculation timed out."));
    }, moveTimeout);

    const cleanup = () => {
      clearTimeout(timeoutId);
      engineProcess?.stdout.removeListener("data", dataHandler);
    };

    const dataHandler = (data: Buffer) => {
      moveOutput += data.toString();
      const lines = moveOutput.split("\n");
      moveOutput = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("bestmove")) {
          const move = line.split(" ")[1];
          bestMoveFound = move && move !== "(none)" ? move : null;
          console.log(`Stockfish bestmove found: ${bestMoveFound}`);
          cleanup();
          resolve(bestMoveFound);
          return;
        }
      }
    };

    engineProcess.stdout.on("data", dataHandler);

    stockfishManager.sendCommand(`position fen ${fen}`);
    stockfishManager.sendCommand(
      `setoption name Skill Level value ${skillLevel}`
    );
    stockfishManager.sendCommand(`go movetime ${moveTime}`);
  });
};
// --- End Helper Function ---

// --- Route Handler ---
router.post("/", (async (req: Request, res: Response) => {
  // Note: Path is '/' relative to where this router is mounted in server.ts
  const { fen, skillLevel } = req.body;

  // --- Input Validation ---
  if (!fen || typeof fen !== "string") {
    return res.status(400).json({ error: "Missing or invalid FEN string." });
  }
  const skill = Number(skillLevel);
  if (isNaN(skill) || skill < MIN_SKILL_LEVEL || skill > MAX_SKILL_LEVEL) {
    return res.status(400).json({
      error: `Invalid skill level. Must be between ${MIN_SKILL_LEVEL} and ${MAX_SKILL_LEVEL}.`,
    });
  }
  // --- End Validation ---

  if (!stockfishManager.isReady()) {
    console.error("Get computer move request failed: Engine not ready.");
    return res.status(503).json({ error: "Stockfish engine not ready." });
  }

  try {
    const bestMove = await getStockfishMove(fen, skill);

    if (bestMove) {
      res.json({ move: bestMove });
    } else {
      console.warn(`Stockfish returned no valid move for FEN: ${fen}`);
      res
        .status(200)
        .json({ move: null, message: "No legal moves found by engine." });
    }
  } catch (error) {
    console.error(`Failed to get computer move for FEN: ${fen}`, error);
    const message =
      error instanceof Error ? error.message : "Unknown engine error";
    res
      .status(500)
      .json({ error: "Failed to get computer move.", details: message });
  }
}) as RequestHandler);
// --- End Route Handler ---

export default router; // Export the router
