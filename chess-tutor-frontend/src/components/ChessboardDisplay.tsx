// src/components/ChessboardDisplay.tsx
import React from "react";
import type { CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
// Assuming this import path works now:
import type { SquareRendererProps } from "react-chessboard";

// Define types locally or import from a shared types file if preferred
type SquareStyles = {
  [square: string]: CSSProperties;
};
type Arrows = Array<[string, string, string?]>;
type MoveNumberStyles = {
  [square: string]: number;
};

interface ChessboardDisplayProps {
  fen: string;
  isValidFen: boolean;
  boardWidth: number;
  squareStyles: SquareStyles;
  arrows: Arrows;
  moveNumberStyles: MoveNumberStyles;
}

const ChessboardDisplay: React.FC<ChessboardDisplayProps> = ({
  fen,
  isValidFen,
  boardWidth,
  squareStyles,
  arrows,
  moveNumberStyles,
}) => {
  // --- Custom Square Renderer for Move Numbers (defined inside component) ---
  const renderSquare = (props: SquareRendererProps) => {
    const { square, children, style } = props;
    const moveNumber = moveNumberStyles[square];

    const numberStyle: CSSProperties = {
      position: "absolute",
      top: 0,
      left: 0,
      padding: "1px 4px",
      fontSize: "clamp(8px, 2vw, 12px)",
      fontWeight: "bold",
      color: "white",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      borderRadius: "2px",
      zIndex: 10,
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

  return (
    <div className="mb-4 chessboard-container flex justify-center">
      {isValidFen ? (
        <Chessboard
          id="AnalysisBoard"
          position={fen}
          boardWidth={boardWidth}
          arePiecesDraggable={false}
          customSquareStyles={squareStyles}
          customArrows={arrows}
          customSquareRenderer={renderSquare} // Use the function defined above
        />
      ) : (
        // Placeholder for invalid FEN
        <div
          className="aspect-square bg-gray-200 border flex items-center justify-center text-gray-500 font-medium"
          style={{ width: boardWidth }} // Keep size consistent
        >
          Invalid FEN String
        </div>
      )}
    </div>
  );
};

export default ChessboardDisplay;
