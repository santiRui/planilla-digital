create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'arbitro', 'oficial_mesa');
create type public.branch as enum ('masculino', 'femenino', 'mixto');
create type public.tournament_status as enum ('activo', 'finalizado', 'pendiente');
create type public.match_status as enum ('programado', 'en_juego', 'finalizado');
create type public.tournament_phase as enum ('fase_regular', 'playoff', 'cuartos', 'semifinal', 'final');
create type public.match_event_type as enum ('points', 'foul', 'substitution_in', 'substitution_out');
create type public.match_official_role as enum ('arbitro', 'oficial_mesa');

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'tiebreak_mode'
  ) then
    execute 'create type public.tiebreak_mode as enum (''olimpico_sorteo'', ''olimpico_sin_sorteo'', ''labas'')';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_team_zones'
      and policyname = 'tournament_team_zones_public_select'
  ) then
    create policy "tournament_team_zones_public_select" on public.tournament_team_zones
    for select to anon, authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_team_zones'
      and policyname = 'tournament_team_zones_admin_write'
  ) then
    create policy "tournament_team_zones_admin_write" on public.tournament_team_zones
    for all to authenticated
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));
  end if;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role public.user_role not null default 'oficial_mesa',
  is_referee boolean not null default false,
  is_table_official boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists is_referee boolean not null default false;

alter table public.profiles
add column if not exists is_table_official boolean not null default false;

update public.profiles
set is_referee = true
where role = 'arbitro' and is_referee = false;

update public.profiles
set is_table_official = true
where role = 'oficial_mesa' and is_table_official = false;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  description text,
  year int not null,
  branch public.branch not null,
  age_group text,
  status public.tournament_status not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch public.branch not null,
  age_group text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, branch, age_group)
);

alter table public.tournaments
add column if not exists category_id uuid references public.categories(id) on delete restrict;

create index if not exists tournaments_category_id_idx on public.tournaments(category_id);

create table if not exists public.category_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch public.branch not null,
  age_group text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, branch, age_group)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  neighborhood text,
  logo_url text,
  primary_color text not null default '#1f2937',
  secondary_color text not null default '#111827',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_categories (
  team_id uuid not null references public.teams(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, category_id)
);

create index if not exists team_categories_category_id_idx on public.team_categories(category_id);

create table if not exists public.tournament_team_zones (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  zone_code text not null,
  created_at timestamptz not null default now(),
  primary key (tournament_id, team_id)
);

create index if not exists tournament_team_zones_tournament_zone_idx on public.tournament_team_zones(tournament_id, zone_code);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  dni text not null,
  birth_date date not null,
  jersey_number int not null,
  height_cm int,
  is_federated boolean not null default true,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, jersey_number),
  unique (dni)
);

create table if not exists public.coaching_staff (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  role text not null,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, name)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  home_team_id uuid not null references public.teams(id) on delete restrict,
  away_team_id uuid not null references public.teams(id) on delete restrict,
  zone_code text,
  round int not null default 1,
  phase public.tournament_phase not null default 'fase_regular',
  status public.match_status not null default 'programado',
  scheduled_at timestamptz,
  venue_id uuid references public.venues(id) on delete set null,
  court_id uuid references public.courts(id) on delete set null,
  home_score int,
  away_score int,
  playoff_series_id uuid,
  series_game_number int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_distinct_teams check (home_team_id <> away_team_id)
);

alter table public.matches
add column if not exists playoff_series_id uuid;

alter table public.matches
add column if not exists series_game_number int;

alter table public.matches
add column if not exists zone_code text;

create index if not exists matches_tournament_round_idx on public.matches(tournament_id, round);
create index if not exists matches_tournament_phase_idx on public.matches(tournament_id, phase);
create index if not exists matches_status_idx on public.matches(status);
create index if not exists matches_scheduled_at_idx on public.matches(scheduled_at);
create index if not exists matches_playoff_series_idx on public.matches(playoff_series_id, series_game_number);
create index if not exists matches_tournament_phase_zone_round_idx on public.matches(tournament_id, phase, zone_code, round);

