'use client';

import { useCallback, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from 'react';
import { mediaApi } from '@/lib/api/endpoints';
import type { GalleryItem } from '@/lib/domain/media';

/**
 * Drag to reorder, drag a box to select, and pick several photos at once — for the hotel and
 * room galleries. Plain HTML5 drag-and-drop and pointer events, no library.
 *
 * - Drag a photo onto another to move it there; dragging a selected photo moves the whole
 *   selection as a block, in its current order.
 * - Drag on the empty space of the grid to draw a box; every photo it touches is selected
 *   (hold Ctrl/⌘ or Shift to add to the selection).
 * - Click a photo's checkbox to toggle it; Shift-click selects the range from the last one.
 *
 * Tiles mark themselves with `data-arrange-id`; the grid takes `containerProps`.
 */

/**
 * Writes a new gallery order: each placement whose position changed gets its new index.
 * `setOrder` takes an absolute position, so the writes are independent of each other.
 */
export async function persistOrder(items: readonly GalleryItem[], next: readonly string[]): Promise<void> {
  const byLink = new Map(items.map((item) => [item.link.id, item]));
  const before = items.map((item) => item.link.id);
  for (let index = 0; index < next.length; index += 1) {
    const id = next[index] as string;
    const item = byLink.get(id);
    if (item && before[index] !== id) await mediaApi.setOrder(item.asset.id, item.link.id, index);
  }
}

/** Moves `moving` (kept in their current order) before or after `target`. Pure, for tests. */
export function moveBlock(ids: readonly string[], moving: readonly string[], target: string, after: boolean): string[] {
  const movingSet = new Set(moving);
  if (movingSet.has(target)) return [...ids];
  const block = ids.filter((id) => movingSet.has(id));
  const rest = ids.filter((id) => !movingSet.has(id));
  const at = rest.indexOf(target);
  if (at < 0) return [...ids];
  const insert = after ? at + 1 : at;
  return [...rest.slice(0, insert), ...block, ...rest.slice(insert)];
}

export interface MarqueeBox { readonly left: number; readonly top: number; readonly width: number; readonly height: number }

export function useGalleryArrange({
  ids,
  canReorder,
  onReorder,
}: {
  readonly ids: readonly string[];
  /** False while filtered or busy: dragging then only selects. */
  readonly canReorder: boolean;
  readonly onReorder: (next: readonly string[]) => void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dragging, setDragging] = useState<readonly string[]>([]);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const [box, setBox] = useState<MarqueeBox | null>(null);
  const anchor = useRef<string | null>(null);
  const container = useRef<HTMLElement | null>(null);
  const marquee = useRef<{ x: number; y: number; base: ReadonlySet<string> } | null>(null);

  // Only photos still in the gallery count (one may have been removed or filtered away).
  const visible = new Set(ids);

  const toggle = useCallback((id: string, event?: MouseEvent) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (event?.shiftKey && anchor.current && ids.includes(anchor.current)) {
        const from = ids.indexOf(anchor.current), to = ids.indexOf(id);
        ids.slice(Math.min(from, to), Math.max(from, to) + 1).forEach((value) => next.add(value));
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    anchor.current = id;
  }, [ids]);

  const clear = useCallback(() => setSelected(new Set()), []);
  const selectAll = useCallback(() => setSelected(new Set(ids)), [ids]);

  function itemProps(id: string) {
    return {
      'data-arrange-id': id,
      'data-selected': selected.has(id) || undefined,
      'data-dragging': dragging.includes(id) || undefined,
      'data-drop': drop?.id === id ? (drop.after ? 'after' : 'before') : undefined,
      draggable: canReorder,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        if (!canReorder) return;
        // ids holds only visible photos, so a hidden selection never travels with the drag.
        const block = selected.has(id) ? ids.filter((value) => selected.has(value)) : [id];
        setDragging(block);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', block.join(','));
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!canReorder || dragging.length === 0) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const after = event.clientX > rect.left + rect.width / 2;
        if (drop?.id !== id || drop.after !== after) setDrop({ id, after });
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        if (canReorder && dragging.length && drop) {
          const next = moveBlock(ids, dragging, drop.id, drop.after);
          if (next.some((value, index) => value !== ids[index])) onReorder(next);
        }
        setDragging([]); setDrop(null);
      },
      onDragEnd: () => { setDragging([]); setDrop(null); },
    };
  }

  /** Box selection: starts only on the grid's empty space, never on a photo or a control. */
  const containerProps = {
    ref: (element: HTMLElement | null) => { container.current = element; },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest('[data-arrange-id], button, input, select, a, label')) return;
      const additive = event.ctrlKey || event.metaKey || event.shiftKey;
      marquee.current = { x: event.clientX, y: event.clientY, base: additive ? new Set(selected) : new Set() };
      if (!additive) setSelected(new Set());
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const start = marquee.current;
      const host = container.current;
      if (!start || !host) return;
      const left = Math.min(start.x, event.clientX), top = Math.min(start.y, event.clientY);
      const right = Math.max(start.x, event.clientX), bottom = Math.max(start.y, event.clientY);
      if (right - left < 4 && bottom - top < 4) return;
      const origin = host.getBoundingClientRect();
      setBox({ left: left - origin.left, top: top - origin.top, width: right - left, height: bottom - top });
      const hit = new Set(start.base);
      host.querySelectorAll<HTMLElement>('[data-arrange-id]').forEach((tile) => {
        const r = tile.getBoundingClientRect();
        if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) hit.add(tile.dataset.arrangeId as string);
      });
      setSelected(hit);
    },
    onPointerUp: () => { marquee.current = null; setBox(null); },
    onPointerCancel: () => { marquee.current = null; setBox(null); },
  };

  return {
    selected: [...selected].filter((id) => visible.has(id)),
    isSelected: (id: string) => selected.has(id) && visible.has(id),
    toggle,
    clear,
    selectAll,
    itemProps,
    containerProps,
    box,
  };
}
