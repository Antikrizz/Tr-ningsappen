-- 0003: Övningsnamn läsbara för alla inloggade.
-- Utan detta visas partnerns egna övningar som "(övning)" i delade historiken.
-- Övningslistorna i appen filtrerar ändå fram bara delade + egna övningar,
-- och ändra/ta bort kräver fortfarande ägarskap.

drop policy exercises_select on public.exercises;
create policy exercises_select on public.exercises
  for select to authenticated using (true);