create table if not exists public.tournament_playoff_config (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  qualified_teams int not null,
  best_of_cuartos int not null default 1,
  best_of_semifinal int not null default 1,
  best_of_final int not null default 1,
  tiebreak_mode public.tiebreak_mode not null default 'olimpico_sorteo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_playoff_config_qualified_teams_check check (qualified_teams in (2,4,8)),
  constraint tournament_playoff_config_best_of_check check (
    best_of_cuartos >= 1 and best_of_semifinal >= 1 and best_of_final >= 1
  )
);

create table if not exists public.playoff_series (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  phase public.tournament_phase not null,
  series_index int not null,
  home_team_id uuid not null references public.teams(id) on delete restrict,
  away_team_id uuid not null references public.teams(id) on delete restrict,
  best_of int not null,
  winner_team_id uuid references public.teams(id) on delete set null,
  tiebreak_applied text,
  random_winner_team_id uuid references public.teams(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint playoff_series_distinct_teams check (home_team_id <> away_team_id),
  constraint playoff_series_best_of_check check (best_of >= 1),
  unique (tournament_id, phase, series_index)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_playoff_series_fk'
      and conrelid = 'public.matches'::regclass
  ) then
    alter table public.matches
    add constraint matches_playoff_series_fk
    foreign key (playoff_series_id) references public.playoff_series(id) on delete set null;
  end if;
end;
$$;

create index if not exists playoff_series_tournament_phase_idx on public.playoff_series(tournament_id, phase);
create index if not exists playoff_series_winner_idx on public.playoff_series(tournament_id, phase, winner_team_id);

create table if not exists public.match_official_assignments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.match_official_role not null,
  created_at timestamptz not null default now()
);

alter table public.match_official_assignments
drop constraint if exists match_official_assignments_match_id_user_id_role_key;

alter table public.match_official_assignments
drop constraint if exists match_official_assignments_match_id_user_id_key;

-- If there are historical duplicates (same user assigned as referee + table official in same match),
-- keep the referee assignment.
delete from public.match_official_assignments moa
using public.match_official_assignments dup
where moa.match_id = dup.match_id
  and moa.user_id = dup.user_id
  and moa.id <> dup.id
  and moa.role = 'oficial_mesa'
  and dup.role = 'arbitro';

-- Keep only one assignment per (match_id, user_id)
delete from public.match_official_assignments moa
using public.match_official_assignments dup
where moa.match_id = dup.match_id
  and moa.user_id = dup.user_id
  and moa.id > dup.id;

alter table public.match_official_assignments
add constraint match_official_assignments_match_id_user_id_key unique (match_id, user_id);

create index if not exists match_official_assignments_user_idx on public.match_official_assignments(user_id);
create index if not exists match_official_assignments_match_idx on public.match_official_assignments(match_id);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  player_id uuid references public.players(id) on delete set null,
  type public.match_event_type not null,
  points int,
  period int not null,
  game_time text not null,
  occurred_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint match_events_points_check check (
    (type = 'points' and points in (1,2,3))
    or (type <> 'points' and points is null)
  )
);

create index if not exists match_events_match_idx on public.match_events(match_id, occurred_at);
create index if not exists match_events_player_idx on public.match_events(player_id);

create table if not exists public.team_standings (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  played int not null default 0,
  won int not null default 0,
  lost int not null default 0,
  points_for int not null default 0,
  points_against int not null default 0,
  points int not null default 0,
  updated_at timestamptz not null default now(),
  unique (tournament_id, team_id)
);

create index if not exists team_standings_tournament_idx on public.team_standings(tournament_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, is_referee, is_table_official)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'Usuario'),
    'oficial_mesa',
    false,
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.backfill_profiles()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, is_referee, is_table_official)
  select
    u.id,
    coalesce(u.raw_user_meta_data->>'full_name', u.email, 'Usuario'),
    'oficial_mesa',
    false,
    true
  from auth.users u
  left join public.profiles p on p.id = u.id
  where p.id is null;
