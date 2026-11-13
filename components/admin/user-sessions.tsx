"use client";

import { LogOutIcon, MonitorIcon, ShieldCheckIcon, SmartphoneIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { ToneBadge } from "@/components/admin/badges";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { errorOf, useAdminAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { revokeUserSessionAction } from "@/lib/admin/user-actions";
import { describeUserAgent } from "@/lib/admin/user-agent";

export type SessionView = {
  id: string;
  createdAt: string;
  updatedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  impersonated: boolean;
};

/** The account's active sessions (device, IP, last activity) with "end session". Tokens never reach the browser. */
export function UserSessions({ userId, sessions, readOnly }: { userId: string; sessions: SessionView[]; readOnly: boolean }) {
  const t = useTranslations("admin.user.sessions");
  const format = useFormatter();
  const run = useAdminAction();
  const [revoking, setRevoking] = useState<SessionView | null>(null);

  if (sessions.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;

  const deviceName = (ua: string | null) => {
    const info = describeUserAgent(ua);
    return t("deviceOn", {
      browser: t(`browsers.${info.browser ?? "unknown"}`),
      os: t(`systems.${info.os ?? "unknown"}`),
    });
  };

  return (
    <>
      <ul className="flex flex-col divide-y">
        {sessions.map((s) => {
          const info = describeUserAgent(s.userAgent);
          const Icon = info.device === "mobile" ? SmartphoneIcon : MonitorIcon;
          const name = deviceName(s.userAgent);
          return (
            <li key={s.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon aria-hidden className="size-4" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {name}
                    {s.impersonated && (
                      <ToneBadge kind="primary" icon={ShieldCheckIcon}>
                        {t("admin")}
                      </ToneBadge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("lastActive", { date: format.dateTime(new Date(s.updatedAt), "dateTime") })}
                    {" · "}
                    {t("started", { date: format.dateTime(new Date(s.createdAt), "dateTime") })}
                  </p>
                  {s.ipAddress && (
                    <p className="text-xs text-muted-foreground">
                      {t("ip")}:{" "}
                      <bdi dir="ltr" className="font-mono">
                        {s.ipAddress}
                      </bdi>
                    </p>
                  )}
                </div>
              </div>
              {!readOnly && (
                <Button variant="outline" size="sm" className="self-start sm:self-center" aria-label={t("revokeAria", { device: name })} onClick={() => setRevoking(s)}>
                  <LogOutIcon aria-hidden className="rtl:rotate-180" />
                  {t("revoke")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(v) => !v && setRevoking(null)}
        title={t("revokeTitle")}
        description={revoking ? `${deviceName(revoking.userAgent)}. ${t("revokeDescription")}` : t("revokeDescription")}
        confirmLabel={t("revoke")}
        destructive
        onConfirm={async () => (revoking ? errorOf(await run(revokeUserSessionAction, { userId, sessionId: revoking.id }, t("revoked"))) : null)}
      />
    </>
  );
}
