
const scoreAliases:Record<string,string>={"racingclubdelens":"lens","rclens":"lens","sportingclubedeportugal":"sportingcp","sabahfk":"sabah","skslaviapraha":"slaviaprague","slaviapraha":"slaviaprague","internazionalemilano":"intermilan","inter":"intermilan","clubbruggekv":"clubbrugge","galatasaraysk":"galatasaray","barca":"barcelona","clubatleticodemadrid":"atleticomadrid","atleti":"atleticomadrid","vikingfk":"viking","bayernmunchen":"bayernmunich","bayern":"bayernmunich","psv":"psveindhoven","villarrealcf":"villarreal","sscnapoli":"napoli","feyenoordrotterdam":"feyenoord","como1907":"como","asroma":"roma","realmadridcf":"realmadrid","fkbodglimt":"bodglimt","dortmund":"borussiadortmund","fenerbahcesk":"fenerbahce","realbetisbalompie":"realbetis","porto":"porto","parissaintgermain":"psg","fkshakhtardonetsk":"shakhtardonetsk","shaktar":"shakhtardonetsk","paeaek":"aekathens","skslovanbratislava":"slovanbratislava","slslovanbratislava":"slovanbratislava","slbratislava":"slovanbratislava","stuttgart":"vfbstuttgart","lask":"lasklinz",westhamunited:"westham",westham:"westham",queensparkrangers:"qpr",manchesterunited:"manunited",manchestercity:"mancity",tottenhamhotspur:"tottenham",brightonhovealbion:"brighton",wolverhamptonwanderers:"wolves",westbromwichalbion:"westbrom",newcastleunited:"newcastle",leedsunited:"leeds",afcbournemouth:"bournemouth",ipswichtown:"ipswich",hullcity:"hull",coventrycity:"coventry",charltonathletic:"charlton",swanseacity:"swansea",norwichcity:"norwich",blackburnrovers:"blackburn",boltonwanderers:"bolton",derbycounty:"derby",lincolncity:"lincoln",stokecity:"stoke",birminghamcity:"birmingham",cardiffcity:"cardiff",prestonnorthend:"preston"};
function scoreName(s:unknown){const n=String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(football club|fc|afc)\b/g,"").replace(/[^a-z0-9]/g,"");return scoreAliases[n]||n;}
const alternateScoreCache=new Map<string,{at:number,matches:any[]}>();
async function freshAlternateScores(comp:string,date:string){
 const league=({PL:"eng.1",ELC:"eng.2",CL:"uefa.champions"} as Record<string,string>)[comp];
 const cacheKey=league+"|"+date,cached=alternateScoreCache.get(cacheKey);
 if(cached&&Date.now()-cached.at<60000)return cached.matches;
 const response=await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/"+league+"/scoreboard?dates="+date.replaceAll("-","")+"&limit=100",{headers:{Accept:"application/json","User-Agent":"PL-Predict/1.0"},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error("Alternate score provider unavailable");
 const body=await response.json();if(!Array.isArray(body.events))throw Error("Invalid alternate score response");
 const matches=body.events.map((e:any)=>{
  const c=e.competitions?.[0],h=c?.competitors?.find((x:any)=>x.homeAway==="home"),a=c?.competitors?.find((x:any)=>x.homeAway==="away");
  const state=c?.status||e.status,t=state?.type||{},name=String(t.name||"");
  const status=/POSTPONED/.test(name)?"POSTPONED":/CANCEL/.test(name)?"CANCELLED":/SUSPEND|ABANDON/.test(name)?"SUSPENDED":t.completed&&t.state==="post"?"FINISHED":/HALFTIME/.test(name)?"PAUSED":t.state==="in"?"IN_PLAY":"TIMED";
  const readScore=(x:any)=>["IN_PLAY","PAUSED","FINISHED"].includes(status)&&x?.score!==null&&x?.score!==undefined&&x.score!==""&&Number.isInteger(Number(x.score))&&Number(x.score)>=0?Number(x.score):null;
  return {id:e.id,utcDate:c?.date||e.date,status,home:h?.team?.displayName,away:a?.team?.displayName,homeShort:h?.team?.shortDisplayName,awayShort:a?.team?.shortDisplayName,homeScore:readScore(h),awayScore:readScore(a),minute:state?.clock?Math.floor(state.clock/60):null};
 }).filter((m:any)=>m.home&&m.away&&m.utcDate);
 if(alternateScoreCache.size>100)alternateScoreCache.clear();
 alternateScoreCache.set(cacheKey,{at:Date.now(),matches});return matches;
}
async function supplementLiveScores(matches:any[],comp:string){
 const now=Date.now();
 const pending=matches.filter(m=>{
  const kick=Date.parse(m.utcDate);
  return Number.isFinite(kick)&&kick<=now&&kick>=now-48*3600000&&!["FINISHED","POSTPONED","CANCELLED","SUSPENDED"].includes(m.status);
 });
 const days=[...new Set(pending.map(m=>m.utcDate.slice(0,10)))];
 const supplements=(await Promise.all(days.map(async date=>{try{return await freshAlternateScores(comp,date);}catch(e){console.warn("Alternate scoreboard",comp,date,String(e?.message||e));return [];}}))).flat();
 return matches.map(m=>{
  if(!pending.includes(m))return m;
  const found=supplements.filter(x=>Math.abs(Date.parse(x.utcDate)-Date.parse(m.utcDate))<6*3600000&&
   [m.home,m.homeShort].some(n=>n&&[x.home,x.homeShort].some(v=>v&&scoreName(n)===scoreName(v)))&&
   [m.away,m.awayShort].some(n=>n&&[x.away,x.awayShort].some(v=>v&&scoreName(n)===scoreName(v))));
  if(found.length!==1)return m;
  const f=found[0];if(!["IN_PLAY","PAUSED","FINISHED"].includes(f.status)||f.homeScore===null||f.awayScore===null)return m;
  return {...m,status:f.status,homeScore:f.homeScore,awayScore:f.awayScore,minute:f.minute,scoreSource:"ESPN",alternateMatchId:f.id};
 });
}

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
 const currentMatches=season?matches:await supplementLiveScores(matches,comp!);
 return new Response(JSON.stringify({competition:comp,updatedAt:new Date().toISOString(),delayed:true,matches:currentMatches}),{headers});
 }catch(e){return new Response(JSON.stringify({error:"Score feed request failed"}),{status:502,headers});}
});