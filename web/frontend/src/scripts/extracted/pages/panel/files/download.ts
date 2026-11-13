export type DownloadProgress = { received: number; total: number | null };

class DownloadError extends Error {
  constructor(message: string, readonly retryable = false) { super(message); }
}

type DownloadOptions = {
  headers: Record<string, string>;
  signal?: AbortSignal;
  onProgress: (progress: DownloadProgress) => void;
  idleTimeoutMs?: number;
  maxRetries?: number;
  onRetry?: () => void;
  parallel?: boolean;
};

type DownloadState = {
  parts: Blob[];
  received: number;
  total: number | null;
  etag?: string;
  type?: string;
  end?: number;
};

const PARALLEL_MIN_BYTES = 16 * 1024 * 1024;
const PARALLEL_STREAMS = 4;

/** Stream without a speed cap. Large, range-capable files can use four
 * continuous connections, all pinned to the same build by If-Range. */
export async function downloadFileBlob(
  url: string,
  options: DownloadOptions,
): Promise<Blob> {
  const state: DownloadState = { parts: [], received: 0, total: null };
  // A one-byte GET discovers range support without an extra full transfer on
  // SFTP targets whose HEAD handler would otherwise read the entire file.
  if (options.parallel) state.end = 0;
  await downloadState(url, options, state);
  if (!state.etag || state.total === null || state.received === state.total) return downloadBlob(state);
  if (!options.parallel || state.total < PARALLEL_MIN_BYTES) {
    state.end = undefined;
    await downloadState(url, options, state);
    return downloadBlob(state);
  }

  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const partSize = Math.ceil((state.total - state.received) / PARALLEL_STREAMS);
  const streams = Array.from({ length: PARALLEL_STREAMS }, (_, index) => {
    const start = state.received + index * partSize;
    return { start, state: {
      parts: [], received: start, end: Math.min(start + partSize - 1, state.total! - 1),
      total: state.total, etag: state.etag, type: state.type,
    } as DownloadState };
  });
  const onProgress = () => options.onProgress({
    received: state.received + streams.reduce((sum, stream) => sum + stream.state.received - stream.start, 0),
    total: state.total,
  });
  const work = streams.map(stream => downloadState(url, { ...options, signal: controller.signal, onProgress }, stream.state));
  try {
    await Promise.all(work);
    controller.signal.throwIfAborted();
    return new Blob([downloadBlob(state), ...streams.map(stream => downloadBlob(stream.state))], { type: state.type });
  } catch (error) {
    controller.abort(error);
    await Promise.allSettled(work);
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abort);
  }
}

function downloadBlob(state: DownloadState): Blob {
  return new Blob(state.parts, { type: state.type ?? "application/octet-stream" });
}

function isComplete(state: DownloadState): boolean {
  return state.received === (state.end === undefined ? state.total : Math.min(state.end + 1, state.total ?? Infinity));
}

async function downloadState(url: string, options: DownloadOptions, state: DownloadState): Promise<void> {
  let displayed = 0;
  let retries = 0;
  do {
    options.signal?.throwIfAborted();
    try {
      const ranged = await downloadStream(url, options, state, () => {
        displayed = Math.max(displayed, state.received);
        options.onProgress({ received: state.total === null ? displayed : Math.min(displayed, state.total), total: state.total });
      });
      if (!ranged || isComplete(state)) break;
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason;
      const retryable = error instanceof TypeError
        || (error instanceof DownloadError && error.retryable)
        || (error instanceof Error && error.name === "TimeoutError");
      if (!retryable) throw error;
      // A transport error after the last validated byte needs no extra request.
      if (state.etag && isComplete(state)) break;
      if (retries++ >= (options.maxRetries ?? 3)) throw error;
      // Without a strong range validator the response must restart in full.
      if (!state.etag) { state.parts = []; state.received = 0; state.total = null; }
      options.onRetry?.();
    }
  } while (true);
}

async function downloadStream(
  url: string,
  options: DownloadOptions,
  state: DownloadState,
  progress: () => void,
): Promise<boolean> {
  const start = state.received;
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  let timer: ReturnType<typeof setTimeout>;
  const resetTimeout = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new DOMException("Download stalled", "TimeoutError")), options.idleTimeoutMs ?? 60_000);
  };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let complete = false;
  try {
    resetTimeout();
    const headers = { ...options.headers, Range: `bytes=${start}-${state.end ?? ""}`, ...(state.etag ? { "If-Range": state.etag } : {}) };
    const response = await fetch(url, {
      credentials: "include",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    if (start === 0 && response.status === 416 && response.headers.get("content-range") === "bytes */0") {
      state.total = 0;
      progress();
      complete = true;
      return true;
    }
    if (!response.ok) throw new DownloadError(`Download HTTP ${response.status}`, response.status >= 500 || response.status === 408 || response.status === 429);
    if (!response.body) throw new DownloadError("Download has no body");
    const ranged = response.status === 206;
    let total: number | null;
    let expectedBytes: number | null;
    let etag: string | undefined;
    if (ranged) {
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
      etag = response.headers.get("etag") ?? undefined;
      if (!range || !etag || etag.startsWith("W/")) throw new DownloadError("Invalid download range validator");
      const first = Number(range[1]), last = Number(range[2]), size = Number(range[3]);
      if (![first, last, size].every(Number.isSafeInteger) || first !== start || last < first || last >= size || (state.end !== undefined && last > state.end)) throw new DownloadError("Invalid download range");
      if ((state.total !== null && state.total !== size) || (state.etag && state.etag !== etag)) throw new DownloadError("File changed during download");
      if (response.headers.has("content-encoding") && response.headers.get("content-encoding") !== "identity") throw new DownloadError("Encoded download range");
      total = size;
      expectedBytes = last - first + 1;
    } else {
      if (start > 0) throw new DownloadError("File changed during download");
      // Encoded Content-Length describes compressed bytes, not the decoded stream.
      const length = response.headers.get("content-encoding") ? NaN : Number(response.headers.get("content-length"));
      total = Number.isSafeInteger(length) && length > 0 ? length : null;
      expectedBytes = total;
    }
    state.total = total;
    state.etag = etag;
    state.type ??= response.headers.get("content-type") ?? "application/octet-stream";
    let received = 0;
    progress();
    reader = response.body.getReader();
    while (true) {
      resetTimeout();
      const { done, value } = await reader.read();
      // A cancelled reader may report EOF; never save the partial file.
      controller.signal.throwIfAborted();
      if (done) break;
      received += value.byteLength;
      if (expectedBytes !== null && received > expectedBytes) throw new DownloadError("Oversized download response");
      state.parts.push(new Blob([new Uint8Array(value)]));
      state.received += value.byteLength;
      progress();
    }
    if (expectedBytes !== null && received !== expectedBytes) throw new DownloadError("Incomplete download", true);
    complete = true;
    return ranged;
  } finally {
    clearTimeout(timer!);
    options.signal?.removeEventListener("abort", abort);
    if (!complete) {
      controller.abort();
      void reader?.cancel().catch(() => {});
    }
    reader?.releaseLock();
  }
}

/** Give the browser time to consume a large blob before revoking its URL. */
export function saveDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
