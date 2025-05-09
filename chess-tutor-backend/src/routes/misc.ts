// src/routes/misc.ts
import express, { Request, Response, Router } from "express";
import { prisma } from "../db"; // Import prisma instance from db.ts

const router: Router = express.Router();

// Health check endpoint
router.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Database test endpoint
router.get("/test-db", async (req: Request, res: Response) => {
  try {
    // Use the imported prisma client
    const count = await prisma.analysis.count();
    res.json({ status: "db ok", analysis_count: count });
  } catch (error) {
    console.error("Database test failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    // Send error response but don't crash the server
    res.status(500).json({ status: "db error", error: message });
  }
});

export default router; // Export the router
