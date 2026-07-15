// Waveform peak extraction: decode the note's audio blob once and downsample to a small
// bar array. The decoded buffer is dropped immediately — only ~300 floats are kept.
import type { CombinedSegment } from "@core/combine";

const cache = new Map<string, Float32Array>();

export async function getPeaks(
  noteId: string,
  audioUrl: string,
  buckets = 300,
): Promise<Float32Array> {
  const hit = cache.get(noteId);
  if (hit) return hit;

  const buf = await (await fetch(audioUrl)).arrayBuffer(); // works on blob: URLs
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const ch = audio.getChannelData(0);
    const per = Math.floor(ch.length / buckets) || 1;
    const peaks = new Float32Array(buckets);
    for (let b = 0; b < buckets; b++) {
      let max = 0;
      for (let i = b * per, end = Math.min(i + per, ch.length); i < end; i++) {
        const v = Math.abs(ch[i]);
        if (v > max) max = v;
      }
      peaks[b] = max;
    }
    // Normalize so the loudest bar always fills the height.
    let top = 1e-6;
    for (let b = 0; b < buckets; b++) if (peaks[b] > top) top = peaks[b];
    for (let b = 0; b < buckets; b++) peaks[b] /= top;

    cache.set(noteId, peaks);
    return peaks;
  } finally {
    void ctx.close();
  }
}

/** One waveform for a combined note: each source's peaks, allotted buckets in proportion to
 *  its duration and concatenated end-to-end so the bar row reads as one stitched timeline. */
export async function getCombinedPeaks(
  segments: CombinedSegment[],
  buckets: number,
): Promise<Float32Array> {
  const total = segments.reduce((sum, s) => sum + s.duration, 0) || 1;
  const parts = await Promise.all(
    segments.map((s) => {
      const share = Math.max(2, Math.round((buckets * s.duration) / total));
      return getPeaks(s.noteId, s.audioUrl, share);
    }),
  );
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
