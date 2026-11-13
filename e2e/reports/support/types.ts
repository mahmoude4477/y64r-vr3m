// Shared by seed-results.mts (run with tsx) and data.ts (Playwright). Types only: nothing here runs.

export type SeedPlan = {
  organizationId: string;
  /** A seeded global protocol (prisma/seed/protocols.ts). */
  protocolSlug: string;
  /** An institution scenario on that protocol is created (published) when given. */
  scenario?: { titleAr: string; titleEn: string };
  teams?: Array<{ key: string; name: string; userIds: string[] }>;
  attempts?: Array<{
    userId: string;
    daysAgo: number;
    /** Step keys answered wrong. */
    violate?: string[];
    /** Step keys violated through a critical wrong option. */
    critical?: string[];
    status?: "completed" | "in_progress";
    /** false = an attempt made outside the institution (organizationId null). */
    inOrganization?: boolean;
  }>;
  scans?: Array<{
    examinerId: string;
    daysAgo: number;
    area: string;
    team?: string;
    violate?: string[];
    /** Default "finalized". Open scans (draft, review, failed) carry no score, risk or finalisation. */
    status?: "finalized" | "draft" | "review" | "failed";
  }>;
};

export type SeedResult = {
  scenarioId: string | null;
  scenarioSlug: string | null;
  protocolId: string;
  teamIds: Record<string, string>;
  /** In plan order. */
  attemptIds: string[];
  /** Stored score of each attempt (null while in progress or not assessable), in plan order. */
  attemptScores: Array<number | null>;
  /** Stored risk level of each attempt (null while in progress or not assessable), in plan order. */
  attemptRisks: Array<"low" | "medium" | "high" | null>;
  scanIds: string[];
  scanScores: Array<number | null>;
  scanRisks: Array<"low" | "medium" | "high" | null>;
  steps: Array<{ id: string; key: string; textAr: string; textEn: string }>;
};
