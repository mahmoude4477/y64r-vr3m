import { connection } from "next/server";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { cachedCheck, checkDatabase, cspStatus, type DbCheck } from "./checks";

// GET/HEAD /api/health: Railway's deploy healthcheck (any 2xx = ready), the external uptime monitor and
// Playwright's webServer readiness probe (note 09 §5).
// - 200 when the database answers SELECT 1 within 2 s (10 s for the first check after a start), else 503.
//   One result is shared for 5 s.
// - Small JSON body: no error text, hostnames, config flags or secrets. External services (S3, Anthropic, email)
//   are not part of it: their outage must not fail deploys; features show their own ServiceOffAlert.
//   `checks.csp` is "stale" when S3_* changed after the build (uploads blocked until a rebuild); never fatal.
// - Never cached (Cache-Control: no-store), never prerendered (connection(): no private network during the build).

const DB_TIMEOUT_MS = 2_000;
// Until the first success: the first query also loads Prisma and opens the pool's first connection (~2-3 s cold).
const DB_COLD_TIMEOUT_MS = 10_000;
const CACHE_MS = 5_000;

let warm = false;
const database = cachedCheck<DbCheck>(
  async () => {
    const result = await checkDatabase(() => prisma.$queryRaw`SELECT 1`, warm ? DB_TIMEOUT_MS : DB_COLD_TIMEOUT_MS);
    if (result.status === "ok") warm = true;
    return result;
  },
  CACHE_MS,
  (result, previous) => {
    if (result.status !== "ok") log.warn("health.db.failed", { status: result.status, ms: result.latencyMs });
    else if (previous && previous.status !== "ok") log.info("health.db.recovered", { ms: result.latencyMs });
  },
);

async function health(): Promise<Response> {
  await connection();
  const db = await database();
  const ok = db.status === "ok";
  return Response.json(
    {
      status: ok ? "ok" : "error",
      version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database: db, csp: cspStatus() },
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export const GET = health;

export async function HEAD(): Promise<Response> {
  const res = await health();
  return new Response(null, { status: res.status, headers: res.headers });
}