end;
$$;

create or replace function public.promote_user_to_admin_by_email(target_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  select u.id into v_uid
  from auth.users u
  where lower(u.email) = lower(target_email)
  limit 1;

  if v_uid is null then
    raise exception 'No existe un usuario en auth.users con email %', target_email;
  end if;

  insert into public.profiles (id, full_name, role, is_referee, is_table_official)
  select
    u.id,
    coalesce(u.raw_user_meta_data->>'full_name', u.email, 'Usuario'),
    'admin',
    false,
    false
  from auth.users u
  where u.id = v_uid
  on conflict (id) do update set role = 'admin', is_referee = false, is_table_official = false;
end;
$$;

create or replace function public.set_user_role_by_email(target_email text, target_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Solo un admin puede asignar roles.';
  end if;

  select u.id into v_uid
  from auth.users u
  where lower(u.email) = lower(target_email)
  limit 1;

  if v_uid is null then
    raise exception 'No existe un usuario en auth.users con email %', target_email;
  end if;

  update public.profiles
  set
    role = target_role,
    is_referee = (target_role = 'arbitro'),
    is_table_official = (target_role = 'oficial_mesa')
  where id = v_uid;

  if not found then
    raise exception 'El usuario existe pero no tiene profile. Ejecuta public.backfill_profiles() y reintenta.';
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_set_updated_at') then
    create trigger profiles_set_updated_at before update on public.profiles
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created') then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();
  end if;

  perform public.backfill_profiles();

  if not exists (select 1 from pg_trigger where tgname = 'tournaments_set_updated_at') then
    create trigger tournaments_set_updated_at before update on public.tournaments
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'categories_set_updated_at') then
    create trigger categories_set_updated_at before update on public.categories
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'category_templates_set_updated_at') then
    create trigger category_templates_set_updated_at before update on public.category_templates
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'teams_set_updated_at') then
    create trigger teams_set_updated_at before update on public.teams
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'players_set_updated_at') then
    create trigger players_set_updated_at before update on public.players
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'coaching_staff_set_updated_at') then
    create trigger coaching_staff_set_updated_at before update on public.coaching_staff
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'venues_set_updated_at') then
    create trigger venues_set_updated_at before update on public.venues
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'courts_set_updated_at') then
    create trigger courts_set_updated_at before update on public.courts
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'matches_set_updated_at') then
    create trigger matches_set_updated_at before update on public.matches
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'tournament_playoff_config_set_updated_at') then
    create trigger tournament_playoff_config_set_updated_at before update on public.tournament_playoff_config
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'playoff_series_set_updated_at') then
    create trigger playoff_series_set_updated_at before update on public.playoff_series
    for each row execute function public.set_updated_at();
  end if;
end;
$$;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

create or replace function public.is_assigned_to_match(uid uuid, mid uuid, required_role public.match_official_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.match_official_assignments moa
    where moa.match_id = mid
      and moa.user_id = uid
      and moa.role = required_role
  );
$$;

