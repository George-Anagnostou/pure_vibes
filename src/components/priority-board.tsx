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
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
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
import { useId, useState, type FormEvent } from "react";

export type BoardItem = {
  id: string;
  name: string;
  how?: string; // the method / data source, in the agent's words
  uses?: string[]; // tools, APIs, data sources
  estTokens?: number;
  estCostUsd?: number;
  detail?: string; // agent's why, or Glass Box's reason for a suggestion
  source?: string; // "Your request", "Its judgment", "Assumption", "Glass Box"…
  origin: "agent" | "suggested" | "human";
  hint?: string; // Glass Box nudge on an agent step, e.g. "Maybe earlier: …"
};

export type Board = { ranked: BoardItem[]; pool: BoardItem[] };
type Column = keyof Board;

export const fmtTokens = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `${n}`;
export const fmtUsd = (n: number) =>
  n === 0 ? "$0" : n < 0.01 ? "<$0.01" : `$${n.toFixed(n < 10 ? 2 : 0)}`;

export function totals(items: BoardItem[]) {
  return items.reduce(
    (t, i) => ({
      tokens: t.tokens + (i.estTokens ?? 0),
      usd: t.usd + (i.estCostUsd ?? 0),
      unknown: t.unknown + (i.estTokens === undefined ? 1 : 0),
    }),
    { tokens: 0, usd: 0, unknown: 0 },
  );
}

// Whatever is under the pointer wins (so a drop lands exactly where released);
// keyboard drags and gaps between bars fall back to the nearest bar.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (!hits.length) return closestCenter(args);
  const bars = hits.filter((h) => h.id !== "ranked" && h.id !== "pool");
  return bars.length ? bars : hits;
};

// Force-ranked priorities in two columns: what the agent is weighing (ranked) on the
// left, Glass Box's suggestions on the right. Drag to reorder or move across, ✕ to
// delete, and type to add your own.
export function PriorityBoard({
  board,
  onChange,
  onDelete,
  onAdd,
}: {
  board: Board;
  onChange: (board: Board) => void;
  onDelete: (item: BoardItem) => void;
  onAdd: (name: string) => void;
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
      <div className="grid grid-cols-[3fr_2fr] gap-2">
        <ColumnShell
          id="ranked"
          title="What it's weighing"
          items={board.ranked}
          empty="Drag a priority here"
          onDelete={onDelete}
          footer={<AddStep onAdd={onAdd} />}
        />
        <ColumnShell
          id="pool"
          title="Also consider"
          items={board.pool}
          empty="Drag a priority here to set it aside"
          onDelete={onDelete}
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
  items,
  empty,
  onDelete,
  footer,
}: {
  id: Column;
  title: string;
  items: BoardItem[];
  empty: string;
  onDelete: (item: BoardItem) => void;
  footer?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const pool = id === "pool";
  const t = totals(items);
  return (
    <section aria-label={title} className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
        <h3 className="text-xs font-bold tracking-wide text-ink-soft uppercase">
          {title}
        </h3>
        {items.length > 0 && (
          <span className="text-[10px] text-ink-soft/80 tabular-nums">
            {items.length}
            {t.tokens > 0 && ` · ~${fmtTokens(t.tokens)} tok`}
            {t.usd > 0 && ` · ${fmtUsd(t.usd)}`}
          </span>
        )}
      </div>
      <SortableContext
        id={id}
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol
          ref={setNodeRef}
          className={`min-h-32 space-y-1.5 rounded-xl p-1 transition-colors ${
            pool ? "bg-paper/80 ring-1 ring-line ring-inset" : ""
          } ${isOver ? "ring-2 ring-ink/30" : ""}`}
        >
          {items.map((item, index) => (
            <SortableBar
              key={item.id}
              item={item}
              rank={pool ? undefined : index + 1}
              onDelete={() => onDelete(item)}
            />
          ))}
          {items.length === 0 && (
            <li className="grid min-h-24 place-items-center rounded-xl border-2 border-dashed border-line px-2 text-center text-xs text-ink-soft">
              {empty}
            </li>
          )}
        </ol>
      </SortableContext>
      {footer}
    </section>
  );
}

function AddStep({ onAdd }: { onAdd: (name: string) => void }) {
  const [text, setText] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const name = text.trim();
    if (!name) return;
    onAdd(name);
    setText("");
  }
  return (
    <form onSubmit={submit} className="mt-1.5 flex gap-1 px-1">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={120}
        placeholder="+ Add a priority"
        aria-label="Add a priority"
        className="min-w-0 flex-1 rounded-lg border border-dashed border-line bg-card px-2 py-1.5 text-[12px] placeholder:text-ink-soft focus:border-ink focus:outline-none"
      />
      {text.trim() && (
        <button
          type="submit"
          className="rounded-lg bg-ink px-2 text-[12px] font-bold text-white"
        >
          Add
        </button>
      )}
    </form>
  );
}

