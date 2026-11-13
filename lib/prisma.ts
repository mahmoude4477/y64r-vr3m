// No `import "server-only"` here: the seed (tsx) and the Better Auth CLI import this file outside
// the react-server condition. Never import it from a "use client" file.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { log } from "@/lib/log";

function createPrismaClient() {
  // Building the client does not connect: the pg pool opens on the first query, so `next build` is safe.
  const adapter = new PrismaPg(
    {
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10), // per instance; replicas * max < max_connections
      connectionTimeoutMillis: 5_000, // pg default is 0 = wait forever
      idleTimeoutMillis: 30_000,
      keepAlive: true,
    },
    { onPoolError: (err) => log.error("db.pool.error", { err }) },
  );
  const client = new PrismaClient({
    adapter,
    // No "error" level on purpose (foundation review, 2026-10-28). Prisma's own error log prints every failed
    // query a second time, although the same error is always thrown to the caller, which handles it or lets it
    // reach Next's error handling (and instrumentation.ts onRequestError). It also prints EXPECTED failures that
    // the caller swallows: Better Auth's syncTeamMemberCount (organization teams) runs a conditional update
    // `where memberCount < count` that matches no row when the count is already right, and the Prisma adapter
    // turns that into a P2025 that Better Auth catches, while Prisma had already logged "prisma:error ... P2025".
    // Warnings stay (rare, and nobody else reports them), as JSON lines through lib/log.ts (PRODUCT 9).
    log: [{ emit: "event", level: "warn" }],
    // Interactive transactions wait up to 5 s for a pooled connection, like every other query
    // (connectionTimeoutMillis above), instead of Prisma's default 2 s; timeout stays 5 s. Keep them rare and short:
    // Better Auth's rate limiter used to open one on EVERY /api/auth request and a burst exhausted the pool (500
    // P2028); it now runs one plain statement instead (lib/auth-rate-limit.ts, final review).
    transactionOptions: { maxWait: 5_000 },
  });
  // "detail", not "message": lib/log.ts drops its reserved keys (time, level, message, event, commit).
  client.$on("warn", (e) => log.warn("db.prisma.warn", { detail: e.message, target: e.target }));
  return client;
}

type AppPrismaClient = ReturnType<typeof createPrismaClient>;
const globalForPrisma = globalThis as unknown as { prisma?: AppPrismaClient };

export const prisma: AppPrismaClient = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
