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
// src/server.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
// Local Imports
const db_1 = require("./db"); // Prisma client instance
const stockfishManager_1 = require("./utils/stockfishManager"); // Stockfish interaction logic
const errorHandler_1 = require("./utils/errorHandler"); // Central error handler
const misc_1 = __importDefault(require("./routes/misc")); // Router for /health, /test-db
const analyze_1 = __importDefault(require("./routes/analyze")); // Router for /analyze
const explain_1 = __importDefault(require("./routes/explain")); // Router for /explain
const computerMove_1 = __importDefault(require("./routes/computerMove"));
const puzzles_1 = __importDefault(require("./routes/puzzles")); // Router for /puzzle
// Load environment variables (.env file)
dotenv_1.default.config();
// --- Server Initialization ---
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
// --- Middleware Setup ---
// 1. Basic Request Logging (Optional but helpful)
app.use((req, res, next) => {
    console.log(`--> ${req.method} ${req.originalUrl}`);
    res.on("finish", () => {
        console.log(`<-- ${req.method} ${req.originalUrl} ${res.statusCode}`);
    });
    next();
});
// 2. CORS Configuration
const allowedOrigins = [
    "http://localhost:5173", // Vite default dev URL
    "https://chesslearnings.netlify.app",
    "https://hoppscotch.io", // For API testing
    // Add any other origins you need to allow
];
// src/server.ts
// ...
const corsOptions = {
    origin: function (requestOrigin, callback) {
        // Allow requests with no origin OR origins in the allowed list
        if (!requestOrigin || // This allows curl, Postman desktop, etc.
            allowedOrigins.some((origin) => requestOrigin.startsWith(origin)) // Problem might be here
        ) {
            callback(null, true);
        }
        else {
            console.error(`CORS Error: Origin ${requestOrigin} not allowed.`); // This is being hit
            callback(new Error("Not allowed by CORS"));
        }
    },
    methods: "GET,HEAD,POST", // Specify allowed methods
    optionsSuccessStatus: 204,
};
app.use((0, cors_1.default)(corsOptions));
// 3. Body Parsing Middleware
app.use(express_1.default.json()); // For parsing application/json
// --- API Route Mounting ---
// Mount the routers defined in separate files
app.use("/api", misc_1.default); // Mounts /api/health, /api/test-db
app.use("/api/analyze", analyze_1.default); // Mounts /api/analyze
app.use("/api/explain", explain_1.default); // Mounts /api/explain
app.use("/api/computerMove", computerMove_1.default); // Mounts /api/computerMove
app.use("/api/puzzles", puzzles_1.default); // Mounts /api/puzzles
// --- TEMPORARY DEBUGGING ---
if (puzzles_1.default && puzzles_1.default.stack) {
    console.log("--- Routes registered under /api/puzzles ---");
    puzzles_1.default.stack.forEach(function (r) {
        if (r.route && r.route.path) {
            console.log(r.route.path, Object.keys(r.route.methods));
        }
    });
    console.log("-----------------------------------------");
}
else {
    console.log("--- puzzleRoutes is undefined or has no stack ---");
}
// --- END TEMPORARY DEBUGGING ---
// --- Central Error Handling Middleware ---
// IMPORTANT: This must be added *after* all your routes
app.use(errorHandler_1.basicErrorHandler);
// --- Server Startup and Stockfish Initialization ---
function startServer() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log("Initializing Stockfish engine...");
            yield stockfishManager_1.stockfishManager.initialize(); // Wait for engine to be ready
            console.log("Stockfish initialized successfully.");
            app.listen(port, () => {
                console.log(`Server listening at http://localhost:${port}`);
            });
        }
        catch (error) {
            console.error("!!! Failed to initialize Stockfish or start server !!!", error);
            process.exit(1); // Exit if critical initialization fails
        }
    });
}
startServer(); // Call the async function to start
// --- Graceful Shutdown ---
function shutdown(signal) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`\n${signal} received. Shutting down server gracefully...`);
        try {
            yield stockfishManager_1.stockfishManager.shutdown(); // Attempt graceful shutdown of Stockfish
        }
        catch (e) {
            console.error("Error during Stockfish shutdown:", e);
        }
        try {
            yield db_1.prisma.$disconnect(); // Disconnect Prisma client
            console.log("Prisma disconnected.");
        }
        catch (e) {
            console.error("Error during Prisma disconnect:", e);
        }
        console.log("Server shutdown complete. Exiting.");
        process.exit(0);
    });
}
process.on("SIGINT", () => shutdown("SIGINT")); // Handle Ctrl+C
process.on("SIGTERM", () => shutdown("SIGTERM")); // Handle kill commands
