import { describe, expect, it } from "vitest";
import { freeSlots, type PhotoSlot, photosBusy, photosReady, slotsReducer, uploadedPhotoIds } from "./photo-slots";

const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "scan.jpg", { type: "image/jpeg" });

function run(...actions: Parameters<typeof slotsReducer>[1][]): PhotoSlot[] {
  return actions.reduce<PhotoSlot[]>((s, a) => slotsReducer(s, a), []);
}

describe("photo slots", () => {
  it("goes preparing -> uploading -> uploaded", () => {
    const s = run(
      { type: "add", localId: "a" },
      { type: "prepared", localId: "a", file, width: 800, height: 600, previewUrl: "blob:a" },
      { type: "progress", localId: "a", progress: 0.4 },
    );
    expect(s[0]).toMatchObject({ status: "uploading", progress: 0.4, previewUrl: "blob:a" });
    expect(photosBusy(s)).toBe(true);
    expect(photosReady(s)).toBe(false);
    const done = slotsReducer(s, { type: "uploaded", localId: "a", photoId: "p1" });
    expect(done[0]).toMatchObject({ status: "uploaded", progress: 1, photoId: "p1" });
    expect(photosReady(done)).toBe(true);
    expect(uploadedPhotoIds(done)).toEqual(["p1"]);
  });

  it("never holds more than 4 photos", () => {
    const s = run(...["a", "b", "c", "d", "e"].map((localId) => ({ type: "add" as const, localId })));
    expect(s.map((x) => x.localId)).toEqual(["a", "b", "c", "d"]);
    expect(freeSlots(s)).toBe(0);
    expect(run({ type: "add", localId: "a" }, { type: "add", localId: "a" })).toHaveLength(1);
  });

  it("retries a failed upload only when the prepared file exists", () => {
    const failed = run(
      { type: "add", localId: "a" },
      { type: "prepared", localId: "a", file, width: 1, height: 1, previewUrl: "blob:a" },
      { type: "failed", localId: "a", error: "upload_failed" },
    );
    expect(photosReady(failed)).toBe(false);
    expect(photosBusy(failed)).toBe(false);
    expect(slotsReducer(failed, { type: "retry", localId: "a" })[0]).toMatchObject({ status: "uploading", error: null, progress: 0 });

    const unreadable = run({ type: "add", localId: "b" }, { type: "failed", localId: "b", error: "unsupported" });
    expect(slotsReducer(unreadable, { type: "retry", localId: "b" })[0].status).toBe("failed");
  });

  it("ignores progress outside uploading, clamps it and removes slots", () => {
    const s = run({ type: "add", localId: "a" }, { type: "progress", localId: "a", progress: 0.5 });
    expect(s[0].progress).toBe(0);
    const up = run(
      { type: "add", localId: "a" },
      { type: "prepared", localId: "a", file, width: 1, height: 1, previewUrl: "blob:a" },
      { type: "progress", localId: "a", progress: 7 },
    );
    expect(up[0].progress).toBe(1);
    expect(slotsReducer(up, { type: "remove", localId: "a" })).toEqual([]);
    expect(photosReady([])).toBe(false);
  });
});
