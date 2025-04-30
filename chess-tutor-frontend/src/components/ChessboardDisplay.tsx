// src/components/ChessboardDisplay.tsx
import React from "react";
import type { CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import type { Square } from "chess.js"; // Import Square type
import { Arrow } from "react-chessboard/dist/chessboard/types";

// Define types locally or import
type SquareStyles = { [square: string]: CSSProperties };
type Arrows = Array<[string, string, string?]>;
type MoveNumberStyles = { [square: string]: number };

// Define the type for the onPieceDrop function prop
type OnPieceDrop = (
  sourceSquare: Square,
  targetSquare: Square,
  piece: string // react-chessboard provides piece string like 'wP', 'bN'
) => boolean; // Return true for success, false for snap back

interface ChessboardDisplayProps {
  position: string; // Now receives FEN string directly
  boardWidth: number;
  squareStyles: SquareStyles;
  arrows: Arrows;
  moveNumberStyles: MoveNumberStyles;
  onPieceDrop: OnPieceDrop; // Add the callback prop
  arePiecesDraggable: boolean; // Add prop to control dragging
  boardOrientation: "white" | "black"; // Add prop for orientation
}

const ChessboardDisplay: React.FC<ChessboardDisplayProps> = ({
  position, // Use position directly
  boardWidth,
  squareStyles,
  arrows,
  moveNumberStyles,
  onPieceDrop, // Receive the handler
  arePiecesDraggable, // Receive draggable status
  boardOrientation, // Receive orientation
}) => {
  return (
    <Chessboard
      id="InteractiveBoard" // Changed ID
      position={position} // Use the position prop
      boardWidth={boardWidth}
      arePiecesDraggable={arePiecesDraggable} // Use prop
      customSquareStyles={squareStyles}
      customArrows={arrows as Arrow[]}
      onPieceDrop={onPieceDrop} // Pass the handler to the board
      boardOrientation={boardOrientation} // Set orientation
    />
  );
};

export default ChessboardDisplay;
