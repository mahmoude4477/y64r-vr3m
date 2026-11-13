import { useSyncExternalStore } from "react";

// useSyncExternalStore instead of the generated useState+useEffect version, which fails
// eslint-config-next 16.4 (react-hooks/set-state-in-effect). Server snapshot = desktop.
const QUERY = "(max-width: 767px)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

/** The same test at call time (event handlers), without subscribing a component to it. */
export function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
}

export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
