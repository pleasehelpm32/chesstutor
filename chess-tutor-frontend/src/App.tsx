// src/App.tsx
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, {
  useEffect,
  useState,
  useCallback,
  useRef, // Import useRef
} from "react";
import type { CSSProperties } from "react";
import { Chess } from "chess.js";
import type { Square, Color } from "chess.js";

// Import Components
import BackendStatus from "./components/BackendStatus";
import FenInput from "./components/FenInput";
import ChessboardDisplay from "./components/ChessboardDisplay";
import AnalysisControls from "./components/AnalysisControls";
import AnalysisResults from "./components/AnalysisResults";
import { Label } from "./components/ui/label";
import { Slider } from "./components/ui/slider";

// --- Define Types ---
interface AnalysisMove {
  move: string;
  isCheckmate: boolean;
}
interface AnalysisResponse {
  topMoves: AnalysisMove[];
}
interface ExplainResponse {
  explanation: string;
}
interface ComputerMoveResponse {
  move: string | null; // Can be null if no move found
  message?: string;
}
const validMoveDotStyle: CSSProperties = {
  // Green dot using radial gradient for better appearance
  background:
    "radial-gradient(circle, rgba(40, 167, 69, 0.6) 25%, transparent 30%)",
  // Ensure the dot doesn't interfere with piece dragging (optional but good practice)
  pointerEvents: "none",
};
const selectedPieceSquareStyle: CSSProperties = {
  // Subtle yellow highlight for the selected piece's square
  backgroundColor: "rgba(255, 255, 0, 0.3)",
};

type SquareStyles = { [square: string]: CSSProperties };
type Arrows = Array<[string, string, string?]>;
type MoveNumberStyles = { [square: string]: number };

// --- Constants ---
const MAX_BOARD_WIDTH = 560; // Max width for the board
const MIN_BOARD_WIDTH = 250; // Min width to prevent extreme shrinking

