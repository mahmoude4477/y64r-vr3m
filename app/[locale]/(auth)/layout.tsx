import { CameraIcon, ChartNoAxesColumnIcon, GraduationCapIcon } from "lucide-react";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Logo, LogoMark } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { clientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";
import { AUTH_ROBOTS } from "@/lib/seo";

// Sign-in, sign-up and password reset: never in search results, links may be followed.
export const metadata: Metadata = { robots: AUTH_ROBOTS };

export default async function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  const t = await getTranslations("auth.brand");
  const c = await getTranslations("common");
  const points = [
    { icon: GraduationCapIcon, text: t("points.simulate") },
    { icon: CameraIcon, text: t("points.scan") },
    { icon: ChartNoAxesColumnIcon, text: t("points.measure") },
  ];
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-[#06141b] text-slate-100 lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_80%_10%,rgba(79,195,217,0.22),transparent),radial-gradient(50%_50%_at_10%_90%,rgba(79,195,217,0.12),transparent)]"
        />
        <Link href="/" className="relative inline-flex w-fit items-center gap-3">
          <LogoMark className="size-10 [&_path]:stroke-[#5fd0e3]" />
          <span className="text-2xl font-bold text-[#5fd0e3]">{c("appName")}</span>
        </Link>
        <div className="relative flex flex-col gap-8">
          <p className="max-w-md text-2xl leading-relaxed font-semibold text-balance">{t("headline")}</p>
          <ul className="flex flex-col gap-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-slate-300">
                <span className="flex size-9 items-center justify-center rounded-lg border border-[#5fd0e3]/25 bg-[#0b2a33]">
                  <Icon className="size-4 text-[#5fd0e3]" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        {/* One trust line. No award line and no team names anywhere on the site (PRODUCT.md, 2026-10-28). */}
        <p className="relative text-xs text-slate-400">{t("trust")}</p>
      </aside>
      <div className="flex min-h-svh flex-col">
        <header className="flex h-14 items-center gap-1 px-4">
          <Link href="/" className="me-auto lg:invisible">
            <Logo name={c("appName")} />
          </Link>
          <LocaleSwitcher compact />
          <ThemeToggle />
        </header>
        <main id="main" className="flex flex-1 items-start justify-center px-4 pt-6 pb-12 sm:items-center sm:pt-0">
          <div className="w-full max-w-sm">
            <NextIntlClientProvider messages={await clientMessages(["auth"])}>{children}</NextIntlClientProvider>
          </div>
        </main>
      </div>
    </div>
  );
}
