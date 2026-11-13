import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/admin/photos/<id> with the session, database and bucket mocked.

const mocks = vi.hoisted(() => ({
  authorizeApi: vi.fn(),
  findUnique: vi.fn(),
  isStorageConfigured: vi.fn(),
  presignPhotoView: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ authorizeApi: mocks.authorizeApi }));
vi.mock("@/lib/prisma", () => ({ prisma: { scanPhoto: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/storage", () => ({
  isStorageConfigured: mocks.isStorageConfigured,
  presignPhotoView: mocks.presignPhotoView,
  VIEW_URL_TTL_SECONDS: 600,
}));
vi.mock("@/lib/log", () => ({ requestLogger: () => ({ error: vi.fn() }) }));

const { GET } = await import("./route");

const call = (id: string) => GET(new Request(`http://127.0.0.1/api/admin/photos/${id}`), { params: Promise.resolve({ id }) } as never);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizeApi.mockResolvedValue({ ok: true, ctx: { user: { id: "admin-1" }, isPlatformAdmin: true } });
  mocks.isStorageConfigured.mockReturnValue(true);
});

describe("admin photo route", () => {
  it("is for platform admins only", async () => {
    mocks.authorizeApi.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    const res = await call("p1");
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.authorizeApi).toHaveBeenCalledWith({ platformAdmin: true });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("refuses odd ids and says when storage is off", async () => {
    expect((await call("../etc")).status).toBe(404);
    mocks.isStorageConfigured.mockReturnValue(false);
    expect((await call("p1")).status).toBe(503);
    expect(mocks.presignPhotoView).not.toHaveBeenCalled();
  });

  it("redirects to a short-lived presigned URL of any institution's photo, cached privately", async () => {
    mocks.findUnique.mockResolvedValue({ storageKey: "orgs/o1/u1/k.jpg" });
    mocks.presignPhotoView.mockResolvedValue("https://bucket.example/k.jpg?sig=1");
    const res = await call("p1");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://bucket.example/k.jpg?sig=1");
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "p1" }, select: { storageKey: true } });
  });

  it("answers 404 for a missing photo and 500 (not cached) when the bucket fails", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    expect((await call("p1")).status).toBe(404);
    mocks.findUnique.mockResolvedValueOnce({ storageKey: "k" });
    mocks.presignPhotoView.mockRejectedValueOnce(new Error("no credentials"));
    const res = await call("p1");
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
