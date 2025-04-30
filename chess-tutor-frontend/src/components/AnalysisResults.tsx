// src/components/AnalysisResults.tsx
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

// Define types locally or import from a shared types file
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

interface AnalysisResultsProps {
  isLoading: boolean;
  analysisError: string | null;
  analysisResult: AnalysisResponse | null;
  explanationResult: ExplainResponse | null;
}

const AnalysisResults: React.FC<AnalysisResultsProps> = ({
  isLoading,
  analysisError,
  analysisResult,
  explanationResult,
}) => {
  return (
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
            {analysisResult?.topMoves && analysisResult.topMoves.length > 0 && (
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
  );
};

export default AnalysisResults;
