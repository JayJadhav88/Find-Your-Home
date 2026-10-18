import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { detectImageType, ImageRejectedError, sanitizeImage } from "./image-sanitize";

const SECRET = "GPS-48.8584N-2.2945E-SERIAL-XYZ";

function pixels(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    data[index * 4] = (index * 7) % 256;
    data[index * 4 + 1] = (index * 13) % 256;
    data[index * 4 + 2] = (index * 29) % 256;
    data[index * 4 + 3] = 255;
  }
  return data;
}

function containsText(bytes: Uint8Array, text: string): boolean {
  return Buffer.from(bytes).includes(Buffer.from(text, "latin1"));
}

function segment(marker: number, payload: Buffer): Buffer {
  const length = payload.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker, length >> 8, length & 0xff]), payload]);
}

/** EXIF block (little-endian) with Orientation plus a fake text tag holding SECRET. */
function exifPayload(orientation: number): Buffer {
  const secret = Buffer.from(SECRET + "\0", "latin1");
  const ifd = Buffer.alloc(2 + 2 * 12 + 4);
  ifd.writeUInt16LE(2, 0);
  // Orientation (SHORT)
  ifd.writeUInt16LE(0x0112, 2);
  ifd.writeUInt16LE(3, 4);
  ifd.writeUInt32LE(1, 6);
  ifd.writeUInt16LE(orientation, 10);
  // ImageDescription (ASCII) pointing at SECRET
  ifd.writeUInt16LE(0x010e, 14);
  ifd.writeUInt16LE(2, 16);
  ifd.writeUInt32LE(secret.length, 18);
  ifd.writeUInt32LE(8 + ifd.length, 22);
  const tiff = Buffer.concat([Buffer.from("II*\0", "latin1"), Buffer.from([8, 0, 0, 0]), ifd, secret]);
  return Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
}

function jpegWithMetadata(orientation = 6): { original: Buffer; tainted: Buffer } {
  const original = jpeg.encode({ data: pixels(16, 8), width: 16, height: 8 }, 90).data;
  // Insert after SOI + APP0 (JFIF): APP1 EXIF, APP13 (Photoshop/IPTC), COM.
  const app0Length = (original[4]! << 8) | original[5]!;
  const split = 4 + app0Length;
  const tainted = Buffer.concat([
    original.subarray(0, split),
    segment(0xe1, exifPayload(orientation)),
    segment(0xed, Buffer.from("Photoshop 3.0\0" + SECRET, "latin1")),
    segment(0xfe, Buffer.from(SECRET, "latin1")),
    original.subarray(split),
  ]);
  return { original, tainted };
}

function crc32(bytes: Buffer): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])), 0);
  return Buffer.concat([header, data, crc]);
}

function readOrientation(bytes: Uint8Array): number | null {
  const buffer = Buffer.from(bytes);
  const at = buffer.indexOf(Buffer.from("Exif\0\0MM", "latin1"));
  if (at < 0) return null;
  return buffer.readUInt16BE(at + 6 + 8 + 2 + 8);
}

describe("detectImageType", () => {
  it("recognises formats by content", () => {
    expect(detectImageType(jpegWithMetadata().original)).toBe("image/jpeg");
    expect(detectImageType(PNG.sync.write(Object.assign(new PNG({ width: 1, height: 1 }), {})))).toBe("image/png");
    expect(detectImageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1"))).toBe("image/webp");
    expect(detectImageType(Buffer.from("<?php echo 1; ?>"))).toBeNull();
  });
});

describe("sanitizeImage", () => {
  it("rejects files that are not images", () => {
    expect(() => sanitizeImage(Buffer.from("MZ\x90\0 executable"), "image/jpeg")).toThrow(ImageRejectedError);
  });

  it("rejects a file whose content does not match the declared type", () => {
    expect(() => sanitizeImage(jpegWithMetadata().original, "image/png")).toThrow(/does not match/);
  });

  it("strips EXIF, IPTC and comments from JPEG without changing pixels", () => {
    const { original, tainted } = jpegWithMetadata(6);
    expect(containsText(tainted, SECRET)).toBe(true);

    const result = sanitizeImage(tainted, "image/jpeg");

    expect(result.type).toBe("image/jpeg");
    expect(containsText(result.bytes, SECRET)).toBe(false);
    expect(jpeg.decode(result.bytes).data).toEqual(jpeg.decode(original).data);
  });

  it("keeps the JPEG orientation so photos are not shown sideways", () => {
    const result = sanitizeImage(jpegWithMetadata(6).tainted, "image/jpeg");
    expect(readOrientation(result.bytes)).toBe(6);
  });

  it("adds no EXIF when orientation is already upright", () => {
    const result = sanitizeImage(jpegWithMetadata(1).tainted, "image/jpeg");
    expect(containsText(result.bytes, "Exif")).toBe(false);
  });

  it("strips text chunks from PNG without changing pixels", () => {
    const image = new PNG({ width: 8, height: 4 });
    pixels(8, 4).copy(image.data);
    const original = PNG.sync.write(image);
    // Insert a tEXt chunk right after IHDR (8-byte signature + 25-byte IHDR chunk).
    const tainted = Buffer.concat([
      original.subarray(0, 33),
      pngChunk("tEXt", Buffer.from("Comment\0" + SECRET, "latin1")),
      original.subarray(33),
    ]);

    const result = sanitizeImage(tainted, "image/png");

    expect(containsText(result.bytes, SECRET)).toBe(false);
    expect(PNG.sync.read(Buffer.from(result.bytes)).data).toEqual(PNG.sync.read(original).data);
  });

  it("strips EXIF/XMP chunks from WebP and fixes the container", () => {
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x08 | 0x04 | 0x10; // EXIF + XMP + alpha flags
    const imageData = Buffer.from([1, 2, 3, 4, 5, 6]);
    const chunk = (fourcc: string, data: Buffer) => {
      const header = Buffer.alloc(8);
      header.write(fourcc, 0, "latin1");
      header.writeUInt32LE(data.length, 4);
      return Buffer.concat([header, data, data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
    };
    const body = Buffer.concat([
      Buffer.from("WEBP", "latin1"),
      chunk("VP8X", vp8x),
      chunk("VP8L", imageData),
      chunk("EXIF", Buffer.from(SECRET, "latin1")),
      chunk("XMP ", Buffer.from(SECRET + "x", "latin1")),
    ]);
    const size = Buffer.alloc(4);
    size.writeUInt32LE(body.length, 0);
    const tainted = Buffer.concat([Buffer.from("RIFF", "latin1"), size, body]);

    const result = Buffer.from(sanitizeImage(tainted, "image/webp").bytes);

    expect(containsText(result, SECRET)).toBe(false);
    expect(result.readUInt32LE(4)).toBe(result.length - 8);
    expect(result[20]).toBe(0x10); // only the alpha flag remains
    expect(containsText(result, "VP8L")).toBe(true);
  });
});
