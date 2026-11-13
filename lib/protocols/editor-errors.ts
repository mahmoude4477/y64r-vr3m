/**
 * Where the protocol editor's errors are, in the order the fields appear on the page (pure, unit-tested). Used to
 * count them for the summary, open the steps that hold them, and move focus to the first one.
 * Works on react-hook-form's nested FieldErrors (objects with a `message`) without importing its types.
 */

// The order of the fields on the page (components/protocols/editor/protocol-editor.tsx).
const BASIC_FIELDS = ["titleAr", "titleEn", "slug", "summaryAr", "summaryEn", "descriptionAr", "descriptionEn", "category", "icon"] as const;
const STEP_FIELDS = [
  "textAr",
  "textEn",
  "rationaleAr",
  "rationaleEn",
  "criteriaAr",
  "criteriaEn",
  "referenceLabel",
  "referenceUrl",
  "weight",
  "isMandatory",
  "isCritical",
  "visualCheck",
] as const;

type Node = { message?: unknown; root?: unknown } & Record<string, unknown>;

const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null;
const hasMessage = (v: unknown) => isNode(v) && typeof v.message === "string" && v.message !== "";

/** "titleAr", "steps", "steps.2.criteriaAr" … in page order. */
export function orderedErrorPaths(errors: unknown): string[] {
  if (!isNode(errors)) return [];
  const paths: string[] = [];
  for (const field of BASIC_FIELDS) if (hasMessage(errors[field])) paths.push(field);
  const steps = errors.steps;
  if (isNode(steps)) {
    if (hasMessage(steps) || hasMessage(steps.root)) paths.push("steps");
    const indexes = Object.keys(steps)
      .filter((k) => /^\d+$/.test(k))
      .map(Number)
      .sort((a, b) => a - b);
    for (const index of indexes) {
      const step = steps[String(index)];
      if (!isNode(step)) continue;
      for (const field of STEP_FIELDS) if (hasMessage(step[field])) paths.push(`steps.${index}.${field}`);
    }
  }
  return paths;
}

/** The step indexes that hold at least one error. */
export function stepIndexesWithErrors(paths: readonly string[]): number[] {
  const out = new Set<number>();
  for (const path of paths) {
    const match = /^steps\.(\d+)\./.exec(path);
    if (match) out.add(Number(match[1]));
  }
  return [...out].sort((a, b) => a - b);
}
