// SPDX-License-Identifier: AGPL-3.0-only
/** Shared by the React host and the lazy terminal controller; owns no session. */
export function ensureTerminalLoading(host: HTMLElement, label: string): HTMLElement {
  let overlay = host.querySelector<HTMLElement>(':scope > #lxp-terminal-loading');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lxp-terminal-loading';
    overlay.className = 'absolute inset-0 z-10 flex items-center justify-center bg-background/95 text-primary';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    const spinner = document.createElement('span');
    spinner.className = 'h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none';
    spinner.setAttribute('aria-hidden', 'true');
    const detail = document.createElement('span');
    detail.id = 'lxp-terminal-loading-detail';
    detail.className = 'sr-only';
    detail.textContent = label;
    overlay.append(spinner, detail);
    host.append(overlay);
  }
  return overlay;
}
export function setTerminalLoading(host: HTMLElement, busy: boolean, label: string): void {
  const overlay = ensureTerminalLoading(host, label);
  overlay.style.display = busy ? 'flex' : 'none';
  overlay.style.pointerEvents = busy ? 'auto' : 'none';
  overlay.setAttribute('aria-hidden', String(!busy));
  host.setAttribute('aria-busy', String(busy));
}
