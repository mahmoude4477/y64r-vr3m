"use client";

import { LogOutIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ variant = "ghost" }: { variant?: "ghost" | "outline" }) {
  const t = useTranslations("nav.userMenu");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant={variant}
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await authClient.signOut();
        } finally {
          router.replace("/sign-in");
          router.refresh();
        }
      }}
    >
      <LogOutIcon className="rtl:rotate-180" aria-hidden />
      {pending ? t("signingOut") : t("signOut")}
    </Button>
  );
}
