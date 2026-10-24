-- Reference for the existing PIN-protected tracker reader, extended with revision history.
CREATE OR REPLACE FUNCTION public.get_ai_tracker_with_pin(p_player text, p_pin text, p_season_key text DEFAULT '2026-27'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_hash text; v_result jsonb;
begin
 if p_player is distinct from 'Joe' then raise exception 'Not authorized'; end if;
 select pin_hash into v_hash from public.pl_player_pins where player='Joe';
 if p_pin is null or p_pin !~ '^[0-9]{4}$' or v_hash is null or crypt(p_pin,v_hash) is distinct from v_hash then raise exception 'Invalid PIN'; end if;
 with round_data as (
 select g.id,g.round_label,g.reveal_at,g.fixtures,a.predictions,a.locked_at,
 coalesce((select jsonb_agg(case when r.fixture_index is null then 'null'::jsonb else jsonb_build_array(r.home_score,r.away_score) end order by n.idx)
 from generate_series(0,jsonb_array_length(g.fixtures)-1) n(idx)
 left join public.pl_results r on r.game_id=g.id and r.fixture_index=n.idx),'[]'::jsonb) results
 from public.pl_ai_predictions a join public.pl_games g on g.id=a.game_id where g.season_key=p_season_key
 ), scored as (
 select d.*,
 coalesce((select sum(case when res is null or jsonb_typeof(res)='null' or pred is null or jsonb_typeof(pred)='null' then 0
 when pred=res then 16
 when sign((pred->>0)::int-(pred->>1)::int)=sign((res->>0)::int-(res->>1)::int) then 6 else 0 end)
 from jsonb_array_elements(d.predictions) with ordinality p(pred,n)
 cross join lateral (select d.results->(p.n-1)::int res) z),0) points,
 (select count(*) from jsonb_array_elements(d.predictions) with ordinality p(pred,n) where d.results->(p.n-1)::int=pred and jsonb_typeof(pred)='array') exacts,
 (select count(*) from jsonb_array_elements(d.predictions) with ordinality p(pred,n) where jsonb_typeof(d.results->(p.n-1)::int)='array' and jsonb_typeof(pred)='array' and sign((pred->>0)::int-(pred->>1)::int)=sign(((d.results->(p.n-1)::int)->>0)::int-((d.results->(p.n-1)::int)->>1)::int)) correct,
 (select count(*) from jsonb_array_elements(d.results) res where jsonb_typeof(res)='array') completed
 from round_data d
 )
 select jsonb_build_object(
 'season_points',coalesce(sum(points),0),'exact_scores',coalesce(sum(exacts),0),
 'correct_results',coalesce(sum(correct),0),'completed_fixtures',coalesce(sum(completed),0),
 'accuracy_pct',case when coalesce(sum(completed),0)>0 then round(100.0*sum(correct)/sum(completed),1) else 0 end,
 'exact_pct',case when coalesce(sum(completed),0)>0 then round(100.0*sum(exacts)/sum(completed),1) else 0 end,
 'avg_points_per_fixture',case when coalesce(sum(completed),0)>0 then round(sum(points)::numeric/sum(completed),2) else 0 end,
 'best_round',(select jsonb_build_object('round_label',round_label,'points',points) from scored where completed>0 order by points desc,reveal_at limit 1),
 'worst_round',(select jsonb_build_object('round_label',round_label,'points',points) from scored where completed>0 order by points asc,reveal_at limit 1),
 'rounds',coalesce((select jsonb_agg(jsonb_build_object('game_id',id,'round_label',round_label,'reveal_at',reveal_at,'locked_at',locked_at,'fixtures',fixtures,'predictions',predictions,'results',results,'points',points,'exacts',exacts,'correct',correct,'completed',completed) order by reveal_at) from scored),'[]'::jsonb))
 into v_result from scored;

 v_result := v_result || jsonb_build_object('betting_rows',(
SELECT coalesce(jsonb_agg(jsonb_build_object(
 'game_id',g.id,'round',g.round_label,'fixture_index',n.idx-1,
 'home',n.fixture->>0,'away',n.fixture->>1,'prediction',a.predictions->((n.idx-1)::int),
 'actual',CASE WHEN r.home_score IS NOT NULL AND r.away_score IS NOT NULL THEN jsonb_build_array(r.home_score,r.away_score) ELSE NULL END,
 'odds',o.decimal_odds,'bookmaker',o.bookmaker,
 'result_odds',mo.decimal_odds,'result_bookmaker',mo.bookmaker
) ORDER BY g.reveal_at,n.idx),'[]'::jsonb)
FROM public.pl_ai_predictions a
JOIN public.pl_games g ON g.id=a.game_id
CROSS JOIN LATERAL jsonb_array_elements(g.fixtures) WITH ORDINALITY n(fixture,idx)
LEFT JOIN public.pl_results r ON r.game_id=g.id AND r.fixture_index=n.idx-1
LEFT JOIN public.pl_virtual_odds o ON o.game_id=g.id AND o.fixture_index=n.idx-1
 AND o.home_score=(a.predictions->((n.idx-1)::int)->>0)::int
 AND o.away_score=(a.predictions->((n.idx-1)::int)->>1)::int
LEFT JOIN public.pl_match_result_odds mo ON mo.game_id=g.id AND mo.fixture_index=n.idx-1
 AND mo.outcome=CASE
 WHEN (a.predictions->((n.idx-1)::int)->>0)::int>(a.predictions->((n.idx-1)::int)->>1)::int THEN 'home'
 WHEN (a.predictions->((n.idx-1)::int)->>0)::int<(a.predictions->((n.idx-1)::int)->>1)::int THEN 'away' ELSE 'draw' END
WHERE g.season_key=p_season_key AND jsonb_typeof(a.predictions->((n.idx-1)::int))='array'
 AND a.locked_at <= (n.fixture->>3)::timestamptz));
 v_result := v_result || jsonb_build_object('lab_revisions',coalesce((
 select jsonb_agg(jsonb_build_object('game_id',r.game_id,'fixture_index',r.fixture_index,'previous_pick',r.previous_pick,'new_pick',r.new_pick,'changed_at',r.changed_at,'kickoff',r.kickoff,'context',r.context) order by r.changed_at,r.id)
 from pl_ai_private.revisions r join public.pl_games g on g.id=r.game_id where g.season_key=p_season_key
 ),'[]'::jsonb));
 return v_result;
end $function$
;
