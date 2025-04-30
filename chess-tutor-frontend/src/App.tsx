// src/App.tsx
import React, { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Chess } from "chess.js";

// Import Components
import BackendStatus from "./components/BackendStatus";
import FenInput from "./components/FenInput";
import ChessboardDisplay from "./components/ChessboardDisplay";
import AnalysisControls from "./components/AnalysisControls";
import AnalysisResults from "./components/AnalysisResults";

// --- Define Types (can be moved to a shared types file, e.g., src/types.ts) ---

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

// Type for square styles object (highlights)
type SquareStyles = {
  [square: string]: CSSProperties;
};

// Type for arrows: Array of [from, to, optionalColor]
type Arrows = Array<[string, string, string?]>;

// Type for move number overlays
type MoveNumberStyles = {
  [square: string]: number;
};

// --- React Component ---

function App() {
  // --- State Variables ---
  const [backendStatus, setBackendStatus] = useState("checking...");
  const [fen, setFen] = useState(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  );
  const [fenError, setFenError] = useState<string | null>(null);
  const [isValidFen, setIsValidFen] = useState(true);
  const [boardWidth, setBoardWidth] = useState(400);
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

  // --- Effects ---

  // Check backend health on mount
  useEffect(() => {
    fetch("http://localhost:3001/api/health")
      .then((res) => {
        if (!res.ok) throw new Error("Network response was not ok");
        return res.json();
      })
      .then((data) => setBackendStatus(data.status || "error"))
      .catch(() => setBackendStatus("error"));
  }, []);

  // Validate FEN whenever it changes
  useEffect(() => {
    validateFen(fen);
  }, [fen]);

  // Basic board resizing
  useEffect(() => {
    const container = document.querySelector(".chessboard-container");
    if (container) {
      setBoardWidth(Math.min(container.clientWidth, 560));
    }
  }, []);

  // --- Helper Functions ---

  // Validate FEN and clear visuals if invalid
  const validateFen = (currentFen: string) => {
    try {
      new Chess(currentFen);
      setFenError(null);
      setIsValidFen(true);
    } catch (e) {
      setFenError("Invalid FEN string");
      setIsValidFen(false);
      setAnalysisResult(null);
      setExplanationResult(null);
      setSquareStyles({});
      setArrows([]);
      setMoveNumberStyles({});
    }
  };

  // Handle changes in the FEN input field
  const handleFenChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFen(event.target.value);
  };

  // Handle the "Analyze Position" button click
  const handleAnalyzeClick = async () => {
    if (!isValidFen) return;

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
        body: JSON.stringify({ fen }),
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
      // --- End Generate Visuals ---

      if (!analysisData.topMoves || analysisData.topMoves.length === 0) {
        setExplanationResult(null); // No moves, no explanation needed
      } else {
        // --- Call /api/explain ---
        const explainResponse = await fetch(
          "http://localhost:3001/api/explain",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fen, topMoves: analysisData.topMoves }),
          }
        );
        if (!explainResponse.ok) {
          const errorData = await explainResponse.json().catch(() => ({}));
          console.error(
            `Explanation failed: ${explainResponse.status} ${
              explainResponse.statusText
            } - ${errorData?.error || "Unknown error"}`
          );
          setExplanationResult({
            explanation: "Error fetching explanation.",
          });
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
      setSquareStyles({});
      setArrows([]);
      setMoveNumberStyles({});
    } finally {
      setIsLoading(false);
    }
  };

  // --- Render JSX ---
  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4 text-center">Chess Tutor</h1>

      <BackendStatus status={backendStatus} />

      <FenInput
        fen={fen}
        onFenChange={handleFenChange}
        fenError={fenError}
        isLoading={isLoading}
      />

      <ChessboardDisplay
        fen={fen}
        isValidFen={isValidFen}
        boardWidth={boardWidth}
        squareStyles={squareStyles}
        arrows={arrows}
        moveNumberStyles={moveNumberStyles}
      />

      <AnalysisControls
        isLoading={isLoading}
        isValidFen={isValidFen}
        onAnalyzeClick={handleAnalyzeClick}
      />

      <AnalysisResults
        isLoading={isLoading}
        analysisError={analysisError}
        analysisResult={analysisResult}
        explanationResult={explanationResult}
      />
    </div>
  );
}

export default App;
