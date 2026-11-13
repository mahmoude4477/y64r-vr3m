import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server logic of the player against an in-memory stand-in for the few Prisma calls it makes. Checks the rules that
 * matter for integrity: attempts are only reached through the caller's own user id, stages are answered in order and
 * once, the last answer completes and scores the attempt, step results are stored from @/lib/scoring, and nothing is
 * written once the scenario cannot be played or the attempt's institution is no longer the active one (SEC-1).
 */

type Attempt = {
  id: string;
  userId: string;
  organizationId: string | null;
  scenarioId: string;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: Date;
  completedAt?: Date;
  durationSec?: number;
  score?: number | null;
  riskLevel?: string | null;
};
type Answer = { attemptId: string; stageId: string; optionIds: string[]; isCorrect: boolean; answeredAt?: Date };

const db = vi.hoisted(() => ({
  attempts: [] as Attempt[],
  answers: [] as Answer[],
  stepResults: [] as Array<{ attemptId: string; stepId: string; compliant: boolean; critical: boolean }>,
  wheres: [] as unknown[],
  readable: true,
  rateOk: true,
  seq: 0,
}));

// Scenario "sc": stage s1 (single: a right, b wrong+critical on step recap), stage s2 (multi: c, d right; e wrong).
const STAGES = [
  {
    id: "s1",
    kind: "single",
    options: [
      { id: "a", stageId: "s1", stepId: "recap", isCorrect: true, isCritical: false },
      { id: "b", stageId: "s1", stepId: "recap", isCorrect: false, isCritical: true },
    ],
  },
  {
    id: "s2",
    kind: "multi",
    options: [
      { id: "c", stageId: "s2", stepId: "dispose", isCorrect: true, isCritical: false },
      { id: "d", stageId: "s2", stepId: "dispose", isCorrect: true, isCritical: false },
      { id: "e", stageId: "s2", stepId: null, isCorrect: false, isCritical: false },
    ],
  },
];
const STEPS = [
  { id: "recap", weight: 3, isMandatory: true, isCritical: true },
  { id: "dispose", weight: 2, isMandatory: true, isCritical: false },
];

function matches(a: Attempt, where: Record<string, unknown>): boolean {
  if (where.id !== undefined && typeof where.id === "string" && a.id !== where.id) return false;
  if (where.id && typeof where.id === "object" && Array.isArray((where.id as { in?: string[] }).in) && !(where.id as { in: string[] }).in.includes(a.id))
    return false;
  if (where.userId !== undefined && a.userId !== where.userId) return false;
  if (where.scenarioId !== undefined && a.scenarioId !== where.scenarioId) return false;
  if (where.status !== undefined && a.status !== where.status) return false;
  return true;
}

const view = (a: Attempt) => ({
  ...a,
  answers: db.answers
    .filter((x) => x.attemptId === a.id)
    .map((x) => ({ stageId: x.stageId, optionIds: x.optionIds, answeredAt: x.answeredAt ?? new Date() })),
  scenario: { stages: STAGES },
});
const newestFirst = (x: Attempt, y: Attempt) => y.startedAt.getTime() - x.startedAt.getTime();

const client = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock("@/lib/prisma", () => ({ prisma: client }));
vi.mock("@/lib/app-rate-limit", () => ({ takeAppRateLimit: async () => db.rateOk }));