// --- React Component ---
function App() {
  // --- State Variables ---
  const [backendStatus, setBackendStatus] = useState("checking...");
  const [game, setGame] = useState(() => new Chess());
  const [fenInput, setFenInput] = useState(game.fen());
  const [fenLoadError, setFenLoadError] = useState<string | null>(null);
  const [boardWidth, setBoardWidth] = useState(MIN_BOARD_WIDTH); // Start with min
  const [isLoading, setIsLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(
    null
  );
  const [explanationResult, setExplanationResult] =
    useState<ExplainResponse | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [squareStyles, setSquareStyles] = useState<SquareStyles>({});
  const [arrows, setArrows] = useState<Arrows>([]);
  const [moveNumberStyles, setMoveNumberStyles] = useState<MoveNumberStyles>(
    {}
  );
  const [isComputerThinking, setIsComputerThinking] = useState(false);
  const [computerSkillLevel, setComputerSkillLevel] = useState(5);
  const playerColor: Color = "w"; // Use Color type from chess.js
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);
  // --- Add this state variable ---
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  // --- Refs ---
  const boardContainerRef = useRef<HTMLDivElement>(null); // Ref for the board's container

  // --- Effects ---

  // Check backend health on mount
  useEffect(() => {
    fetch(import.meta.env.VITE_API_BASE_URL + "/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject("Network error")))
      .then((data) => setBackendStatus(data.status || "error"))
      .catch(() => setBackendStatus("error"));
  }, []);

  // --- Board Resizing Effect ---
  useEffect(() => {
    const handleResize = () => {
      if (boardContainerRef.current) {
        const containerWidth = boardContainerRef.current.clientWidth;
        // Calculate width: take container width, but cap it between MIN and MAX
        const newWidth = Math.max(
          MIN_BOARD_WIDTH,
          Math.min(containerWidth, MAX_BOARD_WIDTH)
        );
        setBoardWidth(newWidth);
      }
    };

    // Run on mount
    handleResize();

    // Add resize listener
    window.addEventListener("resize", handleResize);

    // Cleanup listener on component unmount
    return () => window.removeEventListener("resize", handleResize);
  }, []); // Empty dependency array means this effect runs once on mount and cleans up on unmount

  const clearVisuals = useCallback(() => {
    setSquareStyles({});
    setArrows([]);
    setMoveNumberStyles({});
    setSelectedSquare(null);
  }, []);

  // --- Game Logic Functions ---

  const loadFen = useCallback(
    (fenToLoad: string) => {
      try {
        const newGame = new Chess(fenToLoad);
        setGame(newGame);
        setFenInput(newGame.fen());
        setFenLoadError(null);
        setGameOverMessage(null);
        setAnalysisResult(null);
        setExplanationResult(null);
        setAnalysisError(null);
        setIsComputerThinking(false);
        clearVisuals();
      } catch (e) {
        setFenLoadError("Invalid FEN string");
        clearVisuals();
      }
    },
    [clearVisuals]
  );

  const handleFenInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFen = event.target.value;
    setFenInput(newFen);
    // Attempt to load immediately or maybe add a small debounce/delay
    loadFen(newFen);
  };

  const checkGameOver = useCallback((currentGame: Chess) => {
    if (currentGame.isGameOver()) {
      let message = "Game Over: ";
      if (currentGame.isCheckmate()) {
        message += `Checkmate! ${
          currentGame.turn() === "w" ? "Black" : "White"
        } wins.`;
      } else if (currentGame.isStalemate()) {
        message += "Stalemate (Draw).";
      } else if (currentGame.isThreefoldRepetition()) {
        message += "Draw by Threefold Repetition.";
      } else if (currentGame.isInsufficientMaterial()) {
        message += "Draw by Insufficient Material.";
      } else if (currentGame.isDraw()) {
        message += "Draw by 50-move rule.";
      }
      setGameOverMessage(message);
      return true;
    }
    setGameOverMessage(null);
    return false;
  }, []);

  const triggerComputerMove = useCallback(
    async (currentGame: Chess) => {
      if (checkGameOver(currentGame)) return;
      if (currentGame.turn() === playerColor) return;

      setIsComputerThinking(true);
      setAnalysisResult(null);
      setExplanationResult(null);
      setAnalysisError(null);
      clearVisuals();

      try {
        console.log("Requesting computer move...");
        const response = await fetch(
          import.meta.env.VITE_API_BASE_URL + "/api/get-computer-move",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fen: currentGame.fen(),
              skillLevel: computerSkillLevel,
            }),
          }
        );
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            `Computer move API failed: ${response.status} - ${
              errorData?.error || "Unknown error"
            }`
          );
        }

        const data: ComputerMoveResponse = await response.json();

        if (data.move) {
          console.log("Computer move received:", data.move);
          const gameAfterComputerMove = new Chess(currentGame.fen());
          const computerMoveResult = gameAfterComputerMove.move(data.move);

          if (computerMoveResult === null) {
            console.error(
              "!!! ERROR: Computer returned an illegal move:",
              data.move,
              "FEN:",
              currentGame.fen()
            );
            throw new Error(
              "Computer made an illegal move according to chess.js."
            );
          } else {
            setGame(gameAfterComputerMove);
            setFenInput(gameAfterComputerMove.fen());
            console.log(
              "Computer move applied. New FEN:",
              gameAfterComputerMove.fen()
            );
            checkGameOver(gameAfterComputerMove);
          }
        } else {
          console.log("Computer has no legal moves.", data.message);
          checkGameOver(currentGame);
        }
      } catch (error) {
        console.error("Error during computer turn:", error);
        setAnalysisError(
          `Computer turn failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      } finally {
        setIsComputerThinking(false);
      }
    },
    [playerColor, computerSkillLevel, checkGameOver, clearVisuals]
  );

  const onPieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square): boolean => {
      if (
        isComputerThinking ||
        game.isGameOver() ||
        game.turn() !== playerColor
      ) {
        return false;
      }

      const gameCopy = new Chess(game.fen());
      let moveResult = null;
      try {
        moveResult = gameCopy.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });
      } catch (e) {
        return false;
      }

      if (moveResult === null) {
        // The move failed. Re-show the valid moves for the source square.
        // This provides feedback that the drop location was invalid.
        // Need to ensure onSquareClick is stable or included in deps if called directly.
        // A slightly safer way without direct call:
        setSelectedSquare(sourceSquare); // Re-set selected square
        const moves = game.moves({ square: sourceSquare, verbose: true });
        const newStyles: SquareStyles = {
          [sourceSquare]: selectedPieceSquareStyle,
        };
        moves.forEach((move) => {
          newStyles[move.to] = validMoveDotStyle;
        });
        setSquareStyles(newStyles);
        setArrows([]);
        setMoveNumberStyles({});
        return false; // Indicate move failed
      }
      // --- User move was valid ---
      setGame(gameCopy);
      setFenInput(gameCopy.fen());
      clearVisuals();
      setAnalysisResult(null);
      setExplanationResult(null);
      setAnalysisError(null);

      if (checkGameOver(gameCopy)) {
        return true;
      }

      setTimeout(() => triggerComputerMove(gameCopy), 100);

      return true;
    },
    [
      game,
      isComputerThinking,
      playerColor,
      triggerComputerMove,
      checkGameOver,
      clearVisuals,
    ]
  );

  // --- Handle clicking on a square ---
  const onSquareClick = useCallback(
    (square: Square) => {
      // Don't do anything if it's not the player's turn, computer is thinking, or game over
      if (
        game.turn() !== playerColor ||
        isComputerThinking ||
        game.isGameOver()
      ) {
        clearVisuals(); // Clear any existing visuals if clicked out of turn/game over
        return;
      }

      const pieceOnSquare = game.get(square);

      // --- Logic for clicking a square AFTER a piece was already selected ---
      if (selectedSquare) {
        // If clicking the same square again, deselect
        if (square === selectedSquare) {
          clearVisuals();
          return;
        }

        // Check if the clicked square is a valid move destination
        const movesFromSelected = game.moves({
          square: selectedSquare,
          verbose: true,
        });
        const foundMove = movesFromSelected.find((move) => move.to === square);

        if (foundMove) {
          // Simulate the drop/move action if a valid destination is clicked
          onPieceDrop(selectedSquare, square); // Use the existing drop logic
          // onPieceDrop will handle clearing visuals after the move
          return;
        }
        // If clicking another square that isn't a valid move, fall through to potentially select that square if it's the player's piece
      }

      // --- Logic for selecting a piece (or clicking empty/opponent) ---

      // If clicking an empty square or opponent's piece when nothing is selected, clear visuals
      if (!pieceOnSquare || pieceOnSquare.color !== playerColor) {
        clearVisuals();
        return;
      }

      // --- Player clicked their own piece (and it wasn't a move destination) ---
      setSelectedSquare(square); // Track the selected square

      // Get valid moves for the clicked piece
      const moves = game.moves({ square: square, verbose: true });

      // Create new styles: highlight selected square + dot valid moves
      const newStyles: SquareStyles = {
        [square]: selectedPieceSquareStyle, // Highlight the selected piece's square
      };
      moves.forEach((move) => {
        // Check if the target square already has a style (e.g., from analysis)
        // Merge styles if necessary, giving precedence to the move dot maybe?
        // For simplicity now, just overwrite with the dot.
        newStyles[move.to] = { ...newStyles[move.to], ...validMoveDotStyle };
      });

      // Set the styles, replacing any previous highlights/dots from analysis
      // but keeping the selected square highlight
      setSquareStyles(newStyles);
      // Clear arrows/numbers from potential previous analysis
      setArrows([]);
      setMoveNumberStyles({});
    },
    [
      game,
      playerColor,
      isComputerThinking,
      selectedSquare,
      clearVisuals,
      onPieceDrop,
    ] // <<< Update Dependencies
  );

  // --- Analysis Functions ---
  const handleAnalyzeClick = async () => {
    const API_BASE_URL =
      import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
    const currentFen = game.fen();
    if (game.isGameOver()) {
      setAnalysisError("Cannot analyze: Game is over.");
      return;
    }

    setIsLoading(true);
    setAnalysisResult(null);
    setExplanationResult(null);
    setAnalysisError(null);
    clearVisuals();

    try {
      const analyzeResponse = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: currentFen }),
      });
      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json().catch(() => ({}));
        throw new Error(
          `Analysis failed: ${analyzeResponse.status} ${
            analyzeResponse.statusText
          } - ${errorData?.error || "Unknown error"}`
        );
      }
      const analysisData: AnalysisResponse = await analyzeResponse.json();
      setAnalysisResult(analysisData);

      const newStyles: SquareStyles = {};
      const newArrows: Arrows = [];
      const newMoveNumbers: MoveNumberStyles = {};
      const highlightColor = "rgba(255, 255, 0, 0.4)";
      const arrowColor = "rgb(255, 165, 0)";

      if (analysisData.topMoves && analysisData.topMoves.length > 0) {
        analysisData.topMoves.forEach((analysisMove, index) => {
          if (analysisMove.move && analysisMove.move.length >= 4) {
            const fromSquare = analysisMove.move.substring(0, 2);
            const toSquare = analysisMove.move.substring(2, 4);
            const isValidSquare = (sq: string) => /^[a-h][1-8]$/.test(sq);

            if (isValidSquare(fromSquare) && isValidSquare(toSquare)) {
              newStyles[fromSquare] = { backgroundColor: highlightColor };
              newStyles[toSquare] = { backgroundColor: highlightColor };
              if (index < 3) {
                newArrows.push([fromSquare, toSquare, arrowColor]);
                newMoveNumbers[toSquare] = index + 1;
              }
            }
          }
        });
      }
      setSquareStyles(newStyles);
      setArrows(newArrows);
      setMoveNumberStyles(newMoveNumbers);

      if (!analysisData.topMoves || analysisData.topMoves.length === 0) {
        setExplanationResult(null);
      } else {
        const explainResponse = await fetch(`${API_BASE_URL}/api/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fen: currentFen,
            topMoves: analysisData.topMoves,
          }),
        });
        if (!explainResponse.ok) {
          const errorData = await explainResponse.json().catch(() => ({}));
          console.error(
            `Explanation failed: ${explainResponse.status} ${
              explainResponse.statusText
            } - ${errorData?.error || "Unknown error"}`
          );
          setExplanationResult({ explanation: "Error fetching explanation." });
        } else {
          const explanationData: ExplainResponse = await explainResponse.json();
          setExplanationResult(explanationData);
        }
      }
    } catch (error) {
      console.error("Analysis workflow error:", error);
      const message =
        error instanceof Error ? error.message : "Unknown analysis error";
      setAnalysisError(message);
      clearVisuals();
    } finally {
      setIsLoading(false);
    }
  };

  // --- Render JSX ---
  return (
    // Reduced padding slightly on smallest screens
    <div className="container mx-auto p-2 sm:p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-4 text-center">Chess Tutor</h1>
      <BackendStatus status={backendStatus} />

      {/* Adjusted gap for potentially better mobile spacing */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        {/* Left side (Board, Controls, Settings) */}
        <div className="flex-grow md:w-2/3 flex flex-col">
          {" "}
          {/* Ensure this column flows */}
          <FenInput
            fen={fenInput}
            onFenChange={handleFenInputChange}
            fenError={fenLoadError}
            isLoading={isLoading || isComputerThinking}
          />
          {/* --- Board Container --- */}
          {/* Added a ref here and w-full to ensure it takes available space */}
          {/* Added min-h-[250px] to prevent collapse before JS resize */}
          <div
            ref={boardContainerRef}
            className="w-full relative my-2" // Added margin-y
            style={{ minHeight: `${MIN_BOARD_WIDTH}px` }} // Prevent collapse
          >
            <ChessboardDisplay
              // Use the calculated boardWidth state
              boardWidth={boardWidth}
              position={game.fen()}
              squareStyles={squareStyles}
              arrows={arrows}
              moveNumberStyles={moveNumberStyles}
              onPieceDrop={onPieceDrop}
              onSquareClick={onSquareClick}
              arePiecesDraggable={
                !isComputerThinking &&
                !game.isGameOver() &&
                game.turn() === playerColor
              }
              boardOrientation={playerColor === "w" ? "white" : "black"}
            />
          </div>
          {/* --- Game Over Message --- */}
          {gameOverMessage && (
            <div className="mt-2 mb-2 p-3 text-center font-semibold bg-blue-100 text-blue-800 rounded border border-blue-300">
              {gameOverMessage}
            </div>
          )}
          {/* --- Controls --- */}
          {/* Reduced top margin slightly */}
          <div className="mt-2 space-y-3">
            <AnalysisControls
              isLoading={isLoading}
              canAnalyze={!isComputerThinking && !game.isGameOver()}
              onAnalyzeClick={handleAnalyzeClick}
            />
            <div className="pt-2">
              <Label
                htmlFor="skillLevel"
                className="text-sm font-medium text-gray-700"
              >
                Computer Skill Level: {computerSkillLevel}
              </Label>
              <Slider
                id="skillLevel"
                min={0}
                max={20}
                step={1}
                value={[computerSkillLevel]}
                onValueChange={(value) => setComputerSkillLevel(value[0])}
                className="mt-1"
                disabled={isComputerThinking || isLoading}
              />
            </div>
          </div>
        </div>

        {/* Right side (Analysis Results Panel) */}
        {/* Added mt-4 for spacing when stacked vertically */}
        <div className="w-full md:w-1/3 flex-shrink-0 mt-4 md:mt-0">
          {isComputerThinking && (
            <div className="mb-3 p-2 text-center text-sm font-medium bg-gray-200 text-gray-700 rounded animate-pulse">
              Computer is thinking...
            </div>
          )}
          <AnalysisResults
            isLoading={isLoading}
            analysisError={analysisError}
            analysisResult={analysisResult}
            explanationResult={explanationResult}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
