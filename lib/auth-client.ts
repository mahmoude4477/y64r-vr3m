"use client";

import { i18nClient } from "@better-auth/i18n/client";
import {
  adminClient,
  emailOTPClient,
  inferAdditionalFields,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "@/lib/auth"; // type-only: no server code reaches the bundle
import { ac, orgRoles, platformRoles } from "@/lib/permissions";

// Same origin, so no baseURL. Sign-in / sign-up / OTP calls go through /api/auth from the browser,
// which is where Better Auth's rate limits apply (server-side auth.api.* calls skip them).
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    emailOTPClient(),
    adminClient({ roles: platformRoles }),
    organizationClient({ ac, roles: orgRoles, teams: { enabled: true } }),
    i18nClient(),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
