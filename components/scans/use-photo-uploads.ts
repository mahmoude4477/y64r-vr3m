"use client";

import { type RefObject, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { preparePhoto, PreparePhotoError } from "@/lib/image/prepare-photo";
import { discardScanPhoto, ScanApiError, uploadScanPhoto } from "@/lib/scans/client/api";
import { type PhotoSlot, slotsReducer } from "@/lib/scans/client/photo-slots";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_SCAN } from "@/lib/scans/constants";

export type PhotoEvent = { kind: "uploaded" | "failed"; number: number; error?: string; at: number } | null;

type Controllers = Map<string, AbortController>;

function slotNumber(slots: readonly PhotoSlot[], localId: string): number {
  return slots.findIndex((s) => s.localId === localId) + 1;
}

/** Stops a slot's upload and revokes its preview. */
function stopSlot(slot: PhotoSlot, controllers: Controllers): void {
  controllers.get(slot.localId)?.abort();
  controllers.delete(slot.localId);
  if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
}

/** Stops a slot's upload, revokes its preview and (unless the scan owns it) deletes the uploaded photo. */
function forgetSlot(slot: PhotoSlot, controllers: Controllers, discard: boolean): void {
  stopSlot(slot, controllers);
  if (discard && slot.photoId) discardScanPhoto(slot.photoId);
}

const uploadedIds = (slots: readonly PhotoSlot[]) => slots.flatMap((s) => (s.photoId ? [s.photoId] : []));

/**
 * Photos of the new-scan form: each added image is prepared in the browser (preparePhoto: long side <= 1568 px, JPEG,
 * EXIF stripped), uploaded at once (sign -> PUT -> confirm) with progress, and can be retried or removed. Removing a
 * photo, cancelling or leaving the page discards uploads that no scan uses yet (DELETE /api/scans/photos/<id>): a
 * client-side navigation unmounts the form, a reload or a closed tab fires `pagehide` (the beforeunload prompt asks
 * first). Once submit() created the scan they belong to it and are kept. While the scan is being created nothing is
 * discarded: leaving at that moment waits for the answer and discards only if the scan was not created (a discard
 * racing the create could otherwise delete the file of a photo the new scan already holds).
 */
