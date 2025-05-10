"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/computerMove.ts
const express_1 = __importDefault(require("express"));
const stockfishManager_1 = require("../utils/stockfishManager"); // Import the manager
const router = express_1.default.Router();
// --- Constants ---
const MIN_SKILL_LEVEL = 0;
const MAX_SKILL_LEVEL = 20;
const BASE_MOVE_TIME_MS = 100; // Minimum thinking time
const MAX_ADDITIONAL_TIME_MS = 1000; // Max time added based on skill
// --- Helper function to get a move from Stockfish ---
const getStockfishMove = (fen, skillLevel) => {
    return new Promise((resolve, reject) => {
        const engineProcess = stockfishManager_1.stockfishManager.getProcess();
        if (!engineProcess || !stockfishManager_1.stockfishManager.isReady()) {
            return reject(new Error("Stockfish process not ready or available."));
        }
        let moveOutput = "";
        let bestMoveFound = null;
        const normalizedSkill = Math.max(0, Math.min(1, skillLevel / MAX_SKILL_LEVEL));
        const moveTime = BASE_MOVE_TIME_MS + Math.round(normalizedSkill * MAX_ADDITIONAL_TIME_MS);
        const moveTimeout = moveTime + 7000; // Add buffer
        console.log(`Requesting move for FEN: ${fen}, Skill: ${skillLevel}, MoveTime: ${moveTime}ms`);
        const timeoutId = setTimeout(() => {
            console.error(`Stockfish move calculation timed out after ${moveTimeout}ms.`);
            cleanup();
            stockfishManager_1.stockfishManager.sendCommand("stop");
            reject(new Error("Stockfish move calculation timed out."));
        }, moveTimeout);
        const cleanup = () => {
            clearTimeout(timeoutId);
            engineProcess === null || engineProcess === void 0 ? void 0 : engineProcess.stdout.removeListener("data", dataHandler);
        };
        const dataHandler = (data) => {
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
        stockfishManager_1.stockfishManager.sendCommand(`position fen ${fen}`);
        stockfishManager_1.stockfishManager.sendCommand(`setoption name Skill Level value ${skillLevel}`);
        stockfishManager_1.stockfishManager.sendCommand(`go movetime ${moveTime}`);
    });
};
// --- End Helper Function ---
// --- Route Handler ---
router.post("/", ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
    if (!stockfishManager_1.stockfishManager.isReady()) {
        console.error("Get computer move request failed: Engine not ready.");
        return res.status(503).json({ error: "Stockfish engine not ready." });
    }
    try {
        const bestMove = yield getStockfishMove(fen, skill);
        if (bestMove) {
            res.json({ move: bestMove });
        }
        else {
            console.warn(`Stockfish returned no valid move for FEN: ${fen}`);
            res
                .status(200)
                .json({ move: null, message: "No legal moves found by engine." });
        }
    }
    catch (error) {
        console.error(`Failed to get computer move for FEN: ${fen}`, error);
        const message = error instanceof Error ? error.message : "Unknown engine error";
        res
            .status(500)
            .json({ error: "Failed to get computer move.", details: message });
    }
})));
// --- End Route Handler ---
exports.default = router; // Export the router
