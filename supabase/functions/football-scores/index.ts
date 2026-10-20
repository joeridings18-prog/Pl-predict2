const groupScoreCache=new Map<string,{at:number,body:string}>();
function groupCanonical(name:unknown){
 const n=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(fc|afc)\b/g,'').replace(/[^a-z0-9]/g,'');
 return ({brightonhovealbion:'brighton',stockportcounty:'stockport',grimsbytown:'grimsby',northamptontown:'northampton',boltonwanderers:'bolton',asroma:'roma',skslovanbratislava:'slovanbratislava',leicestercity:'leicester',villarrealcf:'villarreal'} as Record<string,string>)[n]||n;
}
async function groupBetScores(url:URL,headers:Record<string,string>){
 const id=url.searchParams.get('groupBetId')||'';
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return new Response(JSON.stringify({error:'Invalid group bet'}),{status:400,headers});
 const cached=groupScoreCache.get(id);
 if(cached&&Date.now()-cached.at<60000)return new Response(cached.body,{headers});
 const db=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!db||!key)return new Response(JSON.stringify({error:'Group score service unavailable'}),{status:503,headers});
 const auth={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 try{
  const response=await fetch(db+'/rest/v1/pl_group_bets?id=eq.'+id+'&select=id,data,revision',{headers:auth,signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Could not read group bet');
  const [row]=await response.json();
  if(!row)return new Response(JSON.stringify({error:'Group bet not found'}),{status:404,headers});
  const date=row.data.date;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid group bet date');
  const leagues=['eng.1','eng.2','eng.3','eng.4','uefa.champions'];
  const jobs=new Map<string,{league:string,date:string}>();
  for(const p of row.data.picks||[]){
   const competition=p.competition==='CL'?'uefa.champions':p.competition;
   const comps=leagues.includes(competition)?[competition]:leagues;
   const kickoff=Date.parse(p.kickoff||'');
   const days=Number.isFinite(kickoff)?[new Date(kickoff).toISOString().slice(0,10)]:[0,1,2].map(n=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10));
   for(const league of comps)for(const day of days)jobs.set(league+'|'+day,{league,date:day});
  }
  const feeds=await Promise.all([...jobs.values()].map(async ({league,date})=>{
   try{
    const r=await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/'+league+'/scoreboard?dates='+date.replaceAll('-','')+'&limit=100',{headers:{'Accept':'application/json','User-Agent':'PL-Predict/1.0'},signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Error('HTTP '+r.status);
    const raw=await r.json();
    if(!Array.isArray(raw.events))throw Error('invalid response');
    const matches=raw.events.map((e:any)=>{
     const c=e.competitions?.[0],home=c?.competitors?.find((x:any)=>x.homeAway==='home'),away=c?.competitors?.find((x:any)=>x.homeAway==='away');
     const st=c?.status||e.status,type=st?.type||{},name=String(type.name||'');
     const status=/POSTPONED/.test(name)?'POSTPONED':/CANCEL/.test(name)?'CANCELLED':/SUSPEND|ABANDON/.test(name)?'SUSPENDED':type.completed&&type.state==='post'?'FINISHED':/HALFTIME/.test(name)?'PAUSED':type.state==='in'?'IN_PLAY':'TIMED';
     const score=(x:any)=>['IN_PLAY','PAUSED','FINISHED'].includes(status)&&x?.score!==null&&x?.score!==undefined&&x.score!==''&&Number.isInteger(Number(x.score))&&Number(x.score)>=0?Number(x.score):null;
     return {id:e.id,utcDate:c?.date||e.date,status,clock:st?.displayClock||'',minute:st?.clock?Math.floor(st.clock/60):null,home:home?.team?.displayName,away:away?.team?.displayName,homeShort:home?.team?.shortDisplayName,awayShort:away?.team?.shortDisplayName,homeScore:score(home),awayScore:score(away),competition:league};
    }).filter((m:any)=>m.home&&m.away&&m.utcDate);
    return {matches};
   }catch(e){console.warn('Group score feed',league,date,String(e?.message||'request failed'));return {matches:[],issue:({'eng.1':'Premier League','eng.2':'Championship','eng.3':'League One','eng.4':'League Two','uefa.champions':'Champions League'} as Record<string,string>)[league]+' scores temporarily unavailable'};}
  }));
  const matches=feeds.flatMap(x=>x.matches),issues=feeds.flatMap(x=>x.issue?[x.issue]:[]);
  const finals={...(row.data.final_scores||{})};
  for(const p of row.data.picks||[]){
   const candidates=matches.filter((m:any)=>((groupCanonical(m.home)===groupCanonical(p.team)&&groupCanonical(m.away)===groupCanonical(p.opponent))||(groupCanonical(m.away)===groupCanonical(p.team)&&groupCanonical(m.home)===groupCanonical(p.opponent)))&&(!p.kickoff||Math.abs(Date.parse(m.utcDate)-Date.parse(p.kickoff))<86400000));
   // Never guess between two meetings of the same teams in the date window.
   if(candidates.length===1){const m=candidates[0];if(m.status==='FINISHED'&&m.homeScore!==null&&m.awayScore!==null)finals[p.player]={...m,team:p.team,opponent:p.opponent};}
  }
  let revision=row.revision;
  if(JSON.stringify(finals)!==JSON.stringify(row.data.final_scores||{})){
   const patch=await fetch(db+'/rest/v1/pl_group_bets?id=eq.'+id+'&revision=eq.'+row.revision,{method:'PATCH',headers:{...auth,Prefer:'return=representation'},body:JSON.stringify({data:{...row.data,final_scores:finals},revision:row.revision+1,updated_at:new Date().toISOString()}),signal:AbortSignal.timeout(12000)});
   if(patch.ok){const saved=await patch.json();if(saved.length)revision=saved[0].revision;}
  }
  const body=JSON.stringify({competition:'GROUP',updatedAt:new Date().toISOString(),delayed:true,matches,issues,finalScores:finals,revision});
  // Bound the per-instance cache; only public scores and IDs are cached.
  if(groupScoreCache.size>200)groupScoreCache.clear();
  if(issues.length<jobs.size)groupScoreCache.set(id,{at:Date.now(),body});
  return new Response(body,{headers,status:issues.length===jobs.size?502:200});
 }catch{return new Response(JSON.stringify({error:'Group score feed request failed'}),{status:502,headers});}
}

const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, OPTIONS","Cache-Control":"public, max-age=60"};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers});
 if(req.method!=="GET")return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers});
 const url=new URL(req.url),comp=url.searchParams.get("competition");
 const from=url.searchParams.get("dateFrom"),to=url.searchParams.get("dateTo");
 if(comp==="GROUP")return await groupBetScores(url,headers);
 if(!["PL","ELC","CL"].includes(comp||""))return new Response(JSON.stringify({error:"Unsupported competition"}),{status:400,headers});
 const season=url.searchParams.get("season");
 if(season&&!/^(20[0-9]{2})$/.test(season))return new Response(JSON.stringify({error:"Invalid season"}),{status:400,headers});
 const key=Deno.env.get("FOOTBALL_DATA_API_KEY");
 if(!key)return new Response(JSON.stringify({error:"API secret not configured"}),{status:503,headers});
 try{
 const base="https://api.football-data.org/v4/competitions/"+comp+"/matches?";
 let upstream=await fetch(base+(season?"season="+season:from&&to?"dateFrom="+from+"&dateTo="+to:"status=SCHEDULED,LIVE,IN_PLAY,PAUSED,FINISHED"),{headers:{"X-Auth-Token":key},signal:AbortSignal.timeout(12000)});
 if(!upstream.ok&&!season&&from&&to)upstream=await fetch(base+"status=SCHEDULED,LIVE,IN_PLAY,PAUSED,FINISHED",{headers:{"X-Auth-Token":key},signal:AbortSignal.timeout(12000)});
 const raw=await upstream.json();
 if(!upstream.ok)return new Response(JSON.stringify({error:"Football provider unavailable",status:upstream.status}),{status:502,headers});
 const matches=(raw.matches||[]).map(m=>({id:m.id,utcDate:m.utcDate,status:m.status,matchday:m.matchday??null,stage:m.stage??null,minute:m.minute??null,home:m.homeTeam?.name,away:m.awayTeam?.name,homeShort:m.homeTeam?.shortName,awayShort:m.awayTeam?.shortName,homeScore:m.score?.fullTime?.home??null,awayScore:m.score?.fullTime?.away??null}));
 return new Response(JSON.stringify({competition:comp,updatedAt:new Date().toISOString(),delayed:true,matches}),{headers});
 }catch(e){return new Response(JSON.stringify({error:"Score feed request failed"}),{status:502,headers});}
});