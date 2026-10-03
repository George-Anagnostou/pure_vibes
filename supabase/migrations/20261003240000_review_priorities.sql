-- What the agent says it is weighing, ranked, stored next to its decisions (reviews.stated),
-- so the human can force-rank, delete and add priorities in the pop-up.
alter table public.reviews add column priorities jsonb not null default '[]'::jsonb;
