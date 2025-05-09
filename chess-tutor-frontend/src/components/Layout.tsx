// src/components/Layout.tsx
import React from "react";
import { Link, Outlet } from "react-router-dom"; // Outlet renders the matched route component

const Layout: React.FC = () => {
  return (
    <div className="container mx-auto p-2 sm:p-4 max-w-6xl">
      {" "}
      {/* Wider max-width */}
      <header className="mb-6 pb-4 border-b">
        <h1 className="text-3xl font-bold text-center mb-2">Chess Tutor</h1>
        <nav className="flex justify-center gap-4 text-lg">
          <Link
            to="/"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            Analyzer
          </Link>
          <Link
            to="/puzzles"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            Puzzles
          </Link>
          {/* Add other links later */}
        </nav>
      </header>
      <main>
        <Outlet /> {/* Child routes will render here */}
      </main>
      <footer className="mt-8 pt-4 border-t text-center text-xs text-gray-500">
        {/* Footer content */}
        Chess Tutor App
      </footer>
    </div>
  );
};

export default Layout;
