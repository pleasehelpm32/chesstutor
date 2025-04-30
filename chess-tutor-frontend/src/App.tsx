// src/App.tsx
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

  // --- Effects ---

  // Check backend health on mount
  useEffect(() => {
    fetch("http://localhost:3001/api/health")
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
      const newGame = new Chess(fenToLoad); // Validate FEN by creating instance
      setGame(newGame); // Update game state
      setFenLoadError(null); // Clear any previous loading error
      // Clear analysis visuals when loading a new FEN manually
      setAnalysisResult(null);
      setExplanationResult(null);
      setAnalysisError(null);
      setSquareStyles({});
      setArrows([]);
      setMoveNumberStyles({});
    } catch (e) {
      setFenLoadError("Invalid FEN string"); // Set error if FEN is invalid
    }
  }, []); // No dependencies, this function is stable

  // Handle changes in the FEN input field
  const handleFenInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFen = event.target.value;
    setFenInput(newFen); // Update the input box value
    // Attempt to load the FEN immediately for validation feedback
    loadFen(newFen);
  };

  // Handle piece drop on the board (user making a move)
  const onPieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square, piece: string): boolean => {
      // Prevent moves if analysis is loading
      if (isLoading) return false;

      // Create a copy of the game to test the move
      const gameCopy = new Chess(game.fen());
      let moveResult = null;

      try {
        moveResult = gameCopy.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q", // Default to queen promotion for simplicity
        });
      } catch (e) {
        // Catch errors from invalid move format (less likely with react-chessboard)
        console.error("Error making move:", e);
        return false; // Indicate illegal move
      }

      // If move is illegal chess.js returns null
      if (moveResult === null) {
        return false; // Snap piece back
      }

      // Move is legal, update the main game state
      setGame(gameCopy);

      // Clear previous analysis/explanation after a valid move
      setAnalysisResult(null);
      setExplanationResult(null);
      setAnalysisError(null);
      setSquareStyles({});
      setArrows([]);
      setMoveNumberStyles({});

      // TODO: Trigger computer move logic here in Phase B

      return true; // Move successful
    },
    [game, isLoading] // Depend on game state and loading status
  );

  // --- Analysis Functions ---

  // Handle the "Analyze Position" button click
  const handleAnalyzeClick = async () => {
    // Use the current game's FEN
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
      const analyzeResponse = await fetch("http://localhost:3001/api/analyze", {
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
        const explainResponse = await fetch(
          "http://localhost:3001/api/explain",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fen: currentFen,
              topMoves: analysisData.topMoves,
            }),
          }
        );
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
      {" "}
      {/* Increased max-width slightly */}
      <h1 className="text-2xl font-bold mb-4 text-center">Chess Tutor</h1>
      <BackendStatus status={backendStatus} />
      {/* Use flex layout for board and potential side panel later */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Left side (Board and Controls) */}
        <div className="flex-grow">
          <FenInput
            // Use fenInput for display, but loadFen handles validation/update
            fen={fenInput}
            onFenChange={handleFenInputChange}
            fenError={fenLoadError} // Show loading errors here
            isLoading={isLoading} // Disable while analyzing
          />

          <ChessboardDisplay
            // Pass current game FEN to the board
            position={game.fen()}
            // isValidFen is implicitly true if game object exists
            boardWidth={boardWidth}
            squareStyles={squareStyles}
            arrows={arrows}
            moveNumberStyles={moveNumberStyles}
            // Add the drop handler
            onPieceDrop={onPieceDrop}
            // Enable dragging
            arePiecesDraggable={true}
            // Determine board orientation based on whose turn (optional)
            boardOrientation={game.turn() === "w" ? "white" : "black"}
          />

          <AnalysisControls
            isLoading={isLoading}
            // Disable analysis if game is over
            canAnalyze={!game.isGameOver()} // Use game state instead of isValidFen
            onAnalyzeClick={handleAnalyzeClick}
          />
        </div>

        {/* Right side (Analysis Results - can become side panel) */}
        <div className="w-full md:w-1/3 flex-shrink-0">
          <AnalysisResults
            isLoading={isLoading}
            analysisError={analysisError} // Show API errors here
            analysisResult={analysisResult}
            explanationResult={explanationResult}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
