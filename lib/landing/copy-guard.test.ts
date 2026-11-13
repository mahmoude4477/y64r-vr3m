import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_COPY } from "../../e2e/landing/forbidden-copy";

// Guards on the site's copy, next to the e2e checks of what the server sends:
// - no team member names, no award line and no placeholder text in ANY message file (PRODUCT.md). Every namespace
//   counts, not only landing.json: the root layout hands next-intl's client provider all messages, so every string
//   of every namespace is serialized into each public page's HTML, rendered or not (landing review r1);
// - the landing copy invents no contact address (lib/landing/contact.ts decides that);
// - the list of forbidden words is imported by tests only, so the names can never be bundled into the app.

const ROOT = path.join(import.meta.dirname, "..", "..");

const strings = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : value && typeof value === "object"
      ? Object.values(value).flatMap(strings)
      : [];

const messageFiles = (locale: string) =>
  readdirSync(path.join(ROOT, "messages", locale))
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(ROOT, "messages", locale, name));

const readMessages = (file: string) => strings(JSON.parse(readFileSync(file, "utf8")));

for (const locale of ["ar", "en"] as const) {
  describe(`messages/${locale}`, () => {
    const files = messageFiles(locale);

    it("covers every namespace, the landing included", () => {
      expect(files.map((f) => path.basename(f))).toEqual(expect.arrayContaining(["landing.json", "common.json", "email.json"]));
    });

    for (const file of files) {
      it(`${path.basename(file)} has no team names, award line or placeholder text`, () => {
        for (const text of readMessages(file)) {
          for (const pattern of FORBIDDEN_COPY) expect(text, `${String(pattern)} in "${text}"`).not.toMatch(pattern);
        }
      });
    }

    it("landing.json has its copy and shows no e-mail address or link (the contact comes from lib/landing/contact.ts)", () => {
      const all = readMessages(path.join(ROOT, "messages", locale, "landing.json"));
      expect(all.length).toBeGreaterThan(40);
      for (const text of all) {
        expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
        expect(text).not.toMatch(/https?:\/\//);
      }
    });
  });
}

describe("FORBIDDEN_COPY", () => {
  it("catches what it is meant to catch", () => {
    const hits = (text: string) => FORBIDDEN_COPY.some((p) => p.test(text));
    for (const text of ["Med" + "athon 2026", "المركز الثاني", "2nd place", "جائزة", "جامعة الجوف", "Lorem ipsum"]) {
      expect(hits(text), text).toBe(true);
    }
    for (const text of ["Infection-control compliance, measured", "قِس الالتزام بمكافحة العدوى", "Awareness"]) {
      expect(hits(text), text).toBe(false);
    }
  });

  it("is imported by tests only: nothing in the app's source folders imports it", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          if (readFileSync(full, "utf8").includes("forbidden-copy")) offenders.push(path.relative(ROOT, full));
        }
      }
    };
    for (const dir of ["app", "components", "lib", "hooks", "i18n"]) walk(path.join(ROOT, dir));
    for (const file of ["proxy.ts", "instrumentation.ts", "instrumentation-node.ts", "next.config.ts", "global.ts"]) {
      if (readFileSync(path.join(ROOT, file), "utf8").includes("forbidden-copy")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
