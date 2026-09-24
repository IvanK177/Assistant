-- ============================================================
-- SQL-скрипт для Supabase (вставьте в SQL Editor в Supabase)
-- ============================================================

create table if not exists public.assistant_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Включение безопасности RLS
alter table public.assistant_data enable row level security;

-- Политики доступа: пользователь видит и меняет только свои данные
drop policy if exists "Users can read their own assistant data" on public.assistant_data;
create policy "Users can read their own assistant data"
  on public.assistant_data for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own assistant data" on public.assistant_data;
create policy "Users can insert their own assistant data"
  on public.assistant_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own assistant data" on public.assistant_data;
create policy "Users can update their own assistant data"
  on public.assistant_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
