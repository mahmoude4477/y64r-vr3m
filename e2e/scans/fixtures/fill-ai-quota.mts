/**
 * E2E ONLY: uses up today's AI limit of one user, straight in the TEST database, by inserting finished AiCall rows
 * (lib/ai/limits.ts counts every "ok" call of the Riyadh day). e2e/scans/scans.spec.ts needs a limit that is reached
 * AFTER the new-scan page was opened, to check what the examiner sees when the analysis is refused at submit.
 *
 *   DATABASE_URL=<e2e db> WAQAYA_E2E=1 tsx e2e/scans/fixtures/fill-ai-quota.mts <userId>
 *
 * The limit is read the way lib/ai/limits.ts getDailyLimit reads it (AppSetting "ai.dailyLimitPerUser", then
 * AI_DAILY_LIMIT_PER_USER, then 20). Prints {"inserted":<n>}. Refuses unless WAQAYA_E2E=1 and the database is on this
 * machine (never a real one).
 */
const [userId] = process.argv.slice(2);
const url = process.env.DATABASE_URL ?? "";

function refuse(message: string): never {
  console.error(`fill-ai-quota: ${message}`);
  process.exit(1);
}

if (process.env.WAQAYA_E2E !== "1") refuse("WAQAYA_E2E=1 is required");
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  refuse("DATABASE_URL is missing");
}
if (!["127.0.0.1", "localhost", "::1"].includes(host)) refuse("only a local test database is allowed");
if (!userId) refuse("usage: fill-ai-quota.mts <userId>");

const { prisma } = await import("../../../lib/prisma");
try {
  const setting = await prisma.appSetting.findUnique({ where: { key: "ai.dailyLimitPerUser" }, select: { value: true } });
  const env = Number.parseInt(process.env.AI_DAILY_LIMIT_PER_USER ?? "", 10);
  const limit = typeof setting?.value === "number" ? setting.value : Number.isFinite(env) && env >= 0 ? env : 20;
  const { count } = await prisma.aiCall.createMany({
    data: Array.from({ length: limit }, () => ({
      userId,
      kind: "scan_analysis" as const,
      model: "e2e-fixture",
      status: "ok" as const,
      targetType: "e2e-quota",
    })),
  });
  console.log(JSON.stringify({ inserted: count }));
} finally {
  await prisma.$disconnect();
}
