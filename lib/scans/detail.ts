import "server-only";
import type { Locale } from "next-intl";
import { isOrgManager, scansReadable, type Scope } from "@/lib/authz";
import { pick, pickOrNull } from "@/lib/i18n-content";
import { prisma } from "@/lib/prisma";
import type { AiVerdict, FinalVerdict } from "@/lib/scoring";
import type { RiskLevelValue, ScanStatusValue } from "./constants";
import { deleteGate, effectiveStatus } from "./review-core";

/** Everything /scans/[id] shows, in the viewer's language. Built from scansReadable (staff of the active institution). */

export type PersonRef = { name: string | null; deleted: boolean; isMe: boolean };

export type ScanDetailStep = {
  id: string;
  key: string;
  order: number;
  protocolId: string;
  text: string;
  rationale: string;
  criteria: string | null;
  referenceLabel: string | null;
  referenceUrl: string | null;
  isMandatory: boolean;
  isCritical: boolean;
  weight: number;
  visualCheck: boolean;
  aiVerdict: AiVerdict | null;
  aiConfidence: number | null;
  evidence: string | null;
  finalVerdict: FinalVerdict | null;
  note: string | null;
  /** Who decided this step by hand (null: accepted AI verdict, nobody, or a deleted account). */
  decidedBy: string | null;
};

export type ScanDetail = {
  id: string;
  /** Stored status with a crashed analysis shown as "failed". */
  status: ScanStatusValue;
  /** The institution's name in the viewer's language (a printed report names it; the app chrome is hidden in print). */
  institution: string;
  areaLabel: string;
  protocol: { id: string; slug: string; title: string; icon: string; custom: boolean };
  department: string | null;
  examiner: PersonRef;
  finalizedBy: PersonRef | null;
  startedAt: Date;
  analyzedAt: Date | null;
  finalizedAt: Date | null;
  /** The AI's overall notes on the photos, in the viewer's language. */
  overallNotes: string | null;
  notes: string | null;
  score: number | null;
  riskLevel: RiskLevelValue | null;
  photos: Array<{ id: string; width: number; height: number }>;
  steps: ScanDetailStep[];
  visualSteps: number;
  /** The viewer may delete this scan (not finalised; managers any, an examiner their own). */
  canDelete: boolean;
};

function person(user: { id: string; name: string } | null, scope: Scope): PersonRef {
  return user ? { name: user.name, deleted: false, isMe: user.id === scope.userId } : { name: null, deleted: true, isMe: false };
}

export async function loadScanDetail(scope: Scope, id: string, locale: Locale): Promise<ScanDetail | null> {
  const scan = await prisma.scan.findFirst({
    where: { id, ...scansReadable(scope) },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      areaLabel: true,
      examinerId: true,
      startedAt: true,
      analyzedAt: true,
      finalizedAt: true,
      finalizedById: true,
      overallNotesAr: true,
      overallNotesEn: true,
      notes: true,
      score: true,
      riskLevel: true,
      organization: { select: { name: true, nameEn: true } },
      protocol: { select: { id: true, slug: true, titleAr: true, titleEn: true, icon: true, organizationId: true } },
      team: { select: { name: true } },
      examiner: { select: { id: true, name: true } },
      finalizedBy: { select: { id: true, name: true } },
      photos: { select: { id: true, width: true, height: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      stepResults: {
        select: {
          aiVerdict: true,
          aiConfidence: true,
          evidenceAr: true,
          evidenceEn: true,
          finalVerdict: true,
          note: true,
          overriddenBy: { select: { name: true } },
          step: {
            select: {
              id: true,
              key: true,
              order: true,
              protocolId: true,
              textAr: true,
              textEn: true,
              rationaleAr: true,
              rationaleEn: true,
              criteriaAr: true,
              criteriaEn: true,
              referenceLabel: true,
              referenceUrl: true,
              isMandatory: true,
              isCritical: true,
              weight: true,
              visualCheck: true,
            },
          },
        },
      },
    },
  });
  if (!scan) return null;

  const steps = scan.stepResults
    .map((r): ScanDetailStep => ({
      id: r.step.id,
      key: r.step.key,
      order: r.step.order,
      protocolId: r.step.protocolId,
      text: pick(r.step, "text", locale),
      rationale: pick(r.step, "rationale", locale),
      criteria: pickOrNull(r.step, "criteria", locale),
      referenceLabel: r.step.referenceLabel,
      referenceUrl: safeUrl(r.step.referenceUrl),
      isMandatory: r.step.isMandatory,
      isCritical: r.step.isCritical,
      weight: r.step.weight,
      visualCheck: r.step.visualCheck,
      aiVerdict: r.aiVerdict,
      aiConfidence: r.aiConfidence,
      evidence: pickOrNull(r, "evidence", locale),
      finalVerdict: r.finalVerdict,
      note: r.note,
      decidedBy: r.overriddenBy?.name ?? null,
    }))
    .sort((a, b) => a.order - b.order);

  const status = effectiveStatus(scan);
  return {
    id: scan.id,
    status,
    // `name` is the Arabic name, nameEn the optional English one (lib/auth.ts, crosscheck D13).
    institution: locale === "en" && scan.organization.nameEn ? scan.organization.nameEn : scan.organization.name,
    areaLabel: scan.areaLabel,
    protocol: {
      id: scan.protocol.id,
      slug: scan.protocol.slug,
      title: pick(scan.protocol, "title", locale),
      icon: scan.protocol.icon,
      custom: scan.protocol.organizationId !== null,
    },
    department: scan.team?.name ?? null,
    examiner: person(scan.examiner, scope),
    finalizedBy: scan.status === "finalized" ? person(scan.finalizedBy, scope) : null,
    startedAt: scan.startedAt,
    analyzedAt: scan.analyzedAt,
    finalizedAt: scan.finalizedAt,
    overallNotes: pickOrNull(scan, "overallNotes", locale),
    notes: scan.notes,
    score: scan.score,
    riskLevel: scan.riskLevel,
    photos: scan.photos,
    steps,
    visualSteps: steps.filter((s) => s.visualCheck).length,
    canDelete: deleteGate({ userId: scope.userId, manager: isOrgManager(scope) }, scan).ok,
  };
}

/** Only http(s) reference links are rendered (protocol content is edited by people). */
function safeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
