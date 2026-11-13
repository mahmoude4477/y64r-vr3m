import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      // "server-only" throws outside the react-server condition; tests import server modules directly.
      "server-only": path.resolve(import.meta.dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // e2e/** = Playwright specs (pnpm e2e), never vitest; .next-*/** = per-agent dist dirs.
    exclude: ["node_modules/**", ".next/**", ".next-*/**", "generated/**", "e2e/**"],
    // Unit tests never call the real Anthropic API, S3 or the database.
    env: { ANTHROPIC_API_KEY: "", EMAIL_PROVIDER: "" },
  },
});
