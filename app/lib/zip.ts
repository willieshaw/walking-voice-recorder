// Minimal ZIP writer/reader for library backups — store-only (no compression; the audio
// inside is already compressed) and dependency-free, but a real .zip: Finder/Explorer and
// future tools can open an archive. Zip32 limits apply (4GB archive), plenty for a
// personal voice-note library.

const te = new TextEncoder();
const td = new TextDecoder();

/** CRC-32 (IEEE 802.3), table-based — the checksum every zip entry carries. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Build a store-only zip from named entries. */
export function writeZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = te.encode(e.name);
    const crc = crc32(e.data);

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); // local file header signature
    lh.setUint16(4, 20, true); // version needed
    lh.setUint16(6, 0x0800, true); // flags: UTF-8 names
    lh.setUint16(8, 0, true); // method: store
    lh.setUint32(14, crc, true);
    lh.setUint32(18, e.data.length, true); // compressed size (= raw, store)
    lh.setUint32(22, e.data.length, true); // uncompressed size
    lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, e.data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); // central directory signature
    cd.setUint16(4, 20, true); // version made by
    cd.setUint16(6, 20, true); // version needed
    cd.setUint16(8, 0x0800, true); // flags: UTF-8 names
    cd.setUint32(16, crc, true);
    cd.setUint32(20, e.data.length, true);
    cd.setUint32(24, e.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true); // local header offset
    central.push(new Uint8Array(cd.buffer), name);

    offset += 30 + name.length + e.data.length;
  }

  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); // end-of-central-directory signature
  eocd.setUint16(8, entries.length, true); // entries on this disk
  eocd.setUint16(10, entries.length, true); // entries total
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true); // central directory offset

  const out = new Uint8Array(new ArrayBuffer(offset + cdSize + 22));
  let at = 0;
  for (const p of [...parts, ...central, new Uint8Array(eocd.buffer)]) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Read a zip's entries as name -> bytes. Only store-method entries (i.e. our own
 *  archives) are supported — anything compressed fails loudly. */
export function readZip(buf: ArrayBuffer): Map<string, Uint8Array<ArrayBuffer>> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Find the end-of-central-directory record by scanning back from the end (a zip may
  // carry a trailing comment of up to 64KB).
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip archive.");

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array<ArrayBuffer>>();

  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("Corrupt zip directory.");
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const lho = view.getUint32(at + 42, true);
    const name = td.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    if (method !== 0) throw new Error(`"${name}" is compressed — not a Thoughts backup.`);

    // The local header's name/extra lengths can differ from the central directory's.
    const localNameLen = view.getUint16(lho + 26, true);
    const localExtraLen = view.getUint16(lho + 28, true);
    const start = lho + 30 + localNameLen + localExtraLen;
    out.set(name, bytes.subarray(start, start + size));

    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