Object.assign(client, {
  scenario: {
    // Stands in for scenariosReadable: `db.readable` false = unpublished, replaced, or not readable in this scope.
    findFirst: async (args: { where: unknown }) => {
      db.wheres.push(args.where);
      return db.readable ? { id: "sc", _count: { stages: STAGES.length } } : null;
    },
  },
  simulationAttempt: {
    findFirst: async (args: { where: Record<string, unknown> }) => {
      db.wheres.push(args.where);
      const found = db.attempts.filter((a) => matches(a, args.where)).sort(newestFirst)[0];
      return found ? view(found) : null;
    },
    // orderBy startedAt desc, as every caller asks.
    findMany: async (args: { where: Record<string, unknown> }) => db.attempts.filter((a) => matches(a, args.where)).sort(newestFirst).map(view),
    create: async (args: { data: Omit<Attempt, "id" | "status" | "startedAt"> }) => {
      const row: Attempt = { ...args.data, id: `att${++db.seq}`, status: "in_progress", startedAt: new Date(Date.now() + db.seq) };
      db.attempts.push(row);
      return { id: row.id };
    },
    updateMany: async (args: { where: Record<string, unknown>; data: Partial<Attempt> }) => {
      const rows = db.attempts.filter((a) => matches(a, args.where));
      rows.forEach((r) => Object.assign(r, args.data));
      return { count: rows.length };
    },
  },
  simulationAnswer: {
    create: async (args: { data: Answer }) => {
      if (db.answers.some((x) => x.attemptId === args.data.attemptId && x.stageId === args.data.stageId)) {
        throw Object.assign(new Error("unique"), { code: "P2002" });
      }
      db.answers.push({ ...args.data, answeredAt: new Date() }); // the column default: now()
      return args.data;
    },
  },
  protocolStep: { findMany: async () => STEPS },
  simulationStepResult: {
    createMany: async (args: { data: Array<{ attemptId: string; stepId: string; compliant: boolean; critical: boolean }> }) => {
      db.stepResults.push(...args.data);
      return { count: args.data.length };
    },
  },
  $executeRaw: async () => 1,
  $transaction: async (fn: (tx: unknown) => unknown) => fn(client),
});

const { answerStage, completeAttempt, startAttempt } = await import("./attempts");

const me = { userId: "u1", organizationId: "o1", orgRole: "trainee" as const, isPlatformAdmin: false };
const other = { userId: "u2", organizationId: "o1", orgRole: "examiner" as const, isPlatformAdmin: false };

beforeEach(() => {
  db.attempts = [];
  db.answers = [];
  db.stepResults = [];
  db.wheres = [];
  db.readable = true;
  db.rateOk = true;
  db.seq = 0;
});

describe("startAttempt", () => {
  it("opens one attempt in the active organization and resumes it afterwards", async () => {
    const first = await startAttempt(me, "sc");
    expect(first).toMatchObject({ ok: true, resumed: false, answeredStageIds: [] });
    expect(db.attempts).toHaveLength(1);
    expect(db.attempts[0]).toMatchObject({ userId: "u1", organizationId: "o1", scenarioId: "sc" });
    const again = await startAttempt(me, "sc");
    expect(again).toMatchObject({ ok: true, resumed: true });
    expect(db.attempts).toHaveLength(1);
  });

  it("start over abandons the open attempt and opens a new one", async () => {
    const first = await startAttempt(me, "sc");
    const fresh = await startAttempt(me, "sc", { restart: true });
    expect(fresh.ok && first.ok && fresh.attemptId !== first.attemptId).toBe(true);
    expect(db.attempts.map((a) => a.status)).toEqual(["abandoned", "in_progress"]);
  });

  it("refuses a scenario the user may not play, and too many new attempts", async () => {
    db.readable = false;
    expect(await startAttempt(me, "sc")).toEqual({ ok: false, error: "not_found" });
    db.readable = true;
    db.rateOk = false;
    expect(await startAttempt(me, "sc")).toEqual({ ok: false, error: "rate_limited" });
  });
});

