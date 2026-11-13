import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { clientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";
import { PRIVATE_ROBOTS } from "@/lib/seo";

// Signed-in pages (password change, invitations) are never indexed.
export const metadata: Metadata = { robots: PRIVATE_ROBOTS };

// Focused, chrome-free pages for signed-in users that must work BEFORE the app shell:
// /settings/password (forced "set a new password" for mustChangePassword users) and /invite/[id]. Also the static
// /account-deleted page shown right after a self-service account deletion (no session read, nothing personal).
// They live outside (app) on purpose: the (app) layout redirects mustChangePassword users here.
export default async function AccountLayout({ children }: LayoutProps<"/[locale]">) {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center gap-1 border-b px-4">
        {/* The landing page, not /dashboard: on /account-deleted there is no session any more, and signed-in users
            reach the app from the landing header ("go to the app"). */}
        <Link
          href="/"
          className="me-auto rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          <Logo name={t("appName")} />
        </Link>
        <LocaleSwitcher compact />
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
        <div className="w-full max-w-md">
          <NextIntlClientProvider messages={await clientMessages(["auth", "org", "settings"])}>{children}</NextIntlClientProvider>
        </div>
      </main>
    </div>
  );
}
