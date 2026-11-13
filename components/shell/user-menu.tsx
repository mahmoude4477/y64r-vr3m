"use client";

import { LogOutIcon, SettingsIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import type { ShellData } from "./types";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0]?.slice(0, 2) ?? "?")).toUpperCase();
}

export function UserMenu({ data }: { data: ShellData | null }) {
  const t = useTranslations("nav.userMenu");
  const tRoles = useTranslations("common.roles");
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  if (!data) return <Skeleton className="size-8 rounded-full" />;
  const { user } = data;

  async function signOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      router.replace("/sign-in");
      router.refresh();
    }
  }

  return (
    <DropdownMenu>
      {/* The name is the sr-only label, not the initials (WCAG 2.5.3: an aria-label must contain the visible text,
          so the decorative avatar is hidden from assistive technology instead). */}
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" />}>
        <Avatar className="size-8" aria-hidden>
          {user.image && <AvatarImage src={user.image} alt="" />}
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(user.name)}</AvatarFallback>
        </Avatar>
        <span className="sr-only">{t("label")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
            <span className="text-xs font-normal text-muted-foreground">{t("signedInAs")}</span>
            <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
            <bdi dir="ltr" className="truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </bdi>
            {(data.isPlatformAdmin || data.isContentEditor || data.orgRole) && (
              <span className="mt-1 flex flex-wrap gap-1">
                {data.isPlatformAdmin && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <ShieldCheckIcon className="size-3" aria-hidden />
                    {tRoles("platformAdmin")}
                  </span>
                )}
                {!data.isPlatformAdmin && data.isContentEditor && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <ShieldCheckIcon className="size-3" aria-hidden />
                    {tRoles("protocolEditor")}
                  </span>
                )}
                {data.orgRole && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {tRoles(data.orgRole)}
                  </span>
                )}
              </span>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {/* A real link, not router.push: in-page guards (the protocol editor's unsaved-changes prompt) can hold it. */}
          <DropdownMenuItem render={<Link href="/settings" />}>
            <SettingsIcon aria-hidden />
            {t("settings")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" disabled={signingOut} onClick={signOut}>
            <LogOutIcon className="rtl:rotate-180" aria-hidden />
            {signingOut ? t("signingOut") : t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
