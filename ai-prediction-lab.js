/* Private Al Prediction Lab — calculations only; no changes to locked predictions. */
(function(){
const root=document.getElementById('aiPredictionLab');if(!root)return;
root.innerHTML=`<h2 style="margin-top:0">🧪 Al Prediction Lab <span class="pill">Joe only</span></h2>
<p class="small">A private, experimental expected-points calculator. Enter estimated home and away goals (λ) to compare scorelines under our 6-point result + 10-point exact-score rules. These are <b>inputs, not verified live xG or published forecasts</b>. Nothing here changes locked predictions.</p>
<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">
<label>Home expected goals<br><input id="labHome" type="number" min=".1" max="6" step=".05" value="1.55" style="max-width:130px"></label>
<label>Away expected goals<br><input id="labAway" type="number" min=".1" max="6" step=".05" value="1.15" style="max-width:130px"></label>
<button id="labCalculate" type="button">Calculate optimal pick</button></div>
<div id="labOutput" style="margin-top:16px"></div>
<details style="margin-top:14px"><summary><b>Methodology and next development steps</b></summary>
<p class="small">Current calculator: independent Poisson goals, scorelines 0–10, and expected game points = 6 × P(result) + 10 × P(exact score). Model uncertainty and low-score correlation are not yet calibrated.</p>
<p class="small">Next: feed pre-match team ratings, home/away xG, strength-of-schedule, injuries and rest into estimated goals; compare Dixon–Coles and market-calibrated variants with time-ordered backtests. Keep only improvements that increase out-of-sample points per match.</p>
</details>`;
const esc=n=>Number(n).toFixed(2);
function pois(k,l){let p=Math.exp(-l);for(let i=1;i<=k;i++)p*=l/i;return p;}
function calc(){
const h=Number(document.getElementById('labHome').value),a=Number(document.getElementById('labAway').value),out=document.getElementById('labOutput');
if(!Number.isFinite(h)||!Number.isFinite(a)||h<.1||a<.1||h>6||a>6){out.textContent='Enter expected goals between 0.1 and 6.';return;}
const pH=Array.from({length:11},(_,i)=>pois(i,h)),pA=Array.from({length:11},(_,i)=>pois(i,a));
const outcomes=[0,0,0];let mass=0;const scores=[];
for(let i=0;i<=10;i++)for(let j=0;j<=10;j++){const p=pH[i]*pA[j],k=i>j?0:i===j?1:2;outcomes[k]+=p;mass+=p;scores.push({i,j,p,k});}
const ranked=scores.map(x=>({...x,ep:6*outcomes[x.k]+10*x.p})).sort((x,y)=>y.ep-x.ep||y.p-x.p);
const best=ranked[0];
out.innerHTML=`<div class="statMiniGrid"><div class="statMini"><span>Optimal score</span><b>${best.i}–${best.j}</b></div><div class="statMini"><span>Expected points</span><b>${esc(best.ep)}</b></div><div class="statMini"><span>Home / Draw / Away</span><b>${outcomes.map(x=>Math.round(x*100)+'%').join(' / ')}</b></div></div>
<h3>Top 5 scorelines by expected points</h3>
<table class="leader"><thead><tr><th>Score</th><th>Exact probability</th><th>Expected points</th></tr></thead><tbody>${ranked.slice(0,5).map(x=>`<tr><td>${x.i}–${x.j}</td><td>${esc(x.p*100)}%</td><td><b>${esc(x.ep)}</b></td></tr>`).join('')}</tbody></table>
<p class="small">Poisson score grid captures ${esc(mass*100)}% of probability mass. Estimates are illustrative until validated against actual historical results.</p>`;
}
document.getElementById('labCalculate').addEventListener('click',calc);calc();

/* Rolling historical benchmark. Only completed scores; no human predictions. */
const history=document.createElement('section');history.style.marginTop='22px';
history.innerHTML='<h3>📊 Historical model backtest</h3><p class="small">Uses completed match results already recorded in this game. A rolling league-average Poisson model is tested only on later matches, never on the results it is predicting. This is an initial baseline, not yet the final xG model.</p><button id="labBacktest" type="button">Run historical backtest</button><div id="labBacktestOutput" class="small" style="margin-top:12px"></div>';
root.appendChild(history);
document.getElementById('labBacktest').addEventListener('click',async()=>{
const out=document.getElementById('labBacktestOutput');out.textContent='Loading completed fixtures…';
if(!(typeof loggedIn!=='undefined'&&loggedIn&&me==='Joe'&&pin)){out.textContent='Log in as Joe to use this private analysis.';return;}
try{
const [gr,rr]=await Promise.all([sb.from('pl_games').select('id,fixtures,round_label'),sb.from('pl_results').select('game_id,fixture_index,home_score,away_score')]);
if(gr.error)throw gr.error;if(rr.error)throw rr.error;
const gm=new Map((gr.data||[]).map(g=>[g.id,g]));
const rows=(rr.data||[]).map(r=>{const f=gm.get(r.game_id)?.fixtures?.[r.fixture_index];if(!Array.isArray(f)||!f[3]||!Number.isFinite(r.home_score)||!Number.isFinite(r.away_score))return null;return {date:Date.parse(f[3]),league:f[4]||'Other',h:r.home_score,a:r.away_score};}).filter(x=>x&&Number.isFinite(x.date)).sort((a,b)=>a.date-b.date);
const byLeague={};let n=0,points=0,exact=0,result=0;
for(const x of rows){
const prev=(byLeague[x.league]||[]).filter(y=>y.date<x.date);
if(prev.length>=20){
const lh=Math.max(.1,prev.reduce((v,y)=>v+y.h,0)/prev.length),la=Math.max(.1,prev.reduce((v,y)=>v+y.a,0)/prev.length);
const ph=Array.from({length:11},(_,i)=>pois(i,lh)),pa=Array.from({length:11},(_,i)=>pois(i,la));
const oc=[0,0,0],arr=[];
for(let i=0;i<=10;i++)for(let j=0;j<=10;j++){const p=ph[i]*pa[j],k=i>j?0:i===j?1:2;oc[k]+=p;arr.push({i,j,p,k});}
arr.sort((a,b)=>(6*oc[b.k]+10*b.p)-(6*oc[a.k]+10*a.p));
const best=arr[0],actual=x.h>x.a?0:x.h===x.a?1:2,hit=best.i===x.h&&best.j===x.a;
points+=hit?16:best.k===actual?6:0;exact+=Number(hit);result+=Number(best.k===actual);n++;
}
(byLeague[x.league]??=[]).push(x);
}
out.innerHTML=n?'<div class="statMiniGrid"><div class="statMini"><span>Backtested fixtures</span><b>'+n+'</b></div><div class="statMini"><span>Average points</span><b>'+(points/n).toFixed(2)+'</b></div><div class="statMini"><span>Result accuracy</span><b>'+(100*result/n).toFixed(1)+'%</b></div><div class="statMini"><span>Exact-score rate</span><b>'+(100*exact/n).toFixed(1)+'%</b></div></div><p class="small">Baseline uses earlier results within each competition; minimum 20 training fixtures. No opponent-strength adjustment yet. All records are scored once against their actual results.</p>':'Not enough readable historical match data yet (at least 20 prior matches per competition required).';
}catch(e){out.textContent='Historical data unavailable to this login: '+(e.message||e);}
});
})();