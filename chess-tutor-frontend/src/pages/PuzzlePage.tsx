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
import { Lightbulb } from "lucide-react";

// --- Types ---
interface Puzzle {
  id: string; // Prisma's internal UUID
  puzzleId: string | null; // The Lichess PuzzleId
  fen: string;
  solutionMoves: string[];
  theme: string;
  rating?: number;
}

// interface ExplainResponse { // Not used directly in this component yet
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
type Arrows = Array<[string, string, string?]>;

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
  const [hintShown, setHintShown] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null); // For click-to-move

  // --- Refs ---
  const boardContainerRef = useRef<HTMLDivElement>(null);

  // --- Callbacks & Helper Functions ---
  const clearBoardVisuals = useCallback(() => {
    setSquareStyles({});
    setArrows([]);
    // setSelectedSquare(null); // Don't clear selectedSquare here, onSquareClick manages it
  }, []);

  const resetForNewPuzzle = useCallback(() => {
    setCurrentPuzzle(null);
    setCurrentMoveIndexInSolution(0);
    setPuzzleExplanation(null);
    clearBoardVisuals();
    setFetchError(null);
    setHintShown(false);
    setSelectedSquare(null); // Reset selected square for new puzzle
  }, [clearBoardVisuals]);

  const fetchNewPuzzle = useCallback(
    async (themeToFetch: string) => {
      console.log("Fetching new puzzle with theme:", themeToFetch);
      setPuzzleStatus("loadingNewPuzzle");
      setUserMessage("Loading new puzzle...");
      resetForNewPuzzle();

      try {
        const puzzleData = await getRandomPuzzle(themeToFetch);
        if (
          puzzleData &&
          puzzleData.fen &&
          puzzleData.solutionMoves &&
          puzzleData.solutionMoves.length > 0
        ) {
          setCurrentPuzzle(puzzleData);
          let gameAfterInitialComputerMove = new Chess(puzzleData.fen);
          const initialComputerMove = puzzleData.solutionMoves[0];
          const moveResult =
            gameAfterInitialComputerMove.move(initialComputerMove);

          if (!moveResult) {
            console.error(
              `Failed to make initial setup move "${initialComputerMove}" for puzzle ${puzzleData.puzzleId}. Loading original FEN.`
            );
            setGameInstance(new Chess(puzzleData.fen));
            setPlayerToMove(new Chess(puzzleData.fen).turn());
            setCurrentMoveIndexInSolution(0);
            setUserMessage(
              `Puzzle loaded (initial move error). ${
                new Chess(puzzleData.fen).turn() === "w" ? "White" : "Black"
              } to move.`
            );
          } else {
            setGameInstance(gameAfterInitialComputerMove);
            setPlayerToMove(gameAfterInitialComputerMove.turn());
            setCurrentMoveIndexInSolution(1);
            setUserMessage(
              `Puzzle ready. ${
                gameAfterInitialComputerMove.turn() === "w" ? "White" : "Black"
              } to move.`
            );
          }
          setPuzzleStatus("active");
          console.log("Puzzle loaded:", puzzleData);
        } else {
          throw new Error("No valid puzzle data received from API.");
        }
      } catch (error) {
        console.error("Failed to fetch or setup puzzle:", error);
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
      setHintShown(false);
      setArrows([]);
      setSelectedSquare(null); // Clear click-selection on drop

      if (puzzleStatus !== "active" || !currentPuzzle || !gameInstance) {
        return false;
      }
      const currentTurnInGame = gameInstance.turn();
      if (
        currentMoveIndexInSolution >= currentPuzzle.solutionMoves.length ||
        (currentMoveIndexInSolution % 2 === 0 &&
          currentPuzzle.solutionMoves.length > 1 &&
          currentPuzzle.solutionMoves.length > currentMoveIndexInSolution)
      ) {
        console.warn(
          "onPieceDrop: Not player's turn in sequence or sequence ended. Index:",
          currentMoveIndexInSolution
        );
        setUserMessage("Not your turn in the puzzle sequence or puzzle ended.");
        return false;
      }
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

      const expectedMoveUCI =
        currentPuzzle.solutionMoves[currentMoveIndexInSolution];
      console.log(
        `Player attempting move (sol. index ${currentMoveIndexInSolution}): ${userMoveUCI}, Expected: ${expectedMoveUCI}`
      );

      if (userMoveUCI === expectedMoveUCI) {
        setPuzzleStatus("processingPlayerMove");
        const newGame = new Chess(gameInstance.fen());
        const moveResult = newGame.move(chessJsMoveObject);
        if (!moveResult) {
          console.error(
            "CRITICAL ERROR: Player's correct move failed on internal chess.js.",
            chessJsMoveObject
          );
          setUserMessage("An error occurred. Please try a new puzzle.");
          setPuzzleStatus("error");
          return false;
        }
        setGameInstance(newGame);
        const nextMoveIndexAfterPlayer = currentMoveIndexInSolution + 1;
        setCurrentMoveIndexInSolution(nextMoveIndexAfterPlayer);
        clearBoardVisuals();

        if (newGame.isCheckmate()) {
          setPuzzleStatus("solved");
          setUserMessage("Puzzle Solved! Checkmate!");
          console.log("Puzzle solved by player's move!");
          return true;
        } else if (
          nextMoveIndexAfterPlayer >= currentPuzzle.solutionMoves.length
        ) {
          console.warn(
            "Reached end of solution moves after player's move, but not checkmate. Puzzle ID:",
            currentPuzzle.id
          );
          setUserMessage("Sequence complete, but not checkmate by player.");
          setPuzzleStatus("solved");
          return true;
        }

        setUserMessage("Correct! Opponent thinking...");
        setTimeout(() => {
          if (nextMoveIndexAfterPlayer < currentPuzzle.solutionMoves.length) {
            const opponentMoveNotation =
              currentPuzzle.solutionMoves[nextMoveIndexAfterPlayer];
            const gameAfterOpponent = new Chess(newGame.fen());
            const opponentMoveResult =
              gameAfterOpponent.move(opponentMoveNotation);
            if (!opponentMoveResult) {
              console.error(
                "Error making opponent's move:",
                opponentMoveNotation,
                "FEN:",
                newGame.fen(),
                "Puzzle ID:",
                currentPuzzle.id
              );
              setUserMessage("Error with puzzle solution (opponent's move).");
              setPuzzleStatus("error");
              return;
            }
            setGameInstance(gameAfterOpponent);
            const nextMoveIndexAfterOpponent = nextMoveIndexAfterPlayer + 1;
            setCurrentMoveIndexInSolution(nextMoveIndexAfterOpponent);
            setPlayerToMove(gameAfterOpponent.turn());
            if (gameAfterOpponent.isCheckmate()) {
              console.error(
                "Opponent delivered checkmate - puzzle logic error. Puzzle ID:",
                currentPuzzle.id
              );
              setUserMessage("Opponent delivered checkmate!");
              setPuzzleStatus("error");
            } else if (
              nextMoveIndexAfterOpponent >= currentPuzzle.solutionMoves.length
            ) {
              setUserMessage(
                `Opponent replied. ${
                  gameAfterOpponent.turn() === "w" ? "White" : "Black"
                } to move for the win!`
              );
              setPuzzleStatus("active");
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

  const onSquareClick = useCallback(
    (square: Square) => {
      setHintShown(false);
      setArrows([]);

      if (puzzleStatus !== "active" || !currentPuzzle || !gameInstance) {
        clearBoardVisuals();
        setSelectedSquare(null);
        return;
      }

      const currentTurnInGame = gameInstance.turn();
      const pieceOnClickedSquare = gameInstance.get(square);

      if (selectedSquare) {
        if (square === selectedSquare) {
          clearBoardVisuals();
          setSelectedSquare(null);
          return;
        }
        const movesFromSelected = gameInstance.moves({
          square: selectedSquare,
          verbose: true,
        });
        const move = movesFromSelected.find((m) => m.to === square);
        if (move) {
          const pieceBeingMoved = gameInstance.get(selectedSquare);
          if (pieceBeingMoved) {
            const moveSuccessful = onPieceDrop(
              selectedSquare,
              square,
              `${pieceBeingMoved.color}${pieceBeingMoved.type.toUpperCase()}`
            );
            // onPieceDrop now clears selectedSquare internally if successful or on any attempt
            if (!moveSuccessful) {
              // If onPieceDrop returned false (e.g. wrong move in sequence), re-highlight selected piece and its moves
              const currentSelectedPieceMoves = gameInstance.moves({
                square: selectedSquare,
                verbose: true,
              });
              const newStyles: SquareStyles = {
                [selectedSquare]: { backgroundColor: "rgba(255, 255, 0, 0.3)" },
              };
              currentSelectedPieceMoves.forEach((m) => {
                newStyles[m.to] = {
                  background:
                    "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
                  borderRadius: "50%",
                };
              });
              setSquareStyles(newStyles);
            }
          } else {
            clearBoardVisuals();
            setSelectedSquare(null);
          }
          return;
        }
      }

      if (
        pieceOnClickedSquare &&
        pieceOnClickedSquare.color === currentTurnInGame
      ) {
        setSelectedSquare(square);
        const validMoves = gameInstance.moves({
          square: square,
          verbose: true,
        });
        const newStyles: SquareStyles = {
          [square]: { backgroundColor: "rgba(255, 255, 0, 0.3)" },
        };
        validMoves.forEach((m) => {
          newStyles[m.to] = {
            background:
              "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
            borderRadius: "50%",
          };
        });
        setSquareStyles(newStyles);
      } else {
        clearBoardVisuals();
        setSelectedSquare(null);
      }
    },
    [
      gameInstance,
      puzzleStatus,
      currentPuzzle,
      selectedSquare,
      onPieceDrop,
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
    if (
      currentMoveIndexInSolution % 2 === 0 &&
      currentPuzzle.solutionMoves.length > 1 &&
      currentPuzzle.solutionMoves.length > currentMoveIndexInSolution
    ) {
      setUserMessage(
        "Hint is for your move. It's currently opponent's (simulated) turn in sequence."
      );
      return;
    }
    setHintShown(true);
    const nextPlayerMoveUCI =
      currentPuzzle.solutionMoves[currentMoveIndexInSolution];
    if (nextPlayerMoveUCI && nextPlayerMoveUCI.length >= 4) {
      const fromSquare = nextPlayerMoveUCI.substring(0, 2) as Square;
      const toSquare = nextPlayerMoveUCI.substring(2, 4) as Square;
      const hintArrowColor = "rgba(0, 100, 255, 0.5)";
      setArrows([[fromSquare, toSquare, hintArrowColor]]);
      setUserMessage(
        `Hint: Consider moving from ${fromSquare} to ${toSquare}.`
      );
    } else {
      setUserMessage("Could not determine hint for the next move.");
    }
  };

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

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6">
      <div className="flex-grow md:w-2/3 flex flex-col">
        <div className="mb-4 p-4 border rounded-lg shadow bg-card">
          <h3 className="text-lg font-semibold mb-3">Puzzle Controls</h3>
          <div className="mb-3">
            <Label htmlFor="theme-select" className="mb-1 block">
              Select Puzzle Type:
            </Label>
            <Select
              value={selectedTheme}
              onValueChange={(value) => setSelectedTheme(value)}
              disabled={
                puzzleStatus === "loadingNewPuzzle" ||
                puzzleStatus === "processingPlayerMove"
              }
            >
              <SelectTrigger id="theme-select" className="w-full">
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Button
              onClick={() => fetchNewPuzzle(selectedTheme)}
              disabled={
                puzzleStatus === "loadingNewPuzzle" ||
                puzzleStatus === "processingPlayerMove"
              }
              className="w-full sm:flex-1"
            >
              {puzzleStatus === "loadingNewPuzzle"
                ? "Loading..."
                : "New Puzzle"}
            </Button>
            <Button
              variant="outline"
              className="w-full sm:flex-1 flex items-center justify-center gap-2 border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500"
              onClick={handleHintClick}
              disabled={
                !currentPuzzle ||
                puzzleStatus !== "active" ||
                hintShown ||
                (currentPuzzle &&
                  currentMoveIndexInSolution >=
                    currentPuzzle.solutionMoves.length) ||
                (currentMoveIndexInSolution % 2 === 0 &&
                  currentPuzzle &&
                  currentPuzzle.solutionMoves.length > 1 &&
                  currentPuzzle.solutionMoves.length >
                    currentMoveIndexInSolution) // Disable hint if it's "opponent's turn" in sequence
              }
            >
              <Lightbulb size={18} />
              {hintShown ? "Hint Shown" : "Get Hint"}
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
                arrows={arrows}
                moveNumberStyles={{}}
                onPieceDrop={onPieceDrop}
                onSquareClick={onSquareClick} // Pass the named callback
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

      <div className="w-full md:w-1/3 flex-shrink-0 mt-4 md:mt-0">
        <div className="p-4 border rounded-lg shadow bg-card min-h-[200px]">
          <h3 className="text-lg font-semibold mb-2">
            Puzzle Details & Explanation
          </h3>
          {puzzleStatus === "loadingNewPuzzle" && !currentPuzzle && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/3" />{" "}
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
          {currentPuzzle && puzzleStatus !== "loadingNewPuzzle" && (
            <div className="text-sm mb-2">
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
            {/* Show Solution Button Removed */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PuzzlePage;
