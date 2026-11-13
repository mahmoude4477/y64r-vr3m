import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Versions of GLOBAL protocols (PRODUCT 3, CONVENTIONS 6). A new version is a separate protocol row (createProtocolVersion
 * in editor-actions.ts) whose Protocol.versionOfId names the protocol it was made from (versions made before the
 * column existed were linked from their "protocol.version" audit row by the migration that added it).
 *
 * Institution copies point at the global version they were copied from (sourceProtocolId) and never change by
 * themselves. With the version links:
 * - the library hides every version of a global protocol the institution has replaced with its own copy, not only
 *   the copied one (members follow the institution's version);
 * - a copy with no training scenario of its own falls back to its source, then to the newest published newer versions;
 * - managers are told when a newer version of what they copied is published (copy page, list, editor).
 * The pure helpers are unit-tested (versions.test.ts); loadGlobalVersionEdges is the one query.
 */

export type VersionEdge = { from: string; to: string };

const PLAUSIBLE_ID = /^[a-z0-9]{8,64}$/i;

/** "protocol.version" audit rows, oldest first -> version links, oldest first. Rows without a usable link are skipped. */
export function versionEdges(rows: ReadonlyArray<{ targetId: string | null; meta: unknown }>): VersionEdge[] {
  const out: VersionEdge[] = [];
  for (const row of rows) {
    const from = typeof row.meta === "object" && row.meta !== null ? (row.meta as { fromProtocolId?: unknown }).fromProtocolId : undefined;
    const to = row.targetId;
    if (typeof from !== "string" || typeof to !== "string" || from === to) continue;
    if (!PLAUSIBLE_ID.test(from) || !PLAUSIBLE_ID.test(to)) continue;
    out.push({ from, to });
  }
  return out;
}

/**
 * Every newer version of `id` (versions made from it, and versions of those), newest first; never `id` itself.
 * `edges` are oldest first, so an edge's position is its age.
 */
export function newerVersions(edges: readonly VersionEdge[], id: string): string[] {
  const children = new Map<string, Array<{ to: string; at: number }>>();
  edges.forEach((edge, at) => {
    const list = children.get(edge.from) ?? [];
    list.push({ to: edge.to, at });
    children.set(edge.from, list);
  });
  const found: Array<{ id: string; at: number }> = [];
  const seen = new Set([id]);
  const queue = [id];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const child of children.get(next) ?? []) {
      if (seen.has(child.to)) continue;
      seen.add(child.to);
      found.push({ id: child.to, at: child.at });
      queue.push(child.to);
    }
  }
  return found.sort((a, b) => b.at - a.at).map((v) => v.id);
}

/** `id` and every protocol linked to it by versions, older or newer: all the versions of one protocol. */
export function versionFamily(edges: readonly VersionEdge[], id: string): Set<string> {
  const neighbours = new Map<string, string[]>();
  const link = (a: string, b: string) => neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
  for (const edge of edges) {
    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }
  const family = new Set([id]);
  const queue = [id];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const other of neighbours.get(next) ?? []) {
      if (family.has(other)) continue;
      family.add(other);
      queue.push(other);
    }
  }
  return family;
}

/**
 * The version links between global protocols, oldest first (by when the newer version was created). Platform admins
 * create new versions rarely, so this is a short list (Protocol.versionOfId is indexed).
 */
export async function loadGlobalVersionEdges(): Promise<VersionEdge[]> {
  const rows = await prisma.protocol.findMany({
    where: { organizationId: null, versionOfId: { not: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, versionOfId: true },
  });
  return versionEdges(rows.map((r) => ({ targetId: r.id, meta: { fromProtocolId: r.versionOfId } })));
}
