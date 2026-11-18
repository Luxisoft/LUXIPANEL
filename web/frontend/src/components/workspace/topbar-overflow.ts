// SPDX-License-Identifier: AGPL-3.0-only
/** Reserve the overflow trigger only when necessary; keep every item that fits. */
export function fitTopbarItems(widths: number[], available: number, gap: number, trigger: number): Set<number> {
  if (widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1) <= available + 1) return new Set(widths.map((_, i) => i));
  let used = trigger;
  const visible = new Set<number>();
  widths.forEach((width, index) => {
    if (used + gap + width <= available + 1) { visible.add(index); used += gap + width; }
  });
  return visible;
}
