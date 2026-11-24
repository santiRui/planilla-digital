-- La banca y el cuerpo tecnico no son jugadores; conservar su identidad
-- sin insertar identificadores sinteticos en match_events.player_id (FK).
alter table public.match_events
  add column if not exists actor_code text;
