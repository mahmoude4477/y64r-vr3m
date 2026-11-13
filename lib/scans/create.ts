import "server-only";
import { protocolsReadable, type Scope, teamsReadable } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import type { Failure } from "./photos";
import type { CreateScanInput } from "./schemas";

const fail = (status: number, error: string): Failure => ({ ok: false, status, error });

class PhotosTaken extends Error {}

/**
 * Creates a DRAFT scan in the active institution and attaches the user's own unattached uploads to it.
 * - The protocol must be published and readable by the institution (global or its own), with at least one step.
 * - The department (Better Auth team) must belong to the active institution.
 * - One ScanStepResult row per protocol step is created now: the scan keeps the checklist it was started with
 *   (steps that have results cannot be deleted later, CONVENTIONS 6), and the review fills the verdicts in.
 * - Photos are attached inside the same transaction; if any was attached elsewhere in the meantime nothing is saved.
 */
export async function createScan(scope: Scope, input: CreateScanInput): Promise<{ ok: true; id: string } | Failure> {
  const organizationId = scope.organizationId;
  if (!organizationId) return fail(403, "forbidden");

  const protocol = await prisma.protocol.findFirst({
    where: { AND: [{ id: input.protocolId, isPublished: true }, protocolsReadable(scope)] },
    select: { id: true, steps: { select: { id: true }, orderBy: { order: "asc" } } },
  });
  if (!protocol) return fail(404, "protocol_not_found");
  if (protocol.steps.length === 0) return fail(422, "protocol_empty");

  const teamId = input.teamId || null;
  if (teamId) {
    const team = await prisma.team.findFirst({ where: { id: teamId, ...teamsReadable(scope) }, select: { id: true } });
    if (!team) return fail(404, "team_not_found");
  }

  const photoWhere = { id: { in: input.photoIds }, organizationId, uploadedById: scope.userId, scanId: null };
  const available = await prisma.scanPhoto.count({ where: photoWhere });
  if (available !== input.photoIds.length) return fail(409, "photos_unavailable");

  try {
    const scan = await prisma.$transaction(async (tx) => {
      const created = await tx.scan.create({
        data: {
          organizationId,
          teamId,
          examinerId: scope.userId,
          protocolId: protocol.id,
          areaLabel: input.areaLabel,
          status: "draft",
          stepResults: { createMany: { data: protocol.steps.map((s) => ({ stepId: s.id })) } },
        },
        select: { id: true },
      });
      const attached = await tx.scanPhoto.updateMany({ where: photoWhere, data: { scanId: created.id } });
      if (attached.count !== input.photoIds.length) throw new PhotosTaken();
      return created;
    });
    return { ok: true, id: scan.id };
  } catch (e) {
    if (e instanceof PhotosTaken) return fail(409, "photos_unavailable");
    throw e;
  }
}
