import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  cleanText,
  EDITOR_ICONS,
  editorSchema,
  editorValuesShape,
  emptyEditorValues,
  emptyStep,
  hasUserInfo,
  issuesToFieldErrors,
  newStepKey,
  nextVersionSlug,
  normalizeEditorValues,
  placeholderStepKey,
  protocolToEditorValues,
  randomSuffix,
  rewordedStepsWithResults,
  slugify,
  stripControlCharacters,
  suffixedSlug,
  uniqueSlug,
  versionSlugBase,
  type EditorValues,
} from "./editor-form";
import { SLUG_PATTERN } from "@/lib/validation/protocol";

const step = (over: Partial<EditorValues["steps"][number]> = {}) => ({
  ...emptyStep("first"),
  textAr: "ارتدِ القفازات",
  textEn: "Wear gloves",
  rationaleAr: "تحمي اليدين.",
  rationaleEn: "They protect the hands.",
  ...over,
});

const valid = (over: Partial<EditorValues> = {}): EditorValues => ({
  slug: "glove-use",
  category: "safety",
  icon: "hand",
  titleAr: "استخدام القفازات",
  titleEn: "Glove use",
  summaryAr: "متى تُلبس القفازات.",
  summaryEn: "When to wear gloves.",
  descriptionAr: "وصف.",
  descriptionEn: "Description.",
  steps: [step()],
  ...over,
});

const paths = (r: { success: boolean; error?: z.ZodError }) => (r.success ? [] : r.error!.issues.map((i) => i.path.join(".")));
const keysOf = (r: { success: boolean; error?: z.ZodError }) =>
  r.success ? [] : r.error!.issues.map((i) => `${i.path.join(".")}:${(i as { params?: { i18n?: string } }).params?.i18n ?? i.code}`);

describe("editor form values", () => {
  it("starts with one empty mandatory step and a bundled icon", () => {
    const v = emptyEditorValues();
    expect(v.steps).toHaveLength(1);
    expect(v.steps[0]).toMatchObject({ id: null, isMandatory: true, isCritical: false, weight: 1, visualCheck: false });
    expect(EDITOR_ICONS).toContain(v.icon);
  });

  it("gives new steps unique valid placeholder keys", () => {
    const keys = new Set(Array.from({ length: 50 }, () => placeholderStepKey()));
    expect(keys.size).toBe(50);
    for (const k of keys) expect(SLUG_PATTERN.test(k)).toBe(true);
    expect(placeholderStepKey(() => 0)).toBe("new-00000000");
  });

  it("turns database rows into strings and back to the database shape", () => {
    const values = protocolToEditorValues({
      slug: "x",
      category: "waste",
      icon: "trash-2",
      titleAr: "أ",
      titleEn: "A",
      summaryAr: "ب",
      summaryEn: "B",
      descriptionAr: "ج",
      descriptionEn: "C",
      steps: [
        {
          id: "s1",
          key: "k1",
          textAr: "ن",
          textEn: "T",
          rationaleAr: "س",
          rationaleEn: "R",
          criteriaAr: null,
          criteriaEn: null,
          referenceLabel: null,
          referenceUrl: null,
          isMandatory: false,
          isCritical: false,
          weight: 2,
          visualCheck: false,
        },
      ],
    });
    expect(values.steps[0]).toMatchObject({ id: "s1", key: "k1", criteriaAr: "", referenceUrl: "", weight: 2 });
    const normalized = normalizeEditorValues(values);
    expect(normalized.steps[0]).toMatchObject({ id: "s1", criteriaAr: null, referenceLabel: null, referenceUrl: null });
  });

  it("keeps photo criteria only on photo-checkable steps and makes critical steps mandatory", () => {
    const n = normalizeEditorValues(
      valid({
        steps: [
          step({ criteriaAr: "نص", criteriaEn: "text", visualCheck: false }),
          step({ key: "second", isMandatory: false, isCritical: true, visualCheck: true, criteriaAr: " ص ", criteriaEn: "photo" }),
        ],
      }),
    );
    expect(n.steps[0]).toMatchObject({ criteriaAr: null, criteriaEn: null });
    expect(n.steps[1]).toMatchObject({ isMandatory: true, isCritical: true, criteriaAr: " ص ", criteriaEn: "photo" });
  });

  it("trims reference fields and turns empty ones into null", () => {
    const n = normalizeEditorValues(valid({ steps: [step({ referenceLabel: "  ", referenceUrl: " https://www.who.int/x " })] }));
    expect(n.steps[0]).toMatchObject({ referenceLabel: null, referenceUrl: "https://www.who.int/x" });
  });
});

