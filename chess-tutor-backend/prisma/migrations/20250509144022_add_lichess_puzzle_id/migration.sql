-- AlterTable
ALTER TABLE "Puzzle" ADD COLUMN     "lichessPuzzleId" TEXT;

-- CreateIndex
CREATE INDEX "Puzzle_lichessPuzzleId_idx" ON "Puzzle"("lichessPuzzleId");
