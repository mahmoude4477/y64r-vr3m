import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-*/**", // per-agent dist dirs (NEXT_DIST_DIR)
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated code (Prisma client, next-intl message declarations)
    "generated/**",
    "messages/**/*.d.json.ts",
    "coverage/**",
    // Playwright output
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
    ".e2e/**",
  ]),
  {
    // App code never imports the end-to-end test tree (e2e/**): it holds test-only data, e.g. the list of words the
    // landing must never show. (The scan seams under lib/scans/e2e/ are app code and stay importable.)
    files: ["app/**", "components/**", "lib/**", "hooks/**", "i18n/**", "messages/**", "proxy.ts", "instrumentation*.ts"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: String.raw`^(?:\.\./)+e2e/|^@/e2e/`, message: "App code must not import e2e/** test files." }] },
      ],
    },
  },
]);

export default eslintConfig;
