"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter as useLocaleRouter } from "@/i18n/navigation";

type Pending = { kind: "link"; href: string } | { kind: "back" };

export type UnsavedChangesGuard = {
  /** The navigation waiting for the user's answer (the dialog is open while it is set). */
  pending: Pending | null;
  stay: () => void;
  leave: () => void;
  /**
   * Turns the guard off before the editor navigates on purpose (after a create, a delete), and first removes the extra
   * history entry the guard added, so Back afterwards goes where the user expects.
   */
  release: () => Promise<void>;
};

/** How long Back may take to land before "Leave" assumes there was no earlier page in this tab. */
const BACK_FALLBACK_MS = 700;

/** How long the "your changes are not saved" notice stays after a navigation the guard could not hold. */
const LEFT_NOTICE_MS = 15_000;

/**
 * Marks the extra history entry the guard pushes. It lives in history.state, so a page the router shows again on Back
 * (from its cache) knows it stands on that entry already and does not push a second one.
 */
const GUARD_ENTRY = "__waqayaUnsavedGuard";

function historyState(): Record<string, unknown> | null {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null ? (state as Record<string, unknown>) : null;
}

function onGuardEntry(): boolean {
  return historyState()?.[GUARD_ENTRY] === true;
}

/** The extra entry: same address, the router's own state (so it can restore the page) plus the mark. */
function pushGuardEntry() {
  window.history.pushState({ ...historyState(), [GUARD_ENTRY]: true }, "", window.location.href);
}

/**
 * Keeps unsaved editor changes from being lost by a single tap. While `dirty`:
 * - closing or reloading the tab: the browser's own prompt (beforeunload);
 * - any same-origin link (sidebar, breadcrumbs, back link, "View in the library"): the click is held and a dialog asks
 *   first (capture phase, before Next's <Link> sees it: it skips clicks that were already prevented);
 * - the browser's Back button: one extra history entry for the same address is pushed, so Back lands on the page's
 *   own entry (nothing changes on screen) and the dialog asks; Stay pushes the extra entry again.
 * When the form is clean again (saved, or the edits undone) the extra entry is removed.
 * "Leave without saving" discards the edits (`onDiscard`, in the same transition as the navigation), so the page the
 * router keeps does not bring them back on Back.
 * A navigation started from code elsewhere (a menu item calling router.push) cannot be held: the router keeps the
 * hidden editor with its edits, so the next page shows a notice whose button goes back to them.
 * `fallbackHref` (locale-less): where "Leave" goes after Back when there is no earlier page in the tab.
 *
 * The router keeps pages it left mounted but hidden (React Activity) and shows them again on Back: effects then run
 * again, so every (re)mount starts from a clean guard state (the refs below survive a hide).
 */
