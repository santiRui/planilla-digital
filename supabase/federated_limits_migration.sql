-- Run once in Supabase SQL Editor before deploying the federation UI/API.
begin;

alter table public.categories
  add column if not exists federated_u21_limit int check (federated_u21_limit >= 0),
  add column if not exists federated_u23_limit int check (federated_u23_limit >= 0),
  add column if not exists federated_primera_limit int check (federated_primera_limit >= 0),
  add column if not exists federated_segunda_limit int check (federated_segunda_limit >= 0);

alter table public.players
  add column if not exists federated_category text,
  add column if not exists labas_seasons int not null default 0,
  add column if not exists scoring int;

alter table public.players alter column is_federated set default false;

update public.players
set federated_category = case federated_category
  when 'mayores' then 'primera'
  when 'intermedia' then 'segunda'
  else federated_category
end,
scoring = case when federated_category = 'intermedia' and is_federated
  then scoring + 200 else scoring end
where federated_category in ('mayores', 'intermedia');

commit;
