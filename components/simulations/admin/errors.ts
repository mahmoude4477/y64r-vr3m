"use client";

import { useTranslations } from "next-intl";
import type { ActionError } from "@/lib/simulations/admin/actions";

/** The text of a scenario-editor action error (simulations.admin.errors.*); "network" = the request never arrived. */
export function useAdminErrorText() {
  const t = useTranslations("simulations.admin.errors");
  return (code: ActionError | "network"): string => {
    switch (code) {
      case "network":
        return t("network");
      case "forbidden":
        return t("forbidden");
      case "not_found":
        return t("notFound");
      case "stale":
        return t("stale");
      case "has_attempts":
        return t("hasAttempts");
      case "slug_taken":
        return t("slugTaken");
      case "protocol_not_allowed":
        return t("protocolNotAllowed");
      case "organization_not_found":
        return t("organizationNotFound");
      case "invalid_content":
        return t("invalidContent");
      case "cannot_publish":
        return t("cannotPublish");
      case "not_draft":
        return t("notDraft");
      case "invalid_input":
        return t("invalid");
      default:
        return t("generic");
    }
  };
}
