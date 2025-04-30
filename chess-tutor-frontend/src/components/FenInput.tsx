// src/components/FenInput.tsx
import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FenInputProps {
  fen: string;
  onFenChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fenError: string | null;
  isLoading: boolean;
}

const FenInput: React.FC<FenInputProps> = ({
  fen,
  onFenChange,
  fenError,
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
        className={`mt-1 ${fenError ? "border-red-500" : ""}`}
        disabled={isLoading}
        aria-invalid={!!fenError}
        aria-describedby={fenError ? "fen-error-message" : undefined}
      />
      {fenError && (
        <p id="fen-error-message" className="text-red-500 text-sm mt-1">
          {fenError}
        </p>
      )}
    </div>
  );
};

export default FenInput;
