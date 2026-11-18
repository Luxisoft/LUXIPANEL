/** Mail's independent server selection. The panel's active bridge is preserved. */
import { api as panelApi, resolveTargetScope as panelTargetScope, scopeHeaders as panelScopeHeaders } from "/scripts/extracted/lib/api-client.js?v=20260506a";
import { getClientMessages } from "/scripts/extracted/lib/i18n-client.js";
export * from "/scripts/extracted/lib/api-client.js?v=20260506a";

const STORAGE_PREFIX = "lxp:mail:server:v1:";
// Already-open inboxes/composers keep their original server. A settings change
// in another workspace frame must never send their account ids to a new host.
const storageFallback = new Map<string, string>();
const pageSelections = new Map<string, string>();
let restoreGeneration = 0;
const restored = new Set<string>();
const restoring = new Map<string, Promise<void>>();
const selectionIdentity = () => `${panelTargetScope()}:${document.getElementById("messenger-link")?.getAttribute("data-me") ?? ""}`;
export async function ensureMailServerSelection(): Promise<void> {
  const identity = selectionIdentity();
  if (restored.has(identity)) return;
  const pending = restoring.get(identity);
  if (pending) return pending;
  const generation = restoreGeneration;
  const load = (async () => {
    const response = await panelApi.get<{selectedTargetId: string}>("/api/mail/server-settings", {fresh:true});
    if (generation !== restoreGeneration || identity !== selectionIdentity()) throw new Error("TARGET_SCOPE_CHANGED");
    if (!response.ok || typeof response.data?.selectedTargetId !== "string") throw new Error(response.error || "Could not restore mail server selection");
    saveMailServer(response.data.selectedTargetId);
  })();
  restoring.set(identity, load);
  try { await load; } finally { if (restoring.get(identity) === load) restoring.delete(identity); }
}
for (const event of ["luxipanel:logout", "luxipanel:session-ended", "lxp:session:ended"]) window.addEventListener(event, () => { restoreGeneration++; restored.clear(); restoring.clear(); pageSelections.clear(); storageFallback.clear(); });
function requestSelection(): string {
  const scope = selectionIdentity();
  if (!pageSelections.has(scope)) pageSelections.set(scope, selectedMailServer());
  return pageSelections.get(scope)!;
}
export function selectedMailServer(): string {
  const key = STORAGE_PREFIX + panelTargetScope();
  try { return sessionStorage.getItem(key)?.trim() ?? storageFallback.get(key) ?? ""; }
  catch { return storageFallback.get(key) ?? ""; }
}
export function saveMailServer(targetId: string): void {
  const key = STORAGE_PREFIX + panelTargetScope();
  storageFallback.set(key, targetId);
  try {
    if (targetId) sessionStorage.setItem(key, targetId);
    else sessionStorage.removeItem(key);
  } catch { /* The durable server preference still works without browser storage. */ }
  restored.add(selectionIdentity());
}
export function resolveTargetScope(): string {
  const selected = selectedMailServer();
  return selected ? `${panelTargetScope()}::mail:${selected}` : panelTargetScope();
}
export function scopeHeaders(mutating = false): Record<string, string> {
  const headers = panelScopeHeaders(mutating);
  const targetId = requestSelection();
  if (targetId) headers["X-Mail-Target-Id"] = targetId;
  return headers;
}
const isMailboxPath = (path: string) => /^\/api\/(?:accounts(?:\/|$)|mail(?:\/|$))/.test(path)
  && !/^\/api\/mail\/(?:server-settings|outbound)(?:\/|$)/.test(path);
type Options = Parameters<typeof panelApi.get>[1];
function optionsFor(path: string, mutating: boolean, body: unknown, options: Options = {}) {
  const headers = new Headers(panelScopeHeaders(mutating));
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const targetId = isMailboxPath(path) ? requestSelection() : "";
  if (targetId && isMailboxPath(path)) headers.set("X-Mail-Target-Id", targetId);
  else headers.delete("X-Mail-Target-Id");
  // The base client spreads options after its default headers. Supply the full
  // set so content-type, CSRF and the active per-tab bridge remain intact.
  return { ...options, headers: Object.fromEntries(headers.entries()) };
}
async function scoped<T>(path: string, run: () => Promise<T>): Promise<T> {
  const stale = async () => {
    let error: string | undefined;
    try {
      const messages = await getClientMessages(document.documentElement.lang, ["apiErrors"]);
      error = (messages.apiErrors as { targetScopeChanged?: string }).targetScopeChanged;
    } catch { /* caller retains its existing localized error fallback */ }
    return { ok: false, error, code: "TARGET_SCOPE_CHANGED", status: 409 } as T;
  };
  if (isMailboxPath(path) && !restored.has(selectionIdentity())) {
    try { await ensureMailServerSelection(); } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not restore mail server selection", status: 0 } as T;
    }
  }
  if (isMailboxPath(path) && requestSelection() !== selectedMailServer()) return stale();
  const scope = resolveTargetScope();
  const result = await run();
  if (isMailboxPath(path) && resolveTargetScope() !== scope) {
    return stale();
  }
  return result;
}
export const api = {
  get<T = unknown>(path: string, options?: Options) {
    return scoped(path, () => panelApi.get<T>(path, optionsFor(path, false, undefined, options)));
  },
  post<T = unknown>(path: string, body?: unknown, options?: Options) {
    return scoped(path, () => panelApi.post<T>(path, body, optionsFor(path, true, body, options)));
  },
  put<T = unknown>(path: string, body?: unknown, options?: Options) {
    return scoped(path, () => panelApi.put<T>(path, body, optionsFor(path, true, body, options)));
  },
  patch<T = unknown>(path: string, body?: unknown, options?: Options) {
    return scoped(path, () => panelApi.patch<T>(path, body, optionsFor(path, true, body, options)));
  },
  delete<T = unknown>(path: string, body?: unknown, options?: Options) {
    return scoped(path, () => panelApi.delete<T>(path, body, optionsFor(path, true, body, options)));
  },
};
