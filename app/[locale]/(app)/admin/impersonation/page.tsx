import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ImpersonationNotice } from "@/components/admin/impersonation-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthContext } from "@/lib/session";

// /admin/impersonation: where a platform admin who is acting as a user (Better Auth impersonation) lands, with the way
// back. While impersonating, the admin layout shows the same notice on every /admin/** address (the session is the
// USER's, so the other admin pages would answer not found). Without an impersonation session this is the not-found
// page. getAuthContext, not requireUser: an impersonated user with mustChangePassword must still be able to come back
// (stop-impersonating is allowed in that state, lib/auth-hooks.ts).

export async function generateMetadata(): Promise<Metadata> {
  // The title follows what the page shows: the notice while impersonating, else the not-found page.
  const ctx = await getAuthContext();
  if (!ctx?.session.impersonatedBy) {
    const t = await getTranslations("common.notFound");
    return { title: t("title") };
  }
  const t = await getTranslations("admin.impersonation");
  return { title: t("title") };
}

async function ImpersonationBody() {
  const ctx = await getAuthContext();
  if (!ctx?.session.impersonatedBy) notFound();
  return <ImpersonationNotice name={ctx.user.name} userId={ctx.user.id} />;
}

export default function ImpersonationPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 w-full max-w-xl rounded-xl" />}>
      <ImpersonationBody />
    </Suspense>
  );
}
