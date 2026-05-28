-- Supabase stage-2 schema for real authentication and protected cloud sync.
-- Run this later in Supabase SQL editor after the prototype moves from local auth to Supabase Auth.

create extension if not exists "pgcrypto";

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) <= 500),
  type text not null default 'note' check (type in ('note', 'list', 'planner')),
  body text not null default '',
  folder_name text not null default 'Без папки',
  sort_order double precision not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.notes add column if not exists folder_name text not null default 'Без папки';
alter table public.notes add column if not exists sort_order double precision not null default 0;

alter table public.notes enable row level security;

drop policy if exists "Users can read their own notes" on public.notes;
create policy "Users can read their own notes"
  on public.notes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own notes" on public.notes;
create policy "Users can create their own notes"
  on public.notes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own notes" on public.notes;
create policy "Users can update their own notes"
  on public.notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own notes" on public.notes;
create policy "Users can delete their own notes"
  on public.notes for delete
  using (auth.uid() = user_id);

create index if not exists notes_user_updated_idx on public.notes(user_id, updated_at);
create index if not exists notes_user_folder_sort_idx on public.notes(user_id, folder_name, sort_order);
