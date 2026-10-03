-- Glass Box: reviews of agent plans, human-approved priority contracts, and enforcement events.
-- Writes go through the server (service_role) or the security-definer RPCs below;
-- browsers only read their own rows (RLS) and receive Realtime changes for them.

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dials jsonb not null default '{}'::jsonb,
  hard_lines jsonb not null default '{}'::jsonb,
  ranked_priorities jsonb not null default '[]'::jsonb,
  budget_cents integer not null default 2000 check (budget_cents >= 0),
  updated_at timestamptz not null default now()
);

-- Per-agent API keys. Only the sha256 hash is stored; the raw key is shown once.
create table public.agent_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index agent_keys_user_idx on public.agent_keys(user_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_name text not null,
  task text not null check (char_length(task) between 1 and 4000),
  plan text not null check (char_length(plan) between 1 and 20000),
  revealed jsonb,
  critique jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index reviews_user_created_idx on public.reviews(user_id, created_at desc);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ranked_priorities jsonb not null,
  dials jsonb not null,
  hard_lines jsonb not null,
  budget_cents integer not null check (budget_cents >= 0),
  plan_guidance text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('checkpoint_ok', 'drift', 'breach', 'spend', 'approval')),
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_review_idx on public.events(review_id, created_at);

create table public.spends (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  purpose text not null,
  stripe_payment_intent_id text,
  status text not null default 'authorized' check (status in ('authorized', 'succeeded', 'failed')),
  created_at timestamptz not null default now()
);
create index spends_review_idx on public.spends(review_id);

alter table public.profiles enable row level security;
alter table public.agent_keys enable row level security;
alter table public.reviews enable row level security;
alter table public.contracts enable row level security;
alter table public.events enable row level security;
alter table public.spends enable row level security;

revoke all on public.profiles, public.agent_keys, public.reviews, public.contracts, public.events, public.spends from anon, authenticated;
grant select on public.profiles, public.agent_keys, public.reviews, public.contracts, public.events, public.spends to authenticated;
grant all on public.profiles, public.agent_keys, public.reviews, public.contracts, public.events, public.spends to service_role;

create policy "Read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own agent keys" on public.agent_keys for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own reviews" on public.reviews for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own contracts" on public.contracts for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own events" on public.events for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own spends" on public.spends for select to authenticated using ((select auth.uid()) = user_id);

-- Realtime: the agent's wait and the human's phone meet here.
alter publication supabase_realtime add table public.reviews, public.contracts, public.events;

-- Human approval: contract, review status, profile memory and audit event commit together.
-- Called with the signed-in user's session; ownership is checked against auth.uid().
create function public.approve_review(
  p_review_id uuid, p_ranked_priorities jsonb, p_dials jsonb, p_hard_lines jsonb,
  p_budget_cents integer, p_plan_guidance text, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_contract uuid;
begin
  if v_user is null then raise exception 'Sign in to approve' using errcode = '28000'; end if;
  update public.reviews set status = 'approved', decided_at = now()
    where id = p_review_id and user_id = v_user and status = 'pending';
  if not found then raise exception 'Review not found or already decided' using errcode = 'P0002'; end if;

  insert into public.contracts(review_id, user_id, ranked_priorities, dials, hard_lines, budget_cents, plan_guidance, notes)
  values (p_review_id, v_user, p_ranked_priorities, p_dials, p_hard_lines, p_budget_cents, p_plan_guidance, p_notes)
  returning id into v_contract;

  insert into public.profiles(user_id, dials, hard_lines, ranked_priorities, budget_cents)
  values (v_user, p_dials, p_hard_lines, p_ranked_priorities, p_budget_cents)
  on conflict (user_id) do update set
    dials = excluded.dials, hard_lines = excluded.hard_lines,
    ranked_priorities = excluded.ranked_priorities, budget_cents = excluded.budget_cents, updated_at = now();

  insert into public.events(review_id, user_id, type, action, detail)
  values (p_review_id, v_user, 'approval', 'Human approved priority contract',
          jsonb_build_object('contract_id', v_contract, 'ranked_priorities', p_ranked_priorities));
  return v_contract;
end;
$$;
revoke all on function public.approve_review(uuid, jsonb, jsonb, jsonb, integer, text, text) from public, anon;
grant execute on function public.approve_review(uuid, jsonb, jsonb, jsonb, integer, text, text) to authenticated;

create function public.reject_review(p_review_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.reviews set status = 'rejected', decided_at = now()
    where id = p_review_id and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Review not found or already decided' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.reject_review(uuid) from public, anon;
grant execute on function public.reject_review(uuid) to authenticated;

-- Budget hard line, enforced in the database: the check and the reservation are one
-- transaction under a row lock, so concurrent or buggy callers cannot overspend.
-- Returns {allowed, reason, spend_id, remaining_cents}. A refusal is logged as a breach.
create function public.request_spend(p_review_id uuid, p_amount_cents integer, p_purpose text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  c public.contracts%rowtype;
  v_spent integer;
  v_spend uuid;
  v_enforced boolean;
begin
  select * into c from public.contracts where review_id = p_review_id for update;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'No approved contract for this review yet.');
  end if;

  select coalesce(sum(amount_cents), 0) into v_spent
    from public.spends where review_id = p_review_id and status <> 'failed';
  v_enforced := coalesce((c.hard_lines ->> 'budget_cap')::boolean, true);

  if v_enforced and v_spent + p_amount_cents > c.budget_cents then
    insert into public.events(review_id, user_id, type, action, detail)
    values (p_review_id, c.user_id, 'breach', 'Spend blocked: ' || p_purpose,
            jsonb_build_object('hard_line', 'budget_cap', 'amount_cents', p_amount_cents,
                               'spent_cents', v_spent, 'budget_cents', c.budget_cents));
    return jsonb_build_object('allowed', false,
      'reason', format('Spending $%s would exceed the approved budget of $%s ($%s already spent).',
                       to_char(p_amount_cents / 100.0, 'FM999990.00'),
                       to_char(c.budget_cents / 100.0, 'FM999990.00'),
                       to_char(v_spent / 100.0, 'FM999990.00')),
      'remaining_cents', greatest(c.budget_cents - v_spent, 0));
  end if;

  insert into public.spends(review_id, user_id, amount_cents, purpose)
  values (p_review_id, c.user_id, p_amount_cents, p_purpose) returning id into v_spend;
  insert into public.events(review_id, user_id, type, action, detail)
  values (p_review_id, c.user_id, 'spend', 'Spend approved: ' || p_purpose,
          jsonb_build_object('spend_id', v_spend, 'amount_cents', p_amount_cents));
  return jsonb_build_object('allowed', true, 'spend_id', v_spend,
                            'remaining_cents', c.budget_cents - v_spent - p_amount_cents);
end;
$$;
revoke all on function public.request_spend(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.request_spend(uuid, integer, text) to service_role;
