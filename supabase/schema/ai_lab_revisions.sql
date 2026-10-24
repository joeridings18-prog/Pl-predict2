-- Reference SQL for owner-authorized pre-kickoff AI Labs revisions.
-- Applied via the connected database; human competition predictions are untouched.
begin;
create schema if not exists pl_ai_private;
revoke all on schema pl_ai_private from public,anon,authenticated;
grant usage on schema pl_ai_private to anon,authenticated;
create table if not exists pl_ai_private.revisions(
 id bigint generated always as identity primary key,
 game_id text not null,
 fixture_index integer not null,
 previous_pick jsonb,
 new_pick jsonb not null,
 changed_at timestamptz not null default clock_timestamp(),
 kickoff timestamptz not null,
 context jsonb not null default '{}'::jsonb,
 check(changed_at<kickoff)
);
alter table pl_ai_private.revisions enable row level security;
revoke all on pl_ai_private.revisions from public,anon,authenticated;
create index if not exists ai_lab_revisions_game_fixture on pl_ai_private.revisions(game_id,fixture_index,changed_at);

-- Every database update uses this guard, including administrator updates.
create or replace function public.pl_ai_predictions_immutable()
returns trigger language plpgsql security definer set search_path='' as $$
declare fs jsonb; f jsonb; i integer; k timestamptz; moment timestamptz; ctx jsonb;
begin
 if tg_op='DELETE' then raise exception 'AI prediction history cannot be deleted'; end if;
 if new.game_id is distinct from old.game_id or new.locked_at is distinct from old.locked_at then
  raise exception 'Original AI prediction identity and timestamp cannot be changed';
 end if;
 select fixtures into fs from public.pl_games where id=old.game_id for share;
 if fs is null or jsonb_typeof(new.predictions) is distinct from 'array' or jsonb_array_length(new.predictions)<>jsonb_array_length(fs) then
  raise exception 'AI predictions must preserve the complete fixture array';
 end if;
 ctx=coalesce(nullif(current_setting('pl.ai_lab_context',true),'')::jsonb,'{"source":"owner-authorized database revision"}'::jsonb);
 for i in 0..jsonb_array_length(fs)-1 loop
  if (old.predictions->i) is not distinct from (new.predictions->i) then continue; end if;
  f=fs->i;
  begin k=(f->>3)::timestamptz; exception when others then k=null; end;
  moment=clock_timestamp();
  if k is null or k<=moment or exists(select 1 from public.pl_results where game_id=old.game_id and fixture_index=i) then
   raise exception 'Fixture % has started, has a result, or has no valid kickoff; its AI pick is locked',i;
  end if;
  if jsonb_typeof(new.predictions->i) is distinct from 'array' or jsonb_array_length(new.predictions->i)<>2 then
   raise exception 'A revised AI pick must contain two integer goals';
  end if;
  if jsonb_typeof(new.predictions->i->0) is distinct from 'number' or jsonb_typeof(new.predictions->i->1) is distinct from 'number'
   or (new.predictions->i->>0)!~'^(0|[1-9][0-9]?)$' or (new.predictions->i->>1)!~'^(0|[1-9][0-9]?)$'
   or (new.predictions->i->>0)::int>20 or (new.predictions->i->>1)::int>20 then
   raise exception 'Revised goals must be integers from 0 to 20';
  end if;
  insert into pl_ai_private.revisions(game_id,fixture_index,previous_pick,new_pick,changed_at,kickoff,context)
   values(old.game_id,i,old.predictions->i,new.predictions->i,moment,k,ctx);
 end loop;
 return new;
end $$;
revoke all on function public.pl_ai_predictions_immutable() from public,anon,authenticated;

-- The privileged implementation lives outside the exposed API schema.
create or replace function pl_ai_private.set_lab_pick(
 p_player text,p_pin text,p_game_id text,p_fixture_index integer,
 p_expected jsonb,p_pick jsonb,p_fixture jsonb,p_model jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare h text; picks jsonb; fs jsonb; f jsonb; context_before text;
begin
 if p_player is distinct from 'Joe' or p_pin is null or p_pin!~'^[0-9]{4}$' then raise exception 'Not authorized'; end if;
 select pin_hash into h from public.pl_player_pins where player='Joe';
 if h is null or extensions.crypt(p_pin,h) is distinct from h then raise exception 'Not authorized'; end if;
 if jsonb_typeof(p_model) is distinct from 'object' or octet_length(p_model::text)>20000 then raise exception 'Invalid model context'; end if;
 select predictions into picks from public.pl_ai_predictions where game_id=p_game_id for update;
 if not found then raise exception 'This round has no AI Tracker entry yet'; end if;
 select fixtures into fs from public.pl_games where id=p_game_id for share;
 if p_fixture_index is null or p_fixture_index<0 or p_fixture_index>=jsonb_array_length(picks) then raise exception 'Invalid fixture'; end if;
 f=fs->p_fixture_index;
 if jsonb_build_array(f->>0,f->>1,f->>3) is distinct from p_fixture then raise exception 'Fixture details changed; reload AI Labs'; end if;
 if (picks->p_fixture_index) is distinct from p_expected then raise exception 'The AI pick changed on another device; reload AI Labs'; end if;
 -- Check even a no-op so started matches never report a successful revision.
 if coalesce((f->>3)::timestamptz<=clock_timestamp(),true) or exists(select 1 from public.pl_results where game_id=p_game_id and fixture_index=p_fixture_index) then raise exception 'This match has started or has a result; the AI pick is locked'; end if;
 context_before=current_setting('pl.ai_lab_context',true);
 perform set_config('pl.ai_lab_context',jsonb_build_object('source','AI Labs','actor','Joe','model',p_model)::text,true);
 update public.pl_ai_predictions set predictions=jsonb_set(picks,array[p_fixture_index::text],p_pick) where game_id=p_game_id;
 perform set_config('pl.ai_lab_context',coalesce(context_before,''),true);
 return jsonb_build_object('game_id',p_game_id,'fixture_index',p_fixture_index,'prediction',p_pick,'updated_at',clock_timestamp());
end $$;
revoke all on function pl_ai_private.set_lab_pick(text,text,text,integer,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function pl_ai_private.set_lab_pick(text,text,text,integer,jsonb,jsonb,jsonb,jsonb) to anon,authenticated;
create or replace function public.set_ai_lab_pick_with_pin(
 p_player text,p_pin text,p_game_id text,p_fixture_index integer,
 p_expected jsonb,p_pick jsonb,p_fixture jsonb,p_model jsonb
) returns jsonb language sql security invoker set search_path='' as $$
 select pl_ai_private.set_lab_pick(p_player,p_pin,p_game_id,p_fixture_index,p_expected,p_pick,p_fixture,p_model);
$$;
revoke all on function public.set_ai_lab_pick_with_pin(text,text,text,integer,jsonb,jsonb,jsonb,jsonb) from public;
grant execute on function public.set_ai_lab_pick_with_pin(text,text,text,integer,jsonb,jsonb,jsonb,jsonb) to anon,authenticated;
commit;
