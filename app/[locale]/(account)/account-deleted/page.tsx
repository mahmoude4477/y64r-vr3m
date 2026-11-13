import { CircleCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Link } from "@/i18n/navigation";

// Foundation-owned: where confirmAccountDeletion() sends the browser after the account is gone
// (lib/account/delete-account.ts redirects to /<locale>/account-deleted on the server). Static and generic: it reads no
// session and shows nothing about the person (anyone may open the URL). noindex comes from the (account) layout.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.accountDeleted");
  return { title: t("title") };
}

export default async function AccountDeletedPage() {
  const t = await getTranslations("auth.accountDeleted");
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleCheckIcon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
        </EmptyTitle>
        <EmptyDescription>{t("description")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/" className={buttonVariants()}>
          {t("home")}
        </Link>
      </EmptyContent>
    </Empty>
  );
}
