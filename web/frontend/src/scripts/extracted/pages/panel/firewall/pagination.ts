import { pageWindowLabels } from "@/lib/page-window";

export const FIREWALL_PAGE_SIZE = 10;

export function listPage<T>(items: T[], index: number) {
  const pages = Math.max(1, Math.ceil(items.length / FIREWALL_PAGE_SIZE));
  const page = Math.max(0, Math.min(index, pages - 1));
  return { page, pages, items: items.slice(page * FIREWALL_PAGE_SIZE, (page + 1) * FIREWALL_PAGE_SIZE) };
}

export function renderPagination(host: HTMLElement | null, page: number, total: number, change: (page: number) => void) {
  if (!host) return;
  host.replaceChildren();
  host.className = total > FIREWALL_PAGE_SIZE
    ? "flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs" : "hidden";
  const doc = host.ownerDocument;
  const labels = pageWindowLabels(doc.documentElement.lang);
  const pages = Math.max(1, Math.ceil(total / FIREWALL_PAGE_SIZE));
  const previous = doc.createElement("button"), next = doc.createElement("button"), info = doc.createElement("span");
  for (const button of [previous, next]) {
    button.type = "button";
    button.className = "rounded-md border border-border px-3 py-1.5 hover:bg-accent disabled:opacity-40";
  }
  previous.textContent = labels.previous;
  next.textContent = labels.next;
  previous.disabled = page === 0;
  next.disabled = page >= pages - 1;
  previous.addEventListener("click", () => change(page - 1));
  next.addEventListener("click", () => change(page + 1));
  info.setAttribute("aria-live", "polite");
  info.textContent = `${labels.page} ${page + 1} / ${pages} · ${total}`;
  host.append(previous, info, next);
}
