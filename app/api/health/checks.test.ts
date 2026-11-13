import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedCheck, checkDatabase, cspStatus } from "./checks";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("checkDatabase", () => {
  it("ok when the query resolves", async () => {
    await expect(checkDatabase(async () => 1, 100)).resolves.toMatchObject({ status: "ok" });
  });

  it("error when the query rejects or throws synchronously", async () => {
    await expect(checkDatabase(() => Promise.reject(new Error("down")), 100)).resolves.toMatchObject({ status: "error" });
    await expect(
      checkDatabase(() => {
        throw new Error("sync");
      }, 100),
    ).resolves.toMatchObject({ status: "error" });
  });

  it("timeout when the query hangs", async () => {
    vi.useFakeTimers();
    const pending = checkDatabase(() => new Promise(() => {}), 2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(pending).resolves.toMatchObject({ status: "timeout" });
  });
});

describe("cachedCheck", () => {
  it("reuses a fresh result and shares one in-flight run", async () => {
    let t = 0;
    const run = vi.fn(async () => ({ status: "ok" as const, n: run.mock.calls.length }));
    const get = cachedCheck(run, 5_000, undefined, () => t);
    const [a, b] = await Promise.all([get(), get()]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    t = 4_000;
    await get();
    expect(run).toHaveBeenCalledTimes(1);
    t = 5_001;
    await get();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("reports each fresh result with the previous one", async () => {
    let t = 0;
    const results = ["error", "ok"];
    const seen: Array<[string, string | undefined]> = [];
    const get = cachedCheck(
      async () => results.shift()!,
      10,
      (r, p) => seen.push([r, p]),
      () => t,
    );
    await get();
    t = 100;
    await get();
    expect(seen).toEqual([
      ["error", undefined],
      ["ok", "error"],
    ]);
  });
});

describe("cspStatus", () => {
  it("ok when the built origin matches the runtime bucket, stale otherwise", () => {
    vi.stubEnv("S3_ENDPOINT", "https://t3.storageapi.dev");
    vi.stubEnv("S3_BUCKET", "scans-abc");
    vi.stubEnv("S3_URL_STYLE", "");
    expect(cspStatus("https://scans-abc.t3.storageapi.dev")).toBe("ok");
    expect(cspStatus("https://scans-old.t3.storageapi.dev")).toBe("stale");
    expect(cspStatus("")).toBe("stale");
  });

  it("ok when storage is off both at build and at runtime", () => {
    vi.stubEnv("S3_ENDPOINT", "");
    vi.stubEnv("S3_BUCKET", "");
    expect(cspStatus("")).toBe("ok");
    expect(cspStatus(undefined)).toBe("ok");
  });
});
