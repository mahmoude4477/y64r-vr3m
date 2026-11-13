import { isOrgStaff, requireOrgScope, type Scope } from "@/lib/authz";

/**
 * The institution a user may see reports of: the ACTIVE organization, for its staff (owner / admin / examiner) only
 * (PRODUCT 2; same rule as scansReadable and attemptsReadable in @/lib/authz). Trainees and individual users get
 * null and see personal reports only. Every institution query in lib/reports takes this object, never a bare id.
 */
export type InstitutionScope = { scope: Scope; organizationId: string };

export function institutionScope(scope: Scope): InstitutionScope | null {
  if (!isOrgStaff(scope)) return null;
  return { scope, organizationId: requireOrgScope(scope).organizationId };
}
