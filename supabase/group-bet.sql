-- Shared group betting ledger. Readable by all; writes use existing Joe PIN auth.
create table public.pl_group_bets (
 id uuid primary key,
 season_key text not null,
 data jsonb not null,
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.pl_group_bets enable row level security;
revoke all on public.pl_group_bets from anon, authenticated;
grant select on public.pl_group_bets to anon, authenticated;
create policy group_bets_read on public.pl_group_bets for select to anon, authenticated using (true);
create schema if not exists private;
create or replace function private.save_group_bet(p_id uuid,p_season text,p_data jsonb,p_revision integer,p_player text,p_pin text)
returns integer language plpgsql security definer set search_path='' as $$
declare h text; p jsonb; b jsonb; v integer; n numeric;
begin
 if p_player is distinct from 'Joe' or p_pin is null then raise exception 'Only Joe can manage group bets'; end if;
 select pin_hash into h from public.pl_player_pins where player='Joe';
 if h is null or h is distinct from extensions.crypt(p_pin,h) then raise exception 'Incorrect PIN'; end if;
 if p_season is distinct from '2026-27' or p_id is null or p_data is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid group bet'; end if;
 if coalesce(length(trim(p_data->>'title')),0) not between 1 and 100 or coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Title and date required'; end if;
 if jsonb_typeof(p_data->'picks') is distinct from 'array' or jsonb_array_length(p_data->'picks')<>4 then raise exception 'Four picks required'; end if;
 if (select count(distinct x->>'player') from jsonb_array_elements(p_data->'picks') x where x->>'player' in ('Joe','Josh','Russ','Scott'))<>4 then raise exception 'One pick per player required'; end if;
 for p in select * from jsonb_array_elements(p_data->'picks') loop
  if coalesce(length(trim(p->>'team')),0) not between 1 and 100 or coalesce(length(trim(p->>'opponent')),0) not between 1 and 100 then raise exception 'Team and opponent required for every pick'; end if;
  if coalesce(p->>'result','') not in ('pending','won','lost','void') or coalesce(p->>'goals','') not in ('pending','won','lost','void') then raise exception 'Invalid pick result'; end if;
  if coalesce(p->>'game_id','')<>'' and not exists(select 1 from public.pl_games g where g.id=p->>'game_id' and (p->>'fixture_index')::int>=0 and (p->>'fixture_index')::int<jsonb_array_length(g.fixtures) and p->>'side' in ('home','away') and p->>'team'=g.fixtures->((p->>'fixture_index')::int)->>(case when p->>'side'='home' then 0 else 1 end) and p->>'opponent'=g.fixtures->((p->>'fixture_index')::int)->>(case when p->>'side'='home' then 1 else 0 end)) then raise exception 'Invalid linked fixture'; end if;
 end loop;
 if (p_data->'resultBet'->>'placed')::boolean or (p_data->'goalsBet'->>'placed')::boolean then
  if (select count(distinct least(lower(trim(x->>'team')),lower(trim(x->>'opponent')))||'|'||greatest(lower(trim(x->>'team')),lower(trim(x->>'opponent')))) from jsonb_array_elements(p_data->'picks') x)<>4 then raise exception 'A four-fold needs four different matches'; end if;
 end if;
 for b in select p_data->'resultBet' union all select p_data->'goalsBet' loop
  if jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(b->'placed') is distinct from 'boolean' then raise exception 'Invalid bet'; end if;
  n:=(b->>'stake')::numeric;
  if n is null or n<0 or n>100000 or n<>round(n,2) or (b->>'placed')::boolean and n<=0 then raise exception 'Enter a valid stake'; end if;
  n:=nullif(b->>'odds','')::numeric;
  if n is not null and (n<1 or n>1000000) then raise exception 'Decimal odds must be at least 1'; end if;
  n:=nullif(b->>'actual_return','')::numeric;
  if n is not null and (n<0 or n>100000000 or n<>round(n,2)) then raise exception 'Invalid return'; end if;
 end loop;
 if p_revision=0 then
  insert into public.pl_group_bets(id,season_key,data) values(p_id,p_season,p_data) returning revision into v;
 else
  update public.pl_group_bets set data=p_data,revision=revision+1,updated_at=now() where id=p_id and season_key=p_season and revision=p_revision returning revision into v;
  if v is null then raise exception 'This bet changed on another device. Refresh and try again.'; end if;
 end if;
 return v;
end $$;
revoke all on function private.save_group_bet(uuid,text,jsonb,integer,text,text) from public;
grant usage on schema private to anon,authenticated;
grant execute on function private.save_group_bet(uuid,text,jsonb,integer,text,text) to anon,authenticated;
create or replace function public.save_group_bet_with_pin(p_id uuid,p_season text,p_data jsonb,p_revision integer,p_player text,p_pin text)
returns integer language sql security invoker set search_path='' as $$
 select private.save_group_bet(p_id,p_season,p_data,p_revision,p_player,p_pin);
$$;
revoke all on function public.save_group_bet_with_pin(uuid,text,jsonb,integer,text,text) from public;
grant execute on function public.save_group_bet_with_pin(uuid,text,jsonb,integer,text,text) to anon,authenticated;
