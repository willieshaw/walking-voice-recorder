import { describe, expect, it } from "vitest";
import { crc32, readZip, writeZip } from "../app/lib/zip.js";

const te = new TextEncoder();
const td = new TextDecoder();

/** A guaranteed plain ArrayBuffer (TS types Uint8Array.buffer as ArrayBufferLike). */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u8.length);
  new Uint8Array(ab).set(u8);
  return ab;
}

describe("zip (backup archive format)", () => {
  it("round-trips text and binary entries byte-for-byte", () => {
    const audio = new Uint8Array(4096);
    for (let i = 0; i < audio.length; i++) audio[i] = (i * 37 + 11) & 0xff;
    const entries = [
      { name: "manifest.json", data: te.encode('{"format":"thoughts-backup"}') },
      { name: "audio/2026-07-16-note-a1b2", data: audio },
      { name: "audio/empty", data: new Uint8Array(0) },
    ];

    const files = readZip(toArrayBuffer(writeZip(entries)));

    expect([...files.keys()]).toEqual(entries.map((e) => e.name));
    expect(td.decode(files.get("manifest.json")!)).toBe('{"format":"thoughts-backup"}');
    expect([...files.get("audio/2026-07-16-note-a1b2")!]).toEqual([...audio]);
    expect(files.get("audio/empty")!.length).toBe(0);
  });

  it("rejects data that isn't a zip", () => {
    expect(() => readZip(toArrayBuffer(te.encode("not a zip at all")))).toThrow(/not a zip/i);
  });

  it("computes the standard CRC-32 check value", () => {
    // "123456789" -> 0xCBF43926 is the classic CRC-32 test vector.
    expect(crc32(te.encode("123456789"))).toBe(0xcbf43926);
  });
});
