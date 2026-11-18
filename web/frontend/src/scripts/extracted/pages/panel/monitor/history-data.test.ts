import { describe, expect, it } from "vitest";
import { bucketPoints, peakPoints, historyTimeTicks, type HistoryBucket } from "./history-data";

const emptyMetrics = { cpu: 0, ram: 0, disk: 0, rx: 0, tx: 0 };
function bucket(index: number): HistoryBucket {
  return { index, fromTs: index * 60_000, toTs: (index + 1) * 60_000, sampleCount: 3,
    average: { ...emptyMetrics, cpu: index }, maximum: { ...emptyMetrics, cpu: index + 5 } };
}

describe("monitor chart points", () => {
  it("breaks the line across missing intervals while retaining bucket details", () => {
    const points = bucketPoints([bucket(0), bucket(1), bucket(5)], 0, "cpu");
    expect(points).toHaveLength(4);
    expect(points[2]?.y).toBeNull();
    expect(points[3]?.bucket?.index).toBe(5);
    expect(points[3]?.y).toBe(5);
  });

  it("keeps the source snapshot on a peak marker", () => {
    const snapshot = { ts: 120_000, cpu: { usagePercent: 91 }, memory: { usagePercent: 50 },
      disk: { usagePercent: 40 }, network: { rxBytesPerSec: 1, txBytesPerSec: 2 } };
    const points = peakPoints([snapshot], 0, "cpu");
    expect(points[0]).toMatchObject({ x: 2, y: 91, snapshot, peak: true });
  });
});

describe("history time axis", () => {
  it("reduces label density for narrow drawers while preserving the full range", () => {
    const wide = historyTimeTicks(60,1200);
    const narrow = historyTimeTicks(60,262);
    expect(wide).toHaveLength(7);
    expect(narrow).toHaveLength(3);
    expect(narrow.map(tick=>tick.value)).toEqual([0,30,60]);
  });
  it("keeps both endpoints even at very small widths and across seven days", () => {
    const ticks=historyTimeTicks(10080,150,7);
    expect(ticks).toEqual([{value:0},{value:10080}]);
  });
});

describe("history sampling continuity", () => {
  it("joins nearby real observations across minute-bin jitter without creating samples", () => {
    const input=[bucket(0),bucket(2),bucket(5)];
    const points=bucketPoints(input,0,"cpu");
    expect(points).toHaveLength(3);
    expect(points.map(p=>p.y)).toEqual([0,2,5]);
    expect(points.map(p=>p.bucket)).toEqual(input);
  });
  it("keeps a visible break across prolonged missing observations", () => {
    expect(bucketPoints([bucket(0),bucket(4)],0,"ram")[1].y).toBeNull();
  });
  it("does not bridge missing five-minute history buckets", () => {
    const input=[0,2].map(index=>({...bucket(index),fromTs:index*300000,toTs:(index+1)*300000}));
    expect(bucketPoints(input,0,"cpu")[1].y).toBeNull();
  });
});

it("describes seven- and seventeen-minute gaps without changing buckets", async () => {
  const {historyGaps}=await import('./history-data');
  const buckets=[bucket(0),bucket(8),bucket(26)];const before=JSON.stringify(buckets);
  const gaps=historyGaps(buckets,0,27*60000);
  expect(gaps.map(gap=>(gap.toTs-gap.fromTs)/60000)).toEqual([7,17]);
  expect(gaps[0]).toMatchObject({before:buckets[0],after:buckets[1]});
  expect(JSON.stringify(buckets)).toBe(before);
});
it("marks empty periods and boundary gaps without inventing anchors", async () => {
  const {historyGaps}=await import('./history-data');
  expect(historyGaps([],0,3600000)).toEqual([{fromTs:0,toTs:3600000,before:null,after:null}]);
  const gaps=historyGaps([bucket(10)],0,3600000);
  expect(gaps).toHaveLength(2);expect(gaps[0].before).toBeNull();expect(gaps[1].after).toBeNull();
  expect(historyGaps([bucket(0),bucket(2)],0,180000)).toHaveLength(0);
});
