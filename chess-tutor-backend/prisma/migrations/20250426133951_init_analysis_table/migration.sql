-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "stockfish_best_moves" JSONB,
    "llm_explanation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Analysis_fen_depth_idx" ON "Analysis"("fen", "depth");
