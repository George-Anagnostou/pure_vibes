-- One-time install codes: /connect hands the human `curl -fsSL <site>/i/<code> | sh`.
-- Redeeming a code (once, within 15 minutes) mints a fresh agent key and bakes it into
-- the installer, so the human never copies a key. Only the code's sha256 is stored.
create table public.install_codes (
  code_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  key_name text not null default 'Claude Code',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index install_codes_user_idx on public.install_codes(user_id, created_at desc);

-- Server-only: no browser access at all.
alter table public.install_codes enable row level security;
revoke all on public.install_codes from anon, authenticated;
grant all on public.install_codes to service_role;
