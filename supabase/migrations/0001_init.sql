-- Träningsapp: grundschema + RLS + seedade standardövningar
-- Körs i Supabase SQL Editor eller via `supabase db push`

-- ===== Profiler =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  -- sätts av garmin/link.mjs (service role); klienten läser för att visa kopplingsstatus
  garmin_linked boolean not null default false
);
alter table public.profiles enable row level security;

-- Alla inloggade får se namn (behövs för framtida delad vy), men bara ändra sitt eget
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ===== Övningar =====
-- owner_id null = delad standardövning som alla ser men ingen kan ändra
create table public.exercises (
  id bigint generated always as identity primary key,
  name text not null,
  owner_id uuid default auth.uid() references auth.users(id) on delete cascade
);
alter table public.exercises enable row level security;

create policy exercises_select on public.exercises
  for select to authenticated using (owner_id is null or owner_id = auth.uid());
create policy exercises_insert on public.exercises
  for insert to authenticated with check (owner_id = auth.uid());
create policy exercises_update on public.exercises
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy exercises_delete on public.exercises
  for delete to authenticated using (owner_id = auth.uid());

-- ===== Pass =====
create table public.workouts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  note text,
  source text not null default 'manual' check (source in ('manual', 'garmin')),
  garmin_activity_id bigint unique, -- dubblettskydd: samma Garmin-pass kan aldrig importeras två gånger
  created_at timestamptz not null default now()
);
alter table public.workouts enable row level security;

create policy workouts_all on public.workouts
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index workouts_user_date on public.workouts (user_id, date desc);

-- ===== Set =====
create table public.sets (
  id bigint generated always as identity primary key,
  workout_id bigint not null references public.workouts(id) on delete cascade,
  exercise_id bigint not null references public.exercises(id),
  set_number int not null,
  reps int not null check (reps >= 0),
  weight numeric(6,2) not null default 0 check (weight >= 0)
);
alter table public.sets enable row level security;

create policy sets_all on public.sets
  for all to authenticated
  using (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()));

create index sets_workout on public.sets (workout_id);
create index sets_exercise on public.sets (exercise_id);

-- ===== Garmin: användarens egna övningsmappningar =====
-- (vanliga mappningar som BENCH_PRESS->Bänkpress ligger inbyggda i Edge Function-koden;
--  denna tabell är användarens egna val för övningar Garmin-koden inte känner igen)
create table public.garmin_mappings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  garmin_key text not null,
  exercise_id bigint not null references public.exercises(id) on delete cascade,
  primary key (user_id, garmin_key)
);
alter table public.garmin_mappings enable row level security;

create policy garmin_mappings_all on public.garmin_mappings
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== Garmin: tokens =====
-- RLS på men INGA policyer => endast service role (Edge Function/link-skript) kommer åt.
-- Klienten kan aldrig läsa tokens.
create table public.garmin_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.garmin_tokens enable row level security;

-- ===== Garmin: pass som väntar på övningsmappning =====
create table public.garmin_pending (
  activity_id bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  payload jsonb not null,
  unmapped text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.garmin_pending enable row level security;

create policy garmin_pending_select on public.garmin_pending
  for select to authenticated using (user_id = auth.uid());
create policy garmin_pending_delete on public.garmin_pending
  for delete to authenticated using (user_id = auth.uid());

-- ===== Seed: delade standardövningar =====
insert into public.exercises (name, owner_id) values
  ('Bänkpress', null),
  ('Knäböj', null),
  ('Marklyft', null),
  ('Axelpress', null),
  ('Hantelpress', null),
  ('Lutande hantelpress', null),
  ('Latsdrag', null),
  ('Chins', null),
  ('Dips', null),
  ('Skivstångsrodd', null),
  ('Sittande rodd', null),
  ('Hantelrodd', null),
  ('Bicepscurl', null),
  ('Hammercurl', null),
  ('Triceps pushdown', null),
  ('Fransk press', null),
  ('Benpress', null),
  ('Utfall', null),
  ('Rumänsk marklyft', null),
  ('Höftlyft', null),
  ('Benspark', null),
  ('Lårcurl', null),
  ('Vadpress', null),
  ('Sidolyft', null),
  ('Facepull', null),
  ('Magträning (plankan)', null),
  ('Situps', null);
