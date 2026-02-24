-- Tabla para estadísticas por jugador y partido
-- Ejecutar este script en Supabase para crear la tabla definitiva.

create table if not exists match_player_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,

  minutes numeric not null default 0,
  points integer not null default 0,
  t1_made integer not null default 0,
  t1_att integer not null default 0,
  t2_made integer not null default 0,
  t2_att integer not null default 0,
  t3_made integer not null default 0,
  t3_att integer not null default 0,
  rebounds integer not null default 0,
  assists integer not null default 0,
  steals integer not null default 0,
  turnovers integer not null default 0,
  blocks_committed integer not null default 0,
  blocks_received integer not null default 0,
  fouls_committed integer not null default 0,
  fouls_received integer not null default 0,
  rating integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (match_id, player_id)
);