function SortableBar({
  item,
  rank,
  onDelete,
}: {
  item: BoardItem;
  rank?: number;
  onDelete: () => void;
}) {
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
      className={`group relative ${isDragging ? "opacity-30" : ""}`}
      data-testid={rank ? "rank-item" : "pool-item"}
    >
      <div
        {...attributes}
        {...listeners}
        role="button"
        aria-label={
          rank
            ? `Priority ${rank}: ${item.name}. Drag to reorder or drag right to set aside.`
            : `${item.name}, suggested. Drag left to rank it.`
        }
        className="cursor-grab touch-none text-left active:cursor-grabbing"
      >
        <Bar item={item} rank={rank} />
      </div>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onDelete}
        aria-label={`Delete ${item.name}`}
        className="absolute top-1 right-1 grid size-5 place-items-center rounded text-sm leading-none text-ink-soft/70 hover:bg-stop-bg hover:text-stop"
      >
        ×
      </button>
    </li>
  );
}

const SOURCE_TONE: Record<string, string> = {
  Assumption: "bg-warn-bg text-warn",
  "Its judgment": "bg-warn-bg text-warn",
  "Its rules": "bg-paper text-ink-soft",
  "Glass Box": "bg-go-bg text-go",
  You: "bg-go-bg text-go",
};

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
  const tag = ranked && item.origin === "suggested" ? "Added" : item.source;
  const est = [
    item.estTokens !== undefined ? `~${fmtTokens(item.estTokens)} tok` : "",
    item.estCostUsd !== undefined ? fmtUsd(item.estCostUsd) : "",
  ].filter(Boolean);
  return (
    <span
      title={[item.how, item.hint, item.detail].filter(Boolean).join("\n")}
      className={`flex items-start gap-1.5 rounded-lg border py-1.5 pr-6 pl-2 ${
        lifted
          ? "border-ink bg-card shadow-xl"
          : ranked
            ? "border-line bg-card shadow-sm"
            : "ml-1 border-dashed border-line bg-card/60 text-ink/80"
      }`}
    >
      <span
        className={`mt-px grid size-4.5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
          ranked
            ? "bg-paper text-ink"
            : "border border-dashed border-ink-soft/60 text-ink-soft"
        }`}
      >
        {ranked ? rank : "+"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1">
          <span className="text-[13px] leading-tight font-semibold break-words">
            {item.name}
          </span>
          {tag && (
            <span
              className={`rounded px-1 py-px text-[9px] leading-tight font-semibold uppercase ${
                tag === "Added"
                  ? "bg-go-bg text-go"
                  : (SOURCE_TONE[tag] ?? "bg-paper text-ink-soft")
              }`}
            >
              {tag}
            </span>
          )}
        </span>
        {item.how && (
          <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink">
            {item.how}
          </span>
        )}
        {(item.uses?.length || est.length > 0) && (
          <span className="mt-1 flex flex-wrap gap-1">
            {item.uses?.slice(0, 4).map((u) => (
              <span
                key={u}
                className="rounded bg-paper px-1 py-px text-[9.5px] text-ink-soft"
              >
                {u}
              </span>
            ))}
            {est.length > 0 && (
              <span className="rounded bg-brand/10 px-1 py-px text-[9.5px] font-semibold text-brand tabular-nums">
                {est.join(" · ")}
              </span>
            )}
          </span>
        )}
        {item.hint && (
          <span className="mt-0.5 line-clamp-1 text-[10.5px] leading-snug font-semibold text-warn">
            {item.hint}
          </span>
        )}
        {!item.how && item.detail && (
          <span className="line-clamp-1 text-[10.5px] leading-snug text-ink-soft">
            {item.detail}
          </span>
        )}
      </span>
    </span>
  );
}
