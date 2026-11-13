import type { formats } from "@/i18n/formats";
import type { routing } from "@/i18n/routing";
import type { AppMessages } from "@/messages";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: AppMessages;
    Formats: typeof formats;
  }
}
