-- CreateEnum
CREATE TYPE "ProtocolCategory" AS ENUM ('safety', 'hygiene', 'waste', 'maintenance', 'other');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "StageKind" AS ENUM ('single', 'multi');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('in_progress', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('draft', 'analyzing', 'review', 'finalized', 'failed');

-- CreateEnum
CREATE TYPE "StepVerdict" AS ENUM ('compliant', 'non_compliant', 'not_visible');

-- CreateEnum
CREATE TYPE "FinalVerdict" AS ENUM ('compliant', 'non_compliant', 'not_applicable');

-- CreateEnum
CREATE TYPE "AiCallKind" AS ENUM ('scan_analysis', 'simulation_debrief', 'insight');

-- CreateEnum
CREATE TYPE "AiCallStatus" AS ENUM ('ok', 'refused', 'error');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT,
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "locale" TEXT DEFAULT 'ar',
    "profession" TEXT,
    "mustChangePassword" BOOLEAN DEFAULT false,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,
    "activeOrganizationId" TEXT,
    "activeTeamId" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "metadata" TEXT,
    "nameEn" TEXT,
    "type" TEXT,
    "suspended" BOOLEAN DEFAULT false,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipKey" TEXT,
    "createdAt" TIMESTAMP(3),

    CONSTRAINT "teamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "teamId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" TEXT NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "organizationId" TEXT,
    "category" "ProtocolCategory" NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "summaryAr" TEXT NOT NULL,
    "summaryEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sourceProtocolId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_step" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "textAr" TEXT NOT NULL,
    "textEn" TEXT NOT NULL,
    "rationaleAr" TEXT NOT NULL,
    "rationaleEn" TEXT NOT NULL,
    "criteriaAr" TEXT,
    "criteriaEn" TEXT,
    "referenceLabel" TEXT,
    "referenceUrl" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "visualCheck" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protocol_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "organizationId" TEXT,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "introAr" TEXT NOT NULL,
    "introEn" TEXT NOT NULL,
    "settingAr" TEXT NOT NULL,
    "settingEn" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'beginner',
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 5,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_stage" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "StageKind" NOT NULL DEFAULT 'single',
    "promptAr" TEXT NOT NULL,
    "promptEn" TEXT NOT NULL,
    "contextAr" TEXT,
    "contextEn" TEXT,

    CONSTRAINT "scenario_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_option" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "textAr" TEXT NOT NULL,
    "textEn" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "stepId" TEXT,
    "feedbackAr" TEXT NOT NULL,
    "feedbackEn" TEXT NOT NULL,

    CONSTRAINT "scenario_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_attempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "scenarioId" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'in_progress',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "score" INTEGER,
    "riskLevel" "RiskLevel",
    "debriefAr" TEXT,
    "debriefEn" TEXT,

    CONSTRAINT "simulation_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_answer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "optionIds" TEXT[],
    "isCorrect" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_step_result" (
    "attemptId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "compliant" BOOLEAN NOT NULL,
    "critical" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "simulation_step_result_pkey" PRIMARY KEY ("attemptId","stepId")
);

