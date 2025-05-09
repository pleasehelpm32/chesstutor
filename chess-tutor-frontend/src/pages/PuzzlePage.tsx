// src/pages/PuzzlePage.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Chess } from "chess.js";
import type { Square, PieceSymbol, Color } from "chess.js";
import ChessboardDisplay from "../components/ChessboardDisplay";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getRandomPuzzle } from "../services/api";
import type { CSSProperties } from "react";

// --- Types ---
interface Puzzle {
  id: string;
  fen: string;
  solutionMoves: string[];
  theme: string;
  rating?: number;
  puzzleId?: string;
}

// interface ExplainResponse {
//   explanation: string;
//   cacheHit?: boolean;
// }

type PuzzleStatus =
  | "idle"
  | "loadingNewPuzzle"
  | "active"
  | "processingPlayerMove"
  | "opponentReplied"
  | "solved"
  | "failedAttempt"
  | "showingSolution"
  | "loadingExplanation"
  | "error";

type SquareStyles = { [square: string]: CSSProperties };
type Arrows = Array<[string, string, string?]>; // [from, to, color?]

const MATE_THEMES = [
  { value: "mateIn1", label: "Mate in 1" },
  { value: "mateIn2", label: "Mate in 2" },
  { value: "mateIn3", label: "Mate in 3" },
  { value: "mateIn4", label: "Mate in 4" },
  { value: "mateIn5", label: "Mate in 5" },
];

const MIN_BOARD_WIDTH = 250;
const MAX_BOARD_WIDTH = 560;

