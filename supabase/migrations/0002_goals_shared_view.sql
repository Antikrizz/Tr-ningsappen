-- 0002: Repmål per övning (vikt-förslag) + delad vy (läsa varandras pass)

-- ===== Mål per användare och övning =====
-- Saknas rad gäller default: 8 reps, +2,5 kg
create table public.exercise_goals (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise_id bigint not null references public.exercises(id) on delete cascade,
  target_reps int not null default 8 check (target_reps between 1 and 50),
  increment numeric(4,2) not null default 2.5 check (increment > 0),
  primary key (user_id, exercise_id)
);
alter table public.exercise_goals enable row level security;

create policy exercise_goals_all on public.exercise_goals
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== Delad vy =====
-- Alla inloggade får LÄSA varandras pass och set (familjeapp),
-- men bara ändra/ta bort sina egna.
drop policy workouts_all on public.workouts;
create policy workouts_select on public.workouts
  for select to authenticated using (true);
create policy workouts_insert on public.workouts
  for insert to authenticated with check (user_id = auth.uid());
create policy workouts_update on public.workouts
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy workouts_delete on public.workouts
  for delete to authenticated using (user_id = auth.uid());

drop policy sets_all on public.sets;
create policy sets_select on public.sets
  for select to authenticated using (true);
create policy sets_insert on public.sets
  for insert to authenticated
  with check (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()));
create policy sets_update on public.sets
  for update to authenticated
  using (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()));
create policy sets_delete on public.sets
  for delete to authenticated
  using (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()));
