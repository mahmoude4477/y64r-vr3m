-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "actorDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "app_rate_limit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_rate_limit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "app_rate_limit_windowStart_idx" ON "app_rate_limit"("windowStart");

-- CreateIndex
CREATE INDEX "scan_status_finalizedAt_idx" ON "scan"("status", "finalizedAt");
