// src/App.tsx
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useState, useCallback } from "react";
import type { CSSProperties } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js"; // Import Square type

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

type SquareStyles = { [square: string]: CSSProperties };
type Arrows = Array<[string, string, string?]>;
type MoveNumberStyles = { [square: string]: number };

// --- React Component ---
function App() {
  // --- State Variables ---
  const [backendStatus, setBackendStatus] = useState("checking...");
  // Game state managed by chess.js instance
  const [game, setGame] = useState(() => new Chess()); // Initialize with chess.js
  // FEN state primarily for the input box display and loading new positions
  const [fenInput, setFenInput] = useState(game.fen());
  const [fenLoadError, setFenLoadError] = useState<string | null>(null); // Error loading FEN from input
  const [boardWidth, setBoardWidth] = useState(400);
  const [isLoading, setIsLoading] = useState(false); // For API loading
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(
    null
  );
  const [explanationResult, setExplanationResult] =
    useState<ExplainResponse | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null); // For API errors
  const [squareStyles, setSquareStyles] = useState<SquareStyles>({});
  const [arrows, setArrows] = useState<Arrows>([]);
  const [moveNumberStyles, setMoveNumberStyles] = useState<MoveNumberStyles>(
    {}
  );
  const [isComputerThinking, setIsComputerThinking] = useState(false);
  const [computerSkillLevel, setComputerSkillLevel] = useState(5); // Default skill: 5 (0-20)
  const playerColor: "w" | "b" = "w"; // Track player color (default: white)
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);

  // --- Effects ---

  // Check backend health on mount
  useEffect(() => {
    fetch(import.meta.env.VITE_API_BASE_URL + "/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject("Network error")))
      .then((data) => setBackendStatus(data.status || "error"))
      .catch(() => setBackendStatus("error"));
  }, []);

  // Basic board resizing
  useEffect(() => {
    const container = document.querySelector(".chessboard-container");
    if (container) {
      setBoardWidth(Math.min(container.clientWidth, 560));
    }
    // Consider adding a resize listener for dynamic updates
  }, []);

  // --- Game Logic Functions ---

  // Function to safely update the game state from FEN input
  const loadFen = useCallback((fenToLoad: string) => {
    try {
      const newGame = new Chess(fenToLoad);
      setGame(newGame);
      setFenInput(newGame.fen()); // Sync input box with loaded FEN
      setFenLoadError(null);
      setGameOverMessage(null); // Clear game over message
      // Clear analysis/visuals
      setAnalysisResult(null);
      setExplanationResult(null);
      setAnalysisError(null);
      setSquareStyles({});
      setArrows([]);
      setMoveNumberStyles({});
      // Reset computer thinking state if loading new FEN
      setIsComputerThinking(false);
      // TODO: Decide if player color should reset or be configurable
    } catch (e) {
      setFenLoadError("Invalid FEN string");
    }
  }, []);

  // Handle changes in the FEN input field
  const handleFenInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFen = event.target.value;
    setFenInput(newFen);
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

  // --- Computer Turn Trigger ---
  const triggerComputerMove = useCallback(
    async (currentGame: Chess) => {
      if (checkGameOver(currentGame)) return; // Don't move if game ended
      if (currentGame.turn() === playerColor) return; // Only trigger if it's computer's turn

      setIsComputerThinking(true);
      // Clear analysis from previous turn
      setAnalysisResult(null);
      setExplanationResult(null);
      setAnalysisError(null);
      setSquareStyles({});
      setArrows([]);
      setMoveNumberStyles({});

      try {
        console.log("Requesting computer move...");
        const response = await fetch(
          import.meta.env.VITE_API_BASE_URL + "/api/get-computer-move",
          {
            method: "POST", // Ensure method is POST
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
          // Apply computer move - IMPORTANT: use a fresh copy of the game state
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
            setGame(gameAfterComputerMove); // Update game state
            setFenInput(gameAfterComputerMove.fen()); // Sync FEN input
            console.log(
              "Computer move applied. New FEN:",
              gameAfterComputerMove.fen()
            );
            checkGameOver(gameAfterComputerMove); // Check game status after computer move
          }
        } else {
          // Handle case where backend returns null move (e.g., stalemate already)
          console.log("Computer has no legal moves.", data.message);
          checkGameOver(currentGame); // Re-check game status
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
    [playerColor, computerSkillLevel, checkGameOver]
  );

  // Handle piece drop on the board (user making a move)
  const onPieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square): boolean => {
      // Prevent moves if computer is thinking, game is over, or not player's turn
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
          promotion: "q", // Default promotion
        });
      } catch (e) {
        return false;
      } // Should not happen with valid squares

      if (moveResult === null) return false; // Illegal move

      // --- User move is valid ---
      setGame(gameCopy); // Update state immediately
      setFenInput(gameCopy.fen()); // Sync FEN input
      // Clear analysis/visuals
      setAnalysisResult(null);
      setExplanationResult(null);
      setAnalysisError(null);
      setSquareStyles({});
      setArrows([]);
      setMoveNumberStyles({});

      // Check game over *after* user move
      if (checkGameOver(gameCopy)) {
        return true; // Game ended, don't trigger computer
      }

      setTimeout(() => triggerComputerMove(gameCopy), 100); // 100ms delay

      return true; // Move successful
    },
    [game, isComputerThinking, playerColor, triggerComputerMove, checkGameOver]
  );

  // --- Analysis Functions ---

  // Handle the "Analyze Position" button click
  const handleAnalyzeClick = async () => {
    // Use the current game's FEN
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
    setSquareStyles({});
    setArrows([]);
    setMoveNumberStyles({});

    try {
      // --- Call /api/analyze ---
      const analyzeResponse = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: currentFen }), // Send current game FEN
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

      // --- Generate Visuals ---
      const newStyles: SquareStyles = {};
      const newArrows: Arrows = [];
      const newMoveNumbers: MoveNumberStyles = {};
      const highlightColor = "rgba(255, 255, 0, 0.4)";
      const arrowColor = "rgb(255, 165, 0)"; // Orange arrows

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
                // Only draw arrows/numbers for top 3
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
      // --- End Generate Visuals ---

      if (!analysisData.topMoves || analysisData.topMoves.length === 0) {
        setExplanationResult(null);
      } else {
        // --- Call /api/explain ---
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
          setExplanationResult({ explanation: "Error fetching explanation." }); // Show error in results
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
      // Clear visuals on error
      setSquareStyles({});
      setArrows([]);
      setMoveNumberStyles({});
    } finally {
      setIsLoading(false);
    }
  };

  // --- Render JSX ---
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-4 text-center">Chess Tutor</h1>
      <BackendStatus status={backendStatus} />

      <div className="flex flex-col md:flex-row gap-6">
        {" "}
        {/* Increased gap */}
        {/* Left side (Board, Controls, Settings) */}
        <div className="flex-grow md:w-2/3">
          {" "}
          {/* Give board area more space */}
          <FenInput
            fen={fenInput}
            onFenChange={handleFenInputChange}
            fenError={fenLoadError}
            isLoading={isLoading || isComputerThinking} // Disable FEN input during analysis or computer turn
          />
          <ChessboardDisplay
            position={game.fen()}
            boardWidth={boardWidth}
            squareStyles={squareStyles}
            arrows={arrows}
            moveNumberStyles={moveNumberStyles}
            onPieceDrop={onPieceDrop}
            // Disable dragging if not player's turn, computer thinking, or game over
            arePiecesDraggable={
              !isComputerThinking &&
              !game.isGameOver() &&
              game.turn() === playerColor
            }
            boardOrientation={playerColor === "w" ? "white" : "black"} // Orient board to player
          />
          {/* --- Game Over Message --- */}
          {gameOverMessage && (
            <div className="mt-4 p-3 text-center font-semibold bg-blue-100 text-blue-800 rounded border border-blue-300">
              {gameOverMessage}
            </div>
          )}
          {/* --- Controls --- */}
          <div className="mt-4 space-y-3">
            <AnalysisControls
              isLoading={isLoading}
              // Disable analysis if computer thinking or game over
              canAnalyze={!isComputerThinking && !game.isGameOver()}
              onAnalyzeClick={handleAnalyzeClick}
            />
            {/* --- Skill Level Slider --- */}
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
                disabled={isComputerThinking || isLoading} // Disable while busy
              />
            </div>
            {/* Add buttons for New Game, Flip Board etc. later */}
          </div>
        </div>
        {/* Right side (Analysis Results Panel) */}
        <div className="w-full md:w-1/3 flex-shrink-0">
          {/* Indicate Computer Thinking */}
          {isComputerThinking && (
            <div className="mb-3 p-2 text-center text-sm font-medium bg-gray-200 text-gray-700 rounded animate-pulse">
              Computer is thinking...
            </div>
          )}
          <AnalysisResults
            isLoading={isLoading} // Analysis loading
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
