-- Jacra property portal — Supabase schema.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- The portal's API (netlify/functions/api.mts) talks to Supabase with the
-- service-role key, server-side only. Row Level Security is switched ON for
-- every table with NO policies, so the public anon key can read/write nothing —
-- only the service role (which bypasses RLS) can.

create extension if not exists "pgcrypto";

-- One row per property. The whole property record (core fields plus the
-- acquisitions / refurb / dueDiligence / handedOver / inventory groups) lives
-- in `data`, so each edit touches a single row instead of rewriting a shared
-- array — that removes the read-modify-write races the old blob storage had.
create table if not exists public.properties (
  id uuid primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  password_salt text not null,
  -- either the JSON string "all" (admin) or an array of stage ids
  allowed_stages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.presence (
  username text primary key,
  last_seen timestamptz not null,
  path text not null default ''
);

create table if not exists public.time_spent (
  username text not null,
  stage text not null,
  seconds integer not null default 0,
  primary key (username, stage)
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  username text not null,
  type text not null,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists activity_log_ts_idx on public.activity_log (ts desc);

-- Atomic increment so two heartbeats can't overwrite each other's total.
create or replace function public.increment_time_spent(
  p_username text,
  p_stage text,
  p_seconds integer
) returns void
language sql
as $$
  insert into public.time_spent (username, stage, seconds)
  values (p_username, p_stage, p_seconds)
  on conflict (username, stage)
  do update set seconds = public.time_spent.seconds + excluded.seconds;
$$;

-- Lock everything down: RLS on, no policies => anon/authenticated roles get nothing.
alter table public.properties   enable row level security;
alter table public.portfolios   enable row level security;
alter table public.staff_users  enable row level security;
alter table public.presence     enable row level security;
alter table public.time_spent   enable row level security;
alter table public.activity_log enable row level security;

revoke execute on function public.increment_time_spent(text, text, integer) from public, anon, authenticated;

-- Private bucket for property photos (served back through the portal's own
-- authenticated /api/images/:id route, never publicly).
insert into storage.buckets (id, name, public)
values ('property-images', 'property-images', false)
on conflict (id) do nothing;
