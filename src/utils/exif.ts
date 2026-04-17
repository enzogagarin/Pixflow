import { ErrorCode, PixflowError } from '../errors.js';
import { FlipFilter } from '../filters/flip.js';
import { Rotate90Filter } from '../filters/rotate90.js';
import type { Filter } from '../types.js';

/**
 * EXIF orientation values per the TIFF/EXIF spec:
 *
 *   1 = top-left (normal)
 *   2 = top-right (mirror horizontal)
 *   3 = bottom-right (rotate 180)
 *   4 = bottom-left (mirror vertical)
 *   5 = left-top (mirror horizontal + rotate 90 CW)
 *   6 = right-top (rotate 90 CW)
 *   7 = right-bottom (mirror horizontal + rotate 270 CW)
 *   8 = left-bottom (rotate 270 CW)
 */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export function isExifOrientation(value: number): value is ExifOrientation {
  return Number.isInteger(value) && value >= 1 && value <= 8;
}

/** Convert an EXIF orientation value into a sequence of pixflow filters. */
export function orientFilters(orientation: ExifOrientation): Filter[] {
  switch (orientation) {
    case 1:
      return [];
    case 2:
      return [new FlipFilter({ axis: 'h' })];
    case 3:
      return [new Rotate90Filter({ turns: 2 })];
    case 4:
      return [new FlipFilter({ axis: 'v' })];
    case 5:
      return [new FlipFilter({ axis: 'h' }), new Rotate90Filter({ turns: 1 })];
    case 6:
      return [new Rotate90Filter({ turns: 1 })];
    case 7:
      return [new FlipFilter({ axis: 'h' }), new Rotate90Filter({ turns: 3 })];
    case 8:
      return [new Rotate90Filter({ turns: 3 })];
  }
}

/**
 * Minimal EXIF orientation reader for JPEG sources. Returns 1 (normal) when
 * EXIF data is missing or unreadable, so callers don't need to special-case
 * non-JPEG inputs. Throws PixflowError only for truly malformed JPEG markers.
 */
export async function readExifOrientation(source: Blob | ArrayBuffer): Promise<ExifOrientation> {
  const buffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
  const view = new DataView(buffer);

  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
    return 1;
  }

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    if ((marker & 0xff00) !== 0xff00) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `Malformed JPEG marker at offset ${offset.toString()}.`,
      );
    }
    if (marker === 0xffda || marker === 0xffd9) {
      // Start of scan or end of image — no more metadata.
      return 1;
    }
    const segLen = view.getUint16(offset + 2, false);
    if (segLen < 2 || offset + 2 + segLen > view.byteLength) return 1;

    if (marker === 0xffe1) {
      // APP1: may contain EXIF
      const exifHeader = offset + 4;
      if (
        exifHeader + 6 <= view.byteLength &&
        view.getUint32(exifHeader, false) === 0x45786966 && // "Exif"
        view.getUint16(exifHeader + 4, false) === 0x0000
      ) {
        const tiffStart = exifHeader + 6;
        const orient = parseTiffForOrientation(view, tiffStart, offset + 2 + segLen);
        if (orient !== null && isExifOrientation(orient)) return orient;
      }
    }
    offset += 2 + segLen;
  }
  return 1;
}

function parseTiffForOrientation(
  view: DataView,
  tiffStart: number,
  segmentEnd: number,
): number | null {
  if (tiffStart + 8 > segmentEnd) return null;
  const byteOrder = view.getUint16(tiffStart, false);
  let little: boolean;
  if (byteOrder === 0x4949) little = true;
  else if (byteOrder === 0x4d4d) little = false;
  else return null;

  if (view.getUint16(tiffStart + 2, little) !== 0x002a) return null;
  const ifd0Offset = view.getUint32(tiffStart + 4, little);
  const ifdStart = tiffStart + ifd0Offset;
  if (ifdStart + 2 > segmentEnd) return null;

  const entryCount = view.getUint16(ifdStart, little);
  for (let i = 0; i < entryCount; i++) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > segmentEnd) return null;
    const tag = view.getUint16(entry, little);
    if (tag === 0x0112) {
      const type = view.getUint16(entry + 2, little);
      // Orientation is type SHORT (3)
      if (type === 3) {
        return view.getUint16(entry + 8, little);
      }
    }
  }
  return null;
}