alter table public.profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.categories enable row level security;
alter table public.category_templates enable row level security;
alter table public.teams enable row level security;
alter table public.team_categories enable row level security;
alter table public.players enable row level security;
alter table public.coaching_staff enable row level security;
alter table public.venues enable row level security;
alter table public.courts enable row level security;
alter table public.matches enable row level security;
alter table public.tournament_playoff_config enable row level security;
alter table public.playoff_series enable row level security;
alter table public.match_official_assignments enable row level security;
alter table public.match_events enable row level security;
alter table public.team_standings enable row level security;
alter table public.tournament_team_zones enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_playoff_config'
      and policyname = 'tournament_playoff_config_admin_select'
  ) then
    create policy "tournament_playoff_config_admin_select" on public.tournament_playoff_config
    for select to authenticated
    using (public.is_admin(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_playoff_config'
      and policyname = 'tournament_playoff_config_admin_write'
  ) then
    create policy "tournament_playoff_config_admin_write" on public.tournament_playoff_config
    for all to authenticated
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playoff_series'
      and policyname = 'playoff_series_admin_select'
  ) then
    create policy "playoff_series_admin_select" on public.playoff_series
    for select to authenticated
    using (public.is_admin(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playoff_series'
      and policyname = 'playoff_series_admin_write'
  ) then
    create policy "playoff_series_admin_write" on public.playoff_series
    for all to authenticated
    using (public.is_admin(auth.uid()))
    with check (public.is_admin(auth.uid()));
  end if;
end;
$$;

create policy "profiles_self_select" on public.profiles
for select to authenticated
using (id = auth.uid());

create policy "profiles_admin_select" on public.profiles
for select to authenticated
using (public.is_admin(auth.uid()));

create policy "profiles_admin_upsert" on public.profiles
for insert to authenticated
with check (public.is_admin(auth.uid()));

create policy "profiles_admin_update" on public.profiles
for update to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "tournaments_public_select" on public.tournaments
for select to anon, authenticated
using (true);

create policy "tournaments_admin_write" on public.tournaments
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "categories_public_select" on public.categories
for select to anon, authenticated
using (true);

create policy "categories_admin_write" on public.categories
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "category_templates_public_select" on public.category_templates
for select to anon, authenticated
using (true);

create policy "category_templates_admin_write" on public.category_templates
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "teams_public_select" on public.teams
for select to anon, authenticated
using (true);

create policy "teams_admin_write" on public.teams
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "team_categories_public_select" on public.team_categories
for select to anon, authenticated
using (true);

create policy "team_categories_admin_write" on public.team_categories
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "players_public_select" on public.players
for select to anon, authenticated
using (true);

create policy "players_admin_write" on public.players
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "coaching_staff_public_select" on public.coaching_staff
for select to anon, authenticated
using (true);

create policy "coaching_staff_admin_write" on public.coaching_staff
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "venues_public_select" on public.venues
for select to anon, authenticated
using (true);

create policy "venues_admin_write" on public.venues
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "courts_public_select" on public.courts
for select to anon, authenticated
using (true);

create policy "courts_admin_write" on public.courts
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "matches_public_select" on public.matches
for select to anon, authenticated
using (true);

create policy "matches_assigned_select" on public.matches
for select to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1 from public.match_official_assignments moa
    where moa.match_id = id and moa.user_id = auth.uid()
  )
);

create policy "matches_admin_write" on public.matches
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "match_official_assignments_admin" on public.match_official_assignments
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "match_events_public_select" on public.match_events
for select to anon, authenticated
using (true);

create policy "match_events_table_official_insert" on public.match_events
for insert to authenticated
with check (
  public.is_admin(auth.uid())
  or public.is_assigned_to_match(auth.uid(), match_id, 'oficial_mesa')
);

create policy "match_events_table_official_update" on public.match_events
for update to authenticated
using (
  public.is_admin(auth.uid())
  or public.is_assigned_to_match(auth.uid(), match_id, 'oficial_mesa')
)
with check (
  public.is_admin(auth.uid())
  or public.is_assigned_to_match(auth.uid(), match_id, 'oficial_mesa')
);

create policy "match_events_admin_delete" on public.match_events
for delete to authenticated
using (public.is_admin(auth.uid()));

create policy "team_standings_public_select" on public.team_standings
for select to anon, authenticated
using (true);

create policy "team_standings_admin_write" on public.team_standings
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'team-logos') then
    insert into storage.buckets (id, name, public)
    values ('team-logos', 'team-logos', true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'team_logos_public_read'
  ) then
    create policy "team_logos_public_read" on storage.objects
    for select to anon, authenticated
    using (bucket_id = 'team-logos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'team_logos_admin_write'
  ) then
    create policy "team_logos_admin_write" on storage.objects
    for all to authenticated
    using (bucket_id = 'team-logos' and public.is_admin(auth.uid()))
    with check (bucket_id = 'team-logos' and public.is_admin(auth.uid()));
  end if;
end;
$$;
