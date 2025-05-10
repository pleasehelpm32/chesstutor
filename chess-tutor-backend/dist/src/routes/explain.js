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
// src/routes/explain.ts
const express_1 = __importDefault(require("express"));
const openai_1 = __importDefault(require("openai"));
const date_fns_1 = require("date-fns");
const db_1 = require("../db"); // Import prisma instance
const chess_js_1 = require("chess.js"); // Import Chess.js for pre-computation
const router = express_1.default.Router();
// --- OpenAI Client Setup ---
// Load API key (ensure dotenv is configured in main server.ts)
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
// --- End OpenAI Client Setup ---
const EXPLAIN_ANALYSIS_DEPTH = 5; // MUST match ANALYSIS_DEPTH in analyze route
const CACHE_DURATION_DAYS = 7;
router.post("/", ((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    // Note: Path is '/' relative to where this router is mounted in server.ts
    const { fen, topMoves } = req.body; // topMoves is [{move: string, isCheckmate: boolean}]
    // --- Input Validation ---
    if (!fen || typeof fen !== "string") {
        return res.status(400).json({ error: "Missing or invalid FEN string." });
    }
    if (!Array.isArray(topMoves) ||
        topMoves.length === 0 ||
        topMoves.some((m) => typeof m !== "object" ||
            typeof m.move !== "string" ||
            typeof m.isCheckmate !== "boolean")) {
        return res
            .status(400)
            .json({ error: "Missing or invalid top moves analysis data." });
    }
    const movesToExplain = topMoves.slice(0, 3);
    // --- End Validation ---
    // --- Pre-computation using Chess.js ---
    let gameInstance = null;
    try {
        gameInstance = new chess_js_1.Chess(fen);
    }
    catch (e) {
        console.error(`Explain endpoint: Invalid FEN received: ${fen}`, e);
        return res.status(400).json({ error: "Invalid FEN string provided." });
    }
    const enrichedMoves = movesToExplain.map((moveObj) => {
        const moveString = moveObj.move;
        const startSquare = moveString.substring(0, 2);
        const endSquare = moveString.substring(2, 4);
        const pieceData = gameInstance === null || gameInstance === void 0 ? void 0 : gameInstance.get(startSquare); // Cast to 'any' if Square type causes issues with chess.js .get()
        const pieceTypeMap = {
            p: "Pawn",
            n: "Knight",
            b: "Bishop",
            r: "Rook",
            q: "Queen",
            k: "King",
        };
        const pieceType = pieceData
            ? pieceTypeMap[pieceData.type]
            : "Unknown Piece";
        const pieceColor = pieceData
            ? pieceData.color === "w"
                ? "White"
                : "Black"
            : "Unknown Color";
        return Object.assign(Object.assign({}, moveObj), { startSquare, endSquare, pieceType, pieceColor });
    });
    // --- End Pre-computation ---
    // --- Cache Lookup ---
    const cacheCutoffDate = (0, date_fns_1.subDays)(new Date(), CACHE_DURATION_DAYS);
    try {
        const cachedAnalysis = yield db_1.prisma.analysis.findFirst({
            where: {
                fen: fen,
                depth: EXPLAIN_ANALYSIS_DEPTH,
                createdAt: { gte: cacheCutoffDate },
                llm_explanation: { not: null },
            },
            orderBy: { createdAt: "desc" },
        });
        if (cachedAnalysis === null || cachedAnalysis === void 0 ? void 0 : cachedAnalysis.llm_explanation) {
            console.log(`Cache HIT for FEN: ${fen}`);
            return res.json({
                explanation: cachedAnalysis.llm_explanation,
                cacheHit: true,
            });
        }
    }
    catch (error) {
        console.error("Database cache lookup failed:", error);
    }
    // --- End Cache Lookup ---
    if (!openai.apiKey) {
        console.error("Explain request failed: OpenAI API key not configured.");
        return res
            .status(500)
            .json({ error: "OpenAI API key not configured on server." });
    }
    console.log(`OpenAI call for FEN: ${fen}`);
    const checkmatingMove = enrichedMoves.find((m) => m.isCheckmate);
    let prompt = "";
    const moveListForPrompt = enrichedMoves
        .map((m, index) => `${index + 1}. ${m.move}${m.isCheckmate ? " (Checkmate!)" : ""}`)
        .join("\n");
    if (checkmatingMove) {
        // --- Prompt for CHECKMATE (Stricter) ---
        const otherMoves = enrichedMoves.filter((m) => !m.isCheckmate);
        const otherMovesFormat = otherMoves
            .map((m) => `*   **${m.move}:** The ${m.pieceColor} ${m.pieceType} on ${m.startSquare} moves to ${m.endSquare}. [1 sentence idea], but this is **inferior** as it doesn't deliver checkmate.`)
            .join("\n");
        prompt = `You are a factual and expert chess tutor delivering critical information. **Provide only the requested analysis, formatted exactly as specified below. Do not include any introductory or concluding remarks like "Sure!" or "Let's break down...".**

**FEN:** ${fen}
**Stockfish Top Moves:**
${moveListForPrompt}

**CRITICAL ALERT: Move ${checkmatingMove.move} delivers CHECKMATE!**

**Instructions:**
1.  **For the checkmating move (${checkmatingMove.move}):**
    *   The starting square is ${checkmatingMove.startSquare}.
    *   The piece on this square is the **${checkmatingMove.pieceColor} ${checkmatingMove.pieceType}**.
    *   Explain HOW *this specific piece* delivers checkmate (e.g., "attacks the king which has no escape squares..."). Emphasize the immediate win.
2.  **For any other listed moves (if they exist):**
    *   The starting square is [Start Square of other move].
    *   The piece on this square is the [Piece Color and Type of other move].
    *   Briefly state the move's minor idea (1 sentence) and explicitly mention it's inferior as it doesn't win immediately.

**Required Output Format (Use Markdown, EXACTLY as shown):**
*   **${checkmatingMove.move} (CHECKMATE!):** The **${checkmatingMove.pieceColor} ${checkmatingMove.pieceType}** on **${checkmatingMove.startSquare}** moves to **${checkmatingMove.endSquare}**. [Explanation of how *this piece* delivers checkmate and wins].
${otherMovesFormat}

**Constraint Checklist (MUST FOLLOW):**
*   Output ONLY the bulleted list of explanations, starting directly with the first bullet point.
*   Use the PRE-PROVIDED piece type, color, start, and end squares in your descriptions for ALL moves. Do NOT derive piece info from the FEN yourself during explanation generation.
*   Focus explanations ONLY on the immediate impact. No general plans unless directly relevant.
*   No conversational filler. Adhere precisely to the specified output format.`;
    }
    else {
        // --- Prompt for NO checkmate (Stricter) ---
        const enrichedMoveListInData = enrichedMoves
            .map((m, i) => `    ${i + 1}. ${m.move} (This is the ${m.pieceColor} ${m.pieceType} moving from ${m.startSquare} to ${m.endSquare})`)
            .join("\n");
        const moveExamplesFormat = enrichedMoves
            .map((m) => `*   **${m.move}:**
    *   **Idea:** [1-2 sentence explanation of the move's main strategic/tactical purpose, considering it's the ${m.pieceColor} ${m.pieceType} moving from ${m.startSquare} to ${m.endSquare}].
    *   **Opportunities Created:** [List immediate checks, attacks, setups, key squares controlled. If none apparent, state "None apparent."].
    *   **Threats Addressed:** [Does move defend, block, or counter? If none apparent, state "None apparent."].`)
            .join("\n\n"); // Use double newline for better separation
        prompt = `You are a factual and expert chess tutor. **Provide only the requested analysis, formatted exactly as specified below. Do not include any introductory or concluding remarks like "Sure!" or "Let's break down...".**

**Input Data:**
*   **FEN:** ${fen}
*   **Stockfish Top Moves (with pre-identified piece info):**
${enrichedMoveListInData}

**Analysis Task:** For EACH move listed above, provide a detailed breakdown using the pre-identified piece information.

**Required Output Format (Use Markdown, EXACTLY as shown for EACH move):**
${moveExamplesFormat}

**Constraint Checklist (MUST FOLLOW):**
*   Output ONLY the bulleted list analysis for each move, starting directly with the first bullet point for the first move.
*   Base your 'Idea', 'Opportunities Created', and 'Threats Addressed' explanations on the PRE-PROVIDED piece type, color, start, and end squares for each move. Do NOT output a separate 'Piece:' line or re-derive piece info from the FEN during explanation generation.
*   Focus explanations ONLY on the immediate impact. No general plans unless directly relevant.
*   Explicitly address "Opportunities Created" and "Threats Addressed", stating "None apparent." if applicable.
*   No conversational filler. Adhere precisely to the format.`;
    }
    // --- End Prompt Construction ---
    try {
        const maxTokens = checkmatingMove ? 200 : 350; // Increased for non-checkmate detailed breakdown
        const temperature = checkmatingMove ? 0.3 : 0.4;
        const completion = yield openai.chat.completions.create({
            model: "gpt-4o-mini", // Or your preferred model
            messages: [{ role: "user", content: prompt }],
            temperature: temperature,
            max_tokens: maxTokens,
        });
        const explanation = (_c = (_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim();
        if (!explanation) {
            console.error("OpenAI response missing explanation content.");
            return res
                .status(500)
                .json({ error: "Failed to get explanation from AI." });
        }
        // --- Store result in Cache ---
        try {
            const movesToCache = topMoves;
            yield db_1.prisma.analysis.create({
                data: {
                    fen: fen,
                    depth: EXPLAIN_ANALYSIS_DEPTH,
                    llm_explanation: explanation,
                    stockfish_best_moves: movesToCache,
                },
            });
        }
        catch (dbError) {
            console.error("Failed to store explanation in database cache:", dbError);
        }
        // --- End Store result ---
        res.json({ explanation: explanation, cacheHit: false });
    }
    catch (error) {
        console.error("Error calling OpenAI API:", error);
        let errorMessage = "Failed to get explanation due to an internal error.";
        if (error.response) {
            errorMessage = `OpenAI API Error: ${((_e = (_d = error.response.data) === null || _d === void 0 ? void 0 : _d.error) === null || _e === void 0 ? void 0 : _e.message) || error.response.status}`;
        }
        else if (error.request) {
            errorMessage = "No response received from OpenAI API.";
        }
        else {
            errorMessage = `Error setting up OpenAI request: ${error.message}`;
        }
        res.status(500).json({ error: errorMessage });
    }
})));
exports.default = router;
