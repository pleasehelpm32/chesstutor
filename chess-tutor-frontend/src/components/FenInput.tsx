// src/components/FenInput.tsx
import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FenInputProps {
  fen: string;
  onFenChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fenError: string | null; // Renamed prop for clarity
  isLoading: boolean;
}

const FenInput: React.FC<FenInputProps> = ({
  fen,
  onFenChange,
  fenError, // Use the renamed prop
  isLoading,
}) => {
  return (
    <div className="mb-4">
      <Label htmlFor="fenInput">Enter FEN String:</Label>
      <Input
        id="fenInput"
        type="text"
        value={fen}
        onChange={onFenChange}
        className={`mt-1 ${fenError ? "border-red-500" : ""}`} // Use fenError
        disabled={isLoading}
        aria-invalid={!!fenError} // Use fenError
        aria-describedby={fenError ? "fen-error-message" : undefined} // Use fenError
      />
      {fenError && ( // Use fenError
        <p id="fen-error-message" className="text-red-500 text-sm mt-1">
          {fenError}
        </p>
      )}
    </div>
  );
};

export default FenInput;
