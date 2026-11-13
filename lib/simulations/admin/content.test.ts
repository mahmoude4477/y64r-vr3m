import { describe, expect, it } from "vitest";
import { protocols } from "@/prisma/seed/protocols";
import { scenarios } from "@/prisma/seed/scenarios";
import {
  clearForeignSteps,
  createScenarioSchema,
  emptyStage,
  formValuesFromRow,
  inFamily,
  laterDraft,
  LIMITS,
  nextVersion,
  publishIssues,
  type ScenarioFormValues,
  scenarioContentSchema,
  slugify,
  stageIssues,
  stagesCreateData,
  versionInfo,
  versionsToUnpublish,
} from "./content";

const STEPS = new Set(["s-recap", "s-dispose"]);
const stepsOf = (pid: string) => (pid === "p1" ? STEPS : undefined);
const schema = scenarioContentSchema(stepsOf);

function option(over: Partial<ScenarioFormValues["stages"][number]["options"][number]> = {}) {
  return { textAr: "خيار", textEn: "Option", isCorrect: false, isCritical: false, stepId: null, feedbackAr: "شرح", feedbackEn: "Why", ...over };
}

function content(stages: ScenarioFormValues["stages"] = []): ScenarioFormValues {
  return {
    titleAr: "عنوان",
    titleEn: "Title",
    introAr: "مقدمة",
    introEn: "Intro",
    settingAr: "الموقف",
    settingEn: "The situation",
    protocolId: "p1",
    difficulty: "beginner",
    estimatedMinutes: 5,
    stages,
  };
}

function stage(over: Partial<ScenarioFormValues["stages"][number]> = {}): ScenarioFormValues["stages"][number] {
  return {
    kind: "single",
    contextAr: "",
    contextEn: "",
    promptAr: "سؤال",
    promptEn: "Question",
    options: [option({ isCorrect: true, stepId: "s-recap" }), option({ stepId: "s-recap", isCritical: true })],
    ...over,
  };
}

/** The `params.sim` keys of the issues zod reports, with their paths. */
function issues(values: unknown): Array<[string, string]> {
  const r = schema.safeParse(values);
  if (r.success) return [];
  return r.error.issues.map((i) => [i.path.join("."), String((i as { params?: { sim?: string } }).params?.sim ?? i.code)]);
}

