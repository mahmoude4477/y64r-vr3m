"use client";

import { ArrowLeftRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { callAuth, useOrgErrorText } from "@/components/org/use-org-error";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { focusHeading } from "./settings-section";

/**
 * Makes an institution (or, with `organizationId: null`, the individual account) the active one, through Better Auth's
 * set-active like the header's OrgSwitcher. lib/auth.ts refuses a suspended institution (ORGANIZATION_SUSPENDED) and
 * Better Auth refuses one the user is not a member of; both come back as org.errors texts. The row's button is gone
 * after the switch (that row is now the active one), so focus moves to the section heading.
 */
export function SwitchInstitutionButton({
  organizationId,
  label,
  accessibleLabel,
  switchedMessage,
}: {
  organizationId: string | null;
  label: string;
  accessibleLabel: string;
  switchedMessage: string;
}) {
  const t = useTranslations("settings.institutions");
  const errorText = useOrgErrorText();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function choose() {
    if (pending) return;
    setPending(true);
    const result = await callAuth(() => authClient.organization.setActive({ organizationId }));
    setPending(false);
    if (!result.ok) {
      toast.error(errorText(result.error));
      return;
    }
    toast.success(switchedMessage);
    router.refresh();
    focusHeading("institutions");
  }

  return (
    <Button
      type="button"
      variant="outline"
      aria-disabled={pending}
      aria-label={pending ? undefined : accessibleLabel}
      onClick={() => void choose()}
    >
      {pending ? <Spinner /> : <ArrowLeftRightIcon aria-hidden />}
      {pending ? t("switching") : label}
    </Button>
  );
}
