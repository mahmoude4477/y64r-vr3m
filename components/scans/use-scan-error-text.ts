import { useTranslations } from "next-intl";
import { isSharedStateKey, scanErrorKey } from "@/lib/scans/client/errors";

/**
 * Text for a scan API error code: scans.errors.*, or common.states.* for the service states every feature shares
 * (storage off, AI off, over today's AI limit, AI busy), so the same situation always reads the same (CONVENTIONS 3).
 * Works in Server and Client Components.
 */
export function useScanErrorText(): (code: string | null | undefined) => string {
  const errors = useTranslations("scans.errors");
  const states = useTranslations("common.states");
  return (code) => {
    const key = scanErrorKey(code);
    return isSharedStateKey(key) ? states(key) : errors(key);
  };
}
