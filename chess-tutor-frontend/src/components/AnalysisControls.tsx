// src/components/AnalysisControls.tsx
import React from "react";
import { Button } from "@/components/ui/button";

interface AnalysisControlsProps {
  isLoading: boolean;
  isValidFen: boolean;
  onAnalyzeClick: () => void; // Function passed from App.tsx
}

const AnalysisControls: React.FC<AnalysisControlsProps> = ({
  isLoading,
  isValidFen,
  onAnalyzeClick,
}) => {
  return (
    <Button
      onClick={onAnalyzeClick}
      disabled={!isValidFen || isLoading}
      className="w-full"
    >
      {isLoading ? "Analyzing..." : "Analyze Position"}
    </Button>
  );
};

export default AnalysisControls;
