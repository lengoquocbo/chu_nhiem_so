import { PrismaClient } from "@prisma/client";

const globalDb = globalThis as unknown as { db?: PrismaClient };

export const db =
  globalDb.db ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalDb.db = db;