import { PrismaClient } from "@prisma/client";

const globalDb = globalThis as unknown as { orangePrisma?: PrismaClient };
const connectionUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : undefined;
if (connectionUrl && !connectionUrl.searchParams.has("connection_limit"))
  connectionUrl.searchParams.set("connection_limit", "8");
export const db =
  globalDb.orangePrisma ??
  new PrismaClient({
    log: ["error"],
    ...(connectionUrl ? { datasourceUrl: connectionUrl.toString() } : {}),
    transactionOptions: { maxWait: 10000, timeout: 20000 },
  });
export const prisma = db;
if (process.env.NODE_ENV !== "production") globalDb.orangePrisma = db;
