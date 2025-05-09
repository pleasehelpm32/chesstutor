// src/server.ts
import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";

// Local Imports
import { prisma } from "./db"; // Prisma client instance
import { stockfishManager } from "./utils/stockfishManager"; // Stockfish interaction logic
import { basicErrorHandler } from "./utils/errorHandler"; // Central error handler
import miscRoutes from "./routes/misc"; // Router for /health, /test-db
import analyzeRoutes from "./routes/analyze"; // Router for /analyze
import explainRoutes from "./routes/explain"; // Router for /explain
import computerMoveRoutes from "./routes/computerMove";
// Router for /computerMove
// Load environment variables (.env file)
dotenv.config();

// --- Server Initialization ---
const app: Express = express();
const port = process.env.PORT || 3001;

// --- Middleware Setup ---

// 1. Basic Request Logging (Optional but helpful)
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`--> ${req.method} ${req.originalUrl}`);
  res.on("finish", () => {
    console.log(`<-- ${req.method} ${req.originalUrl} ${res.statusCode}`);
  });
  next();
});

// 2. CORS Configuration
const allowedOrigins = [
  "http://localhost:5173", // Vite default dev URL
  "https://chesslearnings.netlify.app", // Your deployed frontend URL
  // Add any other origins you need to allow
];
const corsOptions = {
  origin: function (
    requestOrigin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) {
    // Allow requests with no origin OR origins in the allowed list
    if (
      !requestOrigin ||
      allowedOrigins.some((origin) => requestOrigin.startsWith(origin))
    ) {
      callback(null, true);
    } else {
      console.error(`CORS Error: Origin ${requestOrigin} not allowed.`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: "GET,HEAD,POST", // Specify allowed methods
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

// 3. Body Parsing Middleware
app.use(express.json()); // For parsing application/json

// --- API Route Mounting ---
// Mount the routers defined in separate files
app.use("/api", miscRoutes); // Mounts /api/health, /api/test-db
app.use("/api/analyze", analyzeRoutes); // Mounts /api/analyze
app.use("/api/explain", explainRoutes); // Mounts /api/explain
app.use("/api/computerMove", computerMoveRoutes); // Mounts /api/computerMove
// --- Catch-all for undefined API routes (Optional) ---
// app.use("/api/*", (req: Request, res: Response) => {
//   res.status(404).json({ error: "API route not found." });
// });

// --- Central Error Handling Middleware ---
// IMPORTANT: This must be added *after* all your routes
app.use(basicErrorHandler);

// --- Server Startup and Stockfish Initialization ---
async function startServer() {
  try {
    console.log("Initializing Stockfish engine...");
    await stockfishManager.initialize(); // Wait for engine to be ready
    console.log("Stockfish initialized successfully.");

    app.listen(port, () => {
      console.log(`Server listening at http://localhost:${port}`);
    });
  } catch (error) {
    console.error(
      "!!! Failed to initialize Stockfish or start server !!!",
      error
    );
    process.exit(1); // Exit if critical initialization fails
  }
}

startServer(); // Call the async function to start

// --- Graceful Shutdown ---
async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down server gracefully...`);
  try {
    await stockfishManager.shutdown(); // Attempt graceful shutdown of Stockfish
  } catch (e) {
    console.error("Error during Stockfish shutdown:", e);
  }
  try {
    await prisma.$disconnect(); // Disconnect Prisma client
    console.log("Prisma disconnected.");
  } catch (e) {
    console.error("Error during Prisma disconnect:", e);
  }
  console.log("Server shutdown complete. Exiting.");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT")); // Handle Ctrl+C
process.on("SIGTERM", () => shutdown("SIGTERM")); // Handle kill commands
