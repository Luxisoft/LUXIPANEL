// SPDX-License-Identifier: AGPL-3.0-only
/** Files and Terminal own their header, workspace and responsive controls. */
export function hasOwnModuleLayout(key: string | null | undefined): boolean {
  return ['files', 'terminal'].includes(key?.split(':')[0] ?? '');
}
