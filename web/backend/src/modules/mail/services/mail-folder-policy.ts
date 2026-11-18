// SPDX-License-Identifier: AGPL-3.0-only
export const QUARANTINE_FOLDER = "Cuarentena";
export const quarantineAliases = new Set(["cuarentena", "quarantine", "revisar-ia"]);
const names = new Set(["inbox", "sent", "trash", "junk", "spam", ...quarantineAliases]);
const specials = new Set(["\\inbox", "\\sent", "\\trash", "\\junk"]);
export type PolicyFolder = {
  path: string;
  name: string;
  delimiter?: string;
  specialUse?: string | null;
  flags?: Iterable<string>;
};
const key = (value: string | undefined | null) => (value || "").trim().toLowerCase();
export function folderLeaf(folder: PolicyFolder): string {
  return key(folder.path.split(folder.delimiter || "/").pop() || folder.name);
}
export function isProtectedFolder(folder: PolicyFolder): boolean {
  return (
    names.has(key(folder.name)) ||
    names.has(key(folder.path)) ||
    names.has(folderLeaf(folder)) ||
    specials.has(key(folder.specialUse)) ||
    [...(folder.flags || [])].some((flag) => specials.has(key(flag)))
  );
}
export function folderTreeProtected(folder: PolicyFolder, all: PolicyFolder[]): boolean {
  return (
    isProtectedFolder(folder) ||
    all.some(
      (child) => child.path.startsWith(folder.path + (folder.delimiter || "/")) && isProtectedFolder(child),
    )
  );
}
