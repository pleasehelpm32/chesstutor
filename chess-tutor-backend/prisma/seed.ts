// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";

const prisma = new PrismaClient();

async function main() {
  console.log(`Start seeding mate-in-X puzzles...`);

  // --- ADD THIS LINE TO DELETE ALL EXISTING PUZZLES ---
  console.log("Deleting existing puzzles from the database...");
  await prisma.puzzle.deleteMany({}); // This deletes ALL records in the Puzzle table
  console.log("Existing puzzles deleted.");
  // --- END OF ADDED LINE ---
  const filePath = path.join(__dirname, "puzzles_mate_in_1_to_5_limited.csv");

  if (!fs.existsSync(filePath)) {
    console.warn(`Seed file not found: ${filePath}. Skipping puzzle seeding.`);
    return;
  }

  const puzzlesToSeed = [];
  const parser = fs.createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })
  );

  let processedCount = 0;
  for await (const record of parser) {
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
    if (
      solutionMoves.length > 0 &&
      record.FEN &&
      primaryTheme.startsWith("mateIn") &&
      record.PuzzleId
    ) {
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
        await prisma.puzzle.createMany({
          data: puzzlesToSeed,
          skipDuplicates: true,
        });
        console.log(
          `Seeded ${puzzlesToSeed.length} puzzles... (Total processed: ${processedCount})`
        );
      } catch (e) {
        console.error("Error during batch createMany:", e);
        // Decide how to handle batch errors, e.g., log and continue or stop
      }
      puzzlesToSeed.length = 0;
    }
  }

  if (puzzlesToSeed.length > 0) {
    try {
      await prisma.puzzle.createMany({
        data: puzzlesToSeed,
        skipDuplicates: true,
      });
      console.log(
        `Seeded final ${puzzlesToSeed.length} puzzles. (Total processed: ${processedCount})`
      );
    } catch (e) {
      console.error("Error during final batch createMany:", e);
    }
  }

  console.log(
    `Seeding finished. Total puzzles processed from filtered file: ${processedCount}`
  );
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
