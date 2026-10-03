-- Customer and billing records are server-owned. Browsers can only read their own rows.
create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  event_created bigint not null,
  updated_at timestamptz not null default now()
);
create index subscriptions_user_id_idx on public.subscriptions(user_id);

create table public.stripe_events (
  id text primary key,
  processed_at timestamptz not null default now()
);

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input text not null check (char_length(input) between 10 and 4000),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  output jsonb,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index workflow_runs_user_created_idx on public.workflow_runs(user_id, created_at desc);

alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.workflow_runs enable row level security;

revoke all on public.billing_customers, public.subscriptions, public.stripe_events, public.workflow_runs from anon, authenticated;
grant select on public.billing_customers, public.subscriptions, public.workflow_runs to authenticated;
grant all on public.billing_customers, public.subscriptions, public.stripe_events, public.workflow_runs to service_role;

create policy "Read own customer" on public.billing_customers for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own subscriptions" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own runs" on public.workflow_runs for select to authenticated using ((select auth.uid()) = user_id);

-- Atomic across serverless instances. Failed attempts count against the allowance.
create function public.reserve_workflow(p_user_id uuid, p_input text, p_model text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare run_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if (select count(*) from public.workflow_runs where user_id = p_user_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Workflow rate limit exceeded' using errcode = 'P0001';
  end if;
  insert into public.workflow_runs(user_id, input, model) values (p_user_id, p_input, p_model) returning id into run_id;
  return run_id;
end;
$$;
revoke all on function public.reserve_workflow(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_workflow(uuid, text, text) to service_role;

-- Event deduplication and subscription writes commit together: a failed write remains retryable.
create function public.sync_subscription(
  p_event_id text, p_event_created bigint, p_customer_id text,
  p_subscription_id text, p_status text, p_price_id text,
  p_period_end timestamptz, p_cancel_at_period_end boolean
) returns void language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.billing_customers where stripe_customer_id = p_customer_id;
  -- Other applications may share a Stripe account; never infer ownership from email.
  if owner_id is null then return; end if;
  insert into public.stripe_events(id) values (p_event_id) on conflict do nothing;
  if not found then return; end if;
  insert into public.subscriptions(id, user_id, status, price_id, current_period_end, cancel_at_period_end, event_created)
  values (p_subscription_id, owner_id, p_status, p_price_id, p_period_end, p_cancel_at_period_end, p_event_created)
  on conflict (id) do update set
    status = excluded.status,
    price_id = excluded.price_id,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    event_created = excluded.event_created,
    updated_at = now()
  where public.subscriptions.event_created <= excluded.event_created;
end;
$$;
revoke all on function public.sync_subscription(text, bigint, text, text, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.sync_subscription(text, bigint, text, text, text, text, timestamptz, boolean) to service_role;
