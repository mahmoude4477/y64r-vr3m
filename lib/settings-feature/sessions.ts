// What the "active sessions" list shows about one session. Built on the server from the session row; the view never
// carries the session token or the IP address (the page shows device, browser and dates only). Client-safe and pure.
import { calendarDaysAgo } from "./last-active";
import { type DeviceInfo, parseUserAgent } from "./user-agent";

/** The columns read from the session table (never `token` or `ipAddress`). */
export type SessionRow = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  userAgent: string | null;
  impersonatedBy: string | null;
};

export type SessionView = DeviceInfo & {
  id: string;
  /** The session this request was made with. */
  current: boolean;
  /** Opened by a platform admin acting as this user (admin plugin impersonation). */
  impersonated: boolean;
  signedInAt: Date;
  /** Calendar days since the session was last refreshed (0 = today), see last-active.ts. */
  lastActiveDays: number;
};

export function toSessionView(row: SessionRow, opts: { currentId: string; now: Date; timeZone: string }): SessionView {
  return {
    ...parseUserAgent(row.userAgent),
    id: row.id,
    current: row.id === opts.currentId,
    impersonated: !!row.impersonatedBy,
    signedInAt: row.createdAt,
    lastActiveDays: calendarDaysAgo(row.updatedAt, opts.now, opts.timeZone),
  };
}
