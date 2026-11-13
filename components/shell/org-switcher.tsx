"use client";

import { Building2Icon, CheckIcon, ChevronsUpDownIcon, UserRoundIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import type { ShellData, ShellOrg } from "./types";

function orgName(org: ShellOrg, locale: string) {
  return locale === "en" && org.nameEn ? org.nameEn : org.name;
}

/** Header switcher for the active organization (Better Auth session.activeOrganizationId). */
export function OrgSwitcher({ data }: { data: ShellData | null }) {
  const t = useTranslations("nav.orgSwitcher");
  const tRoles = useTranslations("common.roles");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!data) return <Skeleton className="h-7 w-28" />;

  const active = data.orgs.find((o) => o.id === data.activeOrganizationId) ?? null;
  const label = active ? orgName(active, locale) : t("personal");

  function choose(org: ShellOrg | null) {
    if ((org?.id ?? null) === (active?.id ?? null)) return;
    startTransition(async () => {
      const { error } = await authClient.organization.setActive({ organizationId: org?.id ?? null });
      if (error) {
        toast.error(t("failed"));
        return;
      }
      toast.success(t("switched", { name: org ? orgName(org, locale) : t("personal") }));
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="max-w-48 min-w-0" aria-label={`${t("label")}: ${label}`} />}
      >
        {pending ? (
          <Spinner />
        ) : active ? (
          <Building2Icon aria-hidden />
        ) : (
          <UserRoundIcon aria-hidden />
        )}
        <span className="hidden truncate sm:inline">{label}</span>
        <ChevronsUpDownIcon className="opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-60" align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => choose(null)}>
            <UserRoundIcon aria-hidden />
            <span className="flex flex-1 flex-col">
              <span>{t("personal")}</span>
              <span className="text-xs text-muted-foreground">{t("personalHint")}</span>
            </span>
            {!active && <CheckIcon aria-hidden />}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {data.orgs.length > 0 && <DropdownMenuSeparator />}
        {data.orgs.length > 0 && (
          <DropdownMenuGroup>
            {data.orgs.map((org) => (
              <DropdownMenuItem key={org.id} onClick={() => choose(org)}>
                <Building2Icon aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{orgName(org, locale)}</span>
                  {org.role && <span className="text-xs text-muted-foreground">{tRoles(org.role)}</span>}
                </span>
                {org.id === active?.id && <CheckIcon aria-hidden />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
