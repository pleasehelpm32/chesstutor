// src/pages/AnalyzerPage.tsx
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useState, useCallback, useRef } from "react";
import type { CSSProperties } from "react";
import { Chess } from "chess.js";
import type { Square, Color } from "chess.js";

// Adjust component import paths relative to the 'pages' directory
import BackendStatus from "../components/BackendStatus";
import FenInput from "../components/FenInput";
import ChessboardDisplay from "../components/ChessboardDisplay";
import AnalysisControls from "../components/AnalysisControls";
import AnalysisResults from "../components/AnalysisResults";
import { Label } from "../components/ui/label";
import { Slider } from "../components/ui/slider";

// Import API service functions
import {
  checkBackendHealth,
  analyzePosition,
  getExplanation,
  getComputerMove,
} from "../services/api"; // Adjust path if needed

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
  cacheHit?: boolean; // Optional cache hit flag
}
// interface ComputerMoveResponse {
//   move: string | null; // Can be null if no move found
//   message?: string;
// }
const validMoveDotStyle: CSSProperties = {
  background:
    "radial-gradient(circle, rgba(40, 167, 69, 0.6) 25%, transparent 30%)",
  pointerEvents: "none",
};
const selectedPieceSquareStyle: CSSProperties = {
  backgroundColor: "rgba(255, 255, 0, 0.3)",
};

type SquareStyles = { [square: string]: CSSProperties };
type Arrows = Array<[string, string, string?]>;
type MoveNumberStyles = { [square: string]: number };

// --- Constants ---
const MAX_BOARD_WIDTH = 560;
const MIN_BOARD_WIDTH = 250;