describe("scenario content rules", () => {
  it("accepts a draft without stages and a valid stage", () => {
    expect(schema.safeParse(content()).success).toBe(true);
    expect(schema.safeParse(content([stage()])).success).toBe(true);
  });

  it("needs every text in both languages, except the stage context", () => {
    const missing = { ...content([stage({ promptEn: "  " })]), titleAr: "" };
    const paths = issues(missing).map(([p]) => p);
    expect(paths).toContain("titleAr");
    expect(paths).toContain("stages.0.promptEn");
    expect(paths.some((p) => p.includes("context"))).toBe(false);
  });

  it("a single stage needs exactly one correct option", () => {
    const none = stage({ options: [option(), option()] });
    const two = stage({ options: [option({ isCorrect: true }), option({ isCorrect: true })] });
    expect(issues(content([none]))).toContainEqual(["stages.0.options", "singleNeedsOneCorrect"]);
    expect(issues(content([two]))).toContainEqual(["stages.0.options", "singleNeedsOneCorrect"]);
  });

  it("a multi stage needs at least one correct option and accepts several", () => {
    expect(issues(content([stage({ kind: "multi", options: [option(), option()] })]))).toContainEqual(["stages.0.options", "multiNeedsCorrect"]);
    expect(schema.safeParse(content([stage({ kind: "multi", options: [option({ isCorrect: true }), option({ isCorrect: true }), option()] })])).success).toBe(
      true,
    );
  });

  it("a stage needs two to eight options", () => {
    expect(issues(content([stage({ options: [option({ isCorrect: true })] })]))).toContainEqual(["stages.0.options", "needsTwoOptions"]);
    const nine = Array.from({ length: 9 }, (_, i) => option({ isCorrect: i === 0 }));
    expect(schema.safeParse(content([stage({ options: nine })])).success).toBe(false);
  });

  it("a critical option is a wrong option linked to a step", () => {
    const correctCritical = stage({ options: [option({ isCorrect: true, isCritical: true, stepId: "s-recap" }), option()] });
    expect(issues(content([correctCritical]))).toContainEqual(["stages.0.options.0.isCritical", "criticalMustBeWrong"]);
    const unlinked = stage({ options: [option({ isCorrect: true }), option({ isCritical: true })] });
    expect(issues(content([unlinked]))).toContainEqual(["stages.0.options.1.stepId", "criticalNeedsStep"]);
  });

  it("linked steps must belong to the scenario's protocol", () => {
    const foreign = stage({ options: [option({ isCorrect: true, stepId: "other-step" }), option()] });
    expect(issues(content([foreign]))).toContainEqual(["stages.0.options.0.stepId", "stepNotInProtocol"]);
    // An unknown protocol refuses every link.
    expect(issues({ ...content([stage()]), protocolId: "p2" }).map(([, k]) => k)).toContain("stepNotInProtocol");
  });

  it("limits stages, minutes and lengths", () => {
    const many = Array.from({ length: LIMITS.maxStages + 1 }, () => stage());
    expect(schema.safeParse(content(many)).success).toBe(false);
    expect(schema.safeParse({ ...content(), estimatedMinutes: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...content(), estimatedMinutes: 2.5 }).success).toBe(false);
    expect(schema.safeParse({ ...content(), titleEn: "x".repeat(LIMITS.title + 1) }).success).toBe(false);
  });

  it("publishing needs a stage", () => {
    expect(publishIssues(content())).toEqual(["needsStage"]);
    expect(publishIssues(content([stage()]))).toEqual([]);
  });

  it("stageIssues reports the first rule a stage breaks", () => {
    expect(stageIssues({ kind: "single", options: [{ isCorrect: true }] })).toEqual(["needsTwoOptions"]);
    expect(stageIssues({ kind: "single", options: [{ isCorrect: true }, { isCorrect: false }] })).toEqual([]);
  });

  it("every seed scenario meets the editor's rules (the editor can open and re-save them)", () => {
    for (const s of scenarios) {
      const protocol = protocols.find((p) => p.slug === s.protocolSlug);
      expect(protocol, s.slug).toBeTruthy();
      const keys = new Set(protocol!.steps.map((step) => step.key));
      const values = formValuesFromRow({
        ...s,
        protocolId: s.protocolSlug,
        stages: s.stages.map((st) => ({
          ...st,
          contextAr: st.contextAr ?? null,
          contextEn: st.contextEn ?? null,
          options: st.options.map((o) => ({ ...o, isCritical: o.isCritical ?? false, stepId: o.stepKey ?? null })),
        })),
      });
      const result = scenarioContentSchema((pid) => (pid === s.protocolSlug ? keys : undefined)).safeParse(values);
      expect(result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.code}`), s.slug).toEqual([]);
      expect(publishIssues(values), s.slug).toEqual([]);
    }
  });
});

describe("create", () => {
  const base = { ...content(), slug: "used-needle", organizationId: null };

  it("accepts a slug of lowercase words and refuses others", () => {
    expect(createScenarioSchema.safeParse(base).success).toBe(true);
    for (const slug of ["Used-Needle", "used needle", "-used", "used--needle", ""]) {
      expect(createScenarioSchema.safeParse({ ...base, slug }).success, slug).toBe(false);
    }
  });

  it("refuses a slug that looks like a version", () => {
    const r = createScenarioSchema.safeParse({ ...base, slug: "used-needle-v2" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => (i as { params?: { sim?: string } }).params?.sim === "slugVersionSuffix")).toBe(true);
  });

  it("slugify makes an address from the English title", () => {
    expect(slugify("A used needle after an insulin injection")).toBe("a-used-needle-after-an-insulin-injection");
    expect(slugify("  Café — Blood spill!  ")).toBe("cafe-blood-spill");
    // A trailing version number is dropped: "-v<N>" is reserved for versions.
    expect(slugify("Hand hygiene v2")).toBe("hand-hygiene");
    expect(slugify("Hand hygiene -v2")).toBe("hand-hygiene");
    expect(slugify("نظافة اليدين")).toBe("");
    expect(slugify("x".repeat(100)).length).toBeLessThanOrEqual(60);
  });
});

describe("versions", () => {
  it("reads the version from the slug", () => {
    expect(versionInfo("blood-spill")).toEqual({ base: "blood-spill", version: 1 });
    expect(versionInfo("blood-spill-v2")).toEqual({ base: "blood-spill", version: 2 });
    expect(versionInfo("blood-spill-v12")).toEqual({ base: "blood-spill", version: 12 });
    // "-v1" / "-v0" are not version suffixes (version 1 has no suffix).
    expect(versionInfo("blood-spill-v1")).toEqual({ base: "blood-spill-v1", version: 1 });
  });

  it("tells family members apart from look-alikes", () => {
    expect(inFamily("blood-spill", "blood-spill")).toBe(true);
    expect(inFamily("blood-spill", "blood-spill-v3")).toBe(true);
    expect(inFamily("blood-spill", "blood-spill-room")).toBe(false);
    expect(inFamily("blood-spill", "blood-spill-room-v2")).toBe(false);
  });

  it("numbers the next version after the highest one", () => {
    expect(nextVersion("a", ["a"])).toEqual({ slug: "a-v2", version: 2 });
    expect(nextVersion("a", ["a", "a-v2", "a-v5", "a-other-v9"])).toEqual({ slug: "a-v6", version: 6 });
  });

  it("publishing one version unpublishes the other published ones of its family", () => {
    const family = [
      { id: "1", slug: "a", isPublished: true },
      { id: "2", slug: "a-v2", isPublished: false },
      { id: "3", slug: "a-v3", isPublished: true },
      { id: "4", slug: "a-b", isPublished: true },
    ];
    expect(versionsToUnpublish("2", "a", family)).toEqual(["1", "3"]);
    expect(versionsToUnpublish("3", "a", family)).toEqual(["1"]);
  });

  it("finds an existing draft of a later version", () => {
    const family = [
      { id: "1", slug: "a", isPublished: true, attempts: 4 },
      { id: "2", slug: "a-v2", isPublished: false, attempts: 0 },
    ];
    expect(laterDraft({ slug: "a" }, family)?.id).toBe("2");
    // A later version that was played, or published, is not a draft; an earlier one never counts.
    expect(laterDraft({ slug: "a" }, [family[0], { ...family[1], attempts: 1 }])).toBeNull();
    expect(laterDraft({ slug: "a" }, [family[0], { ...family[1], isPublished: true }])).toBeNull();
    expect(laterDraft({ slug: "a-v2" }, family)).toBeNull();
  });
});

describe("rows and form values", () => {
  it("round-trips stored rows and orders stages and options by position", () => {
    const values = content([stage({ contextAr: "قبل", contextEn: "" }), emptyStage()]);
    const data = stagesCreateData(schema.parse({ ...values, stages: [values.stages[0]] }).stages);
    expect(data[0]).toMatchObject({ order: 1, contextAr: "قبل", contextEn: null });
    expect(data[0].options.create.map((o) => o.order)).toEqual([1, 2]);
    expect(data[0].options.create[1]).toMatchObject({ isCritical: true, isCorrect: false, stepId: "s-recap" });
  });

  it("never stores a correct option as critical", () => {
    const [created] = stagesCreateData([{ ...stage(), options: [option({ isCorrect: true, isCritical: true }), option()] }]);
    expect(created.options.create[0].isCritical).toBe(false);
  });

  it("clears links to steps of another protocol (and their critical flag)", () => {
    const { stages, cleared } = clearForeignSteps([stage()], new Set(["s-dispose"]));
    expect(cleared).toBe(2);
    expect(stages[0].options.every((o) => o.stepId === null && !o.isCritical)).toBe(true);
    expect(clearForeignSteps([stage()], STEPS).cleared).toBe(0);
  });

  it("a new stage starts as a valid one-answer shape with two options", () => {
    const s = emptyStage();
    expect(s.kind).toBe("single");
    expect(s.options).toHaveLength(2);
    expect(s.options.filter((o) => o.isCorrect)).toHaveLength(1);
  });
});
