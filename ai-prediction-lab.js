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
})();