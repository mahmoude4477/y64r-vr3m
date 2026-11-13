"use client";

import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type Labels = { signIn: string; signUp: string; signUpShort: string; goToApp: string };

/**
 * The site header's account actions, as a small client island so the public pages stay fully static and cacheable
 * (the header used to read the session on the server, which made every marketing page dynamic). The server renders
 * the guest actions; after hydration a cookie-presence check (/api/session/state, no database) swaps them for
 * "Dashboard" when the visitor is signed in.
 *
 * Phones (below 640 px) keep one compact primary action (create account, or Dashboard); the ghost "sign in" link
 * shows from 640 px, and the landing offers sign-in in its hero on phones.
 */
export function HeaderAuth({ signIn, signUp, signUpShort, goToApp }: Labels) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/session/state", { signal: controller.signal, credentials: "same-origin", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ signedIn?: unknown }>) : null))
      .then((body) => {
        if (body?.signedIn === true) setSignedIn(true);
      })
      .catch(() => {}); // offline or aborted: keep the guest actions
    return () => controller.abort();
  }, []);

  if (signedIn) {
    return (
      <Link href="/dashboard" className={buttonVariants({ size: "sm", className: "h-8" })}>
        {goToApp}
      </Link>
    );
  }
  return (
    <>
      <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm", className: "hidden h-8 sm:inline-flex" })}>
        {signIn}
      </Link>
      <Link href="/sign-up" className={buttonVariants({ size: "sm", className: "h-8" })}>
        <span className="sm:hidden">{signUpShort}</span>
        <span className="hidden sm:inline">{signUp}</span>
      </Link>
    </>
  );
}
