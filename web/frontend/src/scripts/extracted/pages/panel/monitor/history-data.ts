export const HISTORY_METRICS = ["cpu", "ram", "disk", "rx", "tx"] as const;
export type HistoryMetric = typeof HISTORY_METRICS[number];
export type MetricValues = Record<HistoryMetric, number>;

export interface HistorySnapshot {
  ts: number;
  cpu: { usagePercent: number };
  memory: { usagePercent: number };
  disk: { usagePercent: number };
  network: { rxBytesPerSec: number; txBytesPerSec: number };
}

export interface HistoryBucket {
  index: number;
  fromTs: number;
  toTs: number;
  sampleCount: number;
  average: MetricValues;
  maximum: MetricValues;
}

export interface HistoryChart<T extends HistorySnapshot> {
  fromTs: number;
  toTs: number;
  bucketMs: number;
  totalSamples: number;
  firstTs: number | null;
  lastTs: number | null;
  latestSnapshot: T | null;
  summary: Record<HistoryMetric, { latest: number; average: number; maximum: number }> | null;
  buckets: HistoryBucket[];
  peaks: Record<HistoryMetric, T[]>;
}

export interface HistoryPoint<T extends HistorySnapshot> {
  x: number;
  y: number | null;
  bucket?: HistoryBucket;
  snapshot?: T;
  peak?: boolean;
}

/** Join nearby observations despite minute-bin jitter. Longer outages still
 * break the line; no samples, averages or bucket metadata are synthesized. */
export function bucketPoints<T extends HistorySnapshot>(
  buckets: HistoryBucket[],
  fromTs: number,
  metric: HistoryMetric,
): HistoryPoint<T>[] {
  const points: HistoryPoint<T>[] = [];
  let previous: HistoryBucket | null = null;
  for (const bucket of buckets) {
    if (previous && bucket.index > previous.index + 1
      && bucket.fromTs - previous.fromTs > Math.max(180_000, (previous.toTs - previous.fromTs) * 1.5)) {
      points.push({ x: (previous.toTs - fromTs + 1) / 60_000, y: null });
    }
    points.push({
      x: ((bucket.fromTs + bucket.toTs) / 2 - fromTs) / 60_000,
      y: bucket.average[metric],
      bucket,
    });
    previous = bucket;
  }
  return points;
}

export function peakPoints<T extends HistorySnapshot>(
  snapshots: T[],
  fromTs: number,
  metric: HistoryMetric,
): HistoryPoint<T>[] {
  const pick = {
    cpu: (snapshot: T) => snapshot.cpu.usagePercent,
    ram: (snapshot: T) => snapshot.memory.usagePercent,
    disk: (snapshot: T) => snapshot.disk.usagePercent,
    rx: (snapshot: T) => snapshot.network.rxBytesPerSec,
    tx: (snapshot: T) => snapshot.network.txBytesPerSec,
  }[metric];
  return snapshots.map((snapshot) => ({
    x: (snapshot.ts - fromTs) / 60_000,
    y: pick(snapshot),
    snapshot,
    peak: true,
  }));
}

/** Keep both ends of the time window readable, even in a narrow drawer. */
export function historyTimeTicks(periodMinutes: number, canvasWidth: number, maxIntervals = 6): {value:number}[] {
  const intervals = Math.max(1, Math.min(maxIntervals, Math.floor((canvasWidth - 70) / 90)));
  return Array.from({length:intervals+1}, (_, index) => ({value:periodMinutes * index / intervals}));
}

export interface HistoryGap {
  fromTs: number;
  toTs: number;
  before: HistoryBucket | null;
  after: HistoryBucket | null;
}
/** Missing telemetry is annotation, never a fabricated resource measurement. */
export function historyGaps(buckets: HistoryBucket[], fromTs: number, toTs: number): HistoryGap[] {
  if (!buckets.length) return [{fromTs,toTs,before:null,after:null}];
  const threshold = Math.max(180_000, (buckets[0].toTs-buckets[0].fromTs)*1.5);
  const gaps: HistoryGap[] = [];
  if (buckets[0].fromTs-fromTs > threshold) gaps.push({fromTs,toTs:buckets[0].fromTs,before:null,after:buckets[0]});
  for(let i=1;i<buckets.length;i++){
    const before=buckets[i-1],after=buckets[i];
    if(after.index>before.index+1 && after.fromTs-before.fromTs>threshold)
      gaps.push({fromTs:before.toTs,toTs:after.fromTs,before,after});
  }
  const last=buckets[buckets.length-1];
  if(toTs-last.toTs > threshold) gaps.push({fromTs:last.toTs,toTs,before:last,after:null});
  return gaps;
}
