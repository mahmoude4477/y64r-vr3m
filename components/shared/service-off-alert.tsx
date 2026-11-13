import { CloudOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Clear message when a server capability is not configured (never crash instead):
 *   storage -> lib/storage.ts isStorageConfigured()
 *   email   -> lib/email isEmailEnabled()
 *   ai      -> lib/ai/model.ts isAiConfigured()
 *   aiLimit -> AI error code daily_limit (lib/ai/limits.ts checkAiQuota().allowed === false)
 *   aiBusy  -> AI error code too_many_requests (in-flight / per-minute limit; retry shortly)
 * Under cacheComponents read the flags at request time: storageConfiguredAtRequest(),
 * aiConfiguredAtRequest(), emailEnabledAtRequest(), or inside the Suspense'd data component.
 */
const KEYS = { storage: "storageOff", email: "emailOff", ai: "aiOff", aiLimit: "aiLimit", aiBusy: "aiBusy" } as const;

export function ServiceOffAlert({ service }: { service: keyof typeof KEYS }) {
  const t = useTranslations("common.states");
  const key = KEYS[service];
  return (
    <Alert>
      <CloudOffIcon aria-hidden />
      <AlertDescription>{t(key)}</AlertDescription>
    </Alert>
  );
}
