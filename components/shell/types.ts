import type { OrgRole } from "@/lib/permissions";

/** Serializable data the server shell passes to the client sidebar / header. */
export type ShellOrg = { id: string; name: string; nameEn: string | null; logo: string | null; role: OrgRole | null };

export type ShellData = {
  user: { id: string; name: string; email: string; image: string | null };
  isPlatformAdmin: boolean;
  /** Platform admin or protocol editor. */
  isContentEditor: boolean;
  activeOrganizationId: string | null;
  orgRole: OrgRole | null;
  orgs: ShellOrg[];
};
