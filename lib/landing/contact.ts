// How institutions reach the Waqaya team from the landing page.
//
// No contact address has been chosen yet (2026-10-29), so it is null: the page then shows no address at all and
// sends institutions to /sign-up instead, with copy that promises only what the product does today ("try the
// training simulations yourself"). It must not promise that "we set up your institution": a sign-up is an individual
// trainee, only platform admins create institutions, and nothing tells the team about the request (landing review
// r1). Never invent an address here. When one is picked, set it to an e-mail address ("name@domain") or an https://
// link (a contact form); the institutions section and the closing band then show a "contact us" link to it.

export const INSTITUTION_CONTACT: string | null = null;

export type ContactLink = {
  /** mailto:… for an address, the URL itself for a web form. */
  href: string;
  /** A web form on another site: open it in a new tab. */
  external: boolean;
};

// One address, no display name, no query: "name@domain.tld". Deliberately strict (it is our own constant).
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/**
 * The link for a configured contact, or null when none is set. A value that is neither an e-mail address nor an
 * https URL throws, so a typo fails the build instead of shipping a broken link.
 */
export function contactLink(contact: string | null | undefined): ContactLink | null {
  const value = contact?.trim();
  if (!value) return null;
  if (EMAIL.test(value)) return { href: `mailto:${value}`, external: false };
  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  if (url && url.protocol === "https:" && !url.username && !url.password) return { href: url.href, external: true };
  throw new Error("INSTITUTION_CONTACT must be an e-mail address or an https:// URL");
}

/** The configured institutions contact (null while none has been chosen). */
export function institutionContact(): ContactLink | null {
  return contactLink(INSTITUTION_CONTACT);
}
