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

// --- Define the type for the onSquareClick function prop ---
type OnSquareClick = (square: Square) => void; // Takes the clicked square

interface ChessboardDisplayProps {
  position: string; // Now receives FEN string directly
  boardWidth: number;
  squareStyles: SquareStyles;
  arrows: Arrows;
  moveNumberStyles: MoveNumberStyles;
  onPieceDrop: OnPieceDrop;
  onSquareClick: OnSquareClick; // <<< Add the onSquareClick prop type
  arePiecesDraggable: boolean;
  boardOrientation: "white" | "black";
}

const ChessboardDisplay: React.FC<ChessboardDisplayProps> = ({
  position,
  boardWidth,
  squareStyles,
  arrows,
  onPieceDrop,
  onSquareClick, // <<< Destructure the onSquareClick prop
  arePiecesDraggable,
  boardOrientation,
}) => {
  return (
    <Chessboard
      id="InteractiveBoard"
      position={position}
      boardWidth={boardWidth}
      arePiecesDraggable={arePiecesDraggable}
      customSquareStyles={squareStyles}
      customArrows={arrows as Arrow[]}
      onPieceDrop={onPieceDrop}
      onSquareClick={onSquareClick} // <<< Pass the handler to the underlying Chessboard component
      boardOrientation={boardOrientation}
    />
  );
};

export default ChessboardDisplay;