describe("editorSchema", () => {
  it("accepts a complete protocol, with or without the address", () => {
    expect(editorSchema(true).safeParse(valid()).success).toBe(true);
    expect(editorSchema(false).safeParse(valid({ slug: "" })).success).toBe(true);
  });

  it("requires the address only when asked to, and checks its pattern", () => {
    expect(keysOf(editorSchema(true).safeParse(valid({ slug: "Bad Slug" })))).toEqual(["slug:slug"]);
    expect(paths(editorSchema(true).safeParse(valid({ slug: "" })))).toContain("slug");
  });

  it("reports empty required texts at their form paths", () => {
    const r = editorSchema(false).safeParse(valid({ titleAr: "  ", steps: [step({ rationaleEn: "" })] }));
    expect(paths(r)).toEqual(expect.arrayContaining(["titleAr", "steps.0.rationaleEn"]));
  });

  it("asks for a category the list knows", () => {
    expect(paths(editorSchema(false).safeParse(valid({ category: "" })))).toEqual(["category"]);
  });

  it("needs photo criteria in both languages on a photo-checkable step", () => {
    const r = editorSchema(false).safeParse(valid({ steps: [step({ visualCheck: true, criteriaAr: "ص", criteriaEn: " " })] }));
    expect(keysOf(r)).toEqual(["steps.0.criteriaEn:visualCriteriaRequired"]);
  });

  it("accepts https reference links only, and asks for a name when there is a link", () => {
    const http = editorSchema(false).safeParse(valid({ steps: [step({ referenceLabel: "WHO", referenceUrl: "http://who.int" })] }));
    expect(paths(http)).toEqual(["steps.0.referenceUrl"]);
    const unnamed = editorSchema(false).safeParse(valid({ steps: [step({ referenceUrl: "https://www.who.int/x" })] }));
    expect(keysOf(unnamed)).toEqual(["steps.0.referenceLabel:required"]);
    const named = editorSchema(false).safeParse(valid({ steps: [step({ referenceLabel: "WHO", referenceUrl: "https://www.who.int/x" })] }));
    expect(named.success).toBe(true);
  });

  it("refuses reference links that carry a user name or password (the library would not show them as links)", () => {
    for (const referenceUrl of ["https://www.who.int@evil.example/", "https://user:pw@example.com/guide"]) {
      const r = editorSchema(false).safeParse(valid({ steps: [step({ referenceLabel: "WHO hand hygiene", referenceUrl })] }));
      expect(keysOf(r)).toEqual(["steps.0.referenceUrl:url"]);
    }
    // Shown together with every other error, not only once the rest of the form is valid.
    const withOthers = editorSchema(false).safeParse(
      valid({ category: "", titleAr: "", steps: [step({ referenceLabel: "", referenceUrl: "https://who.int@evil.example/" })] }),
    );
    expect(paths(withOthers)).toEqual(expect.arrayContaining(["category", "titleAr", "steps.0.referenceLabel", "steps.0.referenceUrl"]));
    expect(hasUserInfo("https://www.who.int/publications/i/item/9789241597906")).toBe(false);
    expect(hasUserInfo("not a url")).toBe(false);
  });

  it("drops control characters from pasted text instead of failing the save (Postgres cannot store U+0000)", () => {
    const pasted = valid({
      titleEn: "Null \u0000 byte",
      steps: [step({ textEn: "Wear\u0007 gloves\u0000", rationaleEn: "Line one\nline two\ttab", referenceLabel: "WHO\u0000", referenceUrl: "" })],
    });
    const n = normalizeEditorValues(pasted);
    expect(n.titleEn).toBe("Null  byte");
    expect(n.steps[0]).toMatchObject({ textEn: "Wear gloves", rationaleEn: "Line one\nline two\ttab", referenceLabel: "WHO" });
    expect(editorSchema(false).safeParse(pasted).success).toBe(true);
    expect(stripControlCharacters("a\u0000b\u001Fc\u007Fd\r\n")).toBe("abcd\r\n");
  });

  it("drops invisible format characters, and a text with nothing visible left is empty", () => {
    // Zero-width space, soft hyphen, word joiner, byte-order mark, bidi overrides and isolates, Hangul fillers.
    expect(cleanText("Hand​ hy­giene⁠﻿")).toBe("Hand hygiene");
    expect(cleanText("‮Glove use‬ ⁦x⁩")).toBe("Glove use x");
    expect(cleanText("ㅤᅟﾠ")).toBe("");
    // Joiners and direction marks stay inside real text (Arabic shaping, punctuation direction)...
    expect(cleanText("نظافة‌اليدين‏.")).toBe("نظافة‌اليدين‏.");
    // ...but are not content on their own.
    for (const blank of ["​​", "‍‌", "‎ ‏", " \n\t "]) expect(cleanText(blank)).toBe("");
    expect(cleanText("— 1")).toBe("— 1");
  });

  it("refuses required texts made only of invisible characters, and leaves out optional ones", () => {
    const invisible = valid({
      titleEn: "​​",
      summaryAr: "‮",
      steps: [step({ textAr: "‍‌", referenceLabel: "⁠", referenceUrl: "" })],
    });
    expect(paths(editorSchema(false).safeParse(invisible))).toEqual(["titleEn", "summaryAr", "steps.0.textAr"]);
    expect(normalizeEditorValues(invisible).steps[0]!.referenceLabel).toBeNull();
  });

  it("refuses an icon that is not bundled, and a weight out of range", () => {
    expect(keysOf(editorSchema(false).safeParse(valid({ icon: "rocket" })))).toEqual(["icon:invalidOption"]);
    expect(paths(editorSchema(false).safeParse(valid({ steps: [step({ weight: 4 })] })))).toEqual(["steps.0.weight"]);
  });

  it("needs at least one step and unique step keys", () => {
    expect(paths(editorSchema(false).safeParse(valid({ steps: [] })))).toEqual(["steps"]);
    expect(keysOf(editorSchema(false).safeParse(valid({ steps: [step(), step()] })))).toEqual(["steps.1.key:duplicateStepKey"]);
  });
});

