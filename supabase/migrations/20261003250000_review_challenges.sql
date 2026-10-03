-- Challenge interview: the agent states what it thinks the task is, Glass Box poses
-- real-world challenges (stored in critique.challenges), and the agent answers them
-- before the human sees the pop-up.
alter table public.reviews add column understanding text;
alter table public.reviews add column challenge_answers jsonb not null default '[]'::jsonb;
alter table public.reviews add column answered_at timestamptz;
-- The human's ruling on each challenge (approve the agent's response or say what to do instead).
alter table public.contracts add column challenges jsonb not null default '[]'::jsonb;
