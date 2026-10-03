"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId } from "react";

export type RankItem = {
  id: string;
  name: string;
  tag?: string; // e.g. "You added", "From profile"
  detail?: string;
};

type Props = {
  items: RankItem[];
  onChange: (items: RankItem[]) => void;
  onRemove?: (id: string) => void;
  minItems?: number;
};

// Force-ranked list: drag (mouse/touch/keyboard) or use the arrow buttons.
// No ties by construction: it is an ordered array.
export function RankList({ items, onChange, onRemove, minItems = 1 }: Props) {
  const dndId = useId(); // stable across SSR + hydration
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from !== -1 && to !== -1) onChange(arrayMove(items, from, to));
  }

  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= items.length) return;
    onChange(arrayMove(items, index, to));
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol className="space-y-2" aria-label="Ranked priorities">
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              index={index}
              count={items.length}
              onMove={move}
              onRemove={
                onRemove && items.length > minItems
                  ? () => onRemove(item.id)
                  : undefined
              }
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  item,
  index,
  count,
  onMove,
  onRemove,
}: {
  item: RankItem;
  index: number;
  count: number;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-stretch gap-1 rounded-xl border bg-card ${
        isDragging
          ? "relative z-10 border-ink shadow-xl"
          : "border-line shadow-sm"
      }`}
      data-testid="rank-item"
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${item.name}. Currently #${index + 1}`}
        className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-3 rounded-l-xl py-3 pl-3 text-left active:cursor-grabbing"
      >
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
            index === 0 ? "bg-ink text-white" : "bg-paper text-ink"
          }`}
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-semibold break-words">
              {item.name}
            </span>
            {item.tag && (
              <span className="rounded-full bg-go-bg px-2 py-0.5 text-xs font-semibold text-go">
                {item.tag}
              </span>
            )}
          </span>
          {item.detail && (
            <span className="mt-0.5 block text-sm text-ink-soft">
              {item.detail}
            </span>
          )}
        </span>
        <GripIcon />
      </button>
      <span className="flex shrink-0 flex-col justify-center border-l border-line">
        <button
          type="button"
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          aria-label={`Move ${item.name} up`}
          className="grid h-full min-h-9 w-10 place-items-center text-ink-soft hover:text-ink disabled:opacity-25"
        >
          <Chevron up />
        </button>
        <button
          type="button"
          onClick={() => onMove(index, 1)}
          disabled={index === count - 1}
          aria-label={`Move ${item.name} down`}
          className="grid h-full min-h-9 w-10 place-items-center text-ink-soft hover:text-ink disabled:opacity-25"
        >
          <Chevron />
        </button>
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
          className="grid w-10 shrink-0 place-items-center rounded-r-xl border-l border-line text-xl text-ink-soft hover:bg-stop-bg hover:text-stop"
        >
          ×
        </button>
      )}
    </li>
  );
}

function GripIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 16"
      className="mr-1 h-4 w-2.5 shrink-0 fill-ink-soft/60"
    >
      {[2, 8, 14].map((y) =>
        [2, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />),
      )}
    </svg>
  );
}

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 8"
      className={`h-2 w-3 ${up ? "rotate-180" : ""}`}
    >
      <path
        d="M1 1l5 5 5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