describe("rewordedStepsWithResults", () => {
  const saved = (): EditorValues =>
    valid({
      steps: [
        step({ id: "s-1", key: "wear-gloves" }),
        step({ id: "s-2", key: "close-container", textEn: "Close the container", visualCheck: true, criteriaAr: "مغلقة", criteriaEn: "Closed" }),
        step({ id: "s-3", key: "no-results", textEn: "A step without results" }),
      ],
    });
  const results = (id: string) => (id === "s-3" ? 0 : 2);

  it("names steps with results whose text, reason or photo criteria changed (1-based, in the new order)", () => {
    const before = saved();
    const after = saved();
    after.steps[1] = { ...after.steps[1]!, criteriaEn: "Closed and below the fill line" };
    after.steps[2] = { ...after.steps[2]!, textEn: "Completely new text" }; // no results: no question
    after.steps.reverse();
    expect(rewordedStepsWithResults(before, after, results)).toEqual([2]);
    after.steps[2] = { ...after.steps[2]!, rationaleAr: "سبب آخر" };
    expect(rewordedStepsWithResults(before, after, results)).toEqual([2, 3]);
  });

  it("ignores what is not reported wording, and what the save normalises away", () => {
    const before = saved();
    const after = saved();
    after.steps[0] = { ...after.steps[0]!, textEn: " Wear gloves ​", referenceLabel: "CDC", referenceUrl: "https://www.cdc.gov/" };
    after.steps.push(step({ id: null, key: "new-aaaa1111", textEn: "Brand new" }));
    expect(rewordedStepsWithResults(before, after, results)).toEqual([]);
  });
});

