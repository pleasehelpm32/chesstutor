// src/components/AnalysisControls.tsx
import React from "react";
import { Button } from "@/components/ui/button";

interface AnalysisControlsProps {
  isLoading: boolean;
  canAnalyze: boolean; // Renamed prop for clarity (e.g., !game.isGameOver())
  onAnalyzeClick: () => void;
}

const AnalysisControls: React.FC<AnalysisControlsProps> = ({
  isLoading,
  canAnalyze, // Use the renamed prop
  onAnalyzeClick,
}) => {
  return (
    <Button
      onClick={onAnalyzeClick}
      disabled={!canAnalyze || isLoading} // Use canAnalyze
      className="w-full mt-4" // Added margin-top
    >
      {isLoading ? "Analyzing..." : "Analyze Position"}
    </Button>
  );
};

export default AnalysisControls;
