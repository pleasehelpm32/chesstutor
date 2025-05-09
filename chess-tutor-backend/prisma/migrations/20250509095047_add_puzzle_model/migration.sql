-- CreateTable
CREATE TABLE "Puzzle" (
    "id" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "solutionMoves" TEXT[],
    "theme" TEXT NOT NULL,
    "rating" INTEGER,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Puzzle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Puzzle_fen_key" ON "Puzzle"("fen");

-- CreateIndex
CREATE INDEX "Puzzle_theme_idx" ON "Puzzle"("theme");

-- CreateIndex
CREATE INDEX "Puzzle_rating_idx" ON "Puzzle"("rating");
