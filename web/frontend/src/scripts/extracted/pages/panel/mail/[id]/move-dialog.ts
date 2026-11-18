import { buildFolderTree, flattenFolderTree } from './helpers';
import type { MailFolder } from './state';

type Target = { uid: number; folder: string; account: string; subject: string };
type Options = {
  folders(): MailFolder[];
  currentFolder(): string;
  copy(key: string): string;
  move(target: Target, destination: string): Promise<{ ok: boolean; error?: string }>;
  success(target: Target): void;
};
/** Each mounted mailbox owns its selection, request generation and controls. */
export function createMoveDialog(doc: Document, options: Options) {
  const dialog = doc.getElementById('dlg-move') as HTMLDialogElement | null;
  let target: Target | null = null, destination = '', busy = false, generation = 0;
  const get = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  const confirm = get<HTMLButtonElement>('move-confirm');
  const search = get<HTMLInputElement>('move-search');
  const error = get<HTMLElement>('move-error');
  function buttons() {
    for (const id of ['move-close', 'move-cancel']) get<HTMLButtonElement>(id).disabled = busy;
    confirm.disabled = busy || !destination;
    confirm.textContent = options.copy(busy ? 'moving' : 'confirm');
    dialog?.setAttribute('aria-busy', String(busy));
    search.disabled = busy;
  }
  function render() {
    const list = get<HTMLElement>('move-folders-list');
    list.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase();
    for (const { node, depth } of flattenFolderTree(buildFolderTree(options.folders()).roots)) {
      const folder = node.folder;
      if (!folder || folder.path === target?.folder || !`${folder.name} ${folder.path}`.toLocaleLowerCase().includes(query)) continue;
      const row = doc.createElement('button');
      row.type = 'button'; row.className = 'lxp-aux-folder';
      row.setAttribute('role', 'radio'); row.setAttribute('aria-checked', String(destination === folder.path));
      row.disabled = busy || (folder.flags || []).some(flag => flag.toLowerCase() === '\\noselect');
      row.style.paddingInlineStart = `${12 + depth * 16}px`;
      const icon = doc.createElement('i'); icon.className = 'ti ti-folder'; icon.setAttribute('aria-hidden', 'true');
      const label = doc.createElement('span'); label.className = 'min-w-0 flex-1 text-start';
      const name = doc.createElement('span'); name.className = 'block text-sm font-medium'; name.textContent = folder.name;
      const path = doc.createElement('span'); path.className = 'block text-xs text-muted-foreground break-all'; path.textContent = folder.path;
      label.append(name, path);
      const check = doc.createElement('i'); check.className = destination === folder.path ? 'ti ti-circle-check-filled text-primary' : 'ti ti-circle text-muted-foreground'; check.setAttribute('aria-hidden', 'true');
      row.append(icon, label, check);
      row.onclick = () => { destination = folder.path; error.hidden = true; render(); buttons();
        const selected = list.querySelector<HTMLButtonElement>('[aria-checked="true"]'); selected?.focus(); };
      list.append(row);
    }
    if (!list.children.length) { const empty = doc.createElement('p'); empty.className = 'p-6 text-center text-sm text-muted-foreground'; empty.textContent = options.copy('empty'); list.append(empty); }
  }
  function reset() { generation++; target = null; destination = ''; busy = false; }
  function dismiss() { if (busy) return; reset(); dialog?.close(); }
  dialog?.addEventListener('cancel', event => { if (busy) event.preventDefault(); else reset(); });
  dialog?.addEventListener('close', reset);
  const hidden = () => { if (doc.hidden) { reset(); dialog?.close(); } };
  doc.addEventListener('visibilitychange', hidden);
  doc.addEventListener('lxp:module:visibility', hidden);
  doc.addEventListener('lxp:module:dispose', () => { reset(); dialog?.close(); });
  get('move-close')?.addEventListener('click', dismiss);
  get('move-cancel')?.addEventListener('click', dismiss);
  search?.addEventListener('input', render);
  get('move-folders-list')?.addEventListener('keydown', event => {
    const key = (event as KeyboardEvent).key;
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
    const rows = [...get('move-folders-list').querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (!rows.length) return;
    event.preventDefault();
    const current = rows.indexOf(event.target as HTMLButtonElement);
    const index = key === 'Home' ? 0 : key === 'End' ? rows.length - 1 : (current + (key === 'ArrowUp' ? -1 : 1) + rows.length) % rows.length;
    rows[index].click();
  });
  confirm?.addEventListener('click', async () => {
    const captured = target;
    if (!captured || busy || !destination || options.currentFolder() !== captured.folder || doc.hidden) return;
    const folder = options.folders().find(folder => folder.path === destination);
    if (!folder || folder.path === captured.folder || folder.flags?.some(flag => flag.toLowerCase() === '\\noselect')) return;
    const token = generation;
    busy = true; error.hidden = true; buttons(); render();
    try {
      const result = await options.move(captured, destination);
      if (token !== generation || doc.hidden) return;
      if (!result.ok) throw new Error(result.error || options.copy('error'));
      busy = false; dialog?.close(); options.success(captured);
    } catch (failure) {
      if (token !== generation || doc.hidden) return;
      busy = false; error.textContent = failure instanceof Error ? failure.message : options.copy('error'); error.hidden = false;
      buttons(); render();
    }
  });
  return { open(next: Target) {
    if (!dialog || busy) return;
    reset(); target = next; search.value = ''; error.hidden = true;
    get('move-account').textContent = next.account;
    get('move-subject').textContent = next.subject;
    get('move-origin').textContent = `${options.copy('origin')}: ${next.folder}`;
    render(); buttons(); if (!dialog.open) dialog.showModal(); search.focus();
  } };
}
