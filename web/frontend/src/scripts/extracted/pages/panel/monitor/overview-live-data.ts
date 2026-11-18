// SPDX-License-Identifier: AGPL-3.0-only
/** A bounded session window: repeated cached snapshots aren't new samples. */
export interface LiveSample { ts: number; cpu: number | null; ram: number | null; rx: number | null; tx: number | null }
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
export function appendLiveSample(samples: LiveSample[], snapshot: any): LiveSample[] {
  const ts = finite(snapshot?.ts);
  if (ts === null || ts <= 0 || (samples.length && ts <= samples[samples.length - 1].ts)) return samples;
  const next = samples.filter(sample => sample.ts >= ts - 300_000);
  const previous = next.at(-1);
  if (previous && ts - previous.ts > 30_000) next.push({ ts: previous.ts + 1, cpu:null, ram:null, rx:null, tx:null });
  next.push({ts, cpu:finite(snapshot.cpu?.usagePercent), ram:finite(snapshot.memory?.usagePercent), rx:finite(snapshot.network?.rxBytesPerSec), tx:finite(snapshot.network?.txBytesPerSec)});
  return next.slice(-120);
}
