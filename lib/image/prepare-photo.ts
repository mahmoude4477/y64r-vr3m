/**
 * Browser-only (call it from a "use client" component). Resize + re-encode a camera/gallery photo before upload (PRODUCT.md 5):
 * long side <= 1568 px, JPEG. createImageBitmap applies EXIF rotation, and re-encoding through a
 * canvas strips EXIF/GPS metadata from hospital photos. HEIC is not supported by Claude vision:
 * when the browser cannot decode the file, PreparePhotoError("unsupported") is thrown so the UI can
 * ask for a JPEG/PNG photo.
 */
export const MAX_LONG_EDGE = 1568;
export const JPEG_QUALITY = 0.85;

export type PreparedPhoto = { file: File; width: number; height: number; bytes: number };

export class PreparePhotoError extends Error {
  readonly code: "unsupported" | "encode_failed";
  constructor(code: "unsupported" | "encode_failed") {
    super(`preparePhoto: ${code}`);
    this.name = "PreparePhotoError";
    this.code = code;
  }
}

/** Target size for a w x h image (pure; exported for tests and previews). */
export function fitLongEdge(width: number, height: number, maxLongEdge = MAX_LONG_EDGE) {
  const scale = Math.min(1, maxLongEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function preparePhoto(input: Blob, quality = JPEG_QUALITY): Promise<PreparedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input, { imageOrientation: "from-image" });
  } catch {
    throw new PreparePhotoError("unsupported");
  }
  try {
    const { width, height } = fitLongEdge(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PreparePhotoError("encode_failed");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new PreparePhotoError("encode_failed"))), "image/jpeg", quality),
    );
    const file = new File([blob], "scan.jpg", { type: "image/jpeg" });
    return { file, width, height, bytes: file.size };
  } finally {
    bitmap.close();
  }
}
