import { describe, expect, it } from "vitest";
import { assertValidPhotoUpload, isOwnPhotoKey, MAX_PHOTO_BYTES, newPhotoKey, presignPhotoUpload } from "./storage";

describe("photo keys and upload checks", () => {
  const owner = { organizationId: "org1", userId: "user1" };

  it("newPhotoKey builds scans/<org>/<user>/<uuid>.<ext> and isOwnPhotoKey accepts only the owner's keys", () => {
    const key = newPhotoKey({ ...owner, contentType: "image/jpeg" });
    expect(key).toMatch(/^scans\/org1\/user1\/[0-9a-f-]{36}\.jpg$/);
    expect(isOwnPhotoKey(key, owner)).toBe(true);
    expect(isOwnPhotoKey(key, { organizationId: "org2", userId: "user1" })).toBe(false);
    expect(isOwnPhotoKey(key, { organizationId: "org1", userId: "user2" })).toBe(false);
    for (const bad of [
      null,
      "",
      "scans/org1/user1/../../org2/user9/x.jpg",
      "scans/org1/user1/not-a-uuid.jpg",
      `scans/org1/user1/${crypto.randomUUID()}.svg`,
      `scans/personal/user1/${crypto.randomUUID()}.jpg`,
      `other/org1/user1/${crypto.randomUUID()}.jpg`,
    ]) {
      expect(isOwnPhotoKey(bad, owner)).toBe(false);
    }
    expect(() => newPhotoKey({ organizationId: "../x", userId: "user1", contentType: "image/png" })).toThrow();
  });

  it("rejects bad sizes and types at runtime, also in presignPhotoUpload", async () => {
    expect(() => assertValidPhotoUpload({ contentType: "image/webp", size: 1 })).not.toThrow();
    expect(() => assertValidPhotoUpload({ contentType: "image/jpeg", size: MAX_PHOTO_BYTES })).not.toThrow();
    for (const bad of [
      { contentType: "image/jpeg", size: 0 },
      { contentType: "image/jpeg", size: MAX_PHOTO_BYTES + 1 },
      { contentType: "image/jpeg", size: 1.5 },
      { contentType: "image/svg+xml", size: 100 },
      { contentType: "image/heic", size: 100 },
    ]) {
      expect(() => assertValidPhotoUpload(bad)).toThrow();
    }
    // the size check runs before the storage configuration check
    await expect(
      presignPhotoUpload({ key: "scans/org1/user1/x.jpg", contentType: "image/jpeg", size: 2 * 1024 * 1024 * 1024 }),
    ).rejects.toThrow(/photo size/);
  });
});