describe("answerStage", () => {
  it("only reaches the caller's own attempt", async () => {
    const start = await startAttempt(me, "sc");
    if (!start.ok) throw new Error("start failed");
    const r = await answerStage(other, { attemptId: start.attemptId, stageId: "s1", optionIds: ["a"] });
    expect(r).toEqual({ ok: false, error: "not_found" });
    expect(db.wheres.at(-1)).toMatchObject({ id: start.attemptId, userId: "u2" });
    expect(db.answers).toHaveLength(0);
  });

  it("answers in order, once, with a valid choice", async () => {
    const start = await startAttempt(me, "sc");
    if (!start.ok) throw new Error("start failed");
    const id = start.attemptId;
    expect(await answerStage(me, { attemptId: id, stageId: "s2", optionIds: ["c"] })).toEqual({ ok: false, error: "out_of_order" });
    expect(await answerStage(me, { attemptId: id, stageId: "s1", optionIds: ["a", "b"] })).toEqual({ ok: false, error: "invalid_choice" });
    expect(await answerStage(me, { attemptId: id, stageId: "s1", optionIds: ["c"] })).toEqual({ ok: false, error: "invalid_choice" });
    expect(await answerStage(me, { attemptId: id, stageId: "nope", optionIds: ["a"] })).toEqual({ ok: false, error: "not_found" });
    expect(await answerStage(me, { attemptId: id, stageId: "s1", optionIds: ["a"] })).toEqual({ ok: true, completed: false, nextIndex: 1 });
    expect(await answerStage(me, { attemptId: id, stageId: "s1", optionIds: ["b"] })).toEqual({ ok: false, error: "already_answered" });
    expect(db.answers).toEqual([{ attemptId: id, stageId: "s1", optionIds: ["a"], isCorrect: true, answeredAt: expect.any(Date) }]);
  });

  it("the last answer completes the attempt with the score from @/lib/scoring", async () => {
    const start = await startAttempt(me, "sc");
    if (!start.ok) throw new Error("start failed");
    const id = start.attemptId;
    await answerStage(me, { attemptId: id, stageId: "s1", optionIds: ["a"] });
    const last = await answerStage(me, { attemptId: id, stageId: "s2", optionIds: ["d", "c"] });
    expect(last).toEqual({ ok: true, completed: true, attemptId: id });
    expect(db.attempts[0]).toMatchObject({ status: "completed", score: 100, riskLevel: "low" });
    expect(db.stepResults).toEqual([
      { attemptId: id, stepId: "recap", compliant: true, critical: false },
      { attemptId: id, stepId: "dispose", compliant: true, critical: false },
    ]);
    // A completed attempt takes no more answers.
    expect(await answerStage(me, { attemptId: id, stageId: "s2", optionIds: ["c"] })).toEqual({ ok: false, error: "not_in_progress" });
  });

  it("a critical wrong option gives a high risk and a critical step result", async () => {
    const start = await startAttempt(me, "sc");
    if (!start.ok) throw new Error("start failed");
    await answerStage(me, { attemptId: start.attemptId, stageId: "s1", optionIds: ["b"] });
    await answerStage(me, { attemptId: start.attemptId, stageId: "s2", optionIds: ["c", "d"] });
    expect(db.attempts[0]).toMatchObject({ status: "completed", score: 40, riskLevel: "high" });
    expect(db.stepResults.find((r) => r.stepId === "recap")).toMatchObject({ compliant: false, critical: true });
  });
});

