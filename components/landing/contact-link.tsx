import { ExternalLinkIcon, MailIcon } from "lucide-react";
import type { ContactLink as Contact } from "@/lib/landing/contact";

/**
 * "Contact us" link for institutions. Rendered only when lib/landing/contact.ts has an address (it has none yet:
 * none has been chosen yet). An e-mail opens the mail app; a web form opens in a new tab and says so.
 */
export function ContactLink({
  contact,
  label,
  newTabHint,
  className,
}: {
  contact: Contact;
  label: string;
  newTabHint: string;
  className?: string;
}) {
  const Icon = contact.external ? ExternalLinkIcon : MailIcon;
  return (
    <a
      href={contact.href}
      className={className}
      {...(contact.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      <Icon className="size-4.5" aria-hidden />
      {label}
      {contact.external && <span className="sr-only"> ({newTabHint})</span>}
    </a>
  );
}
