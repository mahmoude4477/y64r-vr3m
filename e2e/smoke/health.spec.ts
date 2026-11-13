import { expect, test } from "../support/fixtures";

// /api/health: Railway's deploy healthcheck and the uptime monitor (note 09 §5). A small, uncached JSON body with
// no secrets, error text or config flags.

test("GET /api/health: 200, database ok, never cached, nothing private", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/json");
  expect(res.headers()["cache-control"]).toContain("no-store");
  const body = await res.json();
  expect(Object.keys(body).sort()).toEqual(["checks", "status", "uptimeSeconds", "version"]);
  expect(body.status).toBe("ok");
  expect(Object.keys(body.checks).sort()).toEqual(["csp", "database"]);
  expect(body.checks.database).toEqual({ status: "ok", latencyMs: expect.any(Number) });
  // The build and the server see the same S3_* (none in e2e), so the CSP's bucket origin is current.
  expect(body.checks.csp).toBe("ok");
  expect(JSON.stringify(body)).not.toMatch(/postgres|secret|password|token|@/i);
});

test("HEAD /api/health: 200 without a body", async ({ request }) => {
  const res = await request.head("/api/health");
  expect(res.status()).toBe(200);
  expect((await res.body()).length).toBe(0);
});
