"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
// src/db.ts (Example utility file)
const client_1 = require("@prisma/client");
// Prevent multiple instances of Prisma Client in development
exports.prisma = global.prisma ||
    new client_1.PrismaClient({
    // Optional: Log queries for debugging
    // log: ['query', 'info', 'warn', 'error'],
    });
if (process.env.NODE_ENV !== "production") {
    global.prisma = exports.prisma;
}
// Now you can import 'prisma' from './db' in other files
