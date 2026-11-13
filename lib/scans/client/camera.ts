/**
 * In-app camera for scans (browser only): the REAR camera by default (facingMode "environment"), a frame captured
 * from the live <video>, and the reasons a camera can fail, so the UI can offer the file upload instead.
 */

export type CameraProblem = "denied" | "unavailable" | "unsupported" | "busy" | "error";

/** Pure: what went wrong, from a getUserMedia rejection (DOMException names per the Media Capture spec). */
export function cameraProblem(error: unknown): CameraProblem {
  const name = typeof error === "object" && error !== null ? String((error as { name?: unknown }).name ?? "") : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "unavailable";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "busy";
    case "TypeError":
      return "unsupported";
    default:
      return "error";
  }
}

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
}

export type Facing = "environment" | "user";

/** Opens a camera. "ideal" (not "exact") so a laptop with one front camera still works. */
export async function openCamera(facing: Facing): Promise<MediaStream> {
  if (!cameraSupported()) throw Object.assign(new Error("camera unsupported"), { name: "TypeError" });
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** More than one camera (after permission, labels and ids are known): offer the front/back switch. */
export async function hasSeveralCameras(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput").length > 1;
  } catch {
    return false;
  }
}

/** The current video frame as a JPEG blob at the camera's resolution (preparePhoto resizes it afterwards). */
export function captureFrame(video: HTMLVideoElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      reject(new Error("camera: no frame yet"));
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("camera: no 2d context"));
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("camera: encode failed"))), "image/jpeg", quality);
  });
}
