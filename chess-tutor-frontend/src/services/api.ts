// src/services/api.ts

// Import types (consider creating a shared types file later)
interface AnalysisMove {
  move: string;
  isCheckmate: boolean;
}
interface AnalysisResponse {
  topMoves: AnalysisMove[];
}
interface ExplainResponse {
  explanation: string;
  cacheHit?: boolean; // Include cacheHit if backend sends it
}
interface ComputerMoveResponse {
  move: string | null;
  message?: string;
}
interface HealthResponse {
  status: string;
  timestamp: string;
}

interface PuzzleData {
  id: string;
  fen: string;
  solutionMoves: string[];
  theme: string;
  rating?: number;
}

// Get base URL from environment variable
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

/**
 * Helper function to handle fetch responses and errors.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Failed to parse error JSON" }));
    console.error(`API Error ${response.status}:`, errorData);
    throw new Error(
      `API request failed: ${response.status} ${response.statusText} - ${
        errorData?.error || "Unknown server error"
      }`
    );
  }
  // Check for empty response body before parsing JSON
  const text = await response.text();
  if (!text) {
    // Handle cases where a 2xx response might have no body
    // Depending on the expected type T, you might return null, undefined, or an empty object/array
    // For now, let's assume T allows null or handle it based on specific endpoint needs.
    // If T is expected to always have data, throwing an error might be better.
    console.warn(
      `API Warning: Received empty response body for ${response.url}`
    );
    // Casting to T might be risky, adjust based on expected types
    return null as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    console.error("Failed to parse JSON response:", text, e);
    throw new Error("Failed to parse server response.");
  }
}

/**
 * Checks the backend health status.
 */
export const checkBackendHealth = async (): Promise<HealthResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  return handleResponse<HealthResponse>(response);
};

/**
 * Analyzes a given FEN position.
 * @param fen - The FEN string of the position.
 * @returns Promise resolving to the analysis response.
 */
export const analyzePosition = async (
  fen: string
): Promise<AnalysisResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fen }),
  });
  return handleResponse<AnalysisResponse>(response);
};

/**
 * Gets an explanation for the top moves in a position.
 * @param fen - The FEN string of the position.
 * @param topMoves - Array of move objects from the analysis endpoint.
 * @returns Promise resolving to the explanation response.
 */
export const getExplanation = async (
  fen: string,
  topMoves: AnalysisMove[]
): Promise<ExplainResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fen, topMoves }),
  });
  return handleResponse<ExplainResponse>(response);
};

/**
 * Gets the computer's next move for a given position and skill level.
 * @param fen - The FEN string of the position.
 * @param theme - The puzzle theme (e.g., "mateIn2").
 *  @returns Promise resolving to the puzzle data.
 * @param skillLevel - The desired computer skill level (0-20).
 * @returns Promise resolving to the computer move response.
 */

export const getRandomPuzzle = async (theme: string): Promise<PuzzleData> => {
  const url = `${API_BASE_URL}/api/puzzles/random?theme=${encodeURIComponent(
    theme
  )}`;
  console.log("Attempting to fetch getRandomPuzzle from:", url); // <-- ADD THIS LOG
  const response = await fetch(url); // Removed method: 'GET' is default
  return handleResponse<PuzzleData>(response);
};
export const getComputerMove = async (
  fen: string,
  skillLevel: number
): Promise<ComputerMoveResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/computerMove`, {
    // Ensure path matches backend
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fen, skillLevel }),
  });
  return handleResponse<ComputerMoveResponse>(response);
};

// Add functions for puzzle API calls later...
// export const getRandomPuzzle = async (theme: string): Promise<PuzzleData> => { ... }
