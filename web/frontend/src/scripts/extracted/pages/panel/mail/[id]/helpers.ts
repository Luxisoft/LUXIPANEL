// Mailbox inbox viewer — pure, stateless helpers (folder-path math, folder-tree
// building, HTML escaping, address/byte formatting, timers). Imports only shared
// types from state; no DOM side effects, no siblings.
import type { MailFolder, FolderTreeNode } from "./state";

const PROTECTED_FOLDER_NAMES = new Set([
  "inbox",
  "sent",
  "trash",
  "junk",
  "spam",
  "cuarentena",
  "quarantine",
  "revisar-ia",
]);

export function normalizeFolderValue(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

export function isProtectedFolder(folder: MailFolder, all: MailFolder[] = []): boolean {
  const name = normalizeFolderValue(folder.name);
  const path = normalizeFolderValue(folder.path);
  const specialUse = normalizeFolderValue(folder.specialUse);
  return (
    folder.protected === true ||
    all.some(
      (child) => child.path.startsWith(folder.path + (folder.delimiter || "/")) && isProtectedFolder(child),
    ) ||
    PROTECTED_FOLDER_NAMES.has(normalizeFolderValue(folder.path.split(folder.delimiter || "/").pop())) ||
    (folder.flags || []).some((flag) =>
      ["\\inbox", "\\sent", "\\trash", "\\junk"].includes(normalizeFolderValue(flag)),
    ) ||
    PROTECTED_FOLDER_NAMES.has(name) ||
    PROTECTED_FOLDER_NAMES.has(path) ||
    specialUse === "\\inbox" ||
    specialUse === "\\sent" ||
    specialUse === "\\trash" ||
    specialUse === "\\junk"
  );
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function inferFolderDelimiter(folderPath: string, fallback = "/"): string {
  if (folderPath.includes("/")) return "/";
  if (folderPath.includes(".")) return ".";
  return fallback;
}

export function getLastPathSegment(path: string, delimiter: string): string {
  const idx = path.lastIndexOf(delimiter);
  return idx >= 0 ? path.slice(idx + delimiter.length) : path;
}

export function isDescendantPath(path: string, maybeAncestorPath: string): boolean {
  return (
    path === maybeAncestorPath ||
    path.startsWith(`${maybeAncestorPath}/`) ||
    path.startsWith(`${maybeAncestorPath}.`)
  );
}

export function buildFolderTree(list: MailFolder[]): {
  roots: FolderTreeNode[];
  map: Map<string, FolderTreeNode>;
} {
  const map = new Map<string, FolderTreeNode>();
  const roots: FolderTreeNode[] = [];

  const ensureNode = (path: string, delimiter: string): FolderTreeNode => {
    const existing = map.get(path);
    if (existing) return existing;

    const safeDelimiter = delimiter || inferFolderDelimiter(path, "/");
    const idx = path.lastIndexOf(safeDelimiter);
    const parentPath = idx > 0 ? path.slice(0, idx) : null;
    const node: FolderTreeNode = {
      path,
      label: getLastPathSegment(path, safeDelimiter),
      delimiter: safeDelimiter,
      folder: null,
      children: [],
      parentPath,
    };
    map.set(path, node);

    if (parentPath) {
      const parent = ensureNode(parentPath, safeDelimiter);
      if (!parent.children.some((child) => child.path === node.path)) {
        parent.children.push(node);
      }
    } else {
      roots.push(node);
    }
    return node;
  };

  for (const folder of list) {
    const delimiter = folder.delimiter || inferFolderDelimiter(folder.path, "/");
    const node = ensureNode(folder.path, delimiter);
    node.folder = folder;
    node.delimiter = delimiter;
    node.label = folder.name || node.label;
  }

  const sortNodes = (nodes: FolderTreeNode[]) => {
    nodes.sort((a, b) => {
      const priority=(node:FolderTreeNode)=>{
        const f=node.folder;
        const special=normalizeFolderValue(f?.specialUse);
        const leaf=normalizeFolderValue(f?.name||node.label);
        const path=normalizeFolderValue(node.path.split(node.delimiter||"/").pop());
        const matches=(names:string[],flag?:string)=>!!(flag&&(special===flag||(f?.flags||[]).some(v=>normalizeFolderValue(v)===flag)))||names.includes(leaf)||names.includes(path);
        if(matches(['inbox'],'\\inbox'))return 0;
        if(matches(['drafts','borradores'],'\\drafts'))return 1;
        if(matches(['sent','enviados'],'\\sent'))return 2;
        if(matches(['archive','archivo'],'\\archive'))return 3;
        if(matches(['trash','papelera'],'\\trash'))return 5;
        if(matches(['junk','spam'],'\\junk'))return 6;
        if(matches(['cuarentena','quarantine','revisar-ia']))return 7;
        return 4;
      };
      const rank=priority(a)-priority(b);if(rank)return rank;
      return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
    });
    for (const node of nodes) {
      if (node.children.length > 0) sortNodes(node.children);
    }
  };
  sortNodes(roots);

  return { roots, map };
}

export function flattenFolderTree(
  nodes: FolderTreeNode[],
  depth = 0,
  result: Array<{ node: FolderTreeNode; depth: number }> = [],
): Array<{ node: FolderTreeNode; depth: number }> {
  for (const node of nodes) {
    result.push({ node, depth });
    if (node.children.length > 0) {
      flattenFolderTree(node.children, depth + 1, result);
    }
  }
  return result;
}

export function formatAddress(addr: any): string {
  if (!addr) return "";
  if (typeof addr === "string") return addr;
  if (Array.isArray(addr)) return addr.map(formatAddress).join(", ");
  return addr.name ? `${addr.name} <${addr.address}>` : (addr.address ?? "");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
