-- The human's answers to the agent's decisions (what to do, and what they changed).
alter table public.contracts add column decisions jsonb not null default '[]'::jsonb;

drop function public.approve_review(uuid, jsonb, jsonb, jsonb, integer, text, text, jsonb, jsonb);

create function public.approve_review(
  p_review_id uuid, p_ranked_priorities jsonb, p_dials jsonb, p_hard_lines jsonb,
  p_budget_cents integer, p_plan_guidance text, p_notes text,
  p_added_by_human jsonb default '[]'::jsonb, p_removed_by_human jsonb default '[]'::jsonb,
  p_decisions jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_contract uuid;
begin
  if v_user is null then raise exception 'Sign in to approve' using errcode = '28000'; end if;
  update public.reviews set status = 'approved', decided_at = now()
    where id = p_review_id and user_id = v_user and status = 'pending';
  if not found then raise exception 'Review not found or already decided' using errcode = 'P0002'; end if;

  insert into public.contracts(review_id, user_id, ranked_priorities, dials, hard_lines, budget_cents,
                               plan_guidance, notes, added_by_human, removed_by_human, decisions)
  values (p_review_id, v_user, p_ranked_priorities, p_dials, p_hard_lines, p_budget_cents, p_plan_guidance, p_notes,
          coalesce(p_added_by_human, '[]'::jsonb), coalesce(p_removed_by_human, '[]'::jsonb),
          coalesce(p_decisions, '[]'::jsonb))
  returning id into v_contract;

  insert into public.profiles(user_id, dials, hard_lines, ranked_priorities, budget_cents)
  values (v_user, p_dials, p_hard_lines, p_ranked_priorities, p_budget_cents)
  on conflict (user_id) do update set
    dials = excluded.dials, hard_lines = excluded.hard_lines,
    ranked_priorities = excluded.ranked_priorities, budget_cents = excluded.budget_cents, updated_at = now();

  insert into public.events(review_id, user_id, type, action, detail)
  values (p_review_id, v_user, 'approval', 'Human approved priority contract',
          jsonb_build_object('contract_id', v_contract, 'ranked_priorities', p_ranked_priorities,
                             'added_by_human', coalesce(p_added_by_human, '[]'::jsonb),
                             'removed_by_human', coalesce(p_removed_by_human, '[]'::jsonb),
                             'decisions', coalesce(p_decisions, '[]'::jsonb)));
  return v_contract;
end;
$$;
revoke all on function public.approve_review(uuid, jsonb, jsonb, jsonb, integer, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.approve_review(uuid, jsonb, jsonb, jsonb, integer, text, text, jsonb, jsonb, jsonb) to authenticated;
