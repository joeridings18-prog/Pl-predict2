import {createClient} from "npm:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,api=Deno.env.get("FOOTBALL_DATA_API_KEY");
const sb=createClient(url,key);
const norm=(s:string)=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(football club|fc|afc)\b/g,"").replace(/[^a-z0-9]/g,"");
const aliases:Record<string,string>={"racingclubdelens":"lens","rclens":"lens","sportingclubedeportugal":"sportingcp","sabahfk":"sabah","skslaviapraha":"slaviaprague","slaviapraha":"slaviaprague","internazionalemilano":"intermilan","inter":"intermilan","clubbruggekv":"clubbrugge","galatasaraysk":"galatasaray","barca":"barcelona","clubatleticodemadrid":"atleticomadrid","atleti":"atleticomadrid","vikingfk":"viking","bayernmunchen":"bayernmunich","bayern":"bayernmunich","psv":"psveindhoven","villarrealcf":"villarreal","sscnapoli":"napoli","feyenoordrotterdam":"feyenoord","como1907":"como","asroma":"roma","realmadridcf":"realmadrid","fkbodglimt":"bodglimt","dortmund":"borussiadortmund","fenerbahcesk":"fenerbahce","realbetisbalompie":"realbetis","porto":"porto","parissaintgermain":"psg","fkshakhtardonetsk":"shakhtardonetsk","shaktar":"shakhtardonetsk","paeaek":"aekathens","skslovanbratislava":"slovanbratislava","slslovanbratislava":"slovanbratislava","slbratislava":"slovanbratislava","stuttgart":"vfbstuttgart","lask":"lasklinz",westhamunited:"westham",westham:"westham",queensparkrangers:"qpr",manchesterunited:"manunited",manchestercity:"mancity",tottenhamhotspur:"tottenham",brightonhovealbion:"brighton",wolverhamptonwanderers:"wolves",westbromwichalbion:"westbrom",newcastleunited:"newcastle",leedsunited:"leeds",afcbournemouth:"bournemouth",ipswichtown:"ipswich",hullcity:"hull",coventrycity:"coventry",charltonathletic:"charlton",swanseacity:"swansea",norwichcity:"norwich",blackburnrovers:"blackburn",boltonwanderers:"bolton",derbycounty:"derby",lincolncity:"lincoln",stokecity:"stoke",birminghamcity:"birmingham",cardiffcity:"cardiff",prestonnorthend:"preston"};
const canonical=(s:string)=>aliases[norm(s)]||norm(s);
Deno.serve(async req=>{
 const token=req.headers.get("x-sync-token")||"";
 const {data:allowed,error:authError}=await sb.rpc("verify_final_sync_token",{p_token:token});
 if(authError||!allowed)return new Response("Unauthorized",{status:401});
 if(!api)return new Response("Football API secret missing",{status:503});
 try{
 const now=Date.now();
 const {data:games,error}=await sb.from("pl_games").select("id,fixtures,reveal_at").lte("reveal_at",new Date(now).toISOString()).gte("reveal_at",new Date(now-10*86400000).toISOString());
 if(error)throw error;
 const competitions=["PL","ELC","CL"];
 const feedDiagnostics:any[]=[];
 const feeds=await Promise.all(competitions.map(async comp=>{
  const res=await fetch(url+"/functions/v1/football-scores?competition="+comp+"&dateFrom="+new Date(now-10*86400000).toISOString().slice(0,10)+"&dateTo="+new Date(now+86400000).toISOString().slice(0,10),{signal:AbortSignal.timeout(40000)});
  if(!res.ok){feedDiagnostics.push({comp,status:res.status});return [];}
  const data=await res.json();const matches=(data.matches||[]).filter((m:any)=>m.status==="FINISHED").map((m:any)=>({status:m.status,utcDate:m.utcDate,homeTeam:{name:m.home,shortName:m.homeShort},awayTeam:{name:m.away,shortName:m.awayShort},score:{fullTime:{home:m.homeScore,away:m.awayScore}}}));feedDiagnostics.push({comp,count:matches.length});return matches;
 }));
 const matches=feeds.flat(),summary:any[]=[];
 for(const g of games||[]){
  const results:any[]=[];
  for(let i=0;i<g.fixtures.length;i++){
   const f=g.fixtures[i],kick=Date.parse(f[3]||"");
   if(!Number.isFinite(kick)||kick>now||kick<now-10*86400000)continue;
   const m=matches.find((m:any)=>(canonical(m.homeTeam?.name)===canonical(f[0])||canonical(m.homeTeam?.shortName)===canonical(f[0]))&&(canonical(m.awayTeam?.name)===canonical(f[1])||canonical(m.awayTeam?.shortName)===canonical(f[1]))&&Math.abs(Date.parse(m.utcDate)-kick)<3*86400000);
   const h=m?.score?.fullTime?.home,a=m?.score?.fullTime?.away;
   if(m&&Number.isInteger(h)&&Number.isInteger(a))results.push({fixture_index:i,home_score:h,away_score:a,status:"FINISHED"});
  }
  if(results.length){const {data,error}=await sb.rpc("import_finished_scores",{p_game_id:g.id,p_results:results});if(error)throw error;summary.push({game:g.id,matched:results.length,inserted:data});}
 }
 console.log("Final score sync",JSON.stringify({games:(games||[]).length,feedDiagnostics,summary}));
 return Response.json({ok:true,games:(games||[]).length,feedDiagnostics,summary});
 }catch(e){console.error("Final score sync error",String(e));return Response.json({error:"Automatic score sync failed"},{status:502});}
});