import "server-only";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { type DeletionBlocker, deletionBlockers } from "@/lib/account/deletion-rules";
import { DELETION_CODE_TTL_SECONDS } from "@/lib/account/deletion-code";
import { isEmailEnabled } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/** A blocker as the settings page shows it: the stable kind, institution names in the page language, a message. */
export type DeletionBlockerView =
  | { kind: "only_owner"; organizations: Array<{ id: string; name: string }>; message: string }
  | { kind: "last_platform_admin"; message: string };

export type AccountDeletionInfo = {
  /** The address the code goes to (show it in <bdi>). */
  email: string;
  /** Ask for the password in the confirm step (false for an account without a password). */
  hasPassword: boolean;
  /** Email is off on this server: no code can be sent, so deletion cannot start. */
  emailEnabled: boolean;
  /** A platform admin acting as this user: deletion is refused. */
  impersonating: boolean;
  blockers: DeletionBlockerView[];
  /** Lifetime of a code, for "the code expires in N minutes". */
  codeMinutes: number;
};

/** "مستشفى أ و مستشفى ب" / "Hospital A and Hospital B". */
function listNames(locale: Locale, names: string[]): string {
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(names);
}

export async function blockerViews(blockers: readonly DeletionBlocker[], locale: Locale): Promise<DeletionBlockerView[]> {
  const t = await getTranslations({ locale, namespace: "auth.deleteAccount.errors" });
  return blockers.map((b) => {
    if (b.kind === "last_platform_admin") return { kind: b.kind, message: t("blockedLastAdmin") };
    const organizations = b.organizations.map((o) => ({ id: o.id, name: locale === "en" ? (o.nameEn ?? o.name) : o.name }));
    return {
      kind: b.kind,
      organizations,
      message: t("blockedOwner", { organizations: listNames(locale, organizations.map((o) => o.name)) }),
    };
  });
}

/** Whether the user can confirm with a password (Better Auth credential account with a hash). */
export async function hasPasswordAccount(userId: string): Promise<boolean> {
  const n = await prisma.account.count({ where: { userId, providerId: "credential", password: { not: null } } });
  return n > 0;
}

/**
 * Everything the settings team's "delete my account" section needs before the first click. Call it inside the
 * Suspense'd data component (it reads the session; it applies the mustChangePassword gate like requireUser()).
 */
export async function getAccountDeletionInfo(locale: Locale): Promise<AccountDeletionInfo> {
  const ctx = await requireUser();
  const [blockers, hasPassword] = await Promise.all([deletionBlockers(ctx.user.id), hasPasswordAccount(ctx.user.id)]);
  return {
    email: ctx.user.email,
    hasPassword,
    emailEnabled: isEmailEnabled(),
    impersonating: !!ctx.session.impersonatedBy,
    blockers: await blockerViews(blockers, locale),
    codeMinutes: DELETION_CODE_TTL_SECONDS / 60,
  };
}
