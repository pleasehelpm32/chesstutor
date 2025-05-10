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
// src/routes/analyze.ts
const express_1 = __importDefault(require("express"));
const chess_js_1 = require("chess.js");
const stockfishManager_1 = require("../utils/stockfishManager"); // Import the manager
const router = express_1.default.Router();
const ANALYSIS_DEPTH = 5;
const ANALYSIS_TIMEOUT_MS = 30000; // 15 seconds
// --- Analyze Endpoint (with Checkmate Detection) ---
router.post("/", ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Note: Path is '/' relative to where this router is mounted in server.ts
    const { fen } = req.body;
    // Check if engine is ready using the manager
    if (!stockfishManager_1.stockfishManager.isReady()) {
        console.warn("Analyze request received but engine not ready.");
        return res
            .status(503)
            .json({ error: "Stockfish engine not ready or not running." });
    }
    if (!fen || typeof fen !== "string") {
        return res.status(400).json({ error: "Invalid FEN string provided." });
    }
    // Optional: Validate FEN syntax on backend
    try {
        new chess_js_1.Chess(fen);
    }
    catch (e) {
        return res.status(400).json({ error: "Invalid FEN string format." });
    }
    console.log(`Received analysis request for FEN: ${fen}`);
    try {
        // --- Analysis Logic using stockfishManager ---
        const runStockfishAnalysis = (currentFen) => {
            return new Promise((resolve, reject) => {
                const engineProcess = stockfishManager_1.stockfishManager.getProcess(); // Get the process instance
                if (!engineProcess) {
                    // This check might be redundant if isReady() passed, but good for safety
                    return reject(new Error("Stockfish process not available."));
                }
                let analysisOutput = "";
                const topMovesInfo = [];
                let analysisTimer = null;
                const cleanup = () => {
                    if (analysisTimer)
                        clearTimeout(analysisTimer);
                    // Remove listener from the specific process instance
                    engineProcess === null || engineProcess === void 0 ? void 0 : engineProcess.stdout.removeListener("data", dataHandler);
                };
                const dataHandler = (data) => {
                    analysisOutput += data.toString();
                    const lines = analysisOutput.split("\n");
                    analysisOutput = lines.pop() || "";
                    for (const line of lines) {
                        if (!line)
                            continue;
                        if (line.startsWith("info depth") && line.includes(" multipv ")) {
                            // ... (Keep the same parsing logic for info lines as before) ...
                            const matchPv = line.match(/multipv (\d+)/);
                            const matchMove = line.match(/ pv (.+?)(?= score|$)/);
                            const matchCp = line.match(/score cp (-?\d+)/);
                            const matchMate = line.match(/score mate (-?\d+)/);
                            if (matchPv && matchMove) {
                                const pvIndex = parseInt(matchPv[1], 10);
                                const move = matchMove[1].trim().split(" ")[0];
                                let score = "N/A";
                                if (matchCp)
                                    score = parseInt(matchCp[1], 10);
                                else if (matchMate)
                                    score = `M${matchMate[1]}`;
                                const existingIndex = topMovesInfo.findIndex((m) => m.pvIndex === pvIndex);
                                if (existingIndex !== -1)
                                    topMovesInfo[existingIndex] = { pvIndex, move, score };
                                else
                                    topMovesInfo.push({ pvIndex, move, score });
                            }
                        }
                        else if (line.startsWith("bestmove")) {
                            cleanup();
                            const bestMove = line.split(" ")[1];
                            topMovesInfo.sort((a, b) => a.pvIndex - b.pvIndex);
                            const uniqueMovesStrings = [];
                            const seenMoves = new Set();
                            for (const moveInfo of topMovesInfo) {
                                if (!seenMoves.has(moveInfo.move) &&
                                    uniqueMovesStrings.length < 3) {
                                    uniqueMovesStrings.push(moveInfo.move);
                                    seenMoves.add(moveInfo.move);
                                }
                            }
                            if (bestMove !== "(none)" &&
                                !seenMoves.has(bestMove) &&
                                uniqueMovesStrings.length < 3) {
                                uniqueMovesStrings.push(bestMove);
                            }
                            // --- Check for Checkmate using Chess.js ---
                            let game = null;
                            try {
                                game = new chess_js_1.Chess(currentFen);
                            }
                            catch (e) {
                                console.error(`Invalid FEN for checkmate check: ${currentFen}`, e);
                                resolve(uniqueMovesStrings.map((move) => ({
                                    move,
                                    isCheckmate: false,
                                })));
                                return;
                            }
                            const movesWithCheckmateInfo = uniqueMovesStrings.map((move) => {
                                let isCheckmate = false;
                                try {
                                    const tempGame = new chess_js_1.Chess(currentFen);
                                    const moveResult = tempGame.move(move); // No need for sloppy here if moves are from engine
                                    if (moveResult && tempGame.isCheckmate()) {
                                        isCheckmate = true;
                                    }
                                }
                                catch (e) {
                                    console.warn(`Could not validate move ${move} for checkmate check: ${e instanceof Error ? e.message : e}`);
                                }
                                return { move, isCheckmate };
                            });
                            // --- End Checkmate Check ---
                            console.log(`Analysis complete. Moves with checkmate info:`, movesWithCheckmateInfo);
                            resolve(movesWithCheckmateInfo);
                            return;
                        }
                    }
                };
                analysisTimer = setTimeout(() => {
                    console.error(`Stockfish analysis timed out for FEN: ${currentFen}`);
                    cleanup();
                    stockfishManager_1.stockfishManager.sendCommand("stop"); // Use manager to send command
                    reject(new Error("Stockfish analysis timed out."));
                }, ANALYSIS_TIMEOUT_MS);
                // Attach listener to the process obtained from the manager
                engineProcess.stdout.on("data", dataHandler);
                // Send commands via the manager
                stockfishManager_1.stockfishManager.sendCommand("ucinewgame");
                stockfishManager_1.stockfishManager.sendCommand(`position fen ${currentFen}`);
                stockfishManager_1.stockfishManager.sendCommand("setoption name MultiPV value 3");
                stockfishManager_1.stockfishManager.sendCommand(`go depth ${ANALYSIS_DEPTH}`);
            });
        };
        // --- End Analysis Logic ---
        // Execute the analysis
        const topMovesAnalysis = yield runStockfishAnalysis(fen);
        res.json({ topMoves: topMovesAnalysis });
    }
    catch (error) {
        console.error(`Stockfish analysis failed for FEN: ${fen}`, error);
        // Let the central error handler manage the response format
        // Throw the error or pass it to next() if using an error middleware
        // For simplicity here, we send a response directly
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Analysis failed.", details: message });
    }
})));
exports.default = router; // Export the router
