import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Use these instead of next/link and next/navigation: they keep the /ar or /en prefix.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
