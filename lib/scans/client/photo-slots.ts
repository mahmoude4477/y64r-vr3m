import { MAX_PHOTOS_PER_SCAN } from "../constants";

/**
 * Photos of the new-scan form (pure reducer, unit-tested). A slot goes preparing -> uploading -> uploaded, or failed
 * (retry puts it back to uploading). Only uploaded slots are sent with the scan.
 */
export type PhotoSlot = {
  localId: string;
  status: "preparing" | "uploading" | "uploaded" | "failed";
  /** blob: URL of the prepared JPEG (null while preparing). The owner revokes it when the slot goes away. */
  previewUrl: string | null;
  file: File | null;
  width: number;
  height: number;
  /** 0..1 while uploading */
  progress: number;
  /** ScanPhoto.id once confirmed */
  photoId: string | null;
  /** error code (scans.errors.*) when failed */
  error: string | null;
};

export type SlotAction =
  | { type: "add"; localId: string }
  | { type: "prepared"; localId: string; file: File; width: number; height: number; previewUrl: string }
  | { type: "progress"; localId: string; progress: number }
  | { type: "uploaded"; localId: string; photoId: string }
  | { type: "failed"; localId: string; error: string }
  | { type: "retry"; localId: string }
  | { type: "remove"; localId: string };

export function slotsReducer(slots: readonly PhotoSlot[], action: SlotAction): PhotoSlot[] {
  const update = (patch: (s: PhotoSlot) => PhotoSlot) => slots.map((s) => (s.localId === action.localId ? patch(s) : s));
  switch (action.type) {
    case "add":
      if (slots.length >= MAX_PHOTOS_PER_SCAN || slots.some((s) => s.localId === action.localId)) return [...slots];
      return [
        ...slots,
        { localId: action.localId, status: "preparing", previewUrl: null, file: null, width: 0, height: 0, progress: 0, photoId: null, error: null },
      ];
    case "prepared":
      return update((s) => ({
        ...s,
        status: "uploading",
        file: action.file,
        width: action.width,
        height: action.height,
        previewUrl: action.previewUrl,
        progress: 0,
        error: null,
      }));
    case "progress":
      return update((s) => (s.status === "uploading" ? { ...s, progress: Math.min(1, Math.max(0, action.progress)) } : s));
    case "uploaded":
      return update((s) => ({ ...s, status: "uploaded", progress: 1, photoId: action.photoId, error: null }));
    case "failed":
      return update((s) => ({ ...s, status: "failed", error: action.error }));
    case "retry":
      return update((s) => (s.status === "failed" && s.file ? { ...s, status: "uploading", progress: 0, error: null } : s));
    case "remove":
      return slots.filter((s) => s.localId !== action.localId);
  }
}

export function freeSlots(slots: readonly PhotoSlot[]): number {
  return Math.max(0, MAX_PHOTOS_PER_SCAN - slots.length);
}

export function uploadedPhotoIds(slots: readonly PhotoSlot[]): string[] {
  return slots.flatMap((s) => (s.status === "uploaded" && s.photoId ? [s.photoId] : []));
}

/** Ready to send: at least one uploaded photo and nothing still preparing or uploading. Failed slots block too. */
export function photosReady(slots: readonly PhotoSlot[]): boolean {
  return slots.length > 0 && slots.every((s) => s.status === "uploaded");
}

export function photosBusy(slots: readonly PhotoSlot[]): boolean {
  return slots.some((s) => s.status === "preparing" || s.status === "uploading");
}
