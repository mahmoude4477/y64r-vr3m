import { describe, expect, it } from "vitest";
import type { Scope } from "@/lib/authz";
import { orderedErrorPaths, stepIndexesWithErrors } from "./editor-errors";
import { editableWhere, editorBasePath, isEditorScope } from "./editor-scope";

const scope = (over: Partial<Scope> = {}): Scope => ({ userId: "u1", organizationId: null, orgRole: null, isPlatformAdmin: false, ...over });
const NOTHING = { id: { in: [] } };

describe("editableWhere", () => {
  it("global: platform admins and protocol editors edit global protocols only; nobody else edits anything", () => {
    expect(editableWhere("global", scope({ isPlatformAdmin: true }))).toEqual({ organizationId: null });
    expect(editableWhere("global", scope({ isContentEditor: true }))).toEqual({ organizationId: null });
    expect(editableWhere("global", scope({ isPlatformAdmin: true, isContentEditor: false }))).toEqual(NOTHING);
    expect(editableWhere("global", scope({ organizationId: "o1", orgRole: "owner" }))).toEqual(NOTHING);
  });

  it("institution: owners and admins of the active institution, never examiners, trainees or individuals", () => {
    expect(editableWhere("institution", scope({ organizationId: "o1", orgRole: "owner" }))).toEqual({ organizationId: "o1" });
    expect(editableWhere("institution", scope({ organizationId: "o1", orgRole: "admin" }))).toEqual({ organizationId: "o1" });
    expect(editableWhere("institution", scope({ organizationId: "o1", orgRole: "examiner" }))).toEqual(NOTHING);
    expect(editableWhere("institution", scope({ organizationId: "o1", orgRole: "trainee" }))).toEqual(NOTHING);
    expect(editableWhere("institution", scope())).toEqual(NOTHING);
    // A platform admin gets no institution powers from the platform role.
    expect(editableWhere("institution", scope({ isPlatformAdmin: true }))).toEqual(NOTHING);
  });

  it("knows its scopes and where each editor lives", () => {
    expect(isEditorScope("global")).toBe(true);
    expect(isEditorScope("institution")).toBe(true);
    expect(isEditorScope("org")).toBe(false);
    expect(isEditorScope(undefined)).toBe(false);
    expect(editorBasePath("global")).toBe("/admin/protocols");
    expect(editorBasePath("institution")).toBe("/org/protocols");
  });
});

describe("orderedErrorPaths", () => {
  it("lists errors in page order: basics, then steps by index and field", () => {
    const errors = {
      icon: { message: "x" },
      titleAr: { message: "x" },
      steps: {
        10: { referenceUrl: { message: "x" } },
        2: { criteriaEn: { message: "x" }, textAr: { message: "x" } },
      },
      slug: { message: "x" },
    };
    expect(orderedErrorPaths(errors)).toEqual([
      "titleAr",
      "slug",
      "icon",
      "steps.2.textAr",
      "steps.2.criteriaEn",
      "steps.10.referenceUrl",
    ]);
    expect(stepIndexesWithErrors(orderedErrorPaths(errors))).toEqual([2, 10]);
  });

  it("reports an error on the step list itself, and ignores empty or odd values", () => {
    expect(orderedErrorPaths({ steps: { message: "too few" } })).toEqual(["steps"]);
    expect(orderedErrorPaths({ steps: { root: { message: "too few" } } })).toEqual(["steps"]);
    expect(orderedErrorPaths({ titleEn: { message: "" }, steps: { 0: null } })).toEqual([]);
    expect(orderedErrorPaths(null)).toEqual([]);
  });
});
