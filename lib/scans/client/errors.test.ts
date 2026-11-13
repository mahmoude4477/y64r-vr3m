import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cameraProblem } from "./camera";
import { aiGaveUp, isSharedStateKey, SCAN_ERROR_KEYS, scanErrorKey, SHARED_STATE_KEYS } from "./errors";

const read = (locale: string, file: string) => JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, file), "utf8"));
const messages = (locale: string) =>
  read(locale, "scans.json") as {
    errors: Record<string, string>;
    new: { camera: Record<string, string> };
  };
const states = (locale: string) => (read(locale, "common.json") as { states: Record<string, string> }).states;

describe("scan error codes", () => {
  it("map API and AI codes to message keys, unknown ones to generic", () => {
    expect(scanErrorKey("daily_limit")).toBe("aiLimit");
    expect(scanErrorKey("too_many_requests")).toBe("aiBusy");
    expect(scanErrorKey("not_configured")).toBe("aiOff");
    expect(scanErrorKey("storage_off")).toBe("storageOff");
    expect(scanErrorKey("slow_down")).toBe("slowDown");
    expect(scanErrorKey("unsupported")).toBe("unsupportedImage");
    expect(scanErrorKey("something_new")).toBe("generic");
    expect(scanErrorKey(null)).toBe("generic");
  });

  it("has a text for every key in both languages", () => {
    for (const locale of ["ar", "en"]) {
      const errors = messages(locale).errors;
      for (const key of SCAN_ERROR_KEYS) {
        if (isSharedStateKey(key)) {
          expect(states(locale)[key], `${locale}: common.states.${key}`).toBeTruthy();
          expect(errors[key], `${locale}: scans.errors.${key} repeats common.states.${key}`).toBeUndefined();
        } else {
          expect(errors[key], `${locale}: errors.${key}`).toBeTruthy();
        }
      }
      expect(Object.keys(errors).sort()).toEqual(SCAN_ERROR_KEYS.filter((k) => !isSharedStateKey(k)).sort());
      for (const problem of ["denied", "unavailable", "unsupported", "busy", "error"]) {
        expect(messages(locale).new.camera[problem], `${locale}: camera.${problem}`).toBeTruthy();
      }
    }
  });

  it("uses the shared service texts for storage and AI states", () => {
    expect([...SHARED_STATE_KEYS].sort()).toEqual(["aiBusy", "aiLimit", "aiOff", "storageOff"]);
    expect(isSharedStateKey(scanErrorKey("daily_limit"))).toBe(true);
    expect(isSharedStateKey(scanErrorKey("timeout"))).toBe(false);
  });

  it("tells when retrying the AI cannot help", () => {
    expect(aiGaveUp("daily_limit")).toBe(true);
    expect(aiGaveUp("refused")).toBe(true);
    expect(aiGaveUp("timeout")).toBe(false);
    expect(aiGaveUp("overloaded")).toBe(false);
  });
});

describe("cameraProblem", () => {
  it("classifies getUserMedia failures", () => {
    expect(cameraProblem(new DOMException("x", "NotAllowedError"))).toBe("denied");
    expect(cameraProblem({ name: "SecurityError" })).toBe("denied");
    expect(cameraProblem(new DOMException("x", "NotFoundError"))).toBe("unavailable");
    expect(cameraProblem({ name: "OverconstrainedError" })).toBe("unavailable");
    expect(cameraProblem({ name: "NotReadableError" })).toBe("busy");
    expect(cameraProblem(new TypeError("no mediaDevices"))).toBe("unsupported");
    expect(cameraProblem("weird")).toBe("error");
    expect(cameraProblem(null)).toBe("error");
  });
});
