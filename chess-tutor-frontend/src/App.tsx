// src/App.tsx

import { Routes, Route } from "react-router-dom";

// Import Page Components
import Layout from "./components/Layout"; // Shared layout
import AnalyzerPage from "./pages/AnalyzerPage";
import PuzzlePage from "./pages/PuzzlePage";
// Import other pages as needed

function App() {
  // App component now primarily sets up routes
  return (
    <Routes>
      {/* Use the Layout component for routes that share the header/footer */}
      <Route path="/" element={<Layout />}>
        {/* Index route: Renders AnalyzerPage at '/' */}
        <Route index element={<AnalyzerPage />} />
        {/* Puzzle route: Renders PuzzlePage at '/puzzles' */}
        <Route path="puzzles" element={<PuzzlePage />} />
        {/* Add other routes nested within Layout here */}
        {/* Example: <Route path="settings" element={<SettingsPage />} /> */}

        {/* Catch-all for routes not found within the Layout */}
        <Route
          path="*"
          element={
            <div>
              <h2>Page Not Found</h2>
            </div>
          }
        />
      </Route>

      {/* You could define routes outside the Layout here if needed */}
      {/* Example: <Route path="/login" element={<LoginPage />} /> */}
    </Routes>
  );
}

export default App;
