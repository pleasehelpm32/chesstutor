"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.basicErrorHandler = void 0;
/**
 * Basic centralized error handler middleware for Express.
 * Should be added LAST in the middleware chain in server.ts.
 */
const basicErrorHandler = (err, // Error can be of any type
req, res, next // Although 'next' isn't used, it's required for Express to recognize it as an error handler
) => {
    // Log the error for server-side debugging
    // Consider using a more robust logger in production
    console.error("--- Unhandled Error ---");
    console.error(`Timestamp: ${new Date().toISOString()}`);
    console.error(`Route: ${req.method} ${req.originalUrl}`);
    // Log the error stack, or specific properties depending on the error type
    console.error("Error:", err.message || err);
    if (err.stack) {
        console.error("Stack:", err.stack);
    }
    // Log additional info if available (e.g., from specific error classes)
    if (err.status) {
        console.error("Status Code:", err.status);
    }
    if (err.details) {
        console.error("Details:", err.details);
    }
    console.error("-----------------------");
    // Determine status code - use error's status or default to 500
    const statusCode = typeof err.status === "number" ? err.status : 500;
    // Send a generic error response to the client
    // Avoid sending detailed error info (like stack traces) to the client in production
    res.status(statusCode).json({
        error: "An unexpected error occurred.",
        // Optionally include a reference ID for correlation if using advanced logging
        // message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
    });
};
exports.basicErrorHandler = basicErrorHandler;
