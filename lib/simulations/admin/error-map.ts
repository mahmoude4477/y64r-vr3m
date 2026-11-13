import type * as z from "zod";
import type { IssueKey } from "./content";

/**
 * Wraps the shared translated zod error map (@/lib/zod-i18n) so the editor's own rules (issues with `params.sim`,
 * see ./content.ts) read from simulations.admin.issues, and everything else keeps the validation.json text.
 * Pure: the caller passes the translators (useTranslations on the client, getTranslations on the server).
 */
export function withScenarioIssues(base: z.core.$ZodErrorMap, issueText: (key: IssueKey) => string): z.core.$ZodErrorMap {
  return (issue) => {
    if (issue.code === "custom") {
      const key = (issue.params as { sim?: unknown } | undefined)?.sim;
      if (typeof key === "string") return issueText(key as IssueKey);
    }
    return base(issue);
  };
}
