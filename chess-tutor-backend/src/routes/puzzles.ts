// src/routes/puzzles.ts
import express, { Request, Response, Router, RequestHandler } from "express";
import { prisma } from "../db"; // Import prisma instance from db.ts

const router: Router = express.Router();

console.log("--- puzzles.ts router loaded ---"); // For verifying the file is loaded

// Main random puzzle route
router.get("/random", (async (req: Request, res: Response) => {
  console.log("Random puzzle endpoint hit!");
  const theme = req.query.theme as string;
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
    const puzzleCount = await prisma.puzzle.count({
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

    const randomPuzzles = await prisma.puzzle.findMany({
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
      console.log(
        `Failed to fetch a random puzzle for theme ${theme} despite count ${puzzleCount}`
      );
      return res
        .status(404)
        .json({ error: `Could not retrieve a puzzle for theme: ${theme}` });
    }

    const fetchedPuzzle = randomPuzzles[0];
    // --- UPDATED LOGGING ---
    console.log(
      `Successfully found puzzle. Lichess ID: ${fetchedPuzzle.lichessPuzzleId}, Internal ID: ${fetchedPuzzle.id}`
    );

    const puzzleToSend = {
      internalId: fetchedPuzzle.id,
      puzzleId: fetchedPuzzle.lichessPuzzleId,
      fen: fetchedPuzzle.fen,
      solutionMoves: fetchedPuzzle.solutionMoves,
      theme: fetchedPuzzle.theme,
      rating: fetchedPuzzle.rating,
    };

    res.json(puzzleToSend);
  } catch (error) {
    console.error(`Failed to fetch random puzzle for theme ${theme}:`, error);
    res
      .status(500)
      .json({ error: "Failed to fetch puzzle due to a server error." });
  }
}) as RequestHandler);

export default router;
