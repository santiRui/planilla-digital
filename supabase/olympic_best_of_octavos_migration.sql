-- Ejecutar despues de olympic_octavos_migration.sql para configurar octavos al mejor de N.
alter table public.tournament_playoff_config
add column if not exists best_of_octavos integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tournament_playoff_config_best_of_octavos_check'
      and conrelid = 'public.tournament_playoff_config'::regclass
  ) then
    alter table public.tournament_playoff_config
    add constraint tournament_playoff_config_best_of_octavos_check
    check (best_of_octavos between 1 and 9);
  end if;
end;
$$;
