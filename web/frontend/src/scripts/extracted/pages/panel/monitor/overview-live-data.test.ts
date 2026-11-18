import { describe, expect, it } from "vitest";
import { appendLiveSample, type LiveSample } from "./overview-live-data";
const snap = (ts: number) => ({ts,cpu:{usagePercent:0},memory:{usagePercent:70},network:{rxBytesPerSec:10,txBytesPerSec:20}});
describe("overview live window", () => {
  it("keeps measured zero and represents missing data as null", () => {
    expect(appendLiveSample([],snap(1000))[0]).toMatchObject({cpu:0,ram:70});
    expect(appendLiveSample([],{ts:1000,cpu:{usagePercent:NaN}})[0]).toMatchObject({cpu:null,ram:null,rx:null});
  });
  it("ignores duplicate, late and invalid samples", () => {
    const initial = appendLiveSample([],snap(1000));
    for (const ts of [1000,900,NaN,0]) expect(appendLiveSample(initial,snap(ts))).toBe(initial);
  });
  it("bounds memory and keeps only five minutes", () => {
    let samples: LiveSample[] = [];
    for(let i=1;i<=1000;i++) samples=appendLiveSample(samples,snap(i*1000));
    expect(samples.length).toBe(120);
    samples=appendLiveSample(samples,snap(2_000_000));
    expect(samples).toHaveLength(1);
  });
  it("breaks lines across a disconnected interval", () => {
    const samples=appendLiveSample(appendLiveSample([],snap(1000)),snap(50_000));
    expect(samples[1]).toMatchObject({cpu:null,ram:null,rx:null,tx:null});
    expect(samples[2].ts).toBe(50_000);
  });
});
