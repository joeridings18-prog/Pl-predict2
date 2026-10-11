// Private payloads are fetched only through Joe's PIN-checked database RPCs.
let researchDocs=[],researchRequest=0,researchCompetition="PL";
const researchCompetitions={PL:"Premier League",ELC:"Championship",CL:"Champions League"};
function researchClear(){
 researchRequest++;researchDocs=[];
 document.getElementById("researchContent").textContent="";
}
async function refreshResearch(){
 const root=document.getElementById("researchContent"),request=++researchRequest;
 if(!(loggedIn&&me==="Joe"&&pin)){researchClear();return;}
 root.textContent="Loading private research…";
 const {data,error}=await sb.rpc("get_research_with_pin",{p_player:me,p_pin:pin});
 if(request!==researchRequest||!loggedIn||me!=="Joe")return;
 if(error){root.textContent="Could not load research: "+error.message;return;}
 researchDocs=data||[];renderResearch();
}
function researchGoalMatches(comp){
 const d=researchDocs.find(d=>d.key==="goals:"+comp+":"+SEASON_KEY)?.payload;
 return (d?.matches||[]).filter(m=>m.status==="FINISHED"&&Number.isInteger(m.homeScore)&&Number.isInteger(m.awayScore)&&Date.parse(m.utcDate)<Date.now());
}
function researchTeamStats(matches,team,venue){
 const rows=matches.filter(m=>venue==="home"?m.home===team:m.away===team).sort((a,b)=>Date.parse(b.utcDate)-Date.parse(a.utcDate));
 const n=rows.length,sum=key=>rows.reduce((s,m)=>s+m[key],0);
 return {rows,n,scored:n?sum(venue==="home"?"homeScore":"awayScore")/n:null,conceded:n?sum(venue==="home"?"awayScore":"homeScore")/n:null,total:n?(sum("homeScore")+sum("awayScore"))/n:null};
}
function researchRate(rows,line){return rows.length?rows.filter(m=>m.homeScore+m.awayScore>line).length+"/"+rows.length:"—";}
function researchUnderRate(rows,line){return rows.length?rows.filter(m=>m.homeScore+m.awayScore<line).length+"/"+rows.length:"—";}
function researchAvg(v){return v==null?"—":v.toFixed(2);}
function renderResearch(){
 const root=document.getElementById("researchContent");
 const comp=root.querySelector("#researchLeague")?.value||researchCompetition,home=root.querySelector("#researchHome")?.value,away=root.querySelector("#researchAway")?.value;
 researchCompetition=comp;
 const source=researchDocs.find(d=>d.key==="sources")?.payload||{};
 root.innerHTML='<h3>Team goals · home and away</h3><label for="researchLeague">Competition</label><select id="researchLeague" class="roundPickerSelect">'+Object.entries(researchCompetitions).map(([k,v])=>'<option value="'+k+'" '+(k===comp?'selected':'')+'>'+esc(v)+'</option>').join("")+'</select><p class="small">Season 2026/27 · completed matches only · each competition kept separate. Small venue samples are shown explicitly.</p><button id="refreshResearchGoals" class="submit">↻ Update and save goals data</button><p id="researchUpdateStatus" class="small"></p><div id="researchGoals"></div><h3>Player markets</h3><p>'+esc((source.markets||[]).join(" · "))+'</p><p class="small">Researched player samples are shown above. Automatic league-wide statistics and prices still require verified provider coverage. Bookings counts currently record yellow cards; bookmaker red-card settlement rules need checking.</p><h3>Save a bookmaker price</h3><p class="small">Record an exact selection for later research. A saved price alone is not a value recommendation.</p><form id="researchQuoteForm" style="display:grid;gap:10px"><label>Match<input name="match" required maxlength="120" placeholder="Liverpool v Manchester City" style="display:block;width:100%;padding:10px"></label><label>Selection<input name="selection" required maxlength="160" placeholder="Haaland 1+ shots on target / Over 2.5 goals" style="display:block;width:100%;padding:10px"></label><label>Bookmaker<input name="bookmaker" required maxlength="60" value="Bet365" style="display:block;width:100%;padding:10px"></label><label>Decimal odds<input name="odds" type="number" min="1.01" max="10000" step="0.01" required style="display:block;width:100%;padding:10px"></label><label>Source link<input name="source" type="url" required placeholder="https://" style="display:block;width:100%;padding:10px"></label><label>When you observed the price (optional, your device time)<input name="observed_at" type="datetime-local" style="display:block;width:100%;padding:10px"></label><label>Settlement rules / replacement-player terms<textarea name="rules" maxlength="2000" style="display:block;width:100%;padding:10px"></textarea></label><label>Notes<textarea name="notes" maxlength="2000" style="display:block;width:100%;padding:10px"></textarea></label><button class="submit" type="submit">Save private price snapshot</button><p id="researchQuoteStatus" class="small"></p></form><div id="researchQuotes"></div><h3>Data-source research</h3>'+
 (source.providers||[]).map(p=>'<details class="fixtureCompare"><summary><b>'+esc(p.name)+'</b> · '+esc(p.price)+'</summary><p>'+esc(p.status)+'</p><p class="small">'+esc(p.notes)+'</p><a href="'+esc(p.url)+'" target="_blank" rel="noopener">Provider documentation</a></details>').join("")+'<p class="small">'+esc(source.next_step)+'</p>';
 document.getElementById("researchLeague").onchange=()=>renderResearch();
 document.getElementById("refreshResearchGoals").onclick=refreshResearchGoals;
 document.getElementById("researchQuoteForm").onsubmit=saveResearchQuote;
 renderResearchGoals(comp,home,away);
 renderResearchPilot();
 renderResearchScreen();
 renderResearchTracker();
 const quotes=researchDocs.filter(d=>d.key.startsWith("quote:")).sort((a,b)=>Date.parse(b.payload.captured_at)-Date.parse(a.payload.captured_at));
 document.getElementById("researchQuotes").innerHTML='<h3>Saved price history</h3>'+(quotes.length?quotes.map(d=>{const p=d.payload;return '<div class="statusRow"><div><b>'+esc(p.selection)+'</b><div class="small">'+esc(p.match)+' · '+esc(p.bookmaker)+' · '+esc(researchTime(p.captured_at))+' saved</div><div class="small">Observed: '+esc(researchTime(p.observed_at))+' · Bookmaker update: '+esc(researchTime(p.source_updated_at))+'</div><div class="small">'+esc(p.price_status||'Manual snapshot; availability not independently checked')+'</div><div class="small">'+esc(p.rules||'Settlement rules not recorded')+'</div><div class="small">'+esc(p.notes||"")+'</div><a href="'+esc(/^https?:\/\//.test(p.source||'')?p.source:'#')+'" target="_blank" rel="noopener">Price source</a></div><div><b>'+Number(p.odds).toFixed(2)+'</b><div class="small">'+(100/Number(p.odds)).toFixed(1)+'% break-even</div></div></div>';}).join(""):'<p class="small">No price snapshots recorded yet.</p>');
}
function renderResearchPilot(){
 const reports=researchDocs.filter(d=>d.key.startsWith("note:")&&Array.isArray(d.payload?.players)&&Array.isArray(d.payload?.markets));
 for(const {payload:pilot} of reports.slice().reverse()){
 const panel=document.createElement("div");panel.className="card";panel.style="margin:0 0 20px;border:1px solid #ddd;box-shadow:none";
 panel.innerHTML='<h3>'+esc(pilot.title)+'</h3><p><b>'+esc(pilot.status)+'</b></p><p class="small">'+esc(pilot.scope)+'</p><p class="warn">'+esc(pilot.price_status)+'</p>'+
 (pilot.players||[]).map(p=>'<details class="fixtureCompare"><summary><b>'+esc(p.name)+'</b> · '+p.matches.length+' available PL appearances</summary><p class="small">'+esc(p.verification_note||'Original pilot; see verification below.')+'</p><div style="overflow-x:auto"><table class="leader"><thead><tr><th>Market</th><th>Sample counts</th><th>1+ hit</th><th>Unverified Statz price 1+</th><th>Break-even</th></tr></thead><tbody>'+
 pilot.markets.map((market,i)=>{const counts=p.matches.filter(m=>m.minutes>0&&Number.isInteger(m.counts?.[i])&&m.counts[i]>=0).map(m=>m.counts[i]),hits=counts.filter(v=>v>=1).length,quote=p.odds_1_plus?.[i],odds=Number.isFinite(quote)&&quote>1?quote:null;return '<tr><td>'+esc(market)+'</td><td>'+counts.join(", ")+'</td><td>'+hits+'/'+counts.length+'</td><td>'+(odds==null?'—':odds.toFixed(2))+'</td><td>'+(odds==null?'—':(100/odds).toFixed(1)+'%')+'</td></tr>';}).join("")+
 '</tbody></table></div><p class="small">Original counts and prices from Statz; corroboration is described below. Break-even is 1 ÷ odds; recent hit rates do not establish the probability of the next match.</p>'+
 '<details><summary>Sample dates, opponents and minutes</summary>'+p.matches.map(m=>'<div class="statusRow"><span>'+esc(m.date)+' · '+esc(m.opponent)+' · '+esc(m.venue)+'</span><span>'+m.minutes+' minutes</span></div>').join("")+'</details><p><a href="'+esc(p.source_url)+'" target="_blank" rel="noopener">Source player page</a>'+(p.crosscheck_url?' · <a href="'+esc(p.crosscheck_url)+'" target="_blank" rel="noopener">Cross-check</a>':'')+'</p></details>').join("")+
 (pilot.verification?'<h4>Verification and context</h4>'+[pilot.verification.summary,pilot.verification.longer_sample_note,pilot.verification.price_note,pilot.verification.context].map(s=>'<p class="small">'+esc(s)+'</p>').join("")+'<details><summary>Cross-check sources</summary>'+pilot.verification.sources.map(s=>'<p><a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.name)+'</a></p>').join("")+'</details>':'')+
 (pilot.watchlist?.length?'<h4>Research watchlist · no confirmed edge</h4><div style="overflow-x:auto"><table class="leader"><thead><tr><th>Selection</th><th>Last 5 PL</th><th>Last 10 PL</th><th>Assessment</th></tr></thead><tbody>'+pilot.watchlist.map(s=>'<tr><td>'+esc(s.selection)+'</td><td>'+esc(s.last5)+'</td><td>'+esc(s.last10)+'</td><td>'+esc(s.assessment)+'</td></tr>').join("")+'</tbody></table></div>':'')+
 (pilot.players||[]).filter(p=>p.longer_matches?.length).map(p=>'<details class="fixtureCompare"><summary>'+esc(p.name)+' · longer sample and missing data</summary><div style="overflow-x:auto"><table class="leader"><thead><tr><th>Date / opponent</th><th>Minutes</th>'+pilot.markets.map(m=>'<th>'+esc(m)+'</th>').join("")+'</tr></thead><tbody>'+p.longer_matches.map(m=>'<tr><td>'+esc(m.date)+' · '+esc(m.opponent)+' · '+esc(m.venue)+'</td><td>'+m.minutes+'</td>'+m.counts.map(v=>'<td>'+(v==null?'—':v)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div><p class="small">— means unavailable, not zero. Older-season rows are contextual evidence.</p></details>').join("")+
 '<p class="small">Research captured '+esc(new Date(pilot.checked_at).toLocaleString("en-GB"))+'. This is the capture time, not the bookmaker price update time.</p><h4>Next checks</h4><ul>'+pilot.next_steps.map(s=>'<li>'+esc(s)+'</li>').join("")+'</ul>';
 document.getElementById("researchContent").prepend(panel);
 }
}
function researchPlayerScreenRows(docs,market,line,minMinutes,fixtureKey="all",window="5",verifiedOnly=false){
 return docs.filter(d=>d.key.startsWith('note:')&&(fixtureKey==='all'||d.key===fixtureKey)&&Array.isArray(d.payload?.players)&&Array.isArray(d.payload?.markets)).flatMap(d=>{
  const p=d.payload;
  return p.players.flatMap(player=>p.markets.flatMap((name,i)=>{
   if(market!=="all"&&name!==market)return [];
   const merged=new Map((player.longer_matches||[]).map(m=>[m.date,m]));
   for(const m of player.matches||[])merged.set(m.date,m);
   let available=[...merged.values()].filter(m=>m.minutes>0&&Date.parse(m.date)<Date.parse(p.kickoff||"9999-12-31")).sort((a,b)=>b.date.localeCompare(a.date));
   available=window==='season'?available.filter(m=>m.date>='2026-08-01'):available.slice(0,Number(window)||5);
   const samples=available.filter(m=>Number.isInteger(m.counts?.[i])&&m.counts[i]>=0&&m.minutes>=minMinutes&&(!verifiedOnly||m.verified_markets?.includes(i)));
   const n=samples.length,hits=samples.filter(m=>m.counts[i]>=line).length;
   const quote=(line===1?player.odds_1_plus:line===2?player.odds_2_plus:null)?.[i];
   const odds=Number.isFinite(quote)&&quote>1?quote:null;
   return [{fixtureKey:d.key,player:player.name,fixture:p.title,market:name,line,n,hits,odds,breakEven:odds?100/odds:null,minutes:n?samples.reduce((s,m)=>s+m.minutes,0)/n:null,notes:player.verification_note||"See original pilot verification.",checked_at:p.checked_at,window,available:available.length,verified:samples.filter(m=>m.verified_markets?.includes(i)).length,start:samples.at(-1)?.date,end:samples[0]?.date}];
  }));
 });
}
function researchSortScreenRows(rows,field,direction){
 const value=r=>field==='hitRate'?(r.n>0?r.hits/r.n:null):r[field];
 const order=direction==='asc'?1:-1;
 return rows.slice().sort((a,b)=>{
  const av=value(a),bv=value(b),am=!Number.isFinite(av),bm=!Number.isFinite(bv);
  if(am||bm)return am===bm?0:am?1:-1;
  return order*(av-bv);
 });
}
function renderResearchScreen(){
 const panel=document.createElement("div");panel.className="card";panel.style="margin:0 0 20px;border:1px solid #ddd;box-shadow:none";
 const docs=researchDocs.filter(d=>d.key.startsWith('note:')&&Array.isArray(d.payload?.players)&&Array.isArray(d.payload?.markets));
 if(!docs.length)return;
 const markets=[...new Set(docs.flatMap(d=>d.payload.markets))],count=docs.reduce((n,d)=>n+d.payload.players.length,0);
 panel.innerHTML='<h3>Player market screen</h3><p class="small">'+count+' researched player samples across '+docs.length+' match report(s). League-wide coverage is not complete. Prices below are unverified Statz snapshots.</p><label>Fixture<select id="researchScreenFixture" class="roundPickerSelect"><option value="all">All researched fixtures</option>'+docs.map(d=>'<option value="'+esc(d.key)+'">'+esc(d.payload.title)+'</option>').join('')+'</select></label><label>Market<select id="researchScreenMarket" class="roundPickerSelect"><option value="all">All six markets</option>'+markets.map(m=>'<option '+(m==='Shots on target'?'selected':'')+' value="'+esc(m)+'">'+esc(m)+'</option>').join('')+'</select></label><label>Line<select id="researchScreenLine" class="roundPickerSelect"><option value="1">1+</option><option value="2">2+</option><option value="3">3+ · no price feed</option></select></label><label>Appearance minutes<select id="researchScreenMinutes" class="roundPickerSelect"><option value="0">All played appearances</option><option value="60">60+ minutes only</option></select></label><label>Sample window<select id="researchScreenWindow" class="roundPickerSelect"><option value="5">Last 5 PL appearances</option><option value="10">Last 10 PL appearances · may span seasons</option><option value="20">Last 20 PL appearances · may span seasons</option><option value="season">Current PL season · available rows</option></select></label><label>Statistics checks<select id="researchScreenVerified" class="roundPickerSelect"><option value="all">All rows · checks shown</option><option value="verified">Independently corroborated match rows only</option></select></label><label>Sort by<select id="researchScreenSort" class="roundPickerSelect"><option value="hitRate">Historical hit rate</option><option value="minutes">Average minutes</option><option value="odds">Unverified price</option><option value="breakEven">Break-even</option></select></label><label>Order<select id="researchScreenOrder" class="roundPickerSelect"><option value="desc">High to low</option><option value="asc">Low to high</option></select></label><div id="researchScreenRows"></div><p class="small">Historical frequency and break-even are comparison inputs. They are not a next-match probability or a confirmed edge. Last 10/20 may span seasons. Unavailable rows are never filled with zeros. A season-total check does not verify individual rows. Filtering minutes changes the sample; a 60+ minute appearance does not prove the player started.</p>';
 document.getElementById("researchContent").prepend(panel);
 const update=()=>{
  const filteredRows=researchPlayerScreenRows(researchDocs,document.getElementById('researchScreenMarket').value,Number(document.getElementById('researchScreenLine').value),Number(document.getElementById('researchScreenMinutes').value),document.getElementById('researchScreenFixture').value,document.getElementById('researchScreenWindow').value,document.getElementById('researchScreenVerified').value==='verified');
  const rows=researchSortScreenRows(filteredRows,document.getElementById('researchScreenSort').value,document.getElementById('researchScreenOrder').value);
  document.getElementById('researchScreenRows').innerHTML='<div style="overflow-x:auto"><table class="leader"><thead><tr><th>Player / match</th><th>Market</th><th>Historical hit</th><th>Avg minutes</th><th>Unverified price</th><th>Break-even</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.player)+'<details><summary class="small">Sample context</summary><p class="small">'+esc(r.fixture)+'</p><p class="small">'+esc(r.notes)+'</p><p class="small">'+esc(r.start||'No eligible rows')+' to '+esc(r.end||'')+' · '+r.verified+'/'+r.n+' match rows independently corroborated for this market. Snapshot captured '+esc(researchTime(r.checked_at))+'. Bookmaker update time unknown.</p></details></td><td>'+esc(r.market)+' '+r.line+'+</td><td>'+(r.n?r.hits+'/'+r.n+' · '+(100*r.hits/r.n).toFixed(0)+'%':'—')+(r.n<(r.window==='season'?5:Number(r.window))?'<div class="small">Incomplete / limited sample</div>':'')+'</td><td>'+(r.minutes==null?'—':r.minutes.toFixed(0))+'</td><td>'+(r.odds==null?'—':r.odds.toFixed(2))+'</td><td>'+(r.breakEven==null?'—':r.breakEven.toFixed(1)+'%')+'</td></tr>').join('')+'</tbody></table></div>';
 };
 for(const id of ['researchScreenFixture','researchScreenMarket','researchScreenLine','researchScreenMinutes','researchScreenSort','researchScreenOrder','researchScreenWindow','researchScreenVerified'])document.getElementById(id).onchange=update;
 update();
}
function renderResearchGoals(comp,home,away){
 const matches=researchGoalMatches(comp),teams=[...new Set(matches.flatMap(m=>[m.home,m.away]))].sort();
 const doc=researchDocs.find(d=>d.key==="goals:"+comp+":"+SEASON_KEY)?.payload;
 const root=document.getElementById("researchGoals");
 if(!matches.length){root.textContent="No completed matches stored for this competition.";return;}
 const options=(selected,preferred)=>teams.map(t=>'<option '+(t===(teams.includes(selected)?selected:preferred)?'selected':'')+' value="'+esc(t)+'">'+esc(t)+'</option>').join("");
 root.innerHTML='<p class="small">'+matches.length+' completed results · '+esc(doc?.source||"")+' · captured '+esc(new Date(doc?.fetched_at).toLocaleString("en-GB"))+'</p><label>Home team<select id="researchHome" class="roundPickerSelect">'+options(home,teams.find(t=>/Liverpool/.test(t))||teams[0])+'</select></label><label>Away team<select id="researchAway" class="roundPickerSelect">'+options(away,teams.find(t=>/Manchester City/.test(t))||teams[1])+'</select></label><div id="researchMatchup"></div><details class="fixtureCompare"><summary>All teams · venue averages</summary><div style="overflow-x:auto"><table class="leader"><thead><tr><th>Team / venue</th><th>Games</th><th>Scored</th><th>Conceded</th><th>Total</th></tr></thead><tbody>'+teams.flatMap(t=>["home","away"].map(v=>{const s=researchTeamStats(matches,t,v);return '<tr><td>'+esc(t)+'<div class="small">'+v+'</div></td><td>'+s.n+'</td><td>'+researchAvg(s.scored)+'</td><td>'+researchAvg(s.conceded)+'</td><td>'+researchAvg(s.total)+'</td></tr>';})).join("")+'</tbody></table></div></details>';
 const update=()=>{
  const h=document.getElementById("researchHome").value,a=document.getElementById("researchAway").value,out=document.getElementById("researchMatchup");
  if(h===a){out.textContent="Choose two different teams.";return;}
  const hs=researchTeamStats(matches,h,"home"),as=researchTeamStats(matches,a,"away");
  out.innerHTML='<h3>'+esc(h)+' v '+esc(a)+'</h3><div style="overflow-x:auto"><table class="leader"><thead><tr><th>Metric</th><th>Home team at home</th><th>Away team away</th></tr></thead><tbody>'+
  [["Games",hs.n,as.n],["Goals scored / game",researchAvg(hs.scored),researchAvg(as.scored)],["Goals conceded / game",researchAvg(hs.conceded),researchAvg(as.conceded)],["Total match goals / game",researchAvg(hs.total),researchAvg(as.total)]].map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join("")+'</tr>').join("")+
  [1.5,2.5,3.5].flatMap(line=>[["season",hs.rows,as.rows],["last 5 at venue",hs.rows.slice(0,5),as.rows.slice(0,5)]].map(([label,hr,ar])=>'<tr><td>Over '+line+' · '+label+'</td><td>'+researchRate(hr,line)+'</td><td>'+researchRate(ar,line)+'</td></tr><tr><td>Under '+line+' · '+label+'</td><td>'+researchUnderRate(hr,line)+'</td><td>'+researchUnderRate(ar,line)+'</td></tr>')).join("")+'</tbody></table></div><p class="small">These are historical hit rates, not estimated probabilities for this matchup. Both teams’ attacking and defensive records matter; do not add the two total-goal averages together.</p>'+
  (hs.n<5||as.n<5?'<p class="warn">Limited sample: at least one team has fewer than five matches at this venue.</p>':'')+
  [["Home team’s last 5 home results",hs.rows],["Away team’s last 5 away results",as.rows]].map(([title,rows])=>'<details class="fixtureCompare"><summary>'+title+'</summary>'+rows.slice(0,5).map(m=>'<div class="statusRow"><span>'+esc(m.home)+' v '+esc(m.away)+'<div class="small">'+esc(new Date(m.utcDate).toLocaleDateString("en-GB"))+'</div></span><b>'+m.homeScore+'–'+m.awayScore+'</b></div>').join("")+'</details>').join("");
 };document.getElementById("researchHome").onchange=update;document.getElementById("researchAway").onchange=update;update();
}
async function saveResearchQuote(e){
 e.preventDefault();if(!(loggedIn&&me==="Joe"&&pin))return;
 const form=e.currentTarget,button=form.querySelector("button"),out=document.getElementById("researchQuoteStatus");
 const fields=Object.fromEntries(new FormData(form)),odds=Number(fields.odds);
 if(!Number.isFinite(odds)||odds<=1){out.textContent="Enter valid decimal odds above 1.";return;}
 if(fields.observed_at){const observed=Date.parse(fields.observed_at);if(!Number.isFinite(observed)||observed>Date.now()){out.textContent='Observed time must be valid and not in the future.';return;}fields.observed_at=new Date(observed).toISOString();}else fields.observed_at=null;
 const payload={...fields,odds,source_updated_at:null,price_status:'Manually recorded; bookmaker update time unknown',captured_at:new Date().toISOString(),kind:"manual_price_snapshot"},key="quote:"+crypto.randomUUID();
 button.disabled=true;
 try{const {error}=await sb.rpc("save_research_with_pin",{p_player:me,p_pin:pin,p_key:key,p_payload:payload});if(error)throw error;if(!loggedIn||me!=="Joe")return;await refreshResearch();}
 catch(err){out.textContent="Could not save: "+err.message;}finally{button.disabled=false;}
}
async function refreshResearchGoals(){
 if(!(loggedIn&&me==="Joe"&&pin))return;
 const comp=document.getElementById("researchLeague").value,button=document.getElementById("refreshResearchGoals"),out=document.getElementById("researchUpdateStatus"),request=researchRequest;
 button.disabled=true;out.textContent="Fetching completed results…";
 try{
  const now=new Date(),dateTo=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  const response=await fetch(SUPABASE_URL+"/functions/v1/football-scores?competition="+comp+"&dateFrom=2026-08-01&dateTo="+dateTo);
  const d=await response.json();if(!response.ok||d.error||!Array.isArray(d.matches))throw Error(d.error||"Score feed unavailable");
  if(request!==researchRequest||!loggedIn||me!=="Joe")return;
  const previous=researchDocs.find(d=>d.key==="goals:"+comp+":"+SEASON_KEY)?.payload?.matches||[],merged=new Map(previous.map(m=>[m.id,m]));
  for(const m of d.matches){if(m.status==="FINISHED"&&Number.isInteger(m.homeScore)&&Number.isInteger(m.awayScore))merged.set(m.id,m);else if(merged.has(m.id))merged.delete(m.id);}
  const payload={competition:comp,season:SEASON_KEY,source:"football-data.org via existing score feed",fetched_at:d.updatedAt,date_from:"2026-08-01",date_to:dateTo,matches:[...merged.values()]};
  const {error}=await sb.rpc("save_research_with_pin",{p_player:me,p_pin:pin,p_key:"goals:"+comp+":"+SEASON_KEY,p_payload:payload});if(error)throw error;
  await refreshResearch();document.getElementById("researchUpdateStatus").textContent="Completed results updated and saved.";
 }catch(err){out.textContent="Could not update: "+err.message;}finally{button.disabled=false;}
}

function researchTime(value){
 const date=new Date(value);
 return value&&Number.isFinite(date.getTime())?date.toLocaleString('en-GB',{timeZone:'Europe/London'})+' UK':'Unknown';
}
function researchForecastMetrics(docs){
 const all=docs.filter(d=>d.key.startsWith('note:forecast_')&&d.payload?.kind==='paper_prediction').map(d=>d.payload);
 const settled=all.filter(p=>['won','lost'].includes(p.outcome)&&Number.isFinite(Number(p.probability))&&Number(p.probability)>0&&Number(p.probability)<1&&Number(p.odds)>1&&Date.parse(p.captured_at)<Date.parse(p.kickoff));
 const n=settled.length,wins=settled.filter(p=>p.outcome==='won').length;
 const profit=settled.reduce((sum,p)=>sum+(p.outcome==='won'?Number(p.odds)-1:-1),0);
 const brier=n?settled.reduce((sum,p)=>sum+(Number(p.probability)-(p.outcome==='won'?1:0))**2,0)/n:null;
 const bands=[0,.2,.4,.6,.8].map((lo,index)=>{const rows=settled.filter(p=>Math.min(4,Math.floor(Number(p.probability)*5))===index);return {lo,n:rows.length,p:rows.length?rows.reduce((sum,p)=>sum+Number(p.probability),0)/rows.length:null,hit:rows.length?rows.filter(p=>p.outcome==='won').length/rows.length:null};});
 return {all,n,wins,profit,brier,roi:n?100*profit/n:null,pending:all.filter(p=>p.outcome==='pending').length,void:all.filter(p=>p.outcome==='void').length,bands};
}
function renderResearchTracker(){
 const root=document.createElement('div');root.className='card';root.style='margin:0 0 20px;border:1px solid #ddd;box-shadow:none';
 const metrics=researchForecastMetrics(researchDocs);
 const fixtures=researchDocs.filter(d=>Array.isArray(d.payload?.players)&&Date.parse(d.payload.kickoff)>Date.now());
 const field=(label,name,type,extra='')=>'<label>'+label+'<input name="'+name+'" type="'+type+'" '+extra+' style="display:block;width:100%;padding:10px"></label>';
 root.innerHTML='<h3>Private prediction tracker · shots pilot</h3><p class="small">Record your research estimate and a price you have checked before kickoff. Estimates are manual; an automatic probability model is not available yet. Original estimates and prices lock when saved. No bets are placed.</p><div class="statusRow"><span>'+metrics.n+' settled · '+metrics.pending+' pending · '+metrics.void+' void</span><span>'+metrics.profit.toFixed(2)+' units · '+(metrics.roi==null?'—':metrics.roi.toFixed(1)+'%')+' return</span></div><p class="small">One hypothetical unit per selection. Return and hit rate exclude voids. Brier score: '+(metrics.brier==null?'—':metrics.brier.toFixed(3))+' (lower is better; it measures probability error). '+(metrics.n?'Results are preliminary and correlated selections are not independent tests.':'No settled predictions yet.')+'</p>'+
 (metrics.n?'<details><summary>Estimated probability versus actual hit rate</summary><table class="leader"><thead><tr><th>Probability band</th><th>Count</th><th>Avg estimate</th><th>Actual hit</th></tr></thead><tbody>'+metrics.bands.filter(b=>b.n).map(b=>'<tr><td>'+Math.round(b.lo*100)+'–'+Math.round((b.lo+.2)*100)+'%</td><td>'+b.n+'</td><td>'+(b.p*100).toFixed(1)+'%</td><td>'+(b.hit*100).toFixed(1)+'%</td></tr>').join('')+'</tbody></table></details>':'')+
 '<details class="fixtureCompare"><summary><b>Record a pre-match estimate</b></summary>'+
 (fixtures.length?'<form id="researchForecastForm" style="display:grid;gap:10px"><label>Fixture<select name="fixture_key" id="researchForecastFixture" class="roundPickerSelect">'+fixtures.map(d=>'<option value="'+esc(d.key)+'">'+esc(d.payload.title)+' · '+esc(researchTime(d.payload.kickoff))+'</option>').join('')+'</select></label><label>Player<select name="player" id="researchForecastPlayer" class="roundPickerSelect"></select></label><label>Market<select name="market" class="roundPickerSelect"><option>Shots on target</option><option>Shots</option></select></label>'+field('Line (at least this many)','line','number','required min="1" max="6" step="1" value="1"')+field('Your estimated chance (%)','probability','number','required min="0.1" max="99.9" step="0.1"')+field('Expected minutes','expected_minutes','number','required min="1" max="120" step="1"')+field('Bookmaker','bookmaker','text','required maxlength="100"')+field('Decimal odds you checked','odds','number','required min="1.01" max="10000" step="0.01"')+field('Selection source link','source','url','required maxlength="1000"')+field('When you checked the price (your device time)','observed_at','datetime-local','required')+'<label>Exact settlement rules, including substitutions<textarea name="rules" required minlength="5" maxlength="2000" style="display:block;width:100%;padding:10px"></textarea></label><label>Why this probability? Include sample, minutes, role and opposition<textarea name="reason" required minlength="10" maxlength="3000" style="display:block;width:100%;padding:10px"></textarea></label><label><input name="price_confirmed" type="checkbox" required> I checked this exact price and its rules at the bookmaker within the last 30 minutes.</label><p id="researchForecastPreview" class="small">Enter your probability and price to calculate fair odds and estimated return.</p><button class="submit">Save and lock private estimate</button><p id="researchForecastStatus" class="small"></p></form>':'<p class="small">No researched fixture is currently open for a pre-match estimate.</p>')+'</details><div id="researchForecastHistory"></div>';
 document.getElementById('researchContent').prepend(root);
 const form=document.getElementById('researchForecastForm');
 if(form){
  const fixture=document.getElementById('researchForecastFixture'),player=document.getElementById('researchForecastPlayer');
  const choose=()=>{const d=fixtures.find(d=>d.key===fixture.value);player.innerHTML=(d?.payload.players||[]).map(p=>'<option>'+esc(p.name)+'</option>').join('');};
  fixture.onchange=choose;choose();form.onsubmit=saveResearchForecast;
  form.oninput=()=>{const p=Number(form.elements.probability.value)/100,o=Number(form.elements.odds.value);document.getElementById('researchForecastPreview').textContent=p>0&&p<1&&o>1?'Fair odds '+(1/p).toFixed(2)+' · estimated return '+((p*o-1)*100).toFixed(1)+'% per unit. This relies on your estimate; it is not a confirmed edge.':'Enter your probability and price to calculate fair odds and estimated return.';};
 }
 const history=document.getElementById('researchForecastHistory');
 const docs=researchDocs.filter(d=>d.key.startsWith('note:forecast_')&&d.payload?.kind==='paper_prediction').sort((a,b)=>Date.parse(b.payload.captured_at)-Date.parse(a.payload.captured_at));
 history.innerHTML='<h4>Locked prediction history</h4>'+(docs.length?docs.map(d=>{const p=d.payload;return '<details class="fixtureCompare"><summary>'+esc(p.player)+' · '+esc(p.market)+' '+p.line+'+ · '+esc(p.outcome)+'</summary><p>'+esc(p.match)+' · '+esc(researchTime(p.kickoff))+'</p><p>Estimate '+(p.probability*100).toFixed(1)+'% · fair odds '+(1/p.probability).toFixed(2)+' · '+esc(p.bookmaker)+' '+Number(p.odds).toFixed(2)+'</p><p class="small">Saved '+esc(researchTime(p.captured_at))+' · price observed '+esc(researchTime(p.observed_at))+' · '+esc(p.estimate_method)+'</p><p class="small">'+esc(p.reason)+'</p><p class="small">Rules: '+esc(p.rules)+'</p><p><a href="'+esc(p.source)+'" target="_blank" rel="noopener">Price source</a></p>'+
 (p.outcome==='pending'?'<form class="researchSettleForm" data-key="'+esc(d.key)+'" style="display:grid;gap:10px"><p class="small">Record only after the match finishes. Settlement opens two hours after the stored kickoff; original estimate stays locked.</p><label>Outcome<select name="outcome" class="roundPickerSelect"><option value="won">Won</option><option value="lost">Lost</option><option value="void">Void</option></select></label>'+field('Result / settlement source','result_source','url','required maxlength="1000"')+'<label>Result notes<textarea name="result_note" maxlength="2000"></textarea></label><button class="submit" '+(Date.now()<Date.parse(p.kickoff)+7200000?'disabled':'')+'>Record final outcome</button><p class="researchSettleStatus small"></p></form>':'<p class="small">Manually settled '+esc(researchTime(p.settled_at))+' · '+esc(p.result_note||'')+'</p><a href="'+esc(p.result_source)+'" target="_blank" rel="noopener">Result source</a>')+'</details>';}).join(''):'<p class="small">No predictions recorded. Existing price snapshots are not counted as predictions.</p>');
 for(const f of history.querySelectorAll('.researchSettleForm'))f.onsubmit=settleResearchForecast;
}
async function saveResearchForecast(e){
 e.preventDefault();if(!(loggedIn&&me==='Joe'&&pin))return;
 const form=e.currentTarget,out=document.getElementById('researchForecastStatus'),button=form.querySelector('button'),fields=Object.fromEntries(new FormData(form));
 const probability=Number(fields.probability)/100,odds=Number(fields.odds),line=Number(fields.line),observed=Date.parse(fields.observed_at),minutes=Number(fields.expected_minutes);
 const doc=researchDocs.find(d=>d.key===fields.fixture_key);
 if(!doc||Date.parse(doc.payload.kickoff)<=Date.now()){out.textContent='This fixture has started. Choose an upcoming match.';return;}
 if(!(probability>0&&probability<1&&odds>1&&odds<=10000&&Number.isInteger(line)&&line>=1&&line<=6&&minutes>0&&minutes<=120)){out.textContent='Check your probability, price, line and minutes.';return;}
 if(!fields.price_confirmed||!Number.isFinite(observed)||observed>Date.now()||Date.now()-observed>1800000){out.textContent='Check a fresh bookmaker price and enter when you observed it (within 30 minutes).';return;}
 const context=researchPlayerScreenRows(researchDocs,fields.market,line,0,fields.fixture_key,'20',false).find(r=>r.player===fields.player);
 const payload={...fields,probability,odds,line,expected_minutes:minutes,observed_at:new Date(observed).toISOString(),price_confirmed:true,kind:'paper_prediction',sample_context:context?{window:'available last 20 PL',n:context.n,hits:context.hits,start:context.start,end:context.end,verified:context.verified}:null};
 button.disabled=true;out.textContent='Saving locked estimate…';
 try{const {error}=await sb.rpc('save_research_with_pin',{p_player:me,p_pin:pin,p_key:'note:forecast_'+crypto.randomUUID(),p_payload:payload});if(error)throw error;if(loggedIn&&me==='Joe')await refreshResearch();}
 catch(err){out.textContent='Could not save: '+err.message;}finally{button.disabled=false;}
}
async function settleResearchForecast(e){
 e.preventDefault();if(!(loggedIn&&me==='Joe'&&pin))return;
 const form=e.currentTarget,out=form.querySelector('.researchSettleStatus'),button=form.querySelector('button');
 const payload={...Object.fromEntries(new FormData(form)),action:'settle'};button.disabled=true;
 try{const {error}=await sb.rpc('save_research_with_pin',{p_player:me,p_pin:pin,p_key:form.dataset.key,p_payload:payload});if(error)throw error;if(loggedIn&&me==='Joe')await refreshResearch();}
 catch(err){out.textContent='Could not settle: '+err.message;}finally{button.disabled=false;}
}
