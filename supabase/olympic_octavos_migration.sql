-- Ejecutar antes de generar los nuevos cuadros de playoffs JO (2 a 16 equipos).
alter type public.tournament_phase add value if not exists 'octavos' before 'cuartos';

-- Mantiene las llaves olimpicas antiguas con sus cruces originales.
alter table public.tournament_playoff_config
add column if not exists jo_bracket_version integer not null default 1;

-- Una serie con un equipo libre almacena al mismo equipo en ambos extremos
-- y marca al ganador sin crear un partido.
alter table public.playoff_series drop constraint if exists playoff_series_distinct_teams;
alter table public.playoff_series add constraint playoff_series_distinct_teams
check (home_team_id <> away_team_id or
       (winner_team_id = home_team_id and tiebreak_applied = 'bye'));
