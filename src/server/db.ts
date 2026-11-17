import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // 対話型トランザクションの既定(待機2秒・実行5秒)は、サーバー/DBが冷えた最初の申込で時間切れ(P2028)になる。余裕を持たせる。
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