-- CreateTable
CREATE TABLE "scan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "teamId" TEXT,
    "examinerId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "areaLabel" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'draft',
    "aiModel" TEXT,
    "aiRaw" JSONB,
    "overallNotesAr" TEXT,
    "overallNotesEn" TEXT,
    "score" INTEGER,
    "riskLevel" "RiskLevel",
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "finalizedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_photo" (
    "id" TEXT NOT NULL,
    "scanId" TEXT,
    "organizationId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_step_result" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "aiVerdict" "StepVerdict",
    "aiConfidence" DOUBLE PRECISION,
    "evidenceAr" TEXT,
    "evidenceEn" TEXT,
    "finalVerdict" "FinalVerdict",
    "overriddenById" TEXT,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_step_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_call" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "kind" "AiCallKind" NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AiCallStatus" NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(12,6),
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "team_organizationId_idx" ON "team"("organizationId");

-- CreateIndex
CREATE INDEX "teamMember_teamId_idx" ON "teamMember"("teamId");

-- CreateIndex
CREATE INDEX "teamMember_userId_idx" ON "teamMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "teamMember_membershipKey_key" ON "teamMember"("membershipKey");

-- CreateIndex
CREATE INDEX "member_organizationId_idx" ON "member"("organizationId");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "rateLimit_key_key" ON "rateLimit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_slug_key" ON "protocol"("slug");

-- CreateIndex
CREATE INDEX "protocol_organizationId_isPublished_idx" ON "protocol"("organizationId", "isPublished");

-- CreateIndex
CREATE INDEX "protocol_category_idx" ON "protocol"("category");

-- CreateIndex
CREATE INDEX "protocol_sourceProtocolId_idx" ON "protocol"("sourceProtocolId");

-- CreateIndex
CREATE INDEX "protocol_createdById_idx" ON "protocol"("createdById");

-- CreateIndex
CREATE INDEX "protocol_step_protocolId_order_idx" ON "protocol_step"("protocolId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_step_protocolId_key_key" ON "protocol_step"("protocolId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "scenario_slug_key" ON "scenario"("slug");

-- CreateIndex
CREATE INDEX "scenario_protocolId_idx" ON "scenario"("protocolId");

-- CreateIndex
CREATE INDEX "scenario_organizationId_isPublished_idx" ON "scenario"("organizationId", "isPublished");

-- CreateIndex
CREATE INDEX "scenario_stage_scenarioId_order_idx" ON "scenario_stage"("scenarioId", "order");

-- CreateIndex
CREATE INDEX "scenario_option_stageId_order_idx" ON "scenario_option"("stageId", "order");

-- CreateIndex
CREATE INDEX "scenario_option_stepId_idx" ON "scenario_option"("stepId");

-- CreateIndex
CREATE INDEX "simulation_attempt_userId_completedAt_idx" ON "simulation_attempt"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "simulation_attempt_organizationId_startedAt_idx" ON "simulation_attempt"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "simulation_attempt_organizationId_completedAt_idx" ON "simulation_attempt"("organizationId", "completedAt");

-- CreateIndex
CREATE INDEX "simulation_attempt_scenarioId_idx" ON "simulation_attempt"("scenarioId");

-- CreateIndex
CREATE INDEX "simulation_attempt_riskLevel_idx" ON "simulation_attempt"("riskLevel");

-- CreateIndex
CREATE INDEX "simulation_answer_stageId_idx" ON "simulation_answer"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "simulation_answer_attemptId_stageId_key" ON "simulation_answer"("attemptId", "stageId");

-- CreateIndex
CREATE INDEX "simulation_step_result_stepId_compliant_idx" ON "simulation_step_result"("stepId", "compliant");

-- CreateIndex
CREATE INDEX "scan_organizationId_createdAt_idx" ON "scan"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "scan_organizationId_status_idx" ON "scan"("organizationId", "status");

-- CreateIndex
CREATE INDEX "scan_examinerId_createdAt_idx" ON "scan"("examinerId", "createdAt");

-- CreateIndex
CREATE INDEX "scan_protocolId_idx" ON "scan"("protocolId");

-- CreateIndex
CREATE INDEX "scan_teamId_idx" ON "scan"("teamId");

-- CreateIndex
CREATE INDEX "scan_riskLevel_idx" ON "scan"("riskLevel");

-- CreateIndex
CREATE INDEX "scan_finalizedById_idx" ON "scan"("finalizedById");

-- CreateIndex
CREATE UNIQUE INDEX "scan_photo_storageKey_key" ON "scan_photo"("storageKey");

-- CreateIndex
CREATE INDEX "scan_photo_scanId_idx" ON "scan_photo"("scanId");

-- CreateIndex
CREATE INDEX "scan_photo_organizationId_createdAt_idx" ON "scan_photo"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "scan_photo_uploadedById_createdAt_idx" ON "scan_photo"("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "scan_step_result_stepId_finalVerdict_idx" ON "scan_step_result"("stepId", "finalVerdict");

-- CreateIndex
CREATE INDEX "scan_step_result_overriddenById_idx" ON "scan_step_result"("overriddenById");

-- CreateIndex
CREATE UNIQUE INDEX "scan_step_result_scanId_stepId_key" ON "scan_step_result"("scanId", "stepId");

-- CreateIndex
CREATE INDEX "ai_call_userId_createdAt_idx" ON "ai_call"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_call_organizationId_createdAt_idx" ON "ai_call"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_call_createdAt_idx" ON "ai_call"("createdAt");

-- CreateIndex
CREATE INDEX "ai_call_status_createdAt_idx" ON "ai_call"("status", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "audit_log_actorId_createdAt_idx" ON "audit_log"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_targetType_targetId_idx" ON "audit_log"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "audit_log_action_createdAt_idx" ON "audit_log"("action", "createdAt");

-- CreateIndex
CREATE INDEX "app_setting_updatedById_idx" ON "app_setting"("updatedById");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teamMember" ADD CONSTRAINT "teamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teamMember" ADD CONSTRAINT "teamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol" ADD CONSTRAINT "protocol_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol" ADD CONSTRAINT "protocol_sourceProtocolId_fkey" FOREIGN KEY ("sourceProtocolId") REFERENCES "protocol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol" ADD CONSTRAINT "protocol_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_step" ADD CONSTRAINT "protocol_step_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "protocol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario" ADD CONSTRAINT "scenario_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "protocol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario" ADD CONSTRAINT "scenario_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_stage" ADD CONSTRAINT "scenario_stage_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_option" ADD CONSTRAINT "scenario_option_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "scenario_stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_option" ADD CONSTRAINT "scenario_option_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "protocol_step"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_attempt" ADD CONSTRAINT "simulation_attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_attempt" ADD CONSTRAINT "simulation_attempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_attempt" ADD CONSTRAINT "simulation_attempt_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_answer" ADD CONSTRAINT "simulation_answer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "simulation_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_answer" ADD CONSTRAINT "simulation_answer_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "scenario_stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_step_result" ADD CONSTRAINT "simulation_step_result_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "simulation_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_step_result" ADD CONSTRAINT "simulation_step_result_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "protocol_step"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan" ADD CONSTRAINT "scan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan" ADD CONSTRAINT "scan_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan" ADD CONSTRAINT "scan_examinerId_fkey" FOREIGN KEY ("examinerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan" ADD CONSTRAINT "scan_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "protocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan" ADD CONSTRAINT "scan_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_photo" ADD CONSTRAINT "scan_photo_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_photo" ADD CONSTRAINT "scan_photo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_photo" ADD CONSTRAINT "scan_photo_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_step_result" ADD CONSTRAINT "scan_step_result_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_step_result" ADD CONSTRAINT "scan_step_result_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "protocol_step"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_step_result" ADD CONSTRAINT "scan_step_result_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call" ADD CONSTRAINT "ai_call_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_setting" ADD CONSTRAINT "app_setting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
