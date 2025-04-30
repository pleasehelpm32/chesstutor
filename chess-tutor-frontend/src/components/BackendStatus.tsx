// src/components/BackendStatus.tsx
import React from "react";

interface BackendStatusProps {
  status: string;
}

const BackendStatus: React.FC<BackendStatusProps> = ({ status }) => {
  return (
    <p className="text-sm text-center mb-6 text-gray-600">
      Backend Status: <span className="font-medium">{status}</span>
    </p>
  );
};

export default BackendStatus;
