// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFileBlob, saveDownload } from "./download";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const options = () => ({ headers: { "X-Bridge-Session-Id": "target-a" }, onProgress: vi.fn(), idleTimeoutMs: 1000, maxRetries: 0 });

function streamingFetch() {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  let signal!: AbortSignal;
  const cancel = vi.fn();
  vi.stubGlobal("fetch", vi.fn((_url, init) => {
    signal = init.signal;
    const body = new ReadableStream<Uint8Array>({ start(c) { stream = c; }, cancel });
    signal.addEventListener("abort", () => stream.error(signal.reason), { once: true });
    return Promise.resolve(new Response(body));
  }));
  return { push: (bytes: number[]) => stream.enqueue(new Uint8Array(bytes)), end: () => stream.close(), cancel, signal: () => signal };
}

describe("file download over an unreliable connection", () => {
  it("keeps authentication and the pinned target, and reports received bytes", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Length": "3" } }));
    vi.stubGlobal("fetch", fetch);
    const opts = options();
    const blob = await downloadFileBlob("/panel/api/files/download?path=example", opts);
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(opts.onProgress).toHaveBeenLastCalledWith({ received: 3, total: 3 });
    expect(fetch).toHaveBeenCalledWith("/panel/api/files/download?path=example", expect.objectContaining({ headers: expect.objectContaining({ ...opts.headers, Range: "bytes=0-" }), credentials: "include", cache: "no-store" }));
  });

  it("times out when even the response headers stop arriving", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)))));
    const result = downloadFileBlob("/download", options());
    const check = expect(result).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(1001);
    await check;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out a stalled body without saving partial data", async () => {
    vi.useFakeTimers();
    const source = streamingFetch();
    const result = downloadFileBlob("/download", options());
    const check = expect(result).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(0);
    source.push([1, 2]);
    await vi.advanceTimersByTimeAsync(1001);
    await check;
    expect(source.signal().aborted).toBe(true);
  });

  it("allows a slow transfer lasting longer than the inactivity limit", async () => {
    vi.useFakeTimers();
    const source = streamingFetch();
    const result = downloadFileBlob("/download", options());
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(900);
      source.push([i]);
      await vi.advanceTimersByTimeAsync(0);
    }
    source.end();
    expect((await result).size).toBe(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts the pending read when the caller cancels or changes target", async () => {
    const source = streamingFetch();
    const controller = new AbortController();
    const result = downloadFileBlob("/download", { ...options(), signal: controller.signal });
    const check = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await check;
    expect(source.signal().aborted).toBe(true);
  });

  it("rejects a truncated response even if HTTP says 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("abc", { headers: { "Content-Length": "10" } })));
    await expect(downloadFileBlob("/download", options())).rejects.toThrow("Incomplete download");
  });

  it("does not compare compressed Content-Length to decoded bytes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("decoded", { headers: { "Content-Length": "2", "Content-Encoding": "gzip" } })));
    expect((await downloadFileBlob("/download", options())).size).toBe(7);
  });

  it("rejects an expired session instead of saving its error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })));
    await expect(downloadFileBlob("/download", options())).rejects.toThrow("401");
  });

  it("keeps a large download in one continuous response", async () => {
    const content = new Uint8Array(3 * 1024 * 1024 + 7);
    content.set([11, 22, 33], content.length - 3);
    const fetch = vi.fn().mockResolvedValue(new Response(content, {
      status: 206, headers: { "Content-Range": `bytes 0-${content.length - 1}/${content.length}`, ETag: '"build-1"' },
    }));
    vi.stubGlobal("fetch", fetch);
    const result = await downloadFileBlob("/download", options());
    expect(Buffer.from(await result.arrayBuffer()).equals(content)).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![1].headers.Range).toBe("bytes=0-");
  });

  it("resumes at the last received byte after a disconnected stream", async () => {
    const content = new Uint8Array(524288 + 7);
    content.set([11, 22, 33], 524286);
    let failed = false;
    const fetch = vi.fn((_url, init) => {
      const start = Number(/^bytes=(\d+)-$/.exec(init.headers.Range)![1]);
      if (start > 0 && !failed) { failed = true; return Promise.reject(new TypeError("network interrupted")); }
      let sent = false;
      const body = start > 0 ? content.slice(start) : new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent) controller.error(new TypeError("connection lost"));
          else { sent = true; controller.enqueue(content.slice(0, 524288)); }
        },
      });
      return Promise.resolve(new Response(body, {
        status: 206, headers: { "Content-Range": `bytes ${start}-${content.length - 1}/${content.length}`, ETag: '"build-1"', "Content-Type": "application/octet-stream" },
      }));
    });
    vi.stubGlobal("fetch", fetch);
    const opts = { ...options(), maxRetries: 2, onRetry: vi.fn() };
    const result = await downloadFileBlob("/download", opts);
    expect(Buffer.from(await result.arrayBuffer()).equals(content)).toBe(true);
    expect(fetch.mock.calls.map(call => call[1].headers.Range)).toEqual(["bytes=0-", "bytes=524288-", "bytes=524288-"]);
    expect(fetch.mock.calls[1]![1].headers["If-Range"]).toBe('"build-1"');
    expect(fetch.mock.calls.every(call => call[1].headers["X-Bridge-Session-Id"] === "target-a")).toBe(true);
    expect(opts.onProgress).toHaveBeenLastCalledWith({ received: content.length, total: content.length });
    expect(opts.onRetry).toHaveBeenCalledTimes(2);
  });

  it("preserves the received portion of a truncated range", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("ab", { status: 206, headers: { "Content-Range": "bytes 0-3/4", ETag: '"build-1"' } }))
      .mockResolvedValueOnce(new Response("cd", { status: 206, headers: { "Content-Range": "bytes 2-3/4", ETag: '"build-1"' } }));
    vi.stubGlobal("fetch", fetch);
    const blob = await downloadFileBlob("/download", { ...options(), maxRetries: 1 });
    expect(await blob.text()).toBe("abcd");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]![1].headers).toMatchObject({ Range: "bytes=2-", "If-Range": '"build-1"' });
  });

  it("restarts targets without range support without duplicating partial bytes", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("ab", { headers: { "Content-Length": "4" } }))
      .mockResolvedValueOnce(new Response("abcd", { headers: { "Content-Length": "4" } }));
    vi.stubGlobal("fetch", fetch);
    expect(await (await downloadFileBlob("/download", { ...options(), maxRetries: 1 })).text()).toBe("abcd");
    expect(fetch.mock.calls.map(call => call[1].headers.Range)).toEqual(["bytes=0-", "bytes=0-"]);
    expect(fetch.mock.calls[1]![1].headers["If-Range"]).toBeUndefined();
  });

  it.each([200, 206])("rejects a changed build when resuming (HTTP %s)", async status => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array(524288), { status: 206, headers: { "Content-Range": "bytes 0-524287/524289", ETag: '"build-1"' } }))
      .mockResolvedValueOnce(new Response("x", { status, headers: { "Content-Range": "bytes 524288-524288/524289", ETag: '"build-2"' } }));
    vi.stubGlobal("fetch", fetch);
    await expect(downloadFileBlob("/download", { ...options(), maxRetries: 3 })).rejects.toThrow("File changed");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects an unexpected range start", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("abcd", { status: 206, headers: { "Content-Range": "bytes 4-7/8", ETag: '"build-1"' } })));
    await expect(downloadFileBlob("/download", options())).rejects.toThrow("Invalid download range");
  });

  it.each([undefined, 'W/"build-1"'])("rejects ranges without a strong validator (%s)", async etag => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("abcd", {
      status: 206, headers: { "Content-Range": "bytes 0-3/4", ...(etag ? { ETag: etag } : {}) },
    })));
    await expect(downloadFileBlob("/download", options())).rejects.toThrow("Invalid download range validator");
  });

  it("does not save excess bytes from a malformed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("abcde", {
      status: 206, headers: { "Content-Range": "bytes 0-3/4", ETag: '"build-1"' },
    })));
    await expect(downloadFileBlob("/download", options())).rejects.toThrow("Oversized download response");
  });

  it("stops retrying repeated disconnects without returning a partial file", async () => {
    const fetch = vi.fn((_url, init) => {
      const start = Number(/^bytes=(\d+)-$/.exec(init.headers.Range)![1]);
      return Promise.resolve(new Response("a", { status: 206, headers: { "Content-Range": `bytes ${start}-9/10`, ETag: '"build-1"' } }));
    });
    vi.stubGlobal("fetch", fetch);
    await expect(downloadFileBlob("/download", { ...options(), maxRetries: 2 })).rejects.toThrow("Incomplete download");
    expect(fetch.mock.calls.map(call => call[1].headers.Range)).toEqual(["bytes=0-", "bytes=1-", "bytes=2-"]);
  });

  it("supports an empty file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 416, headers: { "Content-Range": "bytes */0" } })));
    expect((await downloadFileBlob("/download", options())).size).toBe(0);
  });

  it("keeps the blob URL alive while the browser starts saving a large file", () => {
    vi.useFakeTimers();
    const click = vi.fn(), remove = vi.fn();
    const anchor = { href: "", download: "", click, remove };
    vi.stubGlobal("document", { createElement: () => anchor, body: { appendChild: vi.fn() } });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:apk");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    saveDownload(new Blob(["apk"]), "app-debug.apk");
    expect(anchor.download).toBe("app-debug.apk");
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith("blob:apk");
  });
});

