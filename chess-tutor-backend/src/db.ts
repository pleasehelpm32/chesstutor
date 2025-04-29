// src/db.ts (Example utility file)
import { PrismaClient } from "@prisma/client";

declare global {
  // Allow global `var` declarations
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Prevent multiple instances of Prisma Client in development
export const prisma =
  global.prisma ||
  new PrismaClient({
    // Optional: Log queries for debugging
    // log: ['query', 'info', 'warn', 'error'],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

// Now you can import 'prisma' from './db' in other files
