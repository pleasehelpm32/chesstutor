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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// prisma/seed.ts
const client_1 = require("@prisma/client");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const csv_parse_1 = require("csv-parse");
const prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        console.log(`Start seeding mate-in-X puzzles...`);
        // --- ADD THIS LINE TO DELETE ALL EXISTING PUZZLES ---
        console.log("Deleting existing puzzles from the database...");
        yield prisma.puzzle.deleteMany({}); // This deletes ALL records in the Puzzle table
        console.log("Existing puzzles deleted.");
        // --- END OF ADDED LINE ---
        const filePath = path_1.default.join(__dirname, "puzzles_mate_in_1_to_5_limited.csv");
        if (!fs_1.default.existsSync(filePath)) {
            console.warn(`Seed file not found: ${filePath}. Skipping puzzle seeding.`);
            return;
        }
        const puzzlesToSeed = [];
        const parser = fs_1.default.createReadStream(filePath).pipe((0, csv_parse_1.parse)({
            columns: true,
            skip_empty_lines: true,
            trim: true,
        }));
        let processedCount = 0;
        try {
            for (var _d = true, parser_1 = __asyncValues(parser), parser_1_1; parser_1_1 = yield parser_1.next(), _a = parser_1_1.done, !_a; _d = true) {
                _c = parser_1_1.value;
                _d = false;
                const record = _c;
                processedCount++;
                const solutionMoves = record.Moves ? record.Moves.split(" ") : [];
                const themes = record.Themes ? record.Themes.split(" ") : [];
                let primaryTheme = "unknown";
                for (let i = 5; i >= 1; i--) {
                    if (themes.includes(`mateIn${i}`)) {
                        primaryTheme = `mateIn${i}`;
                        break;
                    }
                }
                // Ensure PuzzleId from CSV is present
                if (solutionMoves.length > 0 &&
                    record.FEN &&
                    primaryTheme.startsWith("mateIn") &&
                    record.PuzzleId) {
                    // <-- Check for record.PuzzleId
                    puzzlesToSeed.push({
                        lichessPuzzleId: record.PuzzleId, // <-- STORE THE ORIGINAL PuzzleId
                        fen: record.FEN,
                        solutionMoves: solutionMoves,
                        theme: primaryTheme,
                        rating: record.Rating ? parseInt(record.Rating) : null,
                        source: record.GameUrl ? "lichess-db" : "unknown-source",
                    });
                }
                if (puzzlesToSeed.length >= 1000) {
                    // Before seeding, delete existing puzzles to avoid issues if re-running on same data
                    // This is optional and depends on your re-seeding strategy.
                    // For a clean seed, you might want to delete all puzzles first:
                    // await prisma.puzzle.deleteMany({}); // Uncomment if you want to clear before seeding
                    try {
                        yield prisma.puzzle.createMany({
                            data: puzzlesToSeed,
                            skipDuplicates: true,
                        });
                        console.log(`Seeded ${puzzlesToSeed.length} puzzles... (Total processed: ${processedCount})`);
                    }
                    catch (e) {
                        console.error("Error during batch createMany:", e);
                        // Decide how to handle batch errors, e.g., log and continue or stop
                    }
                    puzzlesToSeed.length = 0;
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = parser_1.return)) yield _b.call(parser_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        if (puzzlesToSeed.length > 0) {
            try {
                yield prisma.puzzle.createMany({
                    data: puzzlesToSeed,
                    skipDuplicates: true,
                });
                console.log(`Seeded final ${puzzlesToSeed.length} puzzles. (Total processed: ${processedCount})`);
            }
            catch (e) {
                console.error("Error during final batch createMany:", e);
            }
        }
        console.log(`Seeding finished. Total puzzles processed from filtered file: ${processedCount}`);
    });
}
main()
    .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
}));
