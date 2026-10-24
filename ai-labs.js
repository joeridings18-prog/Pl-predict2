(function(){
"use strict";
const STORAGE="pl_ai_labs_v1";
let historicalResults=new Map();
let generation=0,roundRequest=0;
const feeds=new Map(),automatic=new Map();
const root=()=>document.getElementById("aiLabsContent");
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const eligible=()=>Array.isArray(games)?games.filter(g=>Array.isArray(g.fixtures)&&g.fixtures.length):[];
const stored=()=>{try{const value=JSON.parse(localStorage.getItem(STORAGE)||"[]");return Array.isArray(value)?value:[];}catch{return []}};
const current=()=>loggedIn&&me==="Joe"&&!!pin;
const scoreResult=(h,a)=>Math.sign(h-a);
function factorial(n){let f=1;for(let k=2;k<=n;k++)f*=k;return f;}
function poisson(k,lambda){return Math.exp(-lambda)*Math.pow(lambda,k)/factorial(k);}
function matrix(home,away,rho){
 const a=[];let total=0;
 for(let h=0;h<=10;h++)for(let v=0;v<=10;v++){
  let p=poisson(h,home)*poisson(v,away);
  if(h===0&&v===0)p*=1-home*away*rho;
  if(h===0&&v===1)p*=1+home*rho;
  if(h===1&&v===0)p*=1+away*rho;
  if(h===1&&v===1)p*=1-rho;
  if(p<0)throw Error("The Dixon–Coles correlation is not valid for these xG values. Reduce its magnitude.");
  a.push({h,v,p});total+=p;
 }
 return a.map(x=>({...x,p:x.p/total}));
}
function calculate(home,away,rho){
 const a=matrix(home,away,rho);
 const outcomes=[0,0,0];for(const x of a)outcomes[scoreResult(x.h,x.v)+1]+=x.p;
 const choices=a.map(x=>({...x,ep:10*x.p+6*outcomes[scoreResult(x.h,x.v)+1]})).sort((a,b)=>b.ep-a.ep||b.p-a.p);
 return {outcomes,choices,best:choices[0],likely:[...a].sort((a,b)=>b.p-a.p)[0]};
}
function selected(){
 const id=document.getElementById("labRound")?.value;
 return eligible().find(g=>String(g.id)===id);
}
function fixtureDate(f){const t=Date.parse(f?.[3]||f?.[2]||"");return Number.isFinite(t)?t:null;}
function render(){
 generation++;roundRequest++;automatic.clear();
 if(!current()){if(root())root().innerHTML="";return;}
 const gs=eligible(),now=Date.now();
 const upcoming=gs.filter(g=>g.fixtures.some(f=>{const t=fixtureDate(f);return t!==null&&t>now;})).sort((a,b)=>Math.min(...a.fixtures.map(f=>fixtureDate(f)).filter(t=>t>now))-Math.min(...b.fixtures.map(f=>fixtureDate(f)).filter(t=>t>now)));
 const preferred=upcoming[0]||gs[gs.length-1];
 const el=root();if(!el)return;
 el.innerHTML='<h2 style="margin:0 0 8px">🧪 AI Labs · Automatic team model</h2>'+
 '<p class="small">Generate goal estimates from this season’s completed results, or enter your own assumptions. Compare picks for our <b>6-point result + 10-point exact-score</b> rules. Nothing here changes official picks.</p>'+
 '<div class="statMiniGrid"><div class="statMini"><span>Model</span><b>Poisson + Dixon–Coles</b></div><div class="statMini"><span>Strategy</span><b>Expected points</b></div></div>'+
 '<label class="roundPickerLabel" for="labRound">Choose prediction round</label><select id="labRound" class="roundPickerSelect">'+gs.map(g=>'<option value="'+safe(g.id)+'"'+(g===preferred?' selected':'')+'>'+safe(g.round_label||g.id)+'</option>').join('')+'</select>'+
 '<button id="labGenerate" class="submit" type="button">↻ Generate estimates for this round</button><p id="labDataStatus" class="small" role="status">Uses the existing results feed. Each competition is modelled separately.</p>'+
 '<details class="fixtureCompare"><summary>How automatic estimates work</summary><p class="small">Current-season goals only: last 10 matches, a 45-day recency half-life, home/away scoring rates and two opponent-strength adjustment passes. Small samples are pulled towards competition averages using five prior games. Overall and venue ratings receive equal weight. At least 20 completed matches per competition and three per team are required; insufficient samples stay blank. Matches starting within the last four hours are excluded.</p><p class="small">These are goals-based expected-goals estimates, not shot-based xG. Injuries, lineups and cross-league strength are not included. The model is experimental and has not been validated as an improvement. Rho stays at zero until calibrated. Feed snapshots refresh after 15 minutes; use the generate button to check again.</p></details>'+
 '<div id="labFixtures"></div><h3>📋 Saved experiments</h3><div id="labHistory"></div>'+
 '<p class="small">Saved trials remain in this browser only. Automatic estimates include their data source, sample and model settings. Edited inputs are marked as manual overrides. These trials are not an independently audited backtest.</p>';
 document.getElementById("labRound").onchange=renderFixtures;
 document.getElementById("labGenerate").onclick=generateRound;
 renderFixtures();renderHistory();loadResults();
}
function renderFixtures(){
 roundRequest++;automatic.clear();
 const g=selected(),box=document.getElementById("labFixtures");if(!g||!box)return;
 const now=Date.now();
 box.innerHTML=(g.fixtures||[]).map((f,i)=>{
 const t=fixtureDate(f),open=t!==null&&t>now;
 return '<details class="fixtureCompare" '+(i===0?'open':'')+'><summary><b>'+safe(f[0])+' v '+safe(f[1])+'</b> <span class="small">'+(t?new Date(t).toLocaleString("en-GB"):"Kickoff unknown")+'</span></summary>'+
 '<div class="statMiniGrid" style="margin-top:12px"><label>Home expected goals<input type="number" inputmode="decimal" step=".05" min=".1" max="6" id="lh'+i+'" placeholder="e.g. 1.65" style="width:100%;padding:11px;margin-top:6px;border:1px solid #ccc;border-radius:9px"></label><label>Away expected goals<input type="number" inputmode="decimal" step=".05" min=".1" max="6" id="la'+i+'" placeholder="e.g. 1.10" style="width:100%;padding:11px;margin-top:6px;border:1px solid #ccc;border-radius:9px"></label></div>'+
 '<label class="roundPickerLabel" for="lr'+i+'">Dixon–Coles rho (default 0 = independent Poisson)</label><input id="lr'+i+'" type="number" inputmode="decimal" min="-.2" max=".2" step=".01" value="0" style="padding:10px;width:100%;border-radius:9px;border:1px solid #ccc">'+
 '<div id="labEvidence'+i+'" class="small"></div><button class="submit" type="button" data-evaluate="'+i+'">Calculate probabilities</button><div id="labOutput'+i+'"></div>'+
 (open?'<button class="submit" style="background:#333" type="button" data-save="'+i+'">Save pre-match experiment</button>':'<p class="small">Kickoff passed or unknown: no new backtest entries allowed.</p>')+
 '</details>';
 }).join('');
 box.querySelectorAll("[data-evaluate]").forEach(b=>b.onclick=()=>evaluate(Number(b.dataset.evaluate)));
 box.querySelectorAll("[data-save]").forEach(b=>b.onclick=()=>save(Number(b.dataset.save)));
 const button=document.getElementById("labGenerate");if(button)button.disabled=false;
 const status=document.getElementById("labDataStatus");if(status)status.textContent="Generate estimates from completed current-season results. Existing values in this round will be replaced.";
}
async function teamFeed(comp){
 const season=Number(SEASON_KEY.split("-")[0]),key=comp+":"+season,cached=feeds.get(key);
 if(cached&&Date.now()-cached.fetched<15*60000)return cached;
 const response=await fetch(SUPABASE_URL+"/functions/v1/football-scores?competition="+encodeURIComponent(comp)+"&season="+season,{signal:AbortSignal.timeout(20000)});
 const data=await response.json();
 if(!response.ok||data.error||data.competition!==comp||!Array.isArray(data.matches))throw Error(data.error||"Results feed unavailable for "+comp);
 const feed={matches:data.matches,fetched:Date.now(),updatedAt:data.updatedAt,source:"football-data.org via existing results feed",competition:comp,season};
 feeds.set(key,feed);return feed;
}
async function generateRound(){
 if(!current())return;
 const g=selected(),request=++roundRequest,view=generation,button=document.getElementById("labGenerate"),status=document.getElementById("labDataStatus"),now=Date.now();
 if(!g||!window.AiTeamModel){if(status)status.textContent="Team model could not load. Refresh this page and try again.";return;}
 const targets=g.fixtures.map((f,i)=>({f,i,comp:AiTeamModel.competition(f,g)})).filter(x=>fixtureDate(x.f)>now);
 if(!targets.length){status.textContent="No upcoming fixtures in this round.";return;}
 button.disabled=true;status.textContent="Loading current-season team results…";
 const competitions=[...new Set(targets.map(x=>x.comp).filter(Boolean))],loaded=new Map();
 await Promise.all(competitions.map(async comp=>{try{loaded.set(comp,await teamFeed(comp));}catch(e){loaded.set(comp,{error:e.message});}}));
 if(!current()||generation!==view||roundRequest!==request||selected()!==g)return;
 let count=0;const issues=[];
 for(const {f,i,comp} of targets){
  const evidence=document.getElementById("labEvidence"+i);
  // Never leave an old estimate looking current after a failed refresh.
  automatic.delete(i);
  for(const id of ["lh","la"])document.getElementById(id+i).value="";
  document.getElementById("labOutput"+i).innerHTML="";
  try{
   const feed=loaded.get(comp);if(!comp)throw Error("Competition could not be identified.");if(feed?.error)throw Error(feed.error);
   const d=AiTeamModel.estimate(feed.matches,f,{season:feed.season,now:Date.now()});
   const h=Number(d.h.toFixed(2)),a=Number(d.a.toFixed(2));
   automatic.set(i,{...d,h,a,source:feed.source,feedUpdated:feed.updatedAt,fetched:feed.fetched,competition:comp});
   document.getElementById("lh"+i).value=h;document.getElementById("la"+i).value=a;document.getElementById("lr"+i).value=0;
   evidence.innerHTML=evidenceHtml(automatic.get(i),f);evaluate(i);count++;
  }catch(e){evidence.innerHTML='<div class="warn">Automatic estimate unavailable: '+safe(e.message)+' You can enter manual assumptions above.</div>';issues.push(f[0]+" v "+f[1]);}
 }
 status.textContent=count+" of "+targets.length+" upcoming fixtures modelled. "+(issues.length?issues.length+" need manual inputs; see each fixture.":"Open a fixture to review its sample and probabilities.");
 button.disabled=false;
}
function evidenceHtml(d,f){
 const avg=n=>n===null?"—":Number(n).toFixed(2);
 const time=t=>new Date(t).toLocaleString("en-GB",{timeZone:"Europe/London"})+" UK";
 return '<p><b>Automatic · goals-based model</b><br>'+safe(d.competition)+' · '+d.trainingMatches+' completed competition matches · fetched '+safe(time(d.fetched))+'</p>'+
 '<div style="overflow-x:auto"><table><thead><tr><th>Sample</th><th>'+safe(f[0])+'</th><th>'+safe(f[1])+'</th></tr></thead><tbody>'+
 [['Season matches',d.home.n,d.away.n],['Last 5 · scored / conceded',avg(d.home.scored5)+' / '+avg(d.home.conceded5),avg(d.away.scored5)+' / '+avg(d.away.conceded5)],['Last 10 · available',d.home.last10,d.away.last10],['Last 10 · scored / conceded',avg(d.home.scored10)+' / '+avg(d.home.conceded10),avg(d.away.scored10)+' / '+avg(d.away.conceded10)],['Home / away games',d.home.venueN,d.away.venueN],['Home / away · scored / conceded',avg(d.home.venueScored)+' / '+avg(d.home.venueConceded),avg(d.away.venueScored)+' / '+avg(d.away.venueConceded)]].map(row=>'<tr>'+row.map(x=>'<td>'+safe(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+
 (d.warnings.length?'<p class="warn">'+d.warnings.map(safe).join(' ')+'</p>':'')+
 '<details><summary>Source and recent results</summary><p>'+safe(d.source)+' · '+safe(d.version)+' · training cutoff '+safe(time(d.cutoff))+'</p>'+
 [[f[0],d.home],[f[1],d.away]].map(([name,s])=>'<b>'+safe(name)+'</b>'+s.recent.map(m=>'<p>'+safe(new Date(m.date).toLocaleDateString("en-GB"))+' · '+safe(m.home)+' '+m.h+'–'+m.a+' '+safe(m.away)+'</p>').join('')).join('')+'</details>';
}
function inputs(i){
 const h=Number(document.getElementById("lh"+i)?.value),a=Number(document.getElementById("la"+i)?.value),r=Number(document.getElementById("lr"+i)?.value);
 if(!document.getElementById("lh"+i)?.value||!document.getElementById("la"+i)?.value||!Number.isFinite(h)||!Number.isFinite(a)||h<.1||a<.1||h>6||a>6||!Number.isFinite(r)||Math.abs(r)>.2)throw Error("Enter home/away xG from 0.1 to 6 and rho between −0.2 and +0.2.");
 return {h,a,r};
}
function evaluate(i){
 const box=document.getElementById("labOutput"+i);if(!box)return null;
 try{
  const {h,a,r}=inputs(i),d=calculate(h,a,r),b=d.best;
  const pct=n=>(100*n).toFixed(1)+"%";
  const auto=automatic.get(i),method=auto&&h===auto.h&&a===auto.a&&r===auto.r?"Automatic goals model":auto?"Manual override of automatic estimate":"Manual assumptions";
  box.innerHTML='<p class="small"><b>'+method+'</b></p><div class="statMiniGrid" style="margin-top:12px"><div class="statMini"><span>🏠 Home win</span><b>'+pct(d.outcomes[2])+'</b></div><div class="statMini"><span>🤝 Draw</span><b>'+pct(d.outcomes[1])+'</b></div><div class="statMini"><span>✈️ Away win</span><b>'+pct(d.outcomes[0])+'</b></div><div class="statMini"><span>🏆 Highest expected-points pick</span><b>'+b.h+'–'+b.v+'</b><span>'+b.ep.toFixed(2)+' expected pts · '+pct(b.p)+' exact probability</span></div></div>'+
 '<p class="small">Most probable individual score: '+d.likely.h+'–'+d.likely.v+' ('+pct(d.likely.p)+'). This can differ from the points-optimal selection.</p>'+
 '<b>Top 3 points-optimal scores</b><div style="overflow-x:auto"><table><thead><tr><th>Score</th><th>Exact chance</th><th>Expected pts</th></tr></thead><tbody>'+d.choices.slice(0,3).map(x=>'<tr><td>'+x.h+'–'+x.v+'</td><td>'+pct(x.p)+'</td><td>'+x.ep.toFixed(2)+'</td></tr>').join('')+'</tbody></table></div>';
  return {h,a,r,...d};
 }catch(e){box.innerHTML='<div class="warn">'+safe(e.message)+'</div>';return null;}
}
function save(i){
 if(!current())return;
 const g=selected(),f=g?.fixtures?.[i],t=fixtureDate(f);
 if(!f||t===null||Date.now()>=t)return;
 const d=evaluate(i);if(!d)return;
 const rows=stored(),entry={game_id:g.id,round:g.round_label||g.id,index:i,home:String(f[0]),away:String(f[1]),kickoff:t,created:Date.now(),xgh:d.h,xga:d.a,rho:d.r,pick:[d.best.h,d.best.v],expected_points:d.best.ep,probability:d.best.p};
 const auto=automatic.get(i),isAuto=auto&&d.h===auto.h&&d.a===auto.a&&d.r===auto.r;
 entry.input_method=isAuto?"automatic goals model":auto?"manual override":"manual";
 entry.model=auto||null;
 rows.push(entry);
 try{localStorage.setItem(STORAGE,JSON.stringify(rows));renderHistory();document.getElementById("labOutput"+i).insertAdjacentHTML("beforeend",'<div class="ok">Experiment saved in this browser; official prediction unchanged.</div>');}catch{alert("Could not save locally on this device.");}
}
async function loadResults(){
 if(!current())return;
 const view=generation,loginPin=pin;
 try{const {data,error}=await sb.rpc("get_ai_tracker_with_pin",{p_player:"Joe",p_pin:pin,p_season_key:SEASON_KEY});if(error)return;
 if(!current()||view!==generation||pin!==loginPin)return;
 historicalResults=new Map((data?.rounds||[]).map(r=>[String(r.game_id),r.results||[]]));renderHistory();
 }catch{}
}
function renderHistory(){
 const box=document.getElementById("labHistory");if(!box||!current())return;
 const rows=stored().filter(x=>x&&x.game_id!==undefined).sort((a,b)=>b.created-a.created).slice(0,100);
 if(!rows.length){box.innerHTML='<p class="small">No experiments saved yet. Run a fixture model above, then save before kickoff.</p>';return;}
 const roundById=new Map(eligible().map(g=>[String(g.id),g]));
 box.innerHTML='<div style="overflow-x:auto"><table><thead><tr><th>Fixture</th><th>Pick</th><th>Expected pts</th><th>Actual pts</th></tr></thead><tbody>'+rows.map(x=>{
  const g=roundById.get(String(x.game_id));const result=historicalResults.get(String(x.game_id))?.[x.index]||g?.results?.[x.index];const final=Array.isArray(result)&&result.length===2&&result.every(n=>n!==null&&Number.isFinite(Number(n)));
  const points=final?((Number(result[0])===x.pick[0]&&Number(result[1])===x.pick[1]?10:0)+(scoreResult(Number(result[0]),Number(result[1]))===scoreResult(x.pick[0],x.pick[1])?6:0)):null;
  return '<tr><td>'+safe(x.home)+' v '+safe(x.away)+'<div class="small">'+safe(x.round)+' · '+new Date(x.created).toLocaleDateString("en-GB")+' · '+safe(x.input_method||"manual")+'</div></td><td>'+safe(x.pick.join("–"))+'</td><td>'+Number(x.expected_points).toFixed(2)+'</td><td>'+(points===null?'Pending':points)+'</td></tr>';
 }).join('')+'</tbody></table></div><p class="small">Actual scores are shown only if included in the available round data. This browser history is not shared across devices.</p>';
}
window.renderAiLabs=render;
window.clearAiLabs=()=>{generation++;roundRequest++;automatic.clear();historicalResults.clear();if(root())root().innerHTML="";};
})();
