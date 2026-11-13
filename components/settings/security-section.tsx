import {
  KeyRoundIcon,
  type LucideIcon,
  MonitorIcon,
  MonitorSmartphoneIcon,
  ShieldAlertIcon,
  SmartphoneIcon,
  TabletIcon,
  UserCogIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";
import type { SettingsData } from "@/lib/settings-feature/queries";
import type { SessionView } from "@/lib/settings-feature/sessions";
import type { DeviceKind } from "@/lib/settings-feature/user-agent";
import { cn } from "@/lib/utils";
import { RevokeOthersFooter, RevokeSessionButton } from "./session-actions";
import { sectionHeadingId, SettingsSection } from "./settings-section";

const DEVICE_ICON: Record<DeviceKind, LucideIcon> = {
  desktop: MonitorIcon,
  mobile: SmartphoneIcon,
  tablet: TabletIcon,
  unknown: MonitorSmartphoneIcon,
};

type SessionsT = ReturnType<typeof useTranslations<"settings.security.sessions">>;

/** "Chrome on Windows", "Safari", "Unknown browser on Android", "Unknown device". Brand names are not translated. */
function deviceLabel(s: SessionView, t: SessionsT): string {
  if (s.browser && s.os) return t("device", { browser: s.browser, os: s.os });
  if (s.browser) return s.browser;
  if (s.os) return t("device", { browser: t("unknownBrowser"), os: s.os });
  return t("unknownDevice");
}

function lastActiveLabel(s: SessionView, t: SessionsT): string {
  if (s.current) return t("lastActive.now");
  if (s.lastActiveDays === 0) return t("lastActive.today");
  if (s.lastActiveDays === 1) return t("lastActive.yesterday");
  return t("lastActive.daysAgo", { count: s.lastActiveDays });
}

function SessionItem({ session, canRevoke }: { session: SessionView; canRevoke: boolean }) {
  const t = useTranslations("settings.security.sessions");
  const format = useFormatter();
  const Icon = DEVICE_ICON[session.device];
  const label = deviceLabel(session, t);
  return (
    <Item role="listitem" variant="outline" className={session.current ? "border-primary/30 bg-primary/5" : undefined}>
      <ItemMedia variant="icon" className="size-9 rounded-lg bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-4" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="flex-wrap">
          <span dir="auto">{label}</span>
          {session.current && <Badge>{t("current")}</Badge>}
          {session.impersonated && (
            <Badge variant="outline" className="border-warning/40 bg-warning/10 text-foreground">
              <UserCogIcon aria-hidden />
              {t("impersonated")}
            </Badge>
          )}
        </ItemTitle>
        {/* One line per fact on phones (no separator dangling at a line end), one row on wider screens. */}
        <ItemDescription className="flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-2">
          <span>
            {t("signedIn", { date: format.dateTime(session.signedInAt, "date"), time: format.dateTime(session.signedInAt, "time") })}
          </span>
          <span aria-hidden className="hidden sm:inline">
            ·
          </span>
          <span>{lastActiveLabel(session, t)}</span>
        </ItemDescription>
      </ItemContent>
      {canRevoke && !session.current && (
        <ItemActions className="w-full justify-end sm:w-auto">
          <RevokeSessionButton sessionId={session.id} device={label} />
        </ItemActions>
      )}
    </Item>
  );
}

export function SecuritySection({ data }: { data: Pick<SettingsData, "passwordUpdatedAt" | "sessions" | "impersonating"> }) {
  const t = useTranslations("settings.security");
  const format = useFormatter();
  const { current, others, hiddenCount } = data.sessions;
  return (
    <SettingsSection id="security" title={t("title")} description={t("description")}>
      <CardContent className="flex flex-col gap-6">
        <Item variant="outline">
          <ItemMedia variant="icon" className="size-9 rounded-lg bg-muted text-muted-foreground">
            <KeyRoundIcon aria-hidden className="size-4" />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle>
              <h3>{t("password.title")}</h3>
            </ItemTitle>
            <ItemDescription>
              {data.passwordUpdatedAt
                ? t("password.lastChanged", { date: format.dateTime(data.passwordUpdatedAt, "date") })
                : t("password.hint")}
            </ItemDescription>
          </ItemContent>
          <ItemActions className="w-full justify-end sm:w-auto">
            {/* cn(): buttonVariants alone keeps the base border-transparent next to the outline border color. */}
            <Link href="/settings/password" className={cn(buttonVariants({ variant: "outline" }))}>
              {t("password.change")}
            </Link>
          </ItemActions>
        </Item>

        <Separator />

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 id={sectionHeadingId("sessions")} tabIndex={-1} className="text-sm font-semibold outline-none">
              {t("sessions.title")}
            </h3>
            <p className="text-sm text-muted-foreground">{t("sessions.description")}</p>
          </div>
          <ItemGroup aria-labelledby={sectionHeadingId("sessions")} className="gap-2">
            <SessionItem session={current} canRevoke={false} />
            {others.map((s) => (
              // A platform admin acting as this user cannot sign the user's devices out (the action refuses too).
              <SessionItem key={s.id} session={s} canRevoke={!data.impersonating} />
            ))}
          </ItemGroup>
          {hiddenCount > 0 && <p className="text-sm text-muted-foreground">{t("sessions.hidden", { count: hiddenCount })}</p>}
          {others.length === 0 && <p className="text-sm text-muted-foreground">{t("sessions.onlyThis")}</p>}
          {data.impersonating && (
            <Alert>
              <ShieldAlertIcon aria-hidden />
              <AlertDescription>{t("sessions.impersonatingNote")}</AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
      <RevokeOthersFooter show={others.length > 0 && !data.impersonating} />
    </SettingsSection>
  );
}
