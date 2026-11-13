# End-to-end tests (Playwright)

`pnpm e2e` drives a **production build** (`next start`) in a real browser: desktop Chrome and a 390 px phone.
CI runs it on every push (`.github/workflows/ci.yml`); Railway deploys only green commits.

## Run locally (Windows, Git Bash)

```bash
# once: a separate database, so dev data stays clean
docker exec waqaya-postgres createdb -U waqaya waqaya_e2e
DATABASE_URL=postgresql://waqaya:waqaya_dev@127.0.0.1:5434/waqaya_e2e pnpm db:deploy
DATABASE_URL=postgresql://waqaya:waqaya_dev@127.0.0.1:5434/waqaya_e2e pnpm db:seed

# build with the SAME values the test server gets (static pages freeze them at build time)
NEXT_DIST_DIR=.next-e2e BETTER_AUTH_URL=http://127.0.0.1:3100 EMAIL_PROVIDER=file WAQAYA_E2E=1 ANTHROPIC_API_KEY= pnpm build
git checkout -- tsconfig.json   # the build adds .next-e2e/types to it; never commit that

NEXT_DIST_DIR=.next-e2e pnpm e2e            # all projects
NEXT_DIST_DIR=.next-e2e pnpm e2e -g "sign in"  # one test by name
pnpm exec playwright show-report            # the HTML report (traces, screenshots)
```

- Another port: set `E2E_PORT` for **both** the build (`BETTER_AUTH_URL=http://127.0.0.1:<port>`) and the run.
  `globalSetup` stops with the exact build command when the build was made for another origin.
- Browsers are never downloaded locally: Edge is used (`E2E_CHANNEL=msedge`), or a cached Chromium with
  `E2E_CHROMIUM_PATH=C:/Users/<you>/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe`.
- The server runs with a local auth secret (`.e2e/auth-secret`), an e-mail **file sink** (`.e2e/mail.jsonl`) and
  every provider key blanked: tests never reach Anthropic, Cloudflare e-mail or S3.

## How the harness works

| Piece | What it does |
|---|---|
| `playwright.config.ts` | projects `setup` → `desktop` + `mobile` (Pixel 7 at 390 × 844), `webServer` = `next start -H 127.0.0.1 --keepAliveTimeout 70000` (as on Railway) with the e2e env, ready when `/api/health` answers 200 |
| `support/env.ts` | port, base URL, database, dist dir, file paths shared by every process |
| `support/fixtures.ts` | `test`/`expect` with a random `X-Real-IP` per test (Better Auth rate limits are per IP), `uniqueEmail()`, `strongPassword()`, `msg(locale, "ns.key")` (copy from `messages/`), `urlPath()`, `waitForHydration(locator)` |
| `support/mail.ts` | `codeFor(email, "email-verification" \| "forget-password", since)`, `inviteLinkFor(email, since)`: polls the file sink |
| `support/auth.ts` | `createVerifiedUser(request, …)` (API sign-up + e-mailed code), `signInWithForm`, `signOutWithMenu`, `authPost`, `createOrganization` (platform admin only) |
| `support/a11y.ts` | `expectAccessible(page, testInfo)`: axe WCAG 2.2 A/AA, fails on serious/critical + one h1/one main |
| `setup/accounts.setup.ts` | seeds a platform admin with the real `pnpm db:seed-admin`, signs in, does the forced password change (`ADMIN_STATE`); signs up a trainee with the e-mailed code (`TRAINEE_STATE`) |

**The e-mail file sink** (`EMAIL_PROVIDER=file`, `lib/email`) writes `{ at, toHash, subject, preview }` per message,
with the recipient as a sha256 hash, never the address. It is refused unless `WAQAYA_E2E=1`, `BETTER_AUTH_URL` is a
loopback `http://` origin and no `RAILWAY_*` variable is set, so it can never run in production.

## Rules for feature teams

- Your specs live in `e2e/<feature>/**` (you own them). `support/**`, `setup/**` and `smoke/**` are foundation.
- Import `test`, `expect` from `../support/fixtures`. Fixture callbacks are named `provide`, not `use`
  (react-hooks lint).
- After `page.goto`, call `waitForHydration(locator)` before the first `fill` / `click` on a form: on a busy server,
  text filled before React hydrates can be reset (the sign-in form then sent an empty e-mail), and a click does nothing.
- Assert on the **UI** (headings, URLs, text from `msg()`), never on HTTP status codes of pages: a denied page is a
  client-side not-found inside a 200 response (CONVENTIONS 4).
- Reuse `ADMIN_STATE` / `TRAINEE_STATE` read-only. A test that signs out, changes the password or the profile makes
  its own user with `createVerifiedUser` (signing out ends the shared session for everyone).
