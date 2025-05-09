// filter_puzzles.js
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse");
const { stringify } = require("csv-stringify");

// --- Configuration ---
const inputFile = "./src/lichess_db_puzzle.csv"; // Path to your downloaded (decompressed) large CSV
const outputFile = "./prisma/puzzles_mate_in_1_to_5_limited.csv"; // New output file name
const themesToMatch = ["mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5"];
const PUZZLE_LIMIT = 10000; // <<< SET YOUR DESIRED LIMIT HERE
// --- End Configuration ---

async function filterPuzzles() {
  console.log(
    `Starting to filter puzzles from ${inputFile}, limiting to ${PUZZLE_LIMIT} mate puzzles...`
  );
  let recordsProcessed = 0;
  let matePuzzlesFoundAndWritten = 0;

  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const readableStream = fs.createReadStream(inputFile);
  const writableStream = fs.createWriteStream(outputFile);
  const parser = parse({
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  const stringifier = stringify({ header: true });

  stringifier.pipe(writableStream);
  readableStream.pipe(parser);

  for await (const record of parser) {
    recordsProcessed++;
    if (recordsProcessed % 200000 === 0) {
      // Log progress less frequently for faster processing
      console.log(
        `Processed ${recordsProcessed} records... Found ${matePuzzlesFoundAndWritten} mate puzzles so far.`
      );
    }

    if (matePuzzlesFoundAndWritten >= PUZZLE_LIMIT) {
      console.log(`Reached puzzle limit of ${PUZZLE_LIMIT}. Stopping filter.`);
      break; // Stop processing once the limit is reached
    }

    const themesString = record.Themes || "";
    const recordThemes = themesString.split(" ");
    let isMatePuzzle = false;

    for (const targetTheme of themesToMatch) {
      if (recordThemes.includes(targetTheme)) {
        isMatePuzzle = true;
        break;
      }
    }

    if (isMatePuzzle) {
      stringifier.write(record);
      matePuzzlesFoundAndWritten++;
    }
  }

  stringifier.end();

  await new Promise((resolve, reject) => {
    writableStream.on("finish", resolve);
    writableStream.on("error", reject);
  });

  console.log("--------------------------------------------------");
  console.log(`Filtering complete!`);
  console.log(`Total records processed from input: ${recordsProcessed}`);
  console.log(`Mate-in-X puzzles written: ${matePuzzlesFoundAndWritten}`);
  console.log(`Filtered data saved to: ${outputFile}`);
  console.log("--------------------------------------------------");
}

filterPuzzles().catch(console.error);