describe("parallel downloads", () => {
  const size = 16 * 1024 * 1024 + 17;
  const etag = '"parallel-build"';
  function bounds(init: RequestInit & { headers: Record<string, string> }, total = size) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(init.headers.Range)!;
    return { start: Number(match[1]), end: match[2] ? Number(match[2]) : total - 1 };
  }
  function ranged(body: BodyInit, start: number, end: number, total = size, validator = etag) {
    return new Response(body, { status: 206, headers: { "Content-Range": `bytes ${start}-${end}/${total}`, ETag: validator } });
  }

  it("assembles simultaneous streams in file order even when they finish in reverse order", async () => {
    const content = Uint8Array.from({ length: size }, (_, i) => (i * 17 + (i >>> 8)) & 255);
    const pending: (() => void)[] = [];
    const fetch = vi.fn((_url, init) => {
      const { start, end } = bounds(init);
      if (start === 0) return Promise.resolve(ranged(content.slice(0, 1), 0, 0));
      return new Promise<Response>(resolve => pending.push(() => resolve(ranged(content.slice(start, end + 1), start, end))));
    });
    vi.stubGlobal("fetch", fetch);
    const opts = { ...options(), parallel: true };
    const result = downloadFileBlob("/download", opts);
    await vi.waitFor(() => expect(pending).toHaveLength(4));
    for (const resolve of pending.reverse()) resolve();
    expect(Buffer.from(await (await result).arrayBuffer()).equals(content)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(fetch.mock.calls.slice(1).every(call => call[1].headers["If-Range"] === etag && call[1].headers["X-Bridge-Session-Id"] === "target-a")).toBe(true);
    const progress = opts.onProgress.mock.calls.map(([value]) => value.received);
    expect(progress.every((value, i) => i === 0 || value >= progress[i - 1]!)).toBe(true);
    expect(opts.onProgress).toHaveBeenLastCalledWith({ received: size, total: size });
  });

  it("retries only the missing bytes of the interrupted stream", async () => {
    const content = new Uint8Array(size).fill(29);
    let interrupted = false;
    const fetch = vi.fn((_url, init) => {
      const { start, end } = bounds(init);
      let body: BodyInit = content.slice(start, end + 1);
      if (start === 1 && !interrupted) {
        interrupted = true;
        let sent = false;
        body = new ReadableStream({ pull(controller) {
          if (sent) controller.error(new TypeError("connection lost"));
          else { sent = true; controller.enqueue(content.slice(start, start + 3)); }
        } });
      }
      return Promise.resolve(ranged(body, start, end));
    });
    vi.stubGlobal("fetch", fetch);
    const opts = { ...options(), parallel: true, maxRetries: 1, onRetry: vi.fn() };
    const blob = await downloadFileBlob("/download", opts);
    expect(Buffer.from(await blob.arrayBuffer()).equals(content)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(6);
    const first = bounds(fetch.mock.calls[1]![1]);
    expect(fetch.mock.calls.at(-1)![1].headers).toMatchObject({ Range: `bytes=4-${first.end}`, "If-Range": etag });
    expect(opts.onRetry).toHaveBeenCalledOnce();
  });

  it.each([200, 206])("cancels sibling streams when the file changes (HTTP %s)", async status => {
    const siblings: AbortSignal[] = [];
    const fetch = vi.fn((_url, init) => {
      const { start, end } = bounds(init);
      if (start === 0) return Promise.resolve(ranged("a", 0, 0));
      if (start === 1) return Promise.resolve(new Response("changed", { status, headers: { "Content-Range": `bytes ${start}-${end}/${size}`, ETag: '"new-build"' } }));
      siblings.push(init.signal);
      return Promise.resolve(ranged(new ReadableStream({ start(controller) {
        init.signal.addEventListener("abort", () => controller.error(init.signal.reason), { once: true });
      } }), start, end));
    });
    vi.stubGlobal("fetch", fetch);
    await expect(downloadFileBlob("/download", { ...options(), parallel: true })).rejects.toThrow("File changed");
    expect(siblings).toHaveLength(3);
    expect(siblings.every(signal => signal.aborted)).toBe(true);
  });

  it("cancels every stream when the caller changes target", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      const { start, end } = bounds(init);
      if (start === 0) return Promise.resolve(ranged("a", 0, 0));
      signals.push(init.signal);
      return Promise.resolve(ranged(new ReadableStream({ start(controller) {
        init.signal.addEventListener("abort", () => controller.error(init.signal.reason), { once: true });
      } }), start, end));
    }));
    const controller = new AbortController();
    const result = downloadFileBlob("/download", { ...options(), parallel: true, signal: controller.signal });
    const check = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(signals).toHaveLength(4));
    controller.abort();
    await check;
    expect(signals.every(signal => signal.aborted)).toBe(true);
  });

  it("keeps a single request when the target ignores Range", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("remote file", { headers: { "Content-Length": "11" } }));
    vi.stubGlobal("fetch", fetch);
    expect(await (await downloadFileBlob("/download", { ...options(), parallel: true })).text()).toBe("remote file");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("uses one remaining continuous stream for small files", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(ranged("a", 0, 0, 4)).mockResolvedValueOnce(ranged("bcd", 1, 3, 4));
    vi.stubGlobal("fetch", fetch);
    expect(await (await downloadFileBlob("/download", { ...options(), parallel: true })).text()).toBe("abcd");
    expect(fetch.mock.calls.map(call => call[1].headers.Range)).toEqual(["bytes=0-0", "bytes=1-"]);
  });
});
