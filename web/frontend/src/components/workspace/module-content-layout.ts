// SPDX-License-Identifier: AGPL-3.0-only
import { hasOwnModuleLayout } from "./module-presentation";
import { moduleElementVisible } from "./module-table-layout";
const excluded = (node: HTMLElement, root: HTMLElement) => !!node.closest('dialog,[data-lxp-module-settings],[data-view-settings-modal],[data-module-toolbar],[data-module-topbar-source],[data-module-topbar-source-row],[data-ai-footer-relocated]') || !moduleElementVisible(node, root);
export function isMixedModuleContent(root: HTMLElement, table: HTMLElement): boolean {
  // A field does not have to live in a <form>. Tracking, credentials and other
  // native panes keep their filters beside the report inside the same card.
  // Table-owned search/pagination and the mirrored header have separate layout.
  const outsideTable = (node: HTMLElement) => !excluded(node, root) && !table.contains(node) && !node.closest('[data-module-table],table,[data-data-table-toolbar],[data-table-pagination],[data-module-native-source-row],[data-module-topbar-region]');
  return [...root.querySelectorAll<HTMLElement>('form,textarea,input:not([type=hidden]),select,pre,article,[data-module-card],section.border,div.border')].some(node =>
    outsideTable(node) && !node.contains(table) && (node.matches('form,textarea,input,select') || !!node.textContent?.trim()));
}
/** Decorate existing semantic groups; never move controller or React-owned nodes. */
export function layoutModuleContent(root: HTMLElement, mode: "table" | "mixed" | "content") {
  if (hasOwnModuleLayout(root.dataset.internalModule) || !root.querySelector('[data-module-content-root]')) return;
  root.setAttribute('data-module-uniform-content', '');
  root.dataset.moduleLayout = mode;
  root.toggleAttribute('data-module-workspace', ['terminal','files','mail/[id]/inbox','codebase-graph','project-map','chat','module-dev/logs'].includes(root.dataset.internalModule ?? '') || !![...root.querySelectorAll<HTMLElement>('#panel-logs')].find(node => !excluded(node, root)));
  for (const node of root.querySelectorAll('[data-module-surface],[data-module-stack],[data-module-pane],[data-module-card-body],[data-module-content-frame]')) {
    node.removeAttribute('data-module-surface'); node.removeAttribute('data-module-stack'); node.removeAttribute('data-module-pane'); node.removeAttribute('data-module-card-body'); node.removeAttribute('data-module-content-frame');
  }
  if (mode === 'table') return;
  const content = root.querySelector<HTMLElement>('[data-module-content-root]')!;
  const panes = [...content.querySelectorAll<HTMLElement>('[role="tabpanel"],.tab-panel,[data-mail-main-panel],[data-module-section]')].filter(node => !excluded(node, root));
  const frames = panes.filter(node => !panes.some(other => other !== node && other.contains(node)));
  for (const pane of frames.length ? frames : [content]) {
    // A pane owns its card; ancestors shared with the hidden source tabs must
    // not add another inset, margin or border above it.
    for (let node = pane.parentElement; node && content.contains(node); node = node.parentElement) node.setAttribute('data-module-content-frame', '');
    pane.setAttribute('data-module-pane', '');
    const cards = [...pane.querySelectorAll<HTMLElement>('section,article,form,aside,div')].filter(node =>
      !excluded(node, root) && !node.matches('[role=alert],[role=status],[aria-live],[role=group],[role=tablist]') && !/(?:destructive|amber|red|emerald|orange)-/.test(node.className) && !node.closest('[data-module-table],[role=toolbar]') && !node.hasAttribute('data-module-table-path') &&
      (node.hasAttribute('data-module-card') || node.classList.contains('border') && /rounded/.test(node.className) || node.classList.contains('monitor-overview-card') || node.classList.contains('nginx-summary-card')));
    // A single existing outer card is the reference frame; otherwise the pane is.
    const anchors = [...pane.querySelectorAll<HTMLElement>('input:not([type=hidden]),select,textarea,button,table,[data-module-table],pre,canvas,p:not(:empty)')].filter(node => !excluded(node, root));
    const outer = cards.find(card => cards.every(other => card === other || card.contains(other)) && anchors.every(node => card.contains(node)));
    const frame = outer ?? pane;
    frame.dataset.moduleSurface = 'outer';
    for (const card of cards) if (card !== frame) card.dataset.moduleSurface = 'inner';
    // Bare forms and independent groups receive their own inner surface.
    for (const form of pane.querySelectorAll<HTMLElement>('form')) if (!excluded(form, root) && (!form.closest('[data-module-surface]') || form.closest('[data-module-surface]') === frame)) form.dataset.moduleSurface = 'inner';
    for (const node of pane.querySelectorAll<HTMLElement>('div,section,main,article')) if (!excluded(node, root) && !node.hasAttribute('data-module-surface') && node.closest('[data-module-surface]') && !node.closest('[data-module-table]') && !/(?:destructive|amber|red|emerald|orange)-/.test(node.className) && /(?:^|\s)p[xy]?-(?:4|5|6|8)(?:\s|$)/.test(node.className)) node.setAttribute('data-module-card-body', '');
    for (const node of [pane, ...pane.querySelectorAll<HTMLElement>('div,section,form,main,article')]) {
      if (excluded(node, root) || node.closest('[data-module-table]')) continue;
      if (node.hasAttribute('data-module-surface') || [...node.children].some(child => child.hasAttribute('data-module-surface')) || /\b(grid|space-y-(?:3|4|5|6|8|10|12))\b/.test(node.className)) { const style = getComputedStyle(node); node.dataset.moduleStack = style.display === 'grid' ? 'grid' : style.display === 'flex' && style.flexDirection === 'row' ? 'row' : 'column'; }
    }
  }
}
