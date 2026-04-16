import { describe, expect, it } from 'vitest';
import {
  isExifOrientation,
  orientFilters,
  readExifOrientation,
  type ExifOrientation,
} from '../src/utils/exif.js';

describe('isExifOrientation', () => {
  it('accepts integers 1..8', () => {
    for (let i = 1; i <= 8; i++) expect(isExifOrientation(i)).toBe(true);
    expect(isExifOrientation(0)).toBe(false);
    expect(isExifOrientation(9)).toBe(false);
    expect(isExifOrientation(1.5)).toBe(false);
  });
});

describe('orientFilters', () => {
  const expectations: Record<ExifOrientation, string[]> = {
    1: [],
    2: ['flip'],
    3: ['rotate90'],
    4: ['flip'],
    5: ['flip', 'rotate90'],
    6: ['rotate90'],
    7: ['flip', 'rotate90'],
    8: ['rotate90'],
  };

  for (const key of Object.keys(expectations)) {
    const o = Number(key) as ExifOrientation;
    const expected = expectations[o];
    it(`orientation ${o.toString()} produces filters [${expected.join(', ')}]`, () => {
      const filters = orientFilters(o);
      expect(filters.map((f) => f.name)).toEqual(expected);
    });
  }
});

describe('readExifOrientation', () => {
  it('returns 1 when buffer is too short or not a JPEG', async () => {
    expect(await readExifOrientation(new ArrayBuffer(0))).toBe(1);
    expect(await readExifOrientation(new ArrayBuffer(2))).toBe(1);
    const notJpeg = new Uint8Array([0xff, 0xd9, 0x00, 0x00]);
    expect(await readExifOrientation(notJpeg.buffer)).toBe(1);
  });

  it('parses orientation 6 from a synthetic JPEG header', async () => {
    expect(await readExifOrientation(buildJpegWithOrientation(6))).toBe(6);
    expect(await readExifOrientation(buildJpegWithOrientation(8))).toBe(8);
    expect(await readExifOrientation(buildJpegWithOrientation(1))).toBe(1);
  });
});

// Build the smallest valid JPEG SOI + APP1/EXIF segment carrying the
// Orientation tag, followed by EOI. Just enough bytes for readExifOrientation
// to walk the markers and return our value.
function buildJpegWithOrientation(orientation: number): ArrayBuffer {
  const tiff = new Uint8Array([
    0x49, 0x49, // little-endian
    0x2a, 0x00, // magic 42
    0x08, 0x00, 0x00, 0x00, // IFD0 offset = 8
    0x01, 0x00, // 1 entry
    0x12, 0x01, // tag 0x0112 (Orientation)
    0x03, 0x00, // type SHORT
    0x01, 0x00, 0x00, 0x00, // count 1
    orientation, 0x00, 0x00, 0x00, // value
    0x00, 0x00, 0x00, 0x00, // next IFD offset = 0
  ]);
  const exifHeader = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"
  const segData = new Uint8Array(exifHeader.length + tiff.length);
  segData.set(exifHeader, 0);
  segData.set(tiff, exifHeader.length);

  const segLen = segData.length + 2;
  const out = new Uint8Array(2 + 2 + 2 + segData.length + 2);
  let p = 0;
  out[p++] = 0xff;
  out[p++] = 0xd8; // SOI
  out[p++] = 0xff;
  out[p++] = 0xe1; // APP1
  out[p++] = (segLen >> 8) & 0xff;
  out[p++] = segLen & 0xff;
  out.set(segData, p);
  p += segData.length;
  out[p++] = 0xff;
  out[p++] = 0xd9; // EOI
  return out.buffer;
}
