"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { zodErrorMap } from "@/lib/zod-i18n";

/** Client hook: translated zod error map for zodResolver(schema, { error: map }). */
export function useZodErrorMap() {
  const t = useTranslations("validation");
  const locale = useLocale();
  return useMemo(() => zodErrorMap(t, locale), [t, locale]);
}
