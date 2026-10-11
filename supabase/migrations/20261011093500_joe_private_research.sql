create schema if not exists pl_research_private;
revoke all on schema pl_research_private from public, anon, authenticated;
create table pl_research_private.documents(
 key text primary key check (length(key) between 1 and 100),
 payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=1000000),
 updated_at timestamptz not null default now()
);
alter table pl_research_private.documents enable row level security;
revoke all on pl_research_private.documents from public, anon, authenticated;
create or replace function public.get_research_with_pin(p_player text,p_pin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h text;
begin
 if p_player is distinct from 'Joe' or p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'Not authorized'; end if;
 select pin_hash into h from public.pl_player_pins where player='Joe';
 if h is null or extensions.crypt(p_pin,h) is distinct from h then raise exception 'Not authorized'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('key',key,'payload',payload,'updated_at',updated_at) order by key) from pl_research_private.documents),'[]'::jsonb);
end $$;
revoke all on function public.get_research_with_pin(text,text) from public;
grant execute on function public.get_research_with_pin(text,text) to anon, authenticated;
create or replace function public.save_research_with_pin(p_player text,p_pin text,p_key text,p_payload jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare h text;
begin
 if p_player is distinct from 'Joe' or p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'Not authorized'; end if;
 select pin_hash into h from public.pl_player_pins where player='Joe';
 if h is null or extensions.crypt(p_pin,h) is distinct from h then raise exception 'Not authorized'; end if;
 if p_key is null or p_key !~ '^(goals:(PL|ELC|CL):2026-27|note:[a-zA-Z0-9_-]+|quote:[a-zA-Z0-9_-]+)$' then raise exception 'Invalid research key'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>1000000 then raise exception 'Invalid research data'; end if;
 insert into pl_research_private.documents(key,payload) values(p_key,p_payload) on conflict(key) do update set payload=excluded.payload,updated_at=now();
 return true;
end $$;
revoke all on function public.save_research_with_pin(text,text,text,jsonb) from public;
grant execute on function public.save_research_with_pin(text,text,text,jsonb) to anon,authenticated;