export function useUnsavedChangesGuard(dirty: boolean, fallbackHref: string, onDiscard?: () => void): UnsavedChangesGuard {
  const router = useRouter(); // hrefs read from links already carry the locale
  const localeRouter = useLocaleRouter();
  const t = useTranslations("protocols.editor.leave");
  const [pending, setPending] = useState<Pending | null>(null);
  /** The current history entry is the extra one this guard pushed. */
  const sentinel = useRef(false);
  /** The user chose to leave, or the editor navigates on purpose: let everything through. */
  const leaving = useRef(false);
  /** popstate events this guard caused itself (removing the extra entry). */
  const ownPops = useRef(0);
  /** Mounted and shown (not hidden by the router). */
  const active = useRef(false);
  /** The editor's address (path + query, with the locale), read when it is shown. */
  const editorHref = useRef("");
  // The latest values, for listeners and cleanups that outlive a render.
  const latest = useRef({ dirty, onDiscard, t, router });
  useLayoutEffect(() => {
    latest.current = { dirty, onDiscard, t, router };
  });

  // First, so the effects below always start from it (also when a hidden page is shown again).
  useEffect(() => {
    active.current = true;
    sentinel.current = onGuardEntry();
    leaving.current = false;
    ownPops.current = 0;
    editorHref.current = `${window.location.pathname}${window.location.search}`;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!leaving.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (leaving.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page
      e.preventDefault();
      setPending({ kind: "link", href: `${url.pathname}${url.search}${url.hash}` });
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [dirty]);

  // One listener for the whole time the page is shown, so the popstate of removing the extra entry is always counted
  // (also when it arrives after the form became clean).
  useEffect(() => {
    const onPopState = () => {
      if (ownPops.current > 0) {
        ownPops.current -= 1;
        return;
      }
      if (!latest.current.dirty || leaving.current || !sentinel.current) return;
      // Back from the extra entry to the page's own one: the address did not change, nothing is lost yet.
      sentinel.current = false;
      setPending({ kind: "back" });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Dirty: stand on an extra entry. Clean (saved, every edit undone, or shown again clean on that entry): remove it.
  useEffect(() => {
    if (leaving.current) return;
    if (dirty && !sentinel.current) {
      pushGuardEntry();
      sentinel.current = true;
    } else if (!dirty && sentinel.current) {
      sentinel.current = false;
      ownPops.current += 1;
      window.history.back();
    }
  }, [dirty]);

  // Hidden (or unmounted) with unsaved edits by a navigation nobody asked about: the router keeps the hidden page with
  // the edits, so the next page offers the way back to them. Not after signing out (nothing to come back to), and not
  // when the address did not change (the page was only hidden while it reloads).
  useLayoutEffect(
    () => () => {
      if (!latest.current.dirty || leaving.current) return;
      const href = editorHref.current;
      const { t: tl, router: r } = latest.current;
      window.setTimeout(() => {
        const here = `${window.location.pathname}${window.location.search}`;
        if (here === href || /\/sign-in$/.test(window.location.pathname)) return;
        const shownAt = window.location.href;
        toast.warning(tl("leftTitle"), {
          description: tl("leftDescription"),
          duration: LEFT_NOTICE_MS,
          action: {
            label: tl("leftAction"),
            // Back restores the kept page with its edits; after more navigation, open the editor again instead.
            onClick: () => (window.location.href === shownAt ? window.history.back() : r.push(href as Route)),
          },
        });
      }, 0);
    },
    [],
  );

  const stay = useCallback(() => {
    // Back was held: put the extra entry back, so the next Back asks again.
    if (pending?.kind === "back" && !sentinel.current && !leaving.current) {
      pushGuardEntry();
      sentinel.current = true;
    }
    setPending(null);
  }, [pending]);

  const leave = useCallback(() => {
    const target = pending;
    setPending(null);
    if (!target) return;
    leaving.current = true;
    const discard = latest.current.onDiscard;
    if (target.kind === "link") {
      // Over the extra entry, so Back from the next page returns to the editor once, not twice. The edits are
      // discarded in the same transition, so the editor the router keeps is clean if Back shows it again.
      const replace = sentinel.current;
      sentinel.current = false;
      startTransition(() => {
        discard?.();
        if (replace) router.replace(target.href as Route);
        else router.push(target.href as Route);
      });
      return;
    }
    startTransition(() => discard?.());
    // Back once more. With no earlier page in this tab nothing happens (no popstate): go to the list instead.
    let moved = false;
    const onPop = () => {
      moved = true;
    };
    window.addEventListener("popstate", onPop, { once: true });
    window.history.back();
    window.setTimeout(() => {
      window.removeEventListener("popstate", onPop);
      if (!moved && active.current) localeRouter.replace(fallbackHref as Parameters<typeof localeRouter.replace>[0]);
    }, BACK_FALLBACK_MS);
  }, [pending, router, localeRouter, fallbackHref]);

  const release = useCallback(async () => {
    leaving.current = true;
    if (!sentinel.current) return;
    sentinel.current = false;
    await new Promise<void>((resolve) => {
      const done = () => {
        window.removeEventListener("popstate", done);
        window.clearTimeout(timer);
        resolve();
      };
      const timer = window.setTimeout(done, 1000);
      window.addEventListener("popstate", done);
      window.history.back();
    });
  }, []);

  return { pending, stay, leave, release };
}

/** "Leave without saving?" for the guard above. Stay is the safe default (first, so it gets the focus). */
export function UnsavedChangesDialog({ guard }: { guard: UnsavedChangesGuard }) {
  const t = useTranslations("protocols.editor.leave");
  return (
    <AlertDialog
      open={guard.pending !== null}
      onOpenChange={(open) => {
        if (!open) guard.stay();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("stay")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={guard.leave}>
            {t("leave")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