// --- React Component ---
// Rename function to AnalyzerPage
function AnalyzerPage() {
  // --- State Variables ---
  const [backendStatus, setBackendStatus] = useState("checking...");
  const [game, setGame] = useState(() => new Chess());
  const [fenInput, setFenInput] = useState(game.fen());
  const [fenLoadError, setFenLoadError] = useState<string | null>(null);
  const [boardWidth, setBoardWidth] = useState(MIN_BOARD_WIDTH);
  const [isLoading, setIsLoading] = useState(false); // For analysis loading
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
  const playerColor: Color = "w";
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  // --- Refs ---
  const boardContainerRef = useRef<HTMLDivElement>(null);

  // --- Effects ---

  // Check backend health on mount - **MODIFIED TO USE API SERVICE**
  useEffect(() => {
    checkBackendHealth()
      .then((data) => setBackendStatus(data.status || "error"))
      .catch(() => setBackendStatus("error"));
  }, []);

  // Board Resizing Effect
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

  // --- Helper Functions ---

  const clearVisuals = useCallback(() => {
    setSquareStyles({});
    setArrows([]);
    setMoveNumberStyles({});
    setSelectedSquare(null);
  }, []);

  const loadFen = useCallback(
    (fenToLoad: string) => {
      try {
        const newGame = new Chess(fenToLoad);
        setGame(newGame);
        setFenInput(newGame.fen()); // Sync input with loaded FEN
        setFenLoadError(null);
        setGameOverMessage(null);
        setAnalysisResult(null);
        setExplanationResult(null);
        setAnalysisError(null);
        setIsComputerThinking(false);
        clearVisuals();
        checkGameOver(newGame); // Check game state after loading
      } catch (e) {
        setFenLoadError("Invalid FEN string");
        clearVisuals();
      }
    },
    [clearVisuals] // Added checkGameOver dependency if needed, but it's defined below
  );

  const handleFenInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFen = event.target.value;
    setFenInput(newFen);
    // Load FEN on change
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
  }, []); // Removed setGameOverMessage from deps as it's a setter

  // --- triggerComputerMove - **MODIFIED TO USE API SERVICE** ---
  const triggerComputerMove = useCallback(
    async (currentGame: Chess) => {
      if (checkGameOver(currentGame)) return;
      if (currentGame.turn() === playerColor) return; // Should not happen if called correctly

      setIsComputerThinking(true);
      setAnalysisResult(null);
      setExplanationResult(null);
      setAnalysisError(null); // Clear analysis errors when computer moves
      clearVisuals();

      try {
        console.log("Requesting computer move...");
        // Use the API service function
        const data = await getComputerMove(
          currentGame.fen(),
          computerSkillLevel
        );

        if (data.move) {
          console.log("Computer move received:", data.move);
          const gameAfterComputerMove = new Chess(currentGame.fen());
          // Validate move with chess.js before setting state
          const computerMoveResult = gameAfterComputerMove.move(data.move);

          if (computerMoveResult === null) {
            console.error(
              "!!! ERROR: Computer returned an illegal move:",
              data.move,
              "FEN:",
              currentGame.fen()
            );
            // Keep game state as is, show error
            setAnalysisError("Error: Computer suggested an illegal move.");
          } else {
            setGame(gameAfterComputerMove);
            setFenInput(gameAfterComputerMove.fen()); // Sync FEN input
            console.log(
              "Computer move applied. New FEN:",
              gameAfterComputerMove.fen()
            );
            checkGameOver(gameAfterComputerMove); // Check if computer move ended game
          }
        } else {
          console.log("Computer has no legal moves.", data.message);
          checkGameOver(currentGame); // Check game state (likely stalemate/checkmate)
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
    [playerColor, computerSkillLevel, checkGameOver, clearVisuals] // Added checkGameOver
  );

  // --- onPieceDrop - Handles player moves ---
  const onPieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square): boolean => {
      // Prevent moves if computer thinking, game over, or not player's turn
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
        // Attempt the move
        moveResult = gameCopy.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q", // Always promote to queen for simplicity
        });
      } catch (e) {
        // Catch potential errors from chess.js move validation (though usually returns null)
        console.warn("Error during player move validation:", e);
        return false; // Indicate move failed
      }

      // If move is illegal, chess.js returns null
      if (moveResult === null) {
        // Show valid moves for the source square as feedback
        setSelectedSquare(sourceSquare);
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

      // --- Player move was valid ---
      setGame(gameCopy); // Update game state
      setFenInput(gameCopy.fen()); // Sync FEN input
      clearVisuals(); // Clear selection/move dots
      setAnalysisResult(null); // Clear old analysis
      setExplanationResult(null);
      setAnalysisError(null);

      // Check if the player's move ended the game
      if (checkGameOver(gameCopy)) {
        return true; // Move successful, game over
      }

      // If game not over, trigger computer's move after a short delay
      setTimeout(() => triggerComputerMove(gameCopy), 250); // Delay for smoother feel

      return true; // Indicate move succeeded
    },
    [
      game,
      isComputerThinking,
      playerColor,
      triggerComputerMove,
      checkGameOver,
      clearVisuals,
    ] // Added dependencies
  );

  // --- onSquareClick - Handles selecting pieces and showing valid moves ---
  const onSquareClick = useCallback(
    (square: Square) => {
      if (
        game.turn() !== playerColor ||
        isComputerThinking ||
        game.isGameOver()
      ) {
        clearVisuals();
        return;
      }

      const pieceOnSquare = game.get(square);

      // --- Click after selecting a piece (attempting a move) ---
      if (selectedSquare) {
        if (square === selectedSquare) {
          // Click same square to deselect
          clearVisuals();
          return;
        }
        // Check if clicking a valid destination square
        const movesFromSelected = game.moves({
          square: selectedSquare,
          verbose: true,
        });
        const foundMove = movesFromSelected.find((move) => move.to === square);
        if (foundMove) {
          onPieceDrop(selectedSquare, square); // Execute the move
          return;
        }
        // Clicking elsewhere invalidates selection unless it's another of player's pieces
      }

      // --- Selecting a piece (or clicking empty/opponent) ---
      if (!pieceOnSquare || pieceOnSquare.color !== playerColor) {
        clearVisuals(); // Clicked empty or opponent piece, clear visuals
        return;
      }

      // --- Selecting player's own piece ---
      setSelectedSquare(square);
      const moves = game.moves({ square: square, verbose: true });
      const newStyles: SquareStyles = { [square]: selectedPieceSquareStyle };
      moves.forEach((move) => {
        newStyles[move.to] = validMoveDotStyle;
      });

      // Clear previous analysis visuals but show new move hints
      setSquareStyles(newStyles);
      setArrows([]);
      setMoveNumberStyles({});
      setAnalysisResult(null); // Clear analysis results when selecting a piece
      setExplanationResult(null);
      setAnalysisError(null);
    },
    [
      game,
      playerColor,
      isComputerThinking,
      selectedSquare,
      clearVisuals,
      onPieceDrop,
    ]
  );

  // --- handleAnalyzeClick - **MODIFIED TO USE API SERVICE** ---
  const handleAnalyzeClick = async () => {
    const currentFen = game.fen();
    if (game.isGameOver()) {
      setAnalysisError("Cannot analyze: Game is over.");
      return;
    }

    setIsLoading(true);
    setAnalysisResult(null);
    setExplanationResult(null);
    setAnalysisError(null);
    clearVisuals(); // Clear move hints/selection before showing analysis

    try {
      // Use the API service function
      const analysisData = await analyzePosition(currentFen);
      setAnalysisResult(analysisData);

      // Generate visuals based on analysisData
      const newStyles: SquareStyles = {};
      const newArrows: Arrows = [];
      const newMoveNumbers: MoveNumberStyles = {};
      const highlightColor = "rgba(255, 255, 0, 0.4)";
      const arrowColor = "rgb(255, 165, 0)";

      if (analysisData.topMoves && analysisData.topMoves.length > 0) {
        analysisData.topMoves.forEach((analysisMove, index) => {
          if (analysisMove.move && analysisMove.move.length >= 4) {
            const fromSquare = analysisMove.move.substring(0, 2) as Square;
            const toSquare = analysisMove.move.substring(2, 4) as Square;
            const isValidSquare = (sq: string): sq is Square =>
              /^[a-h][1-8]$/.test(sq);

            if (isValidSquare(fromSquare) && isValidSquare(toSquare)) {
              newStyles[fromSquare] = { backgroundColor: highlightColor };
              newStyles[toSquare] = { backgroundColor: highlightColor };
              if (index < 3) {
                newArrows.push([fromSquare, toSquare, arrowColor]);
                // Add move numbers (optional)
                // newMoveNumbers[toSquare] = index + 1;
              }
            }
          }
        });
      }
      setSquareStyles(newStyles);
      setArrows(newArrows);
      setMoveNumberStyles(newMoveNumbers);

      // Get explanation only if analysis returned moves
      if (!analysisData.topMoves || analysisData.topMoves.length === 0) {
        setExplanationResult(null);
      } else {
        // Use the API service function
        const explanationData = await getExplanation(
          currentFen,
          analysisData.topMoves
        );
        setExplanationResult(explanationData);
      }
    } catch (error) {
      console.error("Analysis workflow error:", error);
      setAnalysisError(
        `Analysis failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      clearVisuals(); // Clear visuals on error too
    } finally {
      setIsLoading(false);
    }
  };

  // --- Render JSX ---
  return (
    // This component now renders the content for the '/' route
    // Reduced padding slightly on smallest screens
    <div className="flex flex-col md:flex-row gap-4 md:gap-6">
      {/* Left side (Board, Controls, Settings) */}
      <div className="flex-grow md:w-2/3 flex flex-col">
        <FenInput
          fen={fenInput}
          onFenChange={handleFenInputChange}
          fenError={fenLoadError}
          isLoading={isLoading || isComputerThinking}
        />
        <div
          ref={boardContainerRef}
          className="w-full relative my-2"
          style={{ minHeight: `${MIN_BOARD_WIDTH}px` }}
        >
          <ChessboardDisplay
            boardWidth={boardWidth}
            position={game.fen()}
            squareStyles={squareStyles}
            arrows={arrows}
            moveNumberStyles={moveNumberStyles} // Pass this if using numbers
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
        {gameOverMessage && (
          <div className="mt-2 mb-2 p-3 text-center font-semibold bg-blue-100 text-blue-800 rounded border border-blue-300">
            {gameOverMessage}
          </div>
        )}
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
  );
}

// Export the component
export default AnalyzerPage;
