import "server-only";
import { type AuthContext, getAuthContext } from "@/lib/session";

/**
 * The platform admin or protocol editor of this request, or null. Like requireContentEditor() (lib/session) but
 * without its redirect / not-found, which a Server Action cannot show: guests, users who must change their password,
 * everyone else, and an admin who is impersonating someone (the session user is then the other person) all get null,
 * and the action answers "forbidden". Pages keep using requireContentEditor().
 */
export async function platformAdminOrNull(): Promise<AuthContext | null> {
  const ctx = await getAuthContext();
  if (!ctx || ctx.user.mustChangePassword || !ctx.isContentEditor) return null;
  return ctx;
}
