import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "@/i18n/navigation";
import { LANDING_SECTIONS } from "@/lib/routes";
import { HeaderAuth } from "./header-auth";

/** A solid 2 px focus outline in the ring colour (3.7:1 light, 7.3:1 dark; the 50 % halo is under 3:1). */
const LINK_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring";

/**
 * Public header (marketing pages): logo, the landing's section links from 768 px, language and theme, and the account
 * actions. Reads no request data, so every marketing page keeps a fully static, cacheable shell: the signed-in switch
 * happens in the HeaderAuth client island. Sticky on screen, static on paper.
 */
export async function SiteHeader() {
  const [t, locale] = await Promise.all([getTranslations("common"), getLocale()]);
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 print:static">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link href="/" className={`me-auto rounded-md md:me-0 ${LINK_FOCUS}`}>
          <Logo name={t("appName")} />
        </Link>
        <nav aria-label={t("marketing.nav.label")} className="mx-auto hidden md:block">
          <ul className="flex items-center gap-1">
            {LANDING_SECTIONS.map(({ id, key }) => (
              <li key={id}>
                {/* A plain anchor on the landing's own URL: on the landing it only scrolls (no navigation). */}
                <a
                  href={`/${locale}#${id}`}
                  className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${LINK_FOCUS}`}
                >
                  {t(`marketing.nav.${key}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <LocaleSwitcher compact />
          <ThemeToggle />
          <HeaderAuth
            signIn={t("marketing.signIn")}
            signUp={t("marketing.signUp")}
            signUpShort={t("marketing.signUpShort")}
            goToApp={t("marketing.goToApp")}
          />
        </div>
      </div>
    </header>
  );
}