describe("editorValuesShape", () => {
  it("rejects forged shapes before any rule runs", () => {
    expect(editorValuesShape.safeParse(valid()).success).toBe(true);
    expect(editorValuesShape.safeParse({ ...valid(), steps: "nope" }).success).toBe(false);
    expect(editorValuesShape.safeParse({ ...valid(), steps: [{ ...step(), isCritical: "yes" }] }).success).toBe(false);
    expect(editorValuesShape.safeParse({ ...valid(), titleAr: "x".repeat(10_001) }).success).toBe(false);
    expect(editorValuesShape.safeParse({ ...valid(), steps: Array.from({ length: 51 }, () => step()) }).success).toBe(false);
  });
});

describe("issuesToFieldErrors", () => {
  it("keeps the first message per dotted path", () => {
    expect(
      issuesToFieldErrors([
        { path: ["steps", 2, "criteriaAr"], message: "a" },
        { path: ["steps", 2, "criteriaAr"], message: "b" },
        { path: ["titleEn"], message: "c" },
        { path: [], message: "root" },
      ]),
    ).toEqual({ "steps.2.criteriaAr": "a", titleEn: "c" });
  });
});

describe("addresses and keys", () => {
  it("slugifies English text into a valid address cut on a word boundary", () => {
    expect(slugify("Hand-Hygiene  Station (Sink & Faucet)")).toBe("hand-hygiene-station-sink-faucet");
    expect(slugify("Café déjà vu")).toBe("cafe-deja-vu");
    expect(slugify("نظافة اليدين")).toBe("");
    const long = slugify("discard the used needle straight into the sharps container without recapping it", 40);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(SLUG_PATTERN.test(long)).toBe(true);
    expect(long.endsWith("-")).toBe(false);
  });

  it("finds a free key, with a fallback for text that has no Latin letters", () => {
    expect(uniqueSlug("Wear gloves", new Set())).toBe("wear-gloves");
    expect(uniqueSlug("Wear gloves", new Set(["wear-gloves", "wear-gloves-2"]))).toBe("wear-gloves-3");
    expect(newStepKey("ارتدِ القفازات", new Set(["step"]))).toBe("step-2");
  });

  it("builds generated addresses within 80 characters", () => {
    const s = suffixedSlug("x".repeat(200), "abc123");
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("-abc123")).toBe(true);
    expect(SLUG_PATTERN.test(s)).toBe(true);
    expect(suffixedSlug("", "abc123")).toBe("protocol-abc123");
    expect(randomSuffix(() => 0)).toBe("000000");
    expect(randomSuffix()).toMatch(/^[a-z0-9]{6}$/);
  });

  it("numbers new versions after the highest taken one", () => {
    expect(nextVersionSlug("sharps-safety", new Set())).toBe("sharps-safety-v2");
    expect(nextVersionSlug("sharps-safety", new Set(["sharps-safety-v2"]))).toBe("sharps-safety-v3");
    expect(nextVersionSlug("sharps-safety-v2", new Set())).toBe("sharps-safety-v3");
    expect(versionSlugBase("sharps-safety-v7")).toBe("sharps-safety");
    const long = nextVersionSlug(`${"a".repeat(79)}`, new Set());
    expect(long.length).toBeLessThanOrEqual(80);
    expect(SLUG_PATTERN.test(long)).toBe(true);
  });
});
