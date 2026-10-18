// Strips privacy-sensitive metadata (EXIF GPS, camera serials, XMP, comments, text chunks)
// from JPEG, PNG and WebP files without re-encoding pixels, and verifies the file really is
// the type it claims to be. Pure TypeScript: runs in Deno Edge Functions and in Vitest.

export type SupportedImageType = "image/jpeg" | "image/png" | "image/webp";

export class ImageRejectedError extends Error {}

export function detectImageType(bytes: Uint8Array): SupportedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}

export function sanitizeImage(
  bytes: Uint8Array,
  declaredType: string | null,
): { bytes: Uint8Array; type: SupportedImageType } {
  const type = detectImageType(bytes);
  if (!type) throw new ImageRejectedError("File is not a JPEG, PNG or WebP image");
  if (declaredType && declaredType !== type) {
    throw new ImageRejectedError(`File content (${type}) does not match its declared type (${declaredType})`);
  }
  switch (type) {
    case "image/jpeg":
      return { bytes: sanitizeJpeg(bytes), type };
    case "image/png":
      return { bytes: sanitizePng(bytes), type };
    case "image/webp":
      return { bytes: sanitizeWebp(bytes), type };
  }
}

export function extensionFor(type: SupportedImageType): string {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type];
}

// ---------------------------------------------------------------------------
// JPEG: keep APP0 (JFIF), APP2 ICC profile, APP14 (Adobe colour transform) and all
// non-metadata segments. Drop every other APPn and COM. EXIF is replaced by a minimal
// block that only carries the orientation, so photos are not displayed rotated.
// ---------------------------------------------------------------------------
function sanitizeJpeg(bytes: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientation: number | null = null;
  let offset = 2;
  let insertedExif = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new ImageRejectedError("Malformed JPEG");
    // Skip fill bytes
    while (bytes[offset + 1] === 0xff) offset++;
    const marker = bytes[offset + 1]!;

    if (marker === 0xd9) {
      out.push(bytes.subarray(offset, offset + 2));
      break;
    }
    // Standalone markers without a length
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    if (offset + 4 > bytes.length) throw new ImageRejectedError("Truncated JPEG");
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) throw new ImageRejectedError("Truncated JPEG");
    const segment = bytes.subarray(offset, end);
    const payload = bytes.subarray(offset + 4, end);

    if (marker === 0xda) {
      // Start of scan: everything after is entropy-coded image data.
      if (!insertedExif && orientation && orientation !== 1) {
        out.push(minimalExifSegment(orientation));
        insertedExif = true;
      }
      out.push(bytes.subarray(offset));
      break;
    }

    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (marker === 0xe1 && ascii(payload, 0, 6) === "Exif\0\0") {
      orientation ??= readExifOrientation(payload.subarray(6));
    }

    const keep =
      (!isApp && marker !== 0xfe) ||
      marker === 0xe0 ||
      marker === 0xee ||
      (marker === 0xe2 && ascii(payload, 0, 12) === "ICC_PROFILE\0");

    if (!isApp && !insertedExif && orientation && orientation !== 1) {
      // Place the minimal EXIF right after the leading APP segments.
      out.push(minimalExifSegment(orientation));
      insertedExif = true;
    }
    if (keep) out.push(segment);
    offset = end;
  }

  return concat(out);
}

function readExifOrientation(tiff: Uint8Array): number | null {
  if (tiff.length < 8) return null;
  const little = ascii(tiff, 0, 2) === "II";
  if (!little && ascii(tiff, 0, 2) !== "MM") return null;
  const u16 = (at: number) => (little ? tiff[at]! | (tiff[at + 1]! << 8) : (tiff[at]! << 8) | tiff[at + 1]!);
  const u32 = (at: number) =>
    little
      ? (tiff[at]! | (tiff[at + 1]! << 8) | (tiff[at + 2]! << 16) | (tiff[at + 3]! << 24)) >>> 0
      : ((tiff[at]! << 24) | (tiff[at + 1]! << 16) | (tiff[at + 2]! << 8) | tiff[at + 3]!) >>> 0;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** APP1 "Exif" segment whose IFD0 holds only the Orientation tag (big-endian TIFF). */
function minimalExifSegment(orientation: number): Uint8Array {
  const body = new Uint8Array([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // "MM", 42, IFD0 at offset 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation SHORT
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
  const length = body.length + 2;
  return concat([new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff]), body]);
}

// ---------------------------------------------------------------------------
// PNG: drop textual and EXIF/time chunks.
// ---------------------------------------------------------------------------
const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function sanitizePng(bytes: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new ImageRejectedError("Truncated PNG");
    const length = readU32BE(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new ImageRejectedError("Truncated PNG");
    if (!PNG_DROP.has(type)) out.push(bytes.subarray(offset, end));
    offset = end;
    if (type === "IEND") break;
  }
  return concat(out);
}

// ---------------------------------------------------------------------------
// WebP: drop EXIF and XMP chunks and clear their flags in VP8X.
// ---------------------------------------------------------------------------
function sanitizeWebp(bytes: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourcc = ascii(bytes, offset, 4);
    const size = readU32LE(bytes, offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (offset + 8 + size > bytes.length) throw new ImageRejectedError("Truncated WebP");
    if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      const chunk = bytes.slice(offset, Math.min(end, bytes.length));
      if (fourcc === "VP8X" && chunk.length > 8) chunk[8] = chunk[8]! & ~(0x08 | 0x04);
      chunks.push(chunk);
    }
    offset = end;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 4), 0);
  writeU32LE(header, 4, body.length + 4);
  header.set(bytes.subarray(8, 12), 8);
  return concat([header, body]);
}

// ---------------------------------------------------------------------------
function ascii(bytes: Uint8Array, start: number, length: number): string {
  let value = "";
  for (let index = start; index < start + length && index < bytes.length; index++) {
    value += String.fromCharCode(bytes[index]!);
  }
  return value;
}

function readU32BE(bytes: Uint8Array, at: number): number {
  return ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0;
}

function readU32LE(bytes: Uint8Array, at: number): number {
  return (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0;
}

function writeU32LE(bytes: Uint8Array, at: number, value: number): void {
  bytes[at] = value & 0xff;
  bytes[at + 1] = (value >>> 8) & 0xff;
  bytes[at + 2] = (value >>> 16) & 0xff;
  bytes[at + 3] = (value >>> 24) & 0xff;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
