import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fileSinkAllowed, getEmailSender, recipientHash, sendEmail } from "./index";

vi.mock("@/lib/log", () => ({ log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} } }));

const E2E = { WAQAYA_E2E: "1", BETTER_AUTH_URL: "http://127.0.0.1:3100" };

describe("e2e file sink guard", () => {
  it("is allowed only for a flagged run on a loopback http origin", () => {
    expect(fileSinkAllowed(E2E)).toBe(true);
    expect(fileSinkAllowed({ ...E2E, BETTER_AUTH_URL: "http://localhost:3101" })).toBe(true);
    expect(fileSinkAllowed({ ...E2E, BETTER_AUTH_URL: "http://[::1]:3100" })).toBe(true);
  });

  it("is refused without the flag, on Railway, over https or for a non-loopback host", () => {
    expect(fileSinkAllowed({ BETTER_AUTH_URL: E2E.BETTER_AUTH_URL })).toBe(false);
    expect(fileSinkAllowed({ ...E2E, WAQAYA_E2E: "true" })).toBe(false);
    for (const id of ["RAILWAY_ENVIRONMENT_ID", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_NAME"]) {
      expect(fileSinkAllowed({ ...E2E, [id]: "x" })).toBe(false);
    }
    expect(fileSinkAllowed({ ...E2E, BETTER_AUTH_URL: "https://127.0.0.1:3100" })).toBe(false);
    expect(fileSinkAllowed({ ...E2E, BETTER_AUTH_URL: "http://192.168.1.5:3100" })).toBe(false);
    expect(fileSinkAllowed({ ...E2E, BETTER_AUTH_URL: "http://waqaya.example" })).toBe(false);
    expect(fileSinkAllowed({ ...E2E, BETTER_AUTH_URL: "not a url" })).toBe(false);
    expect(fileSinkAllowed({ ...E2E, BETTER_AUTH_URL: undefined })).toBe(false);
  });
});

describe("file provider", () => {
  const dir = mkdtempSync(join(tmpdir(), "waqaya-mail-"));
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes one JSON line per message with a hashed recipient and no address", async () => {
    const file = join(dir, "nested", "mail.jsonl");
    vi.stubEnv("EMAIL_PROVIDER", "file");
    vi.stubEnv("EMAIL_FILE_SINK", file);
    vi.stubEnv("WAQAYA_E2E", "1");
    vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3100");
    expect(getEmailSender()?.provider).toBe("file");
    const r = await sendEmail({ to: " User@Example.com ", subject: "s", html: "<p>h</p>", text: "t", devPreview: "email-verification code 123456" });
    expect(r).toEqual({ ok: true });
    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(row).toMatchObject({ toHash: recipientHash("user@example.com"), subject: "s", preview: "email-verification code 123456" });
    expect(lines[0]).not.toContain("example.com");
    rmSync(dir, { recursive: true, force: true });
  });

  it("is email-off (never a file) when the guard fails, e.g. on Railway", () => {
    vi.stubEnv("EMAIL_PROVIDER", "file");
    vi.stubEnv("EMAIL_FILE_SINK", join(dir, "x.jsonl"));
    vi.stubEnv("WAQAYA_E2E", "1");
    vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3100");
    vi.stubEnv("RAILWAY_ENVIRONMENT_ID", "env-1");
    expect(getEmailSender()).toBeNull();
  });

  it("is email-off without a sink path", () => {
    vi.stubEnv("EMAIL_PROVIDER", "file");
    vi.stubEnv("EMAIL_FILE_SINK", "");
    vi.stubEnv("WAQAYA_E2E", "1");
    vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3100");
    expect(getEmailSender()).toBeNull();
  });
});