- New institutions and members: the admin's request context (`browser.newContext({ storageState: ADMIN_STATE })`)
  with `createOrganization` and Better Auth's `/api/auth/organization/*` endpoints.
- Add `expectAccessible(page, testInfo)` to every new page you test, in light and dark.
- The full suite runs 4 workers locally (2 in CI) next to axe scans: a test with sign-ups, e-mailed codes or password
  checks takes several times longer there than alone. Mark it `test.slow()` (or `test.setTimeout(…)` with the times
  you measured), and give steps that wait on the server a longer `timeout` instead of sleeping. A file whose tests
  wait on the account lock or load the server on purpose runs them in order:
  `test.describe.configure({ mode: "default" })` (see `account/delete.spec.ts`). Before reporting done, run the FULL
  suite (twice if you touched timing), not only your spec.
- Camera: `launchOptions.args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]` and
  `permissions: ["camera"]`; uploads: `setInputFiles` with a small JPEG fixture. AI and storage are off in e2e.

## Scan flow without S3 or Anthropic (scans team seam)

The whole smart-scan flow (upload -> confirm -> analysis -> review) runs end to end with two **e2e-only** stand-ins,
switched on with `E2E_SCAN_SEAMS=1` for the run (`playwright.config.ts` then gives the server `STORAGE_PROVIDER=file`,
`STORAGE_FILE_DIR=.e2e/storage` and `AI_PROVIDER=stub`; without it both are blank and storage and AI stay off):

| Seam | What it does | Where |
|---|---|---|
| disk photo store | presigned PUT/GET become same-origin `/api/scans/e2e-storage/<signed token>` URLs; files under `.e2e/storage` | `lib/storage.ts` (`fileStorageAllowed`), `lib/scans/e2e/file-storage.ts`, `app/api/scans/e2e-storage/[token]` |
| AI stub | `analyzeScan` answers from a deterministic local model (step order: compliant 0.92, non_compliant 0.81, not_visible 0.35, compliant 0.55, ...); limits and the `AiCall` row still run | `lib/ai/model.ts` (`scanAiStubAllowed`), `lib/scans/e2e/ai-stub.ts` |

Both refuse to run unless `WAQAYA_E2E=1`, `BETTER_AUTH_URL` is a loopback `http://` origin and no `RAILWAY_*` variable is
set (the e-mail file sink's guard). `STORAGE_PROVIDER=file` anywhere else means **storage off**, never the disk; the stub
modules are loaded with a dynamic import only after the guard passed (`lib/scans/e2e/seams.test.ts`).

```bash
NEXT_DIST_DIR=.next-e2e BETTER_AUTH_URL=http://127.0.0.1:3100 EMAIL_PROVIDER=file WAQAYA_E2E=1 ANTHROPIC_API_KEY= pnpm build
E2E_SCAN_SEAMS=1 NEXT_DIST_DIR=.next-e2e pnpm e2e e2e/scans
```

`e2e/scans` specs that need the seams skip themselves without `E2E_SCAN_SEAMS=1`; the others then check that the pages
say storage and AI are off instead of crashing. The in-app camera test (`e2e/scans/camera.spec.ts`) uses Chromium's
fake camera; its launch flags apply to the whole file (Playwright starts a new worker for them), so it has its own file.
Run `e2e/scans` both ways against the same build (the seams change only the server's environment): with the seams for
the full flow, and without them for `storage-off.spec.ts`, which inserts a scan into the TEST database
(`e2e/scans/fixtures/seed-scan.mts`, refused unless `WAQAYA_E2E=1` and a local database) because nothing can be
uploaded on a server without storage. `e2e/scans/fixtures/fill-ai-quota.mts` (same guard) uses up one test user's AI
limit for the day, for the "limit reached at submit" case.

CI runs both before a deploy (`.github/workflows/ci.yml`): `pnpm e2e` (plain server), then
`E2E_SCAN_SEAMS=1 pnpm e2e e2e/scans` on the same build. Locally, the integration gate is the FULL suite with the seams
(`E2E_SCAN_SEAMS=1 pnpm e2e`), twice in a row; `storage-off.spec.ts` then skips itself and needs a plain run of
`e2e/scans`.

## Visible elements only

Next keeps the page it left mounted but hidden (React Activity) after a client navigation, and React keeps streamed
Suspense content in a hidden `<div hidden id="S:…">` until it shows it. A text or label can therefore exist twice in the
DOM for a moment. Locate by role and assert `toBeVisible()`, or filter with `:visible` / `{ visible: true }`; never
take the first node that has a text.
