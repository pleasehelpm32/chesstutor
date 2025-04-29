// src/App.tsx
import React, { useEffect, useState } from "react";
import type { CSSProperties } from "react"; // Import CSSProperties type
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton"; // npx shadcn-ui@latest add skeleton
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard"; // npm install react-chessboard
import type { SquareRendererProps } from "react-chessboard/dist/chessboard";

// --- Define Types ---

interface AnalysisMove {
  move: string; // Expecting algebraic notation like "e2e4"
  isCheckmate: boolean;
}

interface AnalysisResponse {
  topMoves: AnalysisMove[];
}

interface ExplainResponse {
  explanation: string; // Expecting a string, potentially with newlines
}

// Type for square styles object (highlights)
type SquareStyles = {
  [square: string]: CSSProperties;
};

// Type for arrows: Array of [from, to, optionalColor]
type Arrows = Array<[string, string, string?]>;

// Type for move number overlays
type MoveNumberStyles = {
  [square: string]: number; // Map destination square to move number (1, 2, or 3)
};

// --- React Component ---

function App() {
  // --- State Variables ---
  const [backendStatus, setBackendStatus] = useState("checking...");
  const [fen, setFen] = useState(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" // Default: starting position
  );
  const [fenError, setFenError] = useState<string | null>(null);
  const [isValidFen, setIsValidFen] = useState(true);
  const [boardWidth, setBoardWidth] = useState(400); // Initial board size
  const [isLoading, setIsLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(
    null
  );
  const [explanationResult, setExplanationResult] =
    useState<ExplainResponse | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [squareStyles, setSquareStyles] = useState<SquareStyles>({}); // Highlights
  const [arrows, setArrows] = useState<Arrows>([]); // Arrows for top moves
  const [moveNumberStyles, setMoveNumberStyles] = useState<MoveNumberStyles>(
    {}
  ); // Numbers on squares

  // --- Effects ---

  // Check backend health on mount
  useEffect(() => {
    fetch("http://localhost:3001/api/health") // Use your backend URL/port
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

  // Basic board resizing (can be improved with ResizeObserver)
  useEffect(() => {
    const container = document.querySelector(".chessboard-container");
    if (container) {
      setBoardWidth(Math.min(container.clientWidth, 560)); // Cap at 560px
    }
    // Consider adding a resize listener for dynamic resizing
    // window.addEventListener('resize', handleResize);
    // return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Helper Functions ---

  // Validate FEN and clear visuals if invalid
  const validateFen = (currentFen: string) => {
    try {
      new Chess(currentFen); // Use chess.js constructor for validation
      setFenError(null);
      setIsValidFen(true);
      // Don't clear visuals here, only on new analysis or explicit clear action
    } catch (e) {
      setFenError("Invalid FEN string");
      setIsValidFen(false);
      setAnalysisResult(null);
      setExplanationResult(null);
      setSquareStyles({}); // Clear highlights
      setArrows([]); // Clear arrows
      setMoveNumberStyles({}); // Clear move numbers
    }
  };

  // Handle changes in the FEN input field
  const handleFenChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFen(event.target.value);
  };

  // Handle the "Analyze Position" button click
  const handleAnalyzeClick = async () => {
    if (!isValidFen) {
      console.error("Cannot analyze invalid FEN");
      return;
    }

    setIsLoading(true);
    setAnalysisResult(null);
    setExplanationResult(null);
    setAnalysisError(null);
    // Clear previous visuals immediately
    setSquareStyles({});
    setArrows([]);
    setMoveNumberStyles({});

    try {
      // --- Call /api/analyze ---
      console.log("Calling /api/analyze for FEN:", fen);
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
      console.log("Received analysis:", analysisData);
      setAnalysisResult(analysisData); // Set analysis result first

      // --- Generate Square Styles, Arrows, and Move Numbers ---
      const newStyles: SquareStyles = {};
      const newArrows: Arrows = [];
      const newMoveNumbers: MoveNumberStyles = {};
      const highlightColor = "rgba(255, 255, 0, 0.4)"; // Yellow highlight
      const arrowColor = "rgb(255, 165, 0)"; // Orange for arrows

      if (analysisData.topMoves && analysisData.topMoves.length > 0) {
        analysisData.topMoves.forEach((analysisMove, index) => {
          if (analysisMove.move && analysisMove.move.length >= 4) {
            const fromSquare = analysisMove.move.substring(0, 2);
            const toSquare = analysisMove.move.substring(2, 4);
            const isValidSquare = (sq: string) => /^[a-h][1-8]$/.test(sq);

            if (isValidSquare(fromSquare) && isValidSquare(toSquare)) {
              // Add highlights for all top moves shown
              newStyles[fromSquare] = { backgroundColor: highlightColor };
              newStyles[toSquare] = { backgroundColor: highlightColor };

              // Add arrows and numbers only for the top 3 moves
              if (index < 3) {
                newArrows.push([fromSquare, toSquare, arrowColor]);
                newMoveNumbers[toSquare] = index + 1; // Store 1, 2, or 3
              }
            } else {
              console.warn(
                `Invalid square notation in move: ${analysisMove.move}`
              );
            }
          } else {
            console.warn(`Invalid or short move format: ${analysisMove.move}`);
          }
        });
      }
      setSquareStyles(newStyles);
      setArrows(newArrows);
      setMoveNumberStyles(newMoveNumbers);
      // --- End Generate Visuals ---

      if (!analysisData.topMoves || analysisData.topMoves.length === 0) {
        // Decide if explanation should still be called if no moves are found
        // For now, let's assume explanation requires moves.
        console.log("No moves returned from analysis, skipping explanation.");
        // Set explanation to null or a specific message if desired
        setExplanationResult(null);
        // We don't throw an error here, just proceed without explanation
      } else {
        // --- Call /api/explain ---
        console.log("Calling /api/explain with moves:", analysisData.topMoves);
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
          // Don't throw, just log error and set explanation to null/error message
          console.error(
            `Explanation failed: ${explainResponse.status} ${
              explainResponse.statusText
            } - ${errorData?.error || "Unknown error"}`
          );
          setExplanationResult({
            explanation: "Error fetching explanation.",
          }); // Or set to null
        } else {
          const explanationData: ExplainResponse = await explainResponse.json();
          console.log("Received explanation:", explanationData);
          setExplanationResult(explanationData);
        }
      }
    } catch (error) {
      console.error("Analysis workflow error:", error);
      const message =
        error instanceof Error ? error.message : "Unknown analysis error";
      setAnalysisError(message);
      // Ensure visuals are cleared on error too
      setSquareStyles({});
      setArrows([]);
      setMoveNumberStyles({});
    } finally {
      setIsLoading(false);
      // Keep visuals on success until next analysis or invalid FEN
    }
  };

  // --- Custom Square Renderer for Move Numbers ---
  const renderSquare = (props: SquareRendererProps) => {
    const { square, children, style } = props;
    const moveNumber = moveNumberStyles[square];

    const numberStyle: CSSProperties = {
      position: "absolute",
      top: 0,
      left: 0,
      padding: "1px 4px",
      fontSize: "clamp(8px, 2vw, 12px)", // Responsive font size
      fontWeight: "bold",
      color: "white",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      borderRadius: "2px",
      zIndex: 10, // Ensure it's above pieces/highlights
      pointerEvents: "none",
      lineHeight: "1",
    };

    return (
      <div style={{ ...style, position: "relative" }}>
        {children}
        {moveNumber && <span style={numberStyle}>{moveNumber}</span>}
      </div>
    );
  };
  // --- End Custom Square Renderer ---

  // --- Render JSX ---
  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4 text-center">Chess Tutor</h1>
      <p className="text-sm text-center mb-6">
        Backend Status: {backendStatus}
      </p>

      {/* --- FEN Input Section --- */}
      <div className="mb-4">
        <Label htmlFor="fenInput">Enter FEN String:</Label>
        <Input
          id="fenInput"
          type="text"
          value={fen}
          onChange={handleFenChange}
          className={`mt-1 ${fenError ? "border-red-500" : ""}`}
          disabled={isLoading}
        />
        {fenError && <p className="text-red-500 text-sm mt-1">{fenError}</p>}
      </div>

      {/* --- Chessboard Section --- */}
      <div className="mb-4 chessboard-container flex justify-center">
        {isValidFen ? (
          <Chessboard
            id="AnalysisBoard"
            position={fen}
            boardWidth={boardWidth}
            arePiecesDraggable={false}
            customSquareStyles={squareStyles}
            customArrows={arrows}
            customSquareRenderer={renderSquare}
          />
        ) : (
          <div
            className="aspect-square bg-gray-200 border flex items-center justify-center text-gray-500 font-medium"
            style={{ width: boardWidth }} // Keep size consistent
          >
            Invalid FEN String
          </div>
        )}
      </div>
      {/* --- End Chessboard Section --- */}

      {/* --- Analyze Button --- */}
      <Button
        onClick={handleAnalyzeClick}
        disabled={!isValidFen || isLoading}
        className="w-full"
      >
        {isLoading ? "Analyzing..." : "Analyze Position"}
      </Button>

      {/* --- Analysis Output Area --- */}
      <div className="mt-4 p-4 border bg-gray-50 rounded min-h-[100px]">
        <h2 className="text-lg font-semibold mb-3">Analysis:</h2>
        {isLoading && (
          // --- Loading State ---
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        )}
        {!isLoading && analysisError && (
          // --- Error State ---
          <p className="text-red-600 text-sm">Error: {analysisError}</p>
        )}
        {!isLoading &&
          !analysisError &&
          !explanationResult &&
          !analysisResult && (
            // --- Initial/Idle State ---
            <p className="text-sm text-gray-600">
              Click "Analyze Position" to see results.
            </p>
          )}
        {!isLoading &&
          !analysisError &&
          (explanationResult || analysisResult) && (
            // --- Success State ---
            <div>
              {/* Display top moves concisely */}
              {analysisResult?.topMoves &&
                analysisResult.topMoves.length > 0 && (
                  <p className="text-sm mb-3 text-gray-700">
                    <span className="font-medium">Top Moves:</span>{" "}
                    {analysisResult.topMoves
                      .map((m) => `${m.move}${m.isCheckmate ? "#" : ""}`)
                      .join(", ")}
                  </p>
                )}

              {/* Display Explanation if available - Processed for list */}
              {explanationResult?.explanation && (
                <div className="text-sm space-y-2">
                  {explanationResult.explanation
                    .split("\n") // Split into lines
                    .map((line) => line.trim()) // Trim whitespace
                    .filter((line) => line.length > 0) // Remove empty lines
                    .map((line, index) => {
                      // Attempt to extract bolded move like **d2d4:** or * **d2d4:**
                      const match = line.match(/^\*?\s*\*\*(.*?):\*\*\s*(.*)/);
                      let movePart = "";
                      let textPart = line.replace(/^\*?\s*/, ""); // Default text, remove list markers

                      if (match && match[1] && match[2]) {
                        movePart = match[1]; // The move itself (e.g., d2d4)
                        textPart = match[2]; // The explanation text
                      }

                      // Only show numbers for the top 3 corresponding to board numbers
                      const prefix = index < 3 ? `${index + 1}. ` : ""; // Add "1.", "2.", "3."

                      return (
                        <p key={index} className="text-gray-800">
                          {prefix}
                          {movePart && (
                            <span className="font-semibold">{movePart}:</span>
                          )}{" "}
                          {textPart}
                        </p>
                      );
                    })}
                </div>
              )}
              {/* Handle case where analysis succeeded but explanation might be pending/failed/not applicable */}
              {analysisResult && !explanationResult && !analysisError && (
                <p className="text-sm text-gray-500 italic mt-2">
                  {analysisResult.topMoves.length === 0
                    ? "No further explanation available for this position."
                    : "Explanation loading or unavailable."}
                </p>
              )}
            </div>
          )}
      </div>
      {/* --- End Analysis Output Area --- */}
    </div>
  );
}

export default App;
