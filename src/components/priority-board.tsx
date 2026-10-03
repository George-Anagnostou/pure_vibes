"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, useState } from "react";

export type BoardItem = {
  id: string;
  name: string;
  detail?: string; // agent's why, or Glass Box's reason for a suggestion
  origin: "agent" | "suggested";
  hint?: string; // Glass Box nudge on an agent priority, e.g. "Maybe drop"
};

export type Board = { ranked: BoardItem[]; pool: BoardItem[] };
type Column = keyof Board;

// Two columns, drag only: the ranking on the left, possible priorities on the
// right. Drag a bar across to rank it (or to set it aside), and up/down to reorder.

// Whatever is under the pointer wins (so a drop lands exactly where released);
// keyboard drags and gaps between bars fall back to the nearest bar.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (!hits.length) return closestCenter(args);
  const bars = hits.filter((h) => h.id !== "ranked" && h.id !== "pool");
  return bars.length ? bars : hits;
};
export function PriorityBoard({
  board,
  onChange,
}: {
  board: Board;
  onChange: (board: Board) => void;
}) {
  const dndId = useId();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const columnOf = (id: UniqueIdentifier): Column | undefined => {
    if (id === "ranked" || id === "pool") return id;
    if (board.ranked.some((i) => i.id === id)) return "ranked";
    if (board.pool.some((i) => i.id === id)) return "pool";
  };
  const active = [...board.ranked, ...board.pool].find(
    (i) => i.id === activeId,
  );

  // Move between columns while dragging, so the target column opens a gap.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = columnOf(active.id);
    const to = columnOf(over.id);
    if (!from || !to || from === to) return;
    if (from === "ranked" && board.ranked.length <= 1) return; // keep one
    const item = board[from].find((i) => i.id === active.id)!;
    const overIndex = board[to].findIndex((i) => i.id === over.id);
    const dragged = active.rect.current.translated;
    const below =
      dragged !== null && dragged.top > over.rect.top + over.rect.height / 2;
    const at =
      overIndex === -1 ? board[to].length : overIndex + (below ? 1 : 0);
    onChange({
      ...board,
      [from]: board[from].filter((i) => i.id !== active.id),
      [to]: [...board[to].slice(0, at), item, ...board[to].slice(at)],
    } as Board);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const col = columnOf(active.id);
    if (!col || col !== columnOf(over.id)) return;
    const from = board[col].findIndex((i) => i.id === active.id);
    const to = board[col].findIndex((i) => i.id === over.id);
    if (from !== -1 && to !== -1 && from !== to)
      onChange({ ...board, [col]: arrayMove(board[col], from, to) } as Board);
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={({ active }: DragStartEvent) => setActiveId(active.id)}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-2 gap-3">
        <ColumnShell
          id="ranked"
          title="Your ranking"
          note="Top wins"
          items={board.ranked}
          empty="Drag a priority here"
        />
        <ColumnShell
          id="pool"
          title="Also consider"
          note="Drag in"
          items={board.pool}
          empty="Drag one here to set it aside"
        />
      </div>
      <DragOverlay>
        {active ? (
          <Bar
            item={active}
            rank={
              columnOf(active.id) === "ranked"
                ? board.ranked.findIndex((i) => i.id === active.id) + 1
                : undefined
            }
            lifted
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function ColumnShell({
  id,
  title,
  note,
  items,
  empty,
}: {
  id: Column;
  title: string;
  note: string;
  items: BoardItem[];
  empty: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const pool = id === "pool";
  return (
    <section aria-label={title} className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
        <h3 className="text-xs font-bold tracking-wide text-ink-soft uppercase">
          {title}
        </h3>
        <span className="text-[11px] text-ink-soft/80">{note}</span>
      </div>
      <SortableContext
        id={id}
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol
          ref={setNodeRef}
          className={`min-h-40 space-y-2 rounded-2xl p-1.5 transition-colors ${
            pool ? "bg-paper/80 ring-1 ring-line ring-inset" : ""
          } ${isOver ? "ring-2 ring-ink/30" : ""}`}
        >
          {items.map((item, index) => (
            <SortableBar
              key={item.id}
              item={item}
              rank={pool ? undefined : index + 1}
            />
          ))}
          {items.length === 0 && (
            <li className="grid min-h-24 place-items-center rounded-xl border-2 border-dashed border-line px-2 text-center text-xs text-ink-soft">
              {empty}
            </li>
          )}
        </ol>
      </SortableContext>
    </section>
  );
}

function SortableBar({ item, rank }: { item: BoardItem; rank?: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-30" : ""}
      data-testid={rank ? "rank-item" : "pool-item"}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={
          rank
            ? `${item.name}, ranked #${rank}. Drag to reorder or drag right to set aside.`
            : `${item.name}, suggested. Drag left into your ranking.`
        }
        className="block w-full cursor-grab touch-none text-left active:cursor-grabbing"
      >
        <Bar item={item} rank={rank} />
      </button>
    </li>
  );
}

function Bar({
  item,
  rank,
  lifted = false,
}: {
  item: BoardItem;
  rank?: number;
  lifted?: boolean;
}) {
  const ranked = rank !== undefined;
  return (
    <span
      className={`flex items-start gap-2 rounded-xl border px-2.5 py-2.5 ${
        lifted
          ? "border-ink bg-card shadow-xl"
          : ranked
            ? "border-line bg-card shadow-sm"
            : "ml-1.5 border-dashed border-line bg-card/60 text-ink/80"
      }`}
    >
      {ranked ? (
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
            rank === 1 ? "bg-ink text-white" : "bg-paper text-ink"
          }`}
        >
          {rank}
        </span>
      ) : (
        <span
          aria-hidden
          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-dashed border-ink-soft/60 text-[10px] text-ink-soft"
        >
          ⋮
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1">
          <span className="text-sm leading-tight font-semibold break-words">
            {item.name}
          </span>
          {ranked && item.origin === "suggested" && (
            <span className="rounded-full bg-go-bg px-1.5 py-px text-[10px] font-semibold text-go">
              Added
            </span>
          )}
        </span>
        {item.hint && (
          <span className="mt-1 line-clamp-2 block text-[11px] leading-snug font-semibold text-warn">
            {item.hint}
          </span>
        )}
        {item.detail && (
          <span className="mt-0.5 line-clamp-3 block text-[11px] leading-snug text-ink-soft">
            {item.detail}
          </span>
        )}
      </span>
    </span>
  );
}
