import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { loadMessages } from "@/messages";
import { formats, TIME_ZONE } from "./formats";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  // `locale` is only set when a caller passes it explicitly: getTranslations({ locale, namespace })
  // in Server Actions and Route Handlers, where next/root-params throws.
  if (!locale) {
    const param = await rootParams.locale();
    if (!hasLocale(routing.locales, param)) notFound();
    locale = param;
  }
  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: TIME_ZONE,
    formats,
  };
});
