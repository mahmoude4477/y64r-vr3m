-- AlterTable
ALTER TABLE "protocol" ADD COLUMN     "versionOfId" TEXT;

-- CreateIndex
CREATE INDEX "protocol_versionOfId_idx" ON "protocol"("versionOfId");

-- CreateIndex
CREATE INDEX "scan_organizationId_status_finalizedAt_idx" ON "scan"("organizationId", "status", "finalizedAt");

-- CreateIndex
CREATE INDEX "simulation_attempt_userId_startedAt_idx" ON "simulation_attempt"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "protocol" ADD CONSTRAINT "protocol_versionOfId_fkey" FOREIGN KEY ("versionOfId") REFERENCES "protocol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: versions created before this column existed are linked by their "protocol.version" audit row
-- (meta.fromProtocolId), the link the protocol editor used until now. Only rows whose source still exists.
UPDATE "protocol" AS p
SET "versionOfId" = a."meta"->>'fromProtocolId'
FROM "audit_log" AS a
WHERE a."action" = 'protocol.version'
  AND a."targetType" = 'protocol'
  AND a."targetId" = p."id"
  AND p."versionOfId" IS NULL
  AND a."meta"->>'fromProtocolId' IS NOT NULL
  AND a."meta"->>'fromProtocolId' <> p."id"
  AND EXISTS (SELECT 1 FROM "protocol" AS src WHERE src."id" = a."meta"->>'fromProtocolId');
