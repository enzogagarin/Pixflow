/**
 * Minimal ZIP writer using the STORE method (no compression). Produces a
 * standards-compliant archive that every OS and unzip tool accepts. Small
 * enough to live in the demo rather than pulling in jszip.
 */

interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
  readonly crc32: number;
}

export async function buildZip(
  files: readonly { name: string; blob: Blob }[],
): Promise<Blob> {
  const entries: ZipEntry[] = [];
  for (const f of files) {
    const buffer = new Uint8Array(await f.blob.arrayBuffer());
    entries.push({ name: f.name, data: buffer, crc32: crc32(buffer) });
  }

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); // local file header signature
    dv.setUint16(4, 20, true); // version needed
    dv.setUint16(6, 0, true); // flags
    dv.setUint16(8, 0, true); // compression = store
    dv.setUint16(10, 0, true); // mod time
    dv.setUint16(12, 0, true); // mod date
    dv.setUint32(14, entry.crc32, true);
    dv.setUint32(18, entry.data.length, true); // compressed size
    dv.setUint32(22, entry.data.length, true); // uncompressed size
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    chunks.push(local, entry.data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true); // flags
    cv.setUint16(10, 0, true); // compression
    cv.setUint16(12, 0, true); // mod time
    cv.setUint16(14, 0, true); // mod date
    cv.setUint32(16, entry.crc32, true);
    cv.setUint32(20, entry.data.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra field length
    cv.setUint16(32, 0, true); // comment length
    cv.setUint16(34, 0, true); // disk start
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralDir.push(central);

    offset += local.length + entry.data.length;
  }

  const centralSize = centralDir.reduce((n, c) => n + c.length, 0);
  const centralStart = offset;
  for (const c of centralDir) chunks.push(c);

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central dir signature
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  ev.setUint16(20, 0, true);
  chunks.push(end);

  return new Blob(chunks as BlobPart[], { type: 'application/zip' });
}

let CRC_TABLE: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!CRC_TABLE) {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    CRC_TABLE = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
