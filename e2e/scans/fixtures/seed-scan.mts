/**
 * E2E ONLY: inserts a draft "Sharps safety" scan with one photo row for an institution, straight into the TEST database.
 * e2e/scans/storage-off.spec.ts needs a scan on a server WITHOUT photo storage (no upload is possible there), to check
 * that the review still works when the bucket is not configured.
 *
 *   DATABASE_URL=<e2e db> WAQAYA_E2E=1 tsx e2e/scans/fixtures/seed-scan.mts <organizationId> <examinerUserId> <area>
 *
 * Prints {"id":"<scanId>"}. Refuses unless WAQAYA_E2E=1 and the database is on this machine (never a real one). The
 * photo row points at a key that does not exist in any bucket.
 */
import { randomUUID } from "node:crypto";

const [organizationId, examinerId, areaLabel] = process.argv.slice(2);
const url = process.env.DATABASE_URL ?? "";

function refuse(message: string): never {
  console.error(`seed-scan: ${message}`);
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
if (!organizationId || !examinerId || !areaLabel) refuse("usage: seed-scan.mts <organizationId> <examinerUserId> <area>");

const { prisma } = await import("../../../lib/prisma");
try {
  const protocol = await prisma.protocol.findFirstOrThrow({
    where: { slug: "sharps-safety", organizationId: null },
    select: { id: true, steps: { select: { id: true }, orderBy: { order: "asc" } } },
  });
  const scan = await prisma.scan.create({
    data: {
      organizationId,
      examinerId,
      protocolId: protocol.id,
      areaLabel,
      status: "draft",
      stepResults: { createMany: { data: protocol.steps.map((s) => ({ stepId: s.id })) } },
      photos: {
        create: [
          {
            organizationId,
            uploadedById: examinerId,
            storageKey: `orgs/${organizationId}/e2e-missing/${randomUUID()}.jpg`,
            mime: "image/jpeg",
            bytes: 1000,
            width: 800,
            height: 600,
          },
        ],
      },
    },
    select: { id: true },
  });
  console.log(JSON.stringify({ id: scan.id }));
} finally {
  await prisma.$disconnect();
}
