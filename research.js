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
 root.innerHTML='<h3>Team goals · home and away</h3><label for="researchLeague">Competition</label><select id="researchLeague" class="roundPickerSelect">'+Object.entries(researchCompetitions).map(([k,v])=>'<option value="'+k+'" '+(k===comp?'selected':'')+'>'+esc(v)+'</option>').join("")+'</select><p class="small">Season 2026/27 · completed matches only · each competition kept separate. Small venue samples are shown explicitly.</p><button id="refreshResearchGoals" class="submit">↻ Update and save goals data</button><p id="researchUpdateStatus" class="small"></p><div id="researchGoals"></div><h3>Player markets</h3><p>'+esc((source.markets||[]).join(" · "))+'</p><p class="small">Researched player samples are shown above. Automatic league-wide statistics and prices still require verified provider coverage. Bookings counts currently record yellow cards; bookmaker red-card settlement rules need checking.</p><h3>Save a bookmaker price</h3><p class="small">Record an exact selection for later research. A saved price alone is not a value recommendation.</p><form id="researchQuoteForm" style="display:grid;gap:10px"><label>Match<input name="match" required maxlength="120" placeholder="Liverpool v Manchester City" style="display:block;width:100%;padding:10px"></label><label>Selection<input name="selection" required maxlength="160" placeholder="Haaland 1+ shots on target / Over 2.5 goals" style="display:block;width:100%;padding:10px"></label><label>Bookmaker<input name="bookmaker" required maxlength="60" value="Bet365" style="display:block;width:100%;padding:10px"></label><label>Decimal odds<input name="odds" type="number" min="1.01" max="10000" step="0.01" required style="display:block;width:100%;padding:10px"></label><label>Source link<input name="source" type="url" required placeholder="https://" style="display:block;width:100%;padding:10px"></label><label>Notes<textarea name="notes" maxlength="2000" style="display:block;width:100%;padding:10px"></textarea></label><button class="submit" type="submit">Save private price snapshot</button><p id="researchQuoteStatus" class="small"></p></form><div id="researchQuotes"></div><h3>Data-source research</h3>'+
 (source.providers||[]).map(p=>'<details class="fixtureCompare"><summary><b>'+esc(p.name)+'</b> · '+esc(p.price)+'</summary><p>'+esc(p.status)+'</p><p class="small">'+esc(p.notes)+'</p><a href="'+esc(p.url)+'" target="_blank" rel="noopener">Provider documentation</a></details>').join("")+'<p class="small">'+esc(source.next_step)+'</p>';
 document.getElementById("researchLeague").onchange=()=>renderResearch();
 document.getElementById("refreshResearchGoals").onclick=refreshResearchGoals;
 document.getElementById("researchQuoteForm").onsubmit=saveResearchQuote;
 renderResearchGoals(comp,home,away);
 renderResearchPilot();
 renderResearchScreen();
 const quotes=researchDocs.filter(d=>d.key.startsWith("quote:")).sort((a,b)=>Date.parse(b.payload.captured_at)-Date.parse(a.payload.captured_at));
 document.getElementById("researchQuotes").innerHTML='<h3>Saved price history</h3>'+(quotes.length?quotes.map(d=>{const p=d.payload;return '<div class="statusRow"><div><b>'+esc(p.selection)+'</b><div class="small">'+esc(p.match)+' · '+esc(p.bookmaker)+' · '+esc(new Date(p.captured_at).toLocaleString("en-GB"))+'</div><div class="small">'+esc(p.notes||"")+'</div></div><div><b>'+Number(p.odds).toFixed(2)+'</b><div class="small">'+(100/Number(p.odds)).toFixed(1)+'% break-even</div></div></div>';}).join(""):'<p class="small">No price snapshots recorded yet.</p>');
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
function researchPlayerScreenRows(docs,market,line,minMinutes,fixtureKey="all"){
 return docs.filter(d=>d.key.startsWith('note:')&&(fixtureKey==='all'||d.key===fixtureKey)&&Array.isArray(d.payload?.players)&&Array.isArray(d.payload?.markets)).flatMap(d=>{
  const p=d.payload;
  return p.players.flatMap(player=>p.markets.flatMap((name,i)=>{
   if(market!=="all"&&name!==market)return [];
   const samples=player.matches.filter(m=>Number.isInteger(m.counts?.[i])&&m.counts[i]>=0&&m.minutes>0&&m.minutes>=minMinutes);
   const n=samples.length,hits=samples.filter(m=>m.counts[i]>=line).length;
   const quote=(line===1?player.odds_1_plus:line===2?player.odds_2_plus:null)?.[i];
   const odds=Number.isFinite(quote)&&quote>1?quote:null;
   return [{fixtureKey:d.key,player:player.name,fixture:p.title,market:name,line,n,hits,odds,breakEven:odds?100/odds:null,minutes:n?samples.reduce((s,m)=>s+m.minutes,0)/n:null,notes:player.verification_note||"See original pilot verification.",checked_at:p.checked_at}];
  }));
 });
}
function renderResearchScreen(){
 const panel=document.createElement("div");panel.className="card";panel.style="margin:0 0 20px;border:1px solid #ddd;box-shadow:none";
 const docs=researchDocs.filter(d=>d.key.startsWith('note:')&&Array.isArray(d.payload?.players)&&Array.isArray(d.payload?.markets));
 if(!docs.length)return;
 const markets=[...new Set(docs.flatMap(d=>d.payload.markets))],count=docs.reduce((n,d)=>n+d.payload.players.length,0);
 panel.innerHTML='<h3>Player market screen</h3><p class="small">'+count+' researched player samples across '+docs.length+' match report(s). League-wide coverage is not complete. Prices below are unverified Statz snapshots.</p><label>Fixture<select id="researchScreenFixture" class="roundPickerSelect"><option value="all">All researched fixtures</option>'+docs.map(d=>'<option value="'+esc(d.key)+'">'+esc(d.payload.title)+'</option>').join('')+'</select></label><label>Market<select id="researchScreenMarket" class="roundPickerSelect"><option value="all">All six markets</option>'+markets.map(m=>'<option '+(m==='Shots on target'?'selected':'')+' value="'+esc(m)+'">'+esc(m)+'</option>').join('')+'</select></label><label>Line<select id="researchScreenLine" class="roundPickerSelect"><option value="1">1+</option><option value="2">2+</option><option value="3">3+ · no price feed</option></select></label><label>Appearance minutes<select id="researchScreenMinutes" class="roundPickerSelect"><option value="0">All played appearances</option><option value="60">60+ minutes only</option></select></label><div id="researchScreenRows"></div><p class="small">Historical frequency and break-even are comparison inputs. They are not a next-match probability or a confirmed edge. Filtering minutes changes the sample; a 60+ minute appearance does not prove the player started.</p>';
 document.getElementById("researchContent").prepend(panel);
 const update=()=>{
  const rows=researchPlayerScreenRows(researchDocs,document.getElementById('researchScreenMarket').value,Number(document.getElementById('researchScreenLine').value),Number(document.getElementById('researchScreenMinutes').value),document.getElementById('researchScreenFixture').value);
  document.getElementById('researchScreenRows').innerHTML='<div style="overflow-x:auto"><table class="leader"><thead><tr><th>Player / match</th><th>Market</th><th>Historical hit</th><th>Avg minutes</th><th>Unverified price</th><th>Break-even</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.player)+'<details><summary class="small">Sample context</summary><p class="small">'+esc(r.fixture)+'</p><p class="small">'+esc(r.notes)+'</p></details></td><td>'+esc(r.market)+' '+r.line+'+</td><td>'+(r.n?r.hits+'/'+r.n+' · '+(100*r.hits/r.n).toFixed(0)+'%':'—')+(r.n<5?'<div class="small">Limited sample</div>':'')+'</td><td>'+(r.minutes==null?'—':r.minutes.toFixed(0))+'</td><td>'+(r.odds==null?'—':r.odds.toFixed(2))+'</td><td>'+(r.breakEven==null?'—':r.breakEven.toFixed(1)+'%')+'</td></tr>').join('')+'</tbody></table></div>';
 };
 for(const id of ['researchScreenFixture','researchScreenMarket','researchScreenLine','researchScreenMinutes'])document.getElementById(id).onchange=update;
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
 const payload={...fields,odds,captured_at:new Date().toISOString(),kind:"manual_price_snapshot"},key="quote:"+crypto.randomUUID();
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