export function usePhotoUploads() {
  const [slots, dispatch] = useReducer(slotsReducer, []);
  const [event, setEvent] = useState<PhotoEvent>(null);
  const slotsRef = useRef<PhotoSlot[]>(slots);
  const reserved = useRef(0); // slots taken synchronously (state updates arrive later)
  const controllers = useRef<Controllers>(new Map());
  const submitted = useRef(false);
  /** The create-scan request while it runs. */
  const inFlight = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  const startUpload = useCallback((localId: string, photo: { file: File; width: number; height: number }) => {
    const controller = new AbortController();
    controllers.current.set(localId, controller);
    uploadScanPhoto(photo, {
      signal: controller.signal,
      onProgress: (progress) => dispatch({ type: "progress", localId, progress }),
    })
      .then((photoId) => {
        if (controller.signal.aborted) {
          discardScanPhoto(photoId);
          return;
        }
        dispatch({ type: "uploaded", localId, photoId });
        setEvent({ kind: "uploaded", number: slotNumber(slotsRef.current, localId), at: Date.now() });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const error = e instanceof ScanApiError ? e.code : "upload_failed";
        dispatch({ type: "failed", localId, error });
        setEvent({ kind: "failed", number: slotNumber(slotsRef.current, localId), error, at: Date.now() });
      })
      .finally(() => {
        if (controllers.current.get(localId) === controller) controllers.current.delete(localId);
      });
  }, []);

  /** Adds up to the free slots; extra images are ignored (the UI disables adding when full). */
  const addImages = useCallback(
    async (images: readonly Blob[]) => {
      const accepted = images.slice(0, Math.max(0, MAX_PHOTOS_PER_SCAN - reserved.current));
      reserved.current += accepted.length;
      const ids = accepted.map(() => crypto.randomUUID());
      for (const localId of ids) dispatch({ type: "add", localId });
      await Promise.all(
        accepted.map(async (image, i) => {
          const localId = ids[i];
          try {
            const prepared = await preparePhoto(image);
            if (prepared.bytes > MAX_PHOTO_BYTES) {
              dispatch({ type: "failed", localId, error: "photo_too_large" });
              return;
            }
            const previewUrl = URL.createObjectURL(prepared.file);
            dispatch({ type: "prepared", localId, file: prepared.file, width: prepared.width, height: prepared.height, previewUrl });
            startUpload(localId, prepared);
          } catch (e) {
            const error = e instanceof PreparePhotoError ? e.code : "unsupported";
            dispatch({ type: "failed", localId, error });
            setEvent({ kind: "failed", number: slotNumber(slotsRef.current, localId) || i + 1, error, at: Date.now() });
          }
        }),
      );
    },
    [startUpload],
  );

  const retry = useCallback(
    (localId: string) => {
      const slot = slotsRef.current.find((s) => s.localId === localId);
      if (!slot || slot.status !== "failed" || !slot.file) return;
      dispatch({ type: "retry", localId });
      startUpload(localId, { file: slot.file, width: slot.width, height: slot.height });
    },
    [startUpload],
  );

  const remove = useCallback((localId: string) => {
    const slot = slotsRef.current.find((s) => s.localId === localId);
    if (!slot) return;
    forgetSlot(slot, controllers.current, true);
    reserved.current = Math.max(0, reserved.current - 1);
    dispatch({ type: "remove", localId });
  }, []);

  /** Cancel: stop every upload and discard what was uploaded (unless a scan already owns it). */
  const discardAll = useCallback(() => {
    for (const slot of slotsRef.current) forgetSlot(slot, controllers.current, !submitted.current);
    slotsRef.current = []; // already handled: leaving the page afterwards must not discard them a second time
  }, []);

  /**
   * Creates the scan that takes the uploaded photos (`create` sends POST /api/scans). When it succeeds the photos
   * belong to the scan and are never discarded; while it runs, leaving the page does not discard them either.
   */
  const submit = useCallback(async <T,>(create: () => Promise<T>): Promise<T> => {
    const pending = create();
    inFlight.current = pending;
    try {
      const created = await pending;
      submitted.current = true;
      return created;
    } finally {
      if (inFlight.current === pending) inFlight.current = null;
    }
  }, []);

  // Leaving the page (sidebar link, back button) before the scan is saved = cancel. Preview URLs always go.
  useEffect(() => cleanupOnLeave(slotsRef, controllers, submitted, inFlight), []);

  // A reload or a closed tab never unmounts the form: discard on pagehide too (keepalive requests outlive the page).
  // A page kept in the back-forward cache (persisted) comes back with its photos, so they stay.
  useEffect(() => {
    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted || submitted.current || inFlight.current) return;
      const ids = uploadedIds(slotsRef.current);
      for (const id of ids) discardScanPhoto(id);
      if (ids.length > 0) slotsRef.current = slotsRef.current.map((s) => (s.photoId ? { ...s, photoId: null } : s));
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  return { slots, event, addImages, retry, remove, discardAll, submit };
}

function cleanupOnLeave(
  slots: RefObject<PhotoSlot[]>,
  controllers: RefObject<Controllers>,
  submitted: RefObject<boolean>,
  inFlight: RefObject<Promise<unknown> | null>,
): () => void {
  return () => {
    const current = slots.current;
    for (const slot of current) stopSlot(slot, controllers.current);
    if (submitted.current) return;
    const ids = uploadedIds(current);
    const discard = () => {
      for (const id of ids) discardScanPhoto(id);
    };
    // The scan is being created: discard only if that fails (the request goes on after the form is gone).
    if (inFlight.current) inFlight.current.then(() => undefined, discard);
    else discard();
  };
}
