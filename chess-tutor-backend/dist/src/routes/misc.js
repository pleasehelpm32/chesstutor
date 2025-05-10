"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/misc.ts
const express_1 = __importDefault(require("express"));
const db_1 = require("../db"); // Import prisma instance from db.ts
const router = express_1.default.Router();
// Health check endpoint
router.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// Database test endpoint
router.get("/test-db", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Use the imported prisma client
        const count = yield db_1.prisma.analysis.count();
        res.json({ status: "db ok", analysis_count: count });
    }
    catch (error) {
        console.error("Database test failed:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        // Send error response but don't crash the server
        res.status(500).json({ status: "db error", error: message });
    }
}));
exports.default = router; // Export the router
