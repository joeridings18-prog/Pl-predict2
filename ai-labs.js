(function(){
"use strict";
const STORAGE="pl_ai_labs_v1";
let historicalResults=new Map();
const root=()=>document.getElementById("aiLabsContent");
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const eligible=()=>Array.isArray(games)?games.filter(g=>Array.isArray(g.fixtures)&&g.fixtures.length):[];
const stored=()=>{try{return JSON.parse(localStorage.getItem(STORAGE)||"[]")}catch{return []}};
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
 if(!current()){if(root())root().innerHTML="";return;}
 const gs=eligible(),now=Date.now();
 const upcoming=gs.filter(g=>g.fixtures.some(f=>{const t=fixtureDate(f);return t!==null&&t>now;}));
 const preferred=upcoming[0]||gs[gs.length-1];
 const el=root();if(!el)return;
 el.innerHTML='<h2 style="margin:0 0 8px">🧪 AI Labs · Prediction Engine 2.0</h2>'+
 '<p class="small">Private, experimental modelling. Enter your own expected goals (xG) assumptions to test score probabilities and maximise our competition points: <b>6 for the result + 10 for the exact score</b>. Nothing here changes official picks.</p>'+
 '<div class="statMiniGrid"><div class="statMini"><span>Model</span><b>Poisson + Dixon–Coles</b></div><div class="statMini"><span>Strategy</span><b>Expected points</b></div></div>'+
 '<label class="roundPickerLabel" for="labRound">Choose prediction round</label><select id="labRound" class="roundPickerSelect">'+gs.map(g=>'<option value="'+safe(g.id)+'"'+(g===preferred?' selected':'')+'>'+safe(g.round_label||g.id)+'</option>').join('')+'</select>'+
 '<div id="labFixtures"></div><h3>📋 Saved experiments</h3><div id="labHistory"></div>'+
 '<p class="small">Experimental inputs are manually supplied, not live verified xG. Saved trials remain in this browser only. Predictions saved before kickoff can be evaluated later, but are not an independently audited backtest.</p>';
 document.getElementById("labRound").onchange=renderFixtures;
 renderFixtures();renderHistory();loadResults();
}
function renderFixtures(){
 const g=selected(),box=document.getElementById("labFixtures");if(!g||!box)return;
 const now=Date.now();
 box.innerHTML=(g.fixtures||[]).map((f,i)=>{
 const t=fixtureDate(f),open=t!==null&&t>now;
 return '<details class="fixtureCompare" '+(i===0?'open':'')+'><summary><b>'+safe(f[0])+' v '+safe(f[1])+'</b> <span class="small">'+(t?new Date(t).toLocaleString("en-GB"):"Kickoff unknown")+'</span></summary>'+
 '<div class="statMiniGrid" style="margin-top:12px"><label>Home expected goals<input type="number" inputmode="decimal" step=".05" min=".1" max="6" id="lh'+i+'" placeholder="e.g. 1.65" style="width:100%;padding:11px;margin-top:6px;border:1px solid #ccc;border-radius:9px"></label><label>Away expected goals<input type="number" inputmode="decimal" step=".05" min=".1" max="6" id="la'+i+'" placeholder="e.g. 1.10" style="width:100%;padding:11px;margin-top:6px;border:1px solid #ccc;border-radius:9px"></label></div>'+
 '<label class="roundPickerLabel" for="lr'+i+'">Dixon–Coles rho (default 0 = independent Poisson)</label><input id="lr'+i+'" type="number" inputmode="decimal" min="-.2" max=".2" step=".01" value="0" style="padding:10px;width:100%;border-radius:9px;border:1px solid #ccc">'+
 '<button class="submit" type="button" data-evaluate="'+i+'">Calculate probabilities</button><div id="labOutput'+i+'"></div>'+
 (open?'<button class="submit" style="background:#333" type="button" data-save="'+i+'">Save pre-match experiment</button>':'<p class="small">Kickoff passed or unknown: no new backtest entries allowed.</p>')+
 '</details>';
 }).join('');
 box.querySelectorAll("[data-evaluate]").forEach(b=>b.onclick=()=>evaluate(Number(b.dataset.evaluate)));
 box.querySelectorAll("[data-save]").forEach(b=>b.onclick=()=>save(Number(b.dataset.save)));
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
  box.innerHTML='<div class="statMiniGrid" style="margin-top:12px"><div class="statMini"><span>🏠 Home win</span><b>'+pct(d.outcomes[2])+'</b></div><div class="statMini"><span>🤝 Draw</span><b>'+pct(d.outcomes[1])+'</b></div><div class="statMini"><span>✈️ Away win</span><b>'+pct(d.outcomes[0])+'</b></div><div class="statMini"><span>🏆 Highest expected-points pick</span><b>'+b.h+'–'+b.v+'</b><span>'+b.ep.toFixed(2)+' expected pts · '+pct(b.p)+' exact probability</span></div></div>'+
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
 rows.push(entry);
 try{localStorage.setItem(STORAGE,JSON.stringify(rows));renderHistory();document.getElementById("labOutput"+i).insertAdjacentHTML("beforeend",'<div class="ok">Experiment saved in this browser; official prediction unchanged.</div>');}catch{alert("Could not save locally on this device.");}
}
async function loadResults(){
 if(!current())return;
 try{const {data,error}=await sb.rpc("get_ai_tracker_with_pin",{p_player:"Joe",p_pin:pin,p_season_key:SEASON_KEY});if(error)return;
 historicalResults=new Map((data?.rounds||[]).map(r=>[String(r.game_id),r.results||[]]));renderHistory();
 }catch{}
}
function renderHistory(){
 const box=document.getElementById("labHistory");if(!box)return;
 const rows=stored().filter(x=>x&&x.game_id!==undefined).sort((a,b)=>b.created-a.created).slice(0,100);
 if(!rows.length){box.innerHTML='<p class="small">No experiments saved yet. Run a fixture model above, then save before kickoff.</p>';return;}
 const roundById=new Map(eligible().map(g=>[String(g.id),g]));
 box.innerHTML='<div style="overflow-x:auto"><table><thead><tr><th>Fixture</th><th>Pick</th><th>Expected pts</th><th>Actual pts</th></tr></thead><tbody>'+rows.map(x=>{
  const g=roundById.get(String(x.game_id));const result=historicalResults.get(String(x.game_id))?.[x.index]||g?.results?.[x.index];const final=Array.isArray(result)&&result.length===2&&result.every(n=>n!==null&&Number.isFinite(Number(n)));
  const points=final?((Number(result[0])===x.pick[0]&&Number(result[1])===x.pick[1]?10:0)+(scoreResult(Number(result[0]),Number(result[1]))===scoreResult(x.pick[0],x.pick[1])?6:0)):null;
  return '<tr><td>'+safe(x.home)+' v '+safe(x.away)+'<div class="small">'+safe(x.round)+' · '+new Date(x.created).toLocaleDateString("en-GB")+'</div></td><td>'+safe(x.pick.join("–"))+'</td><td>'+Number(x.expected_points).toFixed(2)+'</td><td>'+(points===null?'Pending':points)+'</td></tr>';
 }).join('')+'</tbody></table></div><p class="small">Actual scores are shown only if included in the available round data. This browser history is not shared across devices.</p>';
}
window.renderAiLabs=render;
})();