const PuzzlePage: React.FC = () => {
  // --- State Variables ---
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(null);
  const [gameInstance, setGameInstance] = useState<Chess>(() => new Chess());
  const [currentMoveIndexInSolution, setCurrentMoveIndexInSolution] =
    useState(0);
  const [puzzleStatus, setPuzzleStatus] = useState<PuzzleStatus>("idle");
  const [userMessage, setUserMessage] = useState<string | null>(
    "Select a puzzle type and click 'New Puzzle' to begin!"
  );
  const [puzzleExplanation, setPuzzleExplanation] = useState<string | null>(
    null
  );
  const [selectedTheme, setSelectedTheme] = useState<string>(
    MATE_THEMES[1].value
  );
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [squareStyles, setSquareStyles] = useState<SquareStyles>({});
  const [arrows, setArrows] = useState<Arrows>([]);
  const [boardWidth, setBoardWidth] = useState(MIN_BOARD_WIDTH);
  const [playerToMove, setPlayerToMove] = useState<Color>("w");
  const [hintShown, setHintShown] = useState(false); // For hint button

  // --- Refs ---
  const boardContainerRef = useRef<HTMLDivElement>(null);

  // --- Callbacks & Helper Functions ---
  const clearBoardVisuals = useCallback(() => {
    setSquareStyles({});
    setArrows([]); // Also clear hint arrows
  }, []);

  const resetForNewPuzzle = useCallback(() => {
    setCurrentPuzzle(null);
    setCurrentMoveIndexInSolution(0);
    setPuzzleExplanation(null);
    clearBoardVisuals();
    setFetchError(null);
    setHintShown(false); // Reset hint state
  }, [clearBoardVisuals]);

  const fetchNewPuzzle = useCallback(
    async (themeToFetch: string) => {
      console.log("Fetching new puzzle with theme:", themeToFetch);
      setPuzzleStatus("loadingNewPuzzle");
      setUserMessage("Loading new puzzle...");
      resetForNewPuzzle();

      try {
        const puzzleData = await getRandomPuzzle(themeToFetch);
        if (puzzleData && puzzleData.fen) {
          setCurrentPuzzle(puzzleData);
          const newGame = new Chess(puzzleData.fen);
          setGameInstance(newGame);
          setPlayerToMove(newGame.turn());
          setCurrentMoveIndexInSolution(0);
          setPuzzleStatus("active");
          setUserMessage(
            `Puzzle loaded: ${
              MATE_THEMES.find((t) => t.value === puzzleData.theme)?.label ||
              puzzleData.theme
            }. ${newGame.turn() === "w" ? "White" : "Black"} to move.`
          );
          console.log("Puzzle loaded:", puzzleData);
        } else {
          throw new Error("No valid puzzle data received from API.");
        }
      } catch (error) {
        console.error("Failed to fetch puzzle:", error);
        const message =
          error instanceof Error
            ? error.message
            : "Unknown error fetching puzzle.";
        setFetchError(message);
        setUserMessage(`Error: ${message}`);
        setPuzzleStatus("error");
        setGameInstance(new Chess());
      }
    },
    [resetForNewPuzzle]
  );

  const onPieceDrop = useCallback(
    (
      sourceSquare: Square,
      targetSquare: Square,
      pieceString: string
    ): boolean => {
      setHintShown(false); // Clear hint if user makes a move
      setArrows([]); // Clear hint arrows

      if (puzzleStatus !== "active" || !currentPuzzle || !gameInstance) {
        return false;
      }
      const currentTurnInGame = gameInstance.turn();
      if (!pieceString.startsWith(currentTurnInGame)) {
        setUserMessage(
          `It's ${currentTurnInGame === "w" ? "White" : "Black"}'s turn.`
        );
        return false;
      }

      let userMoveUCI = `${sourceSquare}${targetSquare}`;
      const chessJsMoveObject = {
        from: sourceSquare,
        to: targetSquare,
        promotion: undefined as PieceSymbol | undefined,
      };
      const pieceOnSource = gameInstance.get(sourceSquare);
      if (
        pieceOnSource &&
        pieceOnSource.type === "p" &&
        ((pieceOnSource.color === "w" && targetSquare[1] === "8") ||
          (pieceOnSource.color === "b" && targetSquare[1] === "1"))
      ) {
        userMoveUCI += "q";
        chessJsMoveObject.promotion = "q";
      }

      if (currentMoveIndexInSolution >= currentPuzzle.solutionMoves.length) {
        setUserMessage("Puzzle solution sequence ended. Start a new puzzle?");
        setPuzzleStatus("error");
        return false;
      }
      const expectedMoveUCI =
        currentPuzzle.solutionMoves[currentMoveIndexInSolution];
      console.log(
        `Player attempted: ${userMoveUCI}, Expected: ${expectedMoveUCI}`
      );

      if (userMoveUCI === expectedMoveUCI) {
        setUserMessage("Correct! Processing...");
        setPuzzleStatus("processingPlayerMove");
        const newGame = new Chess(gameInstance.fen());
        const moveResult = newGame.move(chessJsMoveObject);

        if (!moveResult) {
          console.error(
            "CRITICAL ERROR: Validated player move failed on internal chess.js instance.",
            chessJsMoveObject
          );
          setUserMessage(
            "An error occurred applying your move. Please try a new puzzle."
          );
          setPuzzleStatus("error");
          return false;
        }

        setGameInstance(newGame);
        const newPlayerMoveIndex = currentMoveIndexInSolution + 1;
        setCurrentMoveIndexInSolution(newPlayerMoveIndex);
        clearBoardVisuals();

        if (
          newGame.isCheckmate() ||
          newPlayerMoveIndex >= currentPuzzle.solutionMoves.length
        ) {
          setPuzzleStatus("solved");
          setUserMessage("Puzzle Solved! Checkmate!");
          console.log("Puzzle solved by player's move!");
          // TODO: Fetch explanation for the solved puzzle
          return true;
        }

        setUserMessage("Correct! Opponent thinking...");
        setTimeout(() => {
          if (newPlayerMoveIndex < currentPuzzle.solutionMoves.length) {
            const opponentMoveNotation =
              currentPuzzle.solutionMoves[newPlayerMoveIndex];
            const gameAfterOpponent = new Chess(newGame.fen());
            const opponentMoveResult =
              gameAfterOpponent.move(opponentMoveNotation);

            if (!opponentMoveResult) {
              console.error(
                "Error making opponent's move from solution:",
                opponentMoveNotation,
                "FEN:",
                newGame.fen()
              );
              setUserMessage(
                "Error with puzzle solution (opponent's move). Please try a new puzzle."
              );
              setPuzzleStatus("error");
              return;
            }
            setGameInstance(gameAfterOpponent);
            const newOpponentMoveIndex = newPlayerMoveIndex + 1;
            setCurrentMoveIndexInSolution(newOpponentMoveIndex);
            setPlayerToMove(gameAfterOpponent.turn());

            if (
              gameAfterOpponent.isCheckmate() ||
              newOpponentMoveIndex >= currentPuzzle.solutionMoves.length
            ) {
              setPuzzleStatus("solved");
              setUserMessage("Puzzle Solved!");
              console.log(
                "Puzzle solved after opponent's move or end of sequence!"
              );
            } else {
              setUserMessage(
                `Opponent replied. ${
                  gameAfterOpponent.turn() === "w" ? "White" : "Black"
                } to move.`
              );
              setPuzzleStatus("active");
            }
          }
        }, 750);
        return true;
      } else {
        setUserMessage(`Incorrect move. Try again!`);
        return false;
      }
    },
    [
      currentPuzzle,
      puzzleStatus,
      gameInstance,
      currentMoveIndexInSolution,
      clearBoardVisuals,
    ]
  );

  const handleHintClick = () => {
    if (
      !currentPuzzle ||
      puzzleStatus !== "active" ||
      currentMoveIndexInSolution >= currentPuzzle.solutionMoves.length
    ) {
      return;
    }
    setHintShown(true);

    const nextMoveUCI = currentPuzzle.solutionMoves[currentMoveIndexInSolution];
    if (nextMoveUCI && nextMoveUCI.length >= 4) {
      const fromSquare = nextMoveUCI.substring(0, 2) as Square;
      const toSquare = nextMoveUCI.substring(2, 4) as Square;
      const hintArrowColor = "rgba(0, 100, 255, 0.5)"; // A distinct blue for hint

      setArrows([[fromSquare, toSquare, hintArrowColor]]); // Show only the hint arrow
      setUserMessage(
        `Hint: Consider moving from ${fromSquare} to ${toSquare}.`
      );
    } else {
      setUserMessage("Could not determine hint for the next move.");
    }
  };

  // --- Effects ---
  useEffect(() => {
    const handleResize = () => {
      if (boardContainerRef.current) {
        const containerWidth = boardContainerRef.current.clientWidth;
        const newWidth = Math.max(
          MIN_BOARD_WIDTH,
          Math.min(containerWidth, MAX_BOARD_WIDTH)
        );
        setBoardWidth(newWidth);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // --- Render ---
  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6">
      {/* Left Column: Board and Controls */}
      <div className="flex-grow md:w-2/3 flex flex-col">
        <div className="mb-4 p-4 border rounded-lg shadow bg-card">
          <h3 className="text-lg font-semibold mb-3">Puzzle Controls</h3>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-grow">
              <Label htmlFor="theme-select">Select Puzzle Type:</Label>
              <Select
                value={selectedTheme}
                onValueChange={(value) => setSelectedTheme(value)}
                disabled={
                  puzzleStatus === "loadingNewPuzzle" ||
                  puzzleStatus === "processingPlayerMove"
                }
              >
                <SelectTrigger id="theme-select" className="w-full mt-1">
                  <SelectValue placeholder="Select mate type" />
                </SelectTrigger>
                <SelectContent>
                  {MATE_THEMES.map((theme) => (
                    <SelectItem key={theme.value} value={theme.value}>
                      {theme.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => fetchNewPuzzle(selectedTheme)}
              disabled={
                puzzleStatus === "loadingNewPuzzle" ||
                puzzleStatus === "processingPlayerMove"
              }
              className="w-full sm:w-auto"
            >
              {puzzleStatus === "loadingNewPuzzle"
                ? "Loading..."
                : "New Puzzle"}
            </Button>
          </div>
          {fetchError && (
            <p className="text-red-500 text-sm mt-2">{fetchError}</p>
          )}
        </div>

        <div
          ref={boardContainerRef}
          className="w-full relative my-2"
          style={{ minHeight: `${boardWidth}px` }}
        >
          {puzzleStatus === "loadingNewPuzzle" && !currentPuzzle && (
            <div
              className="aspect-square bg-gray-200 border flex items-center justify-center text-gray-500"
              style={{ width: boardWidth }}
            >
              <Skeleton className="w-full h-full" />
            </div>
          )}
          {gameInstance &&
            (puzzleStatus !== "loadingNewPuzzle" || currentPuzzle) && (
              <ChessboardDisplay
                boardWidth={boardWidth}
                position={gameInstance.fen()}
                squareStyles={squareStyles}
                arrows={arrows} // Pass arrows state for hints
                moveNumberStyles={{}} // Not using move numbers for puzzles yet
                onPieceDrop={onPieceDrop}
                onSquareClick={(square: Square) => {
                  if (
                    puzzleStatus === "active" &&
                    gameInstance.get(square)?.color === gameInstance.turn()
                  ) {
                    const moves = gameInstance.moves({ square, verbose: true });
                    const newStyles: SquareStyles = {
                      [square]: { backgroundColor: "rgba(255, 255, 0, 0.3)" },
                    };
                    moves.forEach((move) => {
                      newStyles[move.to] = {
                        background:
                          "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
                        borderRadius: "50%",
                      };
                    });
                    setSquareStyles(newStyles);
                    setArrows([]); // Clear hint arrows if user clicks to select a piece
                    setHintShown(false);
                  } else {
                    clearBoardVisuals();
                  }
                }}
                arePiecesDraggable={puzzleStatus === "active"}
                boardOrientation={playerToMove === "w" ? "white" : "black"}
              />
            )}
        </div>

        {userMessage && (
          <div
            className={`mt-2 mb-2 p-3 text-center font-semibold rounded border ${
              puzzleStatus === "error" || fetchError
                ? "bg-red-100 text-red-800 border-red-300"
                : puzzleStatus === "solved"
                ? "bg-green-100 text-green-800 border-green-300"
                : puzzleStatus === "failedAttempt"
                ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                : "bg-blue-100 text-blue-800 border-blue-300"
            }`}
          >
            {userMessage}
          </div>
        )}
      </div>

      {/* Right Column: Puzzle Info/Explanation */}
      <div className="w-full md:w-1/3 flex-shrink-0 mt-4 md:mt-0">
        <div className="p-4 border rounded-lg shadow bg-card min-h-[200px]">
          <h3 className="text-lg font-semibold mb-2">
            Puzzle Details & Explanation
          </h3>
          {puzzleStatus === "loadingNewPuzzle" && !currentPuzzle && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
          {currentPuzzle && puzzleStatus !== "loadingNewPuzzle" && (
            <div className="text-sm mb-2">
              {/* --- Display Lichess Puzzle ID --- */}
              {currentPuzzle.puzzleId && (
                <p>
                  <strong>Puzzle ID:</strong> {currentPuzzle.puzzleId}
                </p>
              )}
              <p>
                <strong>Theme:</strong>{" "}
                {MATE_THEMES.find((t) => t.value === currentPuzzle.theme)
                  ?.label || currentPuzzle.theme}
              </p>
              {currentPuzzle.rating && (
                <p>
                  <strong>Rating:</strong> {currentPuzzle.rating}
                </p>
              )}
            </div>
          )}

          {puzzleStatus === "loadingExplanation" && (
            <p className="text-sm text-gray-500">Loading explanation...</p>
          )}

          {puzzleExplanation ? (
            <div className="text-sm whitespace-pre-wrap mt-2 border-t pt-2">
              {puzzleExplanation}
            </div>
          ) : (
            puzzleStatus !== "loadingNewPuzzle" &&
            puzzleStatus !== "loadingExplanation" &&
            puzzleStatus !== "idle" &&
            puzzleStatus !== "error" && (
              <p className="text-sm text-gray-500 mt-2 border-t pt-2">
                Solve the puzzle or click "Show Solution" to see the
                explanation.
              </p>
            )
          )}

          <div className="mt-4 space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                // TODO: Implement Show Solution Logic (Step 2.F)
                console.log(
                  "Show solution clicked. Current puzzle:",
                  currentPuzzle
                );
                setUserMessage("Showing solution (placeholder)...");
                setPuzzleStatus("showingSolution");
                setArrows([]); // Clear hint arrows when showing solution
                setHintShown(false);
              }}
              disabled={
                !currentPuzzle ||
                puzzleStatus === "loadingNewPuzzle" ||
                puzzleStatus === "showingSolution" ||
                puzzleStatus === "processingPlayerMove"
              }
            >
              Show Solution
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleHintClick}
              disabled={
                !currentPuzzle ||
                puzzleStatus !== "active" ||
                hintShown ||
                (currentPuzzle &&
                  currentMoveIndexInSolution >=
                    currentPuzzle.solutionMoves.length)
              }
            >
              {hintShown ? "Hint Shown" : "Get Hint"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PuzzlePage;
