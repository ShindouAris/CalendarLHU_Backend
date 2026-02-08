import { PrismaClient } from "@prisma/client";

// Singleton Prisma Client instance
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log("🆗 PostgreSQL connected successfully");
  } catch (error) {
    console.error("＞︿＜ PostgreSQL connection failed:", error);
    process.exit(1);
  }
};

export const closeDB = async () => {
  await prisma.$disconnect();
  console.log("👋 PostgreSQL disconnected");
};

export * from "./services/chatQueries";
export {
  addToBuffer,
  flushNow,
  messageBufferConfig,
} from "./services/messageBufferService";