describe("an attempt that can no longer be played (SEC-1)", () => {
  it("unpublished mid-attempt: the next answer is refused and nothing is written", async () => {
    const start = await startAttempt(me, "sc");
    if (!start.ok) throw new Error("start failed");
    await answerStage(me, { attemptId: start.attemptId, stageId: "s1", optionIds: ["a"] });
    db.readable = false; // the admin unpublished it (or published a new version)
    const r = await answerStage(me, { attemptId: start.attemptId, stageId: "s2", optionIds: ["c", "d"] });
    expect(r).toEqual({ ok: false, error: "not_playable" });
    expect(db.answers).toHaveLength(1);
    expect(db.attempts[0].status).toBe("in_progress");
    expect(db.stepResults).toEqual([]);
    // Every scenario lookup of a write is scoped with scenariosReadable (published, readable protocol).
    expect(db.wheres.at(-1)).toMatchObject({ AND: [{ id: "sc" }, { OR: expect.any(Array) }] });
  });

  it("unpublished with every stage answered: completing is refused too (no score in the reports)", async () => {
    const start = await startAttempt(me, "sc");
    if (!start.ok) throw new Error("start failed");
    db.answers.push(
      { attemptId: start.attemptId, stageId: "s1", optionIds: ["a"], isCorrect: true },
      { attemptId: start.attemptId, stageId: "s2", optionIds: ["c", "d"], isCorrect: true },
    );
    db.readable = false;
    expect(await completeAttempt(me, start.attemptId)).toEqual({ ok: false, error: "not_playable" });
    expect(db.attempts[0].status).toBe("in_progress");
    // Back once it is published again.
    db.readable = true;
    expect(await completeAttempt(me, start.attemptId)).toEqual({ ok: true, attemptId: start.attemptId });
  });

  it("left the institution mid-attempt: the attempt credited to it takes no more answers, and is not closed", async () => {
    const start = await startAttempt(me, "sc");
    if (!start.ok) throw new Error("start failed");
    await answerStage(me, { attemptId: start.attemptId, stageId: "s1", optionIds: ["a"] });
    // Removed from o1: an individual user now (no active institution), the global scenario still readable.
    const removed = { ...me, organizationId: null, orgRole: null };
    expect(await answerStage(removed, { attemptId: start.attemptId, stageId: "s2", optionIds: ["c", "d"] })).toEqual({
      ok: false,
      error: "other_institution",
    });
    expect(await completeAttempt(removed, start.attemptId)).toEqual({ ok: false, error: "other_institution" });
    // Active in another institution: same.
    const elsewhere = { ...me, organizationId: "o2" };
    expect(await answerStage(elsewhere, { attemptId: start.attemptId, stageId: "s2", optionIds: ["c", "d"] })).toEqual({
      ok: false,
      error: "other_institution",
    });
    expect(db.answers).toHaveLength(1);
    expect(db.attempts[0]).toMatchObject({ organizationId: "o1", status: "in_progress" });
  });

  it("starting the scenario in another institution leaves the first one's attempt open to continue there (SPEC-2)", async () => {
    const inA = await startAttempt(me, "sc");
    if (!inA.ok) throw new Error("start failed");
    expect(await answerStage(me, { attemptId: inA.attemptId, stageId: "s1", optionIds: ["a"] })).toMatchObject({ ok: true, nextIndex: 1 });
    // Switched to institution o2: a separate attempt credited to o2; the o1 attempt stays open with its answer.
    const inB = { ...me, organizationId: "o2" };
    const fresh = await startAttempt(inB, "sc");
    expect(fresh).toMatchObject({ ok: true, resumed: false, answeredStageIds: [] });
    expect(db.attempts.map((a) => [a.organizationId, a.status])).toEqual([
      ["o1", "in_progress"],
      ["o2", "in_progress"],
    ]);
    // "Start over" in o2 closes only the o2 attempt.
    const again = await startAttempt(inB, "sc", { restart: true });
    if (!again.ok) throw new Error("restart failed");
    expect(db.attempts.map((a) => [a.organizationId, a.status])).toEqual([
      ["o1", "in_progress"],
      ["o2", "abandoned"],
      ["o2", "in_progress"],
    ]);
    // Back in o1: the o1 attempt resumes where it stopped and can be finished.
    expect(await startAttempt(me, "sc")).toEqual({ ok: true, attemptId: inA.attemptId, answeredStageIds: ["s1"], resumed: true });
    expect(await answerStage(me, { attemptId: inA.attemptId, stageId: "s2", optionIds: ["c", "d"] })).toEqual({
      ok: true,
      completed: true,
      attemptId: inA.attemptId,
    });
    expect(db.attempts.find((a) => a.id === inA.attemptId)).toMatchObject({ status: "completed", organizationId: "o1" });
    expect(db.attempts.find((a) => a.id === again.attemptId)?.status).toBe("in_progress");
  });

  it("an individual attempt started while an institution's stays open: each context continues its own", async () => {
    const inA = await startAttempt(me, "sc");
    if (!inA.ok) throw new Error("start failed");
    const solo = { ...me, organizationId: null, orgRole: null };
    const personal = await startAttempt(solo, "sc");
    if (!personal.ok) throw new Error("start failed");
    expect(personal.attemptId).not.toBe(inA.attemptId);
    // In o1 its own attempt comes first, although the individual one is newer.
    expect(await startAttempt(me, "sc")).toMatchObject({ ok: true, resumed: true, attemptId: inA.attemptId });
    expect(await startAttempt(solo, "sc")).toMatchObject({ ok: true, resumed: true, attemptId: personal.attemptId });
    // "Start over" in o1 closes both attempts that could be continued there (each kept as history).
    await startAttempt(me, "sc", { restart: true });
    expect(db.attempts.map((a) => [a.organizationId, a.status])).toEqual([
      ["o1", "abandoned"],
      [null, "abandoned"],
      ["o1", "in_progress"],
    ]);
  });

  it("an attempt of no institution continues after the user joins one", async () => {
    const solo = { ...me, organizationId: null, orgRole: null };
    const start = await startAttempt(solo, "sc");
    if (!start.ok) throw new Error("start failed");
    expect(await startAttempt(me, "sc")).toMatchObject({ ok: true, resumed: true, attemptId: start.attemptId });
    expect(await answerStage(me, { attemptId: start.attemptId, stageId: "s1", optionIds: ["a"] })).toEqual({ ok: true, completed: false, nextIndex: 1 });
  });
});

