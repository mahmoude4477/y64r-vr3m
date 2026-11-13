import type { Prisma } from "@/generated/prisma/client";
import { protocolsEditable, type Scope } from "@/lib/authz";

/**
 * The two places the one protocol editor runs (components/protocols/editor):
 * - "global": platform admins edit the protocols every user sees (organizationId = null), at /admin/protocols.
 * - "institution": owners and admins of the ACTIVE institution edit its own protocols, at /org/protocols.
 * Every editor query and action takes the scope explicitly and builds its where-clause here. Pure, unit-tested.
 */
export const EDITOR_SCOPES = ["global", "institution"] as const;
export type EditorScope = (typeof EDITOR_SCOPES)[number];

export function isEditorScope(value: unknown): value is EditorScope {
  return typeof value === "string" && (EDITOR_SCOPES as readonly string[]).includes(value);
}

const NOTHING: Prisma.ProtocolWhereInput = { id: { in: [] } };

/**
 * Protocols this user may change in this editor scope. Global: platform admins and protocol editors (the caller
 * already ran requireContentEditor; this is the second line). Institution: protocolsEditable (managers of the active institution).
 */
export function editableWhere(kind: EditorScope, scope: Scope): Prisma.ProtocolWhereInput {
  if (kind === "global") return (scope.isContentEditor ?? scope.isPlatformAdmin) ? { organizationId: null } : NOTHING;
  return protocolsEditable(scope);
}

/** Where the editor of this scope lives (locale-less, for Link / router / revalidation). */
export function editorBasePath(kind: EditorScope): "/admin/protocols" | "/org/protocols" {
  return kind === "global" ? "/admin/protocols" : "/org/protocols";
}

/** Upper bound of an institution's own protocols (copies + its own), so one account cannot fill the table. */
export const MAX_INSTITUTION_PROTOCOLS = 200;

/** Where platform admins move or copy training scenarios (the simulations team's scenario editor). */
export const SCENARIO_EDITOR_PATH = "/admin/scenarios";
