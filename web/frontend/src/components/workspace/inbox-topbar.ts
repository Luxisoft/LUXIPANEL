// SPDX-License-Identifier: AGPL-3.0-only
import type { ControllerScope } from "./controller-scope";
export function mountInboxTopbar(scope: ControllerScope, labels: Record<string, string> = {}): () => void {
  if (scope.root.dataset.internalModule !== "mail/[id]/inbox") return () => {};
  const drawer = scope.root.closest<HTMLElement>(".lxp-workspace-quick-drawer");
  const uniform = !!drawer?.querySelector("[data-module-header-search-slot]");
  const slot = drawer?.querySelector<HTMLElement>(uniform ? "[data-module-header-controls-slot]" : "[data-module-header-tabs-slot]");
  if (!slot) return () => {};
  const owner = document.createElement("div");
  owner.className = "lxp-inbox-topbar";
  slot.append(owner);
  const release = scope.registerOwnedRoot(owner);
  const homes = new Map<HTMLElement, Comment>();
  const cleanupDetails: Array<() => void> = [];
  for (const kind of ["folders", "list", "reader"]) {
    const region = document.createElement("div");
    region.dataset.inboxHeaderRegion = kind;
    owner.append(region);
    const source = scope.root.querySelector<HTMLElement>(`[data-inbox-header="${kind}"]`);
    if (kind === "reader") {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "inbox-back-list";
      back.setAttribute("aria-label", "←");
      back.innerHTML = '<i class="ti ti-arrow-left"></i>';
      back.onclick = () => {
        const layout = scope.root.querySelector<HTMLElement>("[data-inbox-layout]");
        if (layout) layout.dataset.inboxPane = "list";
      };
      region.append(back);
    }
    if (source) {
      const home = document.createComment("inbox-header-home");
      source.before(home);
      homes.set(source, home);
      region.append(source);
      if (kind === "reader") {
        const details = document.createElement("details");
        details.className = "inbox-reader-details";
        const summary = document.createElement("summary");
        summary.setAttribute(
          "aria-label",
          source.querySelector("#msg-from")?.parentElement?.textContent?.trim() || "Info",
        );
        summary.innerHTML = '<i class="ti ti-info-circle"></i>';
        details.append(summary);
        const content = document.createElement("div");
        details.append(content);
        for (const node of [...source.children].slice(1)) {
          const home = document.createComment("inbox-details-home");
          node.before(home);
          homes.set(node as HTMLElement, home);
          content.append(node);
        }
        source.firstElementChild?.append(details);
        cleanupDetails.push(() => details.remove());
      }
    }
  }
  const actionsSlot = drawer?.querySelector<HTMLElement>("[data-module-header-actions-slot]");
  const actions = document.createElement("div");
  actions.className = "inbox-global-actions";
  actionsSlot?.append(actions);
  const releaseActions = scope.registerOwnedRoot(actions);
  const tools = document.createElement("div");
  tools.className = "inbox-tools-popover";
  tools.setAttribute("popover", "auto");
  tools.setAttribute("role", "dialog");
  tools.setAttribute("aria-label", labels.toolsLabel || "Herramientas");
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "lxp-workspace-header-action";
  trigger.title = labels.toolsLabel || "Herramientas";
  trigger.setAttribute("aria-label", trigger.title);
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = '<i class="ti ti-tool"></i><span></span>';
  trigger.querySelector("span")!.textContent = trigger.title;
  const styles = new Map<HTMLElement, string>();
  function move(node: HTMLElement | null, container: HTMLElement) {
    if (!node) return;
    const home = document.createComment("inbox-action-home");
    node.before(home);
    homes.set(node, home);
    styles.set(node, node.className);
    node.classList.add("inbox-tool-control");
    container.append(node);
  }
  const compose = scope.root.querySelector<HTMLElement>('a[href*="/mail/compose?from="]');
  if (compose) {
    move(compose, actions);
    compose.title = labels.btnCompose || "Redactar";
    compose.setAttribute("aria-label", compose.title);
    compose.classList.add("inbox-compose-action");
  }
  for (const selector of [
    "#btn-open-folders-manager",
    "#btn-open-contacts",
    "#btn-refresh",
    "#btn-mark-all-read",
  ]) {
    const node =
      owner.querySelector<HTMLElement>(selector) || scope.root.querySelector<HTMLElement>(selector);
    if (node) {
      move(node, tools);
      if (node.id !== "btn-open-folders-manager") {
        const label = document.createElement("span");
        label.dataset.inboxToolLabel = "";
        label.textContent = node.title;
        if (!node.querySelector("span")) node.append(label);
      }
    }
  }
  const filters =
    owner.querySelector<HTMLElement>(".inbox-advanced-filters") ||
    scope.root.querySelector<HTMLElement>(".inbox-advanced-filters");
  move(filters, tools);
  const regionOwners: HTMLElement[] = [];
  const regionReleases: Array<() => void> = [];
  if (uniform && drawer) {
    for (const [node, region] of [[scope.root.querySelector("#msg-search")?.parentElement || owner.querySelector("#msg-search")?.parentElement, "search"], [filters, "filters"]] as const) {
      const target = drawer.querySelector(`[data-module-header-${region}-slot]`);
      if (!node || !target) continue;
      const container = document.createElement("div");
      target.append(container); regionOwners.push(container);
      regionReleases.push(scope.registerOwnedRoot(container));
      if (!homes.has(node)) { const home = document.createComment("inbox-control-home"); node.before(home); homes.set(node, home); }
      container.append(node);
    }
  }
  if (filters) {
    const summary = filters.querySelector("summary");
    if (summary) {
      summary.setAttribute("aria-label", labels.filtersLabel || "Filtros");
      const text = document.createElement("span");
      text.dataset.inboxToolLabel = "";
      text.textContent = labels.filtersLabel || "Filtros";
      summary.append(text);
    }
  }
  const status = document.createElement("p");
  status.dataset.quarantineStatus = "";
  status.hidden = true;
  status.setAttribute("role", "status");
  tools.append(status);
  const toolsSlot = uniform ? drawer?.querySelector("[data-module-header-tools-slot]") : null;
  if (toolsSlot) {
    const toolsOwner = document.createElement("div");
    toolsSlot.append(toolsOwner); regionOwners.push(toolsOwner);
    regionReleases.push(scope.registerOwnedRoot(toolsOwner));
    toolsOwner.append(trigger, tools);
  } else actions.append(trigger, tools);
  const closeTools = () => {
    try {
      tools.hidePopover();
    } catch {}
    trigger.setAttribute("aria-expanded", "false");
  };
  trigger.onclick = () => {
    if (tools.matches(":popover-open")) {
      closeTools();
      return;
    }
    const rect = trigger.getBoundingClientRect();
    tools.style.left = Math.max(6, Math.min(rect.left, window.innerWidth - 300)) + "px";
    tools.style.top = rect.bottom + 6 + "px";
    tools.showPopover();
    trigger.setAttribute("aria-expanded", "true");
  };
  tools.addEventListener("toggle", () =>
    trigger.setAttribute("aria-expanded", String(tools.matches(":popover-open"))),
  );
  tools.addEventListener("click", (event) => {
    if ((event.target as Element).closest("button") && !filters?.contains(event.target as Node)) closeTools();
  });
  const footer = scope.root.querySelector<HTMLElement>("#folders-list")
    ?.nextElementSibling as HTMLElement | null;
  const footerHidden = footer?.hidden;
  if (footer && footer.children.length === 0) footer.hidden = true;
  // On narrow drawers keep message actions accessible in Tools without wrapping the header.
  const readerTools = document.createElement("div");
  readerTools.className = "inbox-reader-tools";
  tools.append(readerTools);
  const readerButtons = [
    ...owner.querySelectorAll<HTMLButtonElement>(
      '[data-inbox-header="reader"] > div:first-child > div > button',
    ),
  ];
  const readerHomes = new Map<HTMLButtonElement, Comment>();
  for (const button of readerButtons) {
    const home = document.createComment("inbox-reader-action-home");
    button.before(home);
    readerHomes.set(button, home);
    const label = document.createElement("span");
    label.className = "inbox-reader-tool-label";
    label.textContent = button.title;
    button.append(label);
  }
  const fitActions = () => {
    const compact =
      !!drawer && drawer.querySelector(".lxp-workspace-quick-sheet")!.getBoundingClientRect().width < 1100;
    for (const [button, home] of readerHomes) {
      if (compact) {
        if (button.parentElement !== readerTools) readerTools.append(button);
      } else if (home.parentNode && button.parentNode !== home.parentNode) {
        home.after(button);
      }
    }
    readerTools.hidden = !compact || !!scope.root.querySelector("#viewer-content.hidden");
  };
  const resizeObserver = new ResizeObserver(fitActions);
  if (drawer) resizeObserver.observe(drawer.querySelector(".lxp-workspace-quick-sheet")!);
  fitActions();
  const sync = () => {
    fitActions();
    owner.hidden = scope.root.hidden;
    actions.hidden = scope.root.hidden;
    if (scope.root.hidden) closeTools();
    const reader = owner.querySelector<HTMLElement>("[data-inbox-header-region=reader]");
    if (reader) reader.hidden = !!scope.root.querySelector("#viewer-content.hidden");
  };
  const observer = new MutationObserver(sync);
  observer.observe(scope.root, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden", "aria-hidden"],
  });
  sync();
  scope.document.addEventListener("lxp:module:visibility", sync);
  return () => {
    observer.disconnect();
    resizeObserver.disconnect();
    for (const [button, home] of readerHomes) {
      home.replaceWith(button);
      button.querySelector(".inbox-reader-tool-label")?.remove();
    }
    scope.document.removeEventListener("lxp:module:visibility", sync);
    closeTools();
    for (const [node, home] of homes) {
      home.replaceWith(node);
      if (styles.has(node)) node.className = styles.get(node)!;
      for (const label of node.querySelectorAll("[data-inbox-tool-label]")) label.remove();
    }
    if (footer) footer.hidden = footerHidden || false;
    for (const dispose of regionReleases) dispose();
    for (const container of regionOwners) container.remove();
    releaseActions();
    actions.remove();
    for (const cleanup of cleanupDetails) cleanup();
    release();
    owner.remove();
  };
}