describe("completeAttempt", () => {
  it("stores the time played, not the days away of a resumed attempt (SPEC-1)", async () => {
    // Only Date is faked: the clock of the answers, of the attempt row and of the completion.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.UTC(2026, 9, 30, 8, 0, 0));
      const start = await startAttempt(me, "sc");
      if (!start.ok) throw new Error("start failed");
      const startedAt = db.attempts[0].startedAt.getTime();
      vi.setSystemTime(startedAt + 40_000); // 40 s on stage 1
      await answerStage(me, { attemptId: start.attemptId, stageId: "s1", optionIds: ["a"] });
      vi.setSystemTime(startedAt + 40_000 + 3 * 24 * 3600 * 1000 + 50_000); // "Continue later", back 3 days later, 50 s on stage 2
      await answerStage(me, { attemptId: start.attemptId, stageId: "s2", optionIds: ["c", "d"] });
      const attempt = db.attempts[0];
      expect(attempt.status).toBe("completed");
      // 40 s, then the long gap counted as the cap only (MAX_ACTIVE_GAP_SEC, 5 min); the last answer completes it.
      expect(attempt.durationSec).toBe(40 + 300);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stores the real time of an attempt played in one go", async () => {
    const start = await startAttempt(me, "sc");
    if (!start.ok) throw new Error("start failed");
    const startedAt = db.attempts[0].startedAt.getTime();
    db.answers.push(
      { attemptId: start.attemptId, stageId: "s1", optionIds: ["a"], isCorrect: true, answeredAt: new Date(startedAt + 45_000) },
      { attemptId: start.attemptId, stageId: "s2", optionIds: ["c", "d"], isCorrect: true, answeredAt: new Date(startedAt + 120_000) },
    );
    expect(await completeAttempt(me, start.attemptId, new Date(startedAt + 121_000))).toEqual({ ok: true, attemptId: start.attemptId });
    expect(db.attempts[0].durationSec).toBe(121);
  });

  it("refuses an attempt with unanswered stages and is idempotent once completed", async () => {
    const start = await startAttempt(me, "sc");
    if (!start.ok) throw new Error("start failed");
    expect(await completeAttempt(me, start.attemptId)).toEqual({ ok: false, error: "incomplete" });
    db.answers.push(
      { attemptId: start.attemptId, stageId: "s1", optionIds: ["a"], isCorrect: true },
      { attemptId: start.attemptId, stageId: "s2", optionIds: ["c"], isCorrect: false },
    );
    expect(await completeAttempt(me, start.attemptId)).toEqual({ ok: true, attemptId: start.attemptId });
    // "c" without "d": the dispose step is violated (a right option was missed).
    expect(db.attempts[0]).toMatchObject({ status: "completed", score: 60, riskLevel: "medium" });
    const results = db.stepResults.length;
    expect(await completeAttempt(me, start.attemptId)).toEqual({ ok: true, attemptId: start.attemptId });
    expect(db.stepResults).toHaveLength(results);
  });

  it("does not complete someone else's attempt", async () => {
    const start = await startAttempt(me, "sc");
    if (!start.ok) throw new Error("start failed");
    expect(await completeAttempt(other, start.attemptId)).toEqual({ ok: false, error: "not_found" });
  });
});
