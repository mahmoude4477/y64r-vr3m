import "server-only";
import { auth } from "@/lib/auth";

// What the server's Better Auth configuration (lib/auth.ts, foundation) allows, so the org pages offer exactly that.

type OrganizationPluginOptions = { teams?: { allowRemovingAllTeams?: boolean } };

/**
 * Whether an institution's last department can be deleted. Better Auth refuses it (UNABLE_TO_REMOVE_LAST_TEAM) unless
 * the organization plugin sets teams.allowRemovingAllTeams (foundation request SPEC-4); the departments page reads the
 * same option, so its delete action is right before and after that change.
 */
export function canDeleteLastDepartment(): boolean {
  const plugin = auth.options.plugins.find((p) => p.id === "organization") as { options?: OrganizationPluginOptions } | undefined;
  return plugin?.options?.teams?.allowRemovingAllTeams === true;
}
