"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { BoardItem } from "@/components/priority-board";
import styles from "./glassbox.module.css";
import local from "./align.module.css";

// Kathryn's force-ranked tile list (priority-list.tsx on kathryn/align-ui) on live
// review data: drag anywhere on a tile (mouse or touch), tap to reveal the red
// close, or focus a tile and use ↑/↓ to move it and Delete to remove it.
export function RankedPriorities({
  items,
  onChange,
  onRemove,
}: {
  items: BoardItem[];
  onChange: (items: BoardItem[]) => void;
  onRemove: (item: BoardItem) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [offsetY, setOffsetY] = useState(0);
  const [armedId, setArmedId] = useState<string | null>(null);
  // Refs mirror drag state so rapid pointermove events don't read stale state.
  const dragRef = useRef<number | null>(null);
  const orderRef = useRef(items);
  const grabY = useRef(0);
  const slotHeight = useRef(0);
  const movedRef = useRef(false);

  useEffect(() => {
    orderRef.current = items;
  }, [items]);

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  function onPointerDown(e: React.PointerEvent<HTMLLIElement>, index: number) {
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Tile height + the list's 8px gap.
    slotHeight.current = e.currentTarget.getBoundingClientRect().height + 8;
    grabY.current = e.clientY;
    dragRef.current = index;
    movedRef.current = false;
    setDragIndex(index);
    setOffsetY(0);
  }

  function onPointerMove(e: React.PointerEvent<HTMLLIElement>) {
    const from = dragRef.current;
    if (from === null) return;
    const current = orderRef.current;
    const dy = e.clientY - grabY.current;
    if (Math.abs(dy) > 5 && !movedRef.current) {
      movedRef.current = true;
      setArmedId(current[from]?.id ?? null);
    }
    const slots = Math.round(dy / slotHeight.current);
    const target = Math.min(Math.max(from + slots, 0), current.length - 1);
    if (target !== from) {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      orderRef.current = next;
      onChange(next);
      grabY.current += (target - from) * slotHeight.current;
      dragRef.current = target;
      setDragIndex(target);
      setOffsetY(e.clientY - grabY.current);
    } else {
      setOffsetY(dy);
    }
  }

  function onPointerUp(index: number) {
    const wasDrag = dragRef.current !== null;
    dragRef.current = null;
    setDragIndex(null);
    setOffsetY(0);
    // A press that never moved is a tap: toggle the close control.
    if (wasDrag && !movedRef.current) {
      const id = orderRef.current[index]?.id ?? null;
      setArmedId((prev) => (prev === id ? null : id));
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLLIElement>, index: number) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const to = index + (e.key === "ArrowUp" ? -1 : 1);
      const list = e.currentTarget.parentElement;
      move(index, to);
      // Keep focus on the tile that moved.
      requestAnimationFrame(() =>
        (
          list?.children[Math.min(Math.max(to, 0), items.length - 1)] as
            HTMLElement | undefined
        )?.focus(),
      );
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onRemove(items[index]);
    }
  }

  return (
    <ol className={styles.rankList}>
      {items.map((item, i) => {
        const classes = [
          styles.rankItem,
          local.rankFocus,
          i === 0 ? styles.rankItemTop : "",
          dragIndex === i ? styles.rankItemDragging : "",
          armedId === item.id ? styles.rankItemArmed : "",
        ]
          .filter(Boolean)
          .join(" ");
        const tag =
          item.origin === "human"
            ? " · you added"
            : item.origin === "suggested"
              ? " · Glass Box suggested"
              : "";
        return (
          <li
            key={item.id}
            className={classes}
            tabIndex={0}
            aria-label={`Priority ${i + 1}: ${item.name}. Use arrow keys to move, Delete to remove.`}
            style={
              dragIndex === i
                ? { transform: `translateY(${offsetY}px)` }
                : undefined
            }
            onPointerDown={(e) => onPointerDown(e, i)}
            onPointerMove={onPointerMove}
            onPointerUp={() => onPointerUp(i)}
            onPointerCancel={() => onPointerUp(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className={styles.rankBody}>
              <span className={styles.rankNum}>
                Priority {i + 1}
                {tag && <span className={styles.rankAdded}>{tag}</span>}
              </span>
              <span className={styles.rankName}>{item.name}</span>
              {item.detail && (
                <span className={local.rankDetail}>{item.detail}</span>
              )}
              {item.hint && <span className={local.rankHint}>{item.hint}</span>}
            </span>
            <button
              type="button"
              className={styles.rankRemove}
              aria-label={`Remove ${item.name}`}
              onClick={() => {
                setArmedId(null);
                onRemove(item);
              }}
            >
              ×
            </button>
            <span className={styles.rankGrip} aria-hidden />
          </li>
        );
      })}
    </ol>
  );
}
