begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
insert into public.billing_customers(user_id, stripe_customer_id) values
('00000000-0000-0000-0000-000000000001', 'cus_one'), ('00000000-0000-0000-0000-000000000002', 'cus_two');
insert into public.workflow_runs(user_id, input, model) values
('00000000-0000-0000-0000-000000000001', 'First user brief', 'test'), ('00000000-0000-0000-0000-000000000002', 'Second user brief', 'test');

select public.sync_subscription('evt_new', 200, 'cus_one', 'sub_one', 'active', 'price_test', now(), false);
select public.sync_subscription('evt_old', 100, 'cus_one', 'sub_one', 'past_due', 'price_test', now(), false);
select is((select status from public.subscriptions where id = 'sub_one'), 'active', 'Old event cannot overwrite newer state');
select public.sync_subscription('evt_new', 200, 'cus_one', 'sub_one', 'canceled', 'price_test', now(), false);
select is((select status from public.subscriptions where id = 'sub_one'), 'active', 'Duplicate event is a no-op');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.workflow_runs), 1, 'Only own workflows are visible');
select is((select count(*)::int from public.billing_customers), 1, 'Only own customer is visible');
select is((select count(*)::int from public.subscriptions), 1, 'Own subscription is visible');
select throws_ok($$insert into public.subscriptions(id, user_id, status, event_created) values ('fake', '00000000-0000-0000-0000-000000000001', 'active', 999)$$, '42501', null, 'Cannot forge subscription');
select throws_ok($$select public.reserve_workflow('00000000-0000-0000-0000-000000000001', 'Bypass limit brief', 'test')$$, '42501', null, 'Browser cannot reserve privileged workflow');
select throws_ok($$select * from public.stripe_events$$, '42501', null, 'Event ledger is private');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.subscriptions), 0, 'Other user cannot read subscription');
reset role;

set local role anon;
select throws_ok($$select * from public.workflow_runs$$, '42501', null, 'Anonymous cannot read runs');
reset role;

set local role service_role;
select lives_ok($$select public.reserve_workflow('00000000-0000-0000-0000-000000000001', 'Valid workflow brief', 'test')$$, 'Service can reserve run');
reset role;
insert into public.workflow_runs(user_id, input, model)
select '00000000-0000-0000-0000-000000000001', 'Fill quota brief', 'test' from generate_series(1, 8);
set local role service_role;
select throws_ok($$select public.reserve_workflow('00000000-0000-0000-0000-000000000001', 'Over quota brief', 'test')$$, 'P0001', 'Workflow rate limit exceeded', 'Hourly quota is enforced in database');
reset role;
select * from finish();
rollback;
