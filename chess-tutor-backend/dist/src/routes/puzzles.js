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
// src/routes/puzzles.ts
const express_1 = __importDefault(require("express"));
const db_1 = require("../db"); // Import prisma instance from db.ts
const router = express_1.default.Router();
console.log("--- puzzles.ts router loaded ---"); // For verifying the file is loaded
// Main random puzzle route
router.get("/random", ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Random puzzle endpoint hit!");
    const theme = req.query.theme;
    console.log("Theme from query:", theme);
    if (!theme) {
        console.log("No theme provided");
        return res
            .status(400)
            .json({ error: "A 'theme' query parameter is required." });
    }
    if (!/^mateIn[1-5]$/.test(theme)) {
        console.log("Invalid theme format:", theme);
        return res.status(400).json({
            error: "Invalid theme format. Expected 'mateIn1' through 'mateIn5'.",
        });
    }
    try {
        console.log(`Counting puzzles for theme: ${theme}`);
        const puzzleCount = yield db_1.prisma.puzzle.count({
            where: {
                theme: theme,
            },
        });
        console.log(`Found ${puzzleCount} puzzles for theme: ${theme}`);
        if (puzzleCount === 0) {
            console.log(`No puzzles found for theme: ${theme}`);
            return res
                .status(404)
                .json({ error: `No puzzles found for theme: ${theme}` });
        }
        const randomSkip = Math.floor(Math.random() * puzzleCount);
        console.log(`Using random skip: ${randomSkip}`);
        const randomPuzzles = yield db_1.prisma.puzzle.findMany({
            where: {
                theme: theme,
            },
            take: 1,
            skip: randomSkip,
            select: {
                // Ensure all necessary fields are selected
                id: true, // Prisma's internal UUID
                lichessPuzzleId: true,
                fen: true,
                solutionMoves: true,
                theme: true,
                rating: true,
                // source: true, // Uncomment if you added and seeded 'source'
            },
        });
        if (!randomPuzzles || randomPuzzles.length === 0) {
            console.log(`Failed to fetch a random puzzle for theme ${theme} despite count ${puzzleCount}`);
            return res
                .status(404)
                .json({ error: `Could not retrieve a puzzle for theme: ${theme}` });
        }
        const fetchedPuzzle = randomPuzzles[0];
        // --- UPDATED LOGGING ---
        console.log(`Successfully found puzzle. Lichess ID: ${fetchedPuzzle.lichessPuzzleId}, Internal ID: ${fetchedPuzzle.id}`);
        const puzzleToSend = {
            internalId: fetchedPuzzle.id,
            puzzleId: fetchedPuzzle.lichessPuzzleId,
            fen: fetchedPuzzle.fen,
            solutionMoves: fetchedPuzzle.solutionMoves,
            theme: fetchedPuzzle.theme,
            rating: fetchedPuzzle.rating,
        };
        res.json(puzzleToSend);
    }
    catch (error) {
        console.error(`Failed to fetch random puzzle for theme ${theme}:`, error);
        res
            .status(500)
            .json({ error: "Failed to fetch puzzle due to a server error." });
    }
})));
exports.default = router;
