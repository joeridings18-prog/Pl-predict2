// Shared real-bet ledger. No stakes or odds are assumed or fetched.
let groupRows=[],groupScores={},groupEdit=null,groupBusy=false;
const groupMoney=(n,signed=false)=>(signed?(n<0?'−':'+'):'')+'£'+Math.abs(n).toFixed(2);
const groupPennies=n=>Math.round(Number(n)*100);
function groupPickOutcome(p,market){
 if(p.game_id){
  const score=groupScores[p.game_id]?.[p.fixture_index];
  if(!score)return 'pending';
  if(market==='goals')return score[0]+score[1]>=3?'won':'lost';
  const side=p.side==='home'?0:1;
  return score[side]>score[1-side]?'won':'lost';
 }
 return p[market]||'pending';
}
function groupSettle(row,market){
 const b=row.data[market==='result'?'resultBet':'goalsBet'];
 if(!b.placed)return {status:'Not placed',stake:0,returns:0};
 const states=row.data.picks.map(p=>groupPickOutcome(p,market)),stake=groupPennies(b.stake);
 if(states.includes('lost'))return {status:'Lost',stake,returns:0};
 if(states.includes('pending'))return {status:'Pending',stake,returns:null};
 if(states.every(x=>x==='void'))return {status:'Void',stake,returns:stake};
 if(b.actual_return!==null&&b.actual_return!==''&&b.actual_return!==undefined)return {status:'Won',stake,returns:groupPennies(b.actual_return)};
 if(states.includes('void')||!b.odds)return {status:'Return needed',stake,returns:null};
 return {status:'Won',stake,returns:Math.round(stake*Number(b.odds))};
}
function groupStats(rows,player,market){
 let wins=0,losses=0,streak=0,best=0,voids=0;
 for(const r of [...rows].sort((a,b)=>a.data.date.localeCompare(b.data.date)||a.id.localeCompare(b.id))){
  if(!r.data[market==='result'?'resultBet':'goalsBet'].placed)continue;
  const p=r.data.picks.find(x=>x.player===player);if(!p)continue;
  const state=groupPickOutcome(p,market);
  if(state==='won'){wins++;best=Math.max(best,++streak);}else if(state==='lost'){losses++;streak=0;}else if(state==='void')voids++;
 }
 return {wins,losses,voids,best,streak,rate:wins+losses?Math.round(100*wins/(wins+losses))+'%':'—'};
}
function groupBadge(s){return '<span class="pill">'+esc(({won:'✅ Won',lost:'❌ Lost',pending:'⏳ Pending',void:'↩ Void'})[s]||s)+'</span>';}
function renderGroupBets(){
 const root=document.getElementById('groupContent');
 const rows=[...groupRows].sort((a,b)=>b.data.date.localeCompare(a.data.date)||a.id.localeCompare(b.id));
 const bets=rows.flatMap(r=>['result','goals'].map(m=>groupSettle(r,m)));
 const stake=bets.reduce((n,b)=>n+b.stake,0),returns=bets.reduce((n,b)=>n+(b.returns||0),0),pending=bets.filter(b=>b.returns===null),settledStake=bets.filter(b=>b.returns!==null).reduce((n,b)=>n+b.stake,0);
 root.innerHTML='<div class="card"><h3>Group money · '+esc(SEASON_KEY)+'</h3><div class="recordGrid">'+[
 ['Running total',groupMoney((returns-stake)/100,true)],['Settled profit / loss',groupMoney((returns-settledStake)/100,true)],['Total staked',groupMoney(stake/100)],['Total returns',groupMoney(returns/100)]
 ].map(([t,v])=>'<div class="recordCard"><div class="small">'+t+'</div><div class="recordValue">'+v+'</div></div>').join('')+'</div><p class="small">Running total = returns minus every placed stake, including pending bets. Starts at £0; this is profit / loss, not your bookmaker balance. Returns include the stake.</p><p>'+bets.filter(b=>b.status==='Won').length+' wins · '+bets.filter(b=>b.status==='Lost').length+' losses · '+pending.length+' pending / awaiting return</p><button type="button" id="groupRefresh">↻ Refresh</button> '+(loggedIn&&me==='Joe'?'<button type="button" id="groupAdd">＋ Add group bet</button>':'<span class="small">Joe can add and update the group betting slips after logging in.</span>')+'</div>'+
 '<div id="groupEditor"></div><div class="card"><h3>Individual pick records</h3><p class="small">Picks count when their four-fold is marked placed. Voids and pending picks are excluded from win rates.</p><div class="playerStatsGrid">'+PLAYERS.map(p=>'<div class="recordCard"><h3>'+esc(p)+'</h3>'+['result','goals'].map(m=>{const s=groupStats(rows,p,m);return '<p><b>'+(m==='result'?'Team to win':'Over 2.5 match goals')+'</b><br>'+s.wins+' wins · '+s.losses+' losses · '+s.voids+' voids<br>Win rate: <b>'+s.rate+'</b> · Current streak: '+s.streak+' · Best: '+s.best+'</p>';}).join('')+'</div>').join('')+'</div></div>'+(rows.length>1?'<h3>Previous bets</h3>':'')+
 (rows.length?rows.map(r=>'<div class="card" data-group-bet-id="'+esc(r.id)+'"><div class="sectionHead"><h3>'+esc(r.data.title)+'</h3><span class="small">'+esc(r.data.date)+'</span></div><div style="overflow-x:auto"><table><thead><tr><th>Player / pick</th><th>Team win</th><th>Over 2.5</th></tr></thead><tbody>'+r.data.picks.map(p=>'<tr><td><b>'+esc(p.player)+'</b><br>'+esc(p.team)+'<br><span class="small">vs '+esc(p.opponent)+'</span></td><td>'+groupBadge(groupPickOutcome(p,'result'))+'</td><td>'+groupBadge(groupPickOutcome(p,'goals'))+'</td></tr>').join('')+'</tbody></table></div>'+['result','goals'].map(m=>{const b=r.data[m==='result'?'resultBet':'goalsBet'],s=groupSettle(r,m);const potential=Number(b.stake)>0&&Number(b.odds)>=1?groupMoney(Math.round(groupPennies(b.stake)*Number(b.odds))/100):'—';return '<div class="betRow"><b>'+(m==='result'?'Match result four-fold':'Over 2.5 goals four-fold')+'</b> · '+groupBadge(s.status)+'<br>Stake '+groupMoney(s.stake/100)+' · Combined odds '+esc(b.odds||'—')+' · Potential return <b>'+potential+'</b> <span class="small">(including stake)</span><br>Return '+(s.returns===null?'Awaiting settlement':groupMoney(s.returns/100))+(s.returns!==null&&b.placed?' · Net '+groupMoney((s.returns-s.stake)/100,true):'')+'</div>';}).join('')+(loggedIn&&me==='Joe'?'<button type="button" data-group-edit="'+r.id+'">Edit picks / slip</button>':'')+'</div>').join(''):'<div class="card"><p>No group bets yet. Add your first four picks to start the record.</p></div>');
 const newestCard=root.querySelector('[data-group-bet-id]');
 if(newestCard)root.prepend(newestCard);
 document.getElementById('groupRefresh').onclick=refreshGroupBets;
 if(document.getElementById('groupAdd'))document.getElementById('groupAdd').onclick=()=>editGroupBet();
 root.querySelectorAll('[data-group-edit]').forEach(b=>b.onclick=()=>editGroupBet(b.dataset.groupEdit));
}
async function refreshGroupBets(){
 if(groupBusy)return;groupBusy=true;
 try{
  const {data,error}=await sb.from('pl_group_bets').select('id,data,revision').eq('season_key',SEASON_KEY);
  if(error)throw error;
  const ids=[...new Set((data||[]).flatMap(r=>r.data.picks.map(p=>p.game_id).filter(Boolean)))];
  const scores=await Promise.all(ids.map(async id=>{const r=await sb.rpc('get_game_results',{p_game_id:id});if(r.error)throw r.error;return [id,Object.fromEntries((r.data||[]).filter(x=>x.home_score!==null&&x.away_score!==null).map(x=>[x.fixture_index,[Number(x.home_score),Number(x.away_score)]]))];}));
  groupRows=data||[];groupScores=Object.fromEntries(scores);groupEdit=null;renderGroupBets();
 }catch(e){document.getElementById('groupContent').innerHTML='<div class="card warn">Could not load group bets: '+esc(e.message||e)+'<br><button type="button" onclick="refreshGroupBets()">Try again</button></div>';}
 finally{groupBusy=false;}
}
function groupFixtureOptions(p){
 const options=[];
 for(const g of games)for(const [i,f] of (g.fixtures||[]).entries()){
  const kick=Date.parse(f[3]);
  if(!(g.id===p.game_id&&i===p.fixture_index)&&(kick<Date.now()-86400000*2||kick>Date.now()+86400000*21))continue;
  for(const side of ['home','away'])options.push({key:g.id+'|'+i+'|'+side,label:(g.round_label||g.title)+' · '+f[0]+' v '+f[1]+' · '+(side==='home'?f[0]:f[1])+' to win'});
 }
 return '<option value="">Other fixture / manual result</option>'+options.map(o=>'<option value="'+esc(o.key)+'"'+(o.key===p.game_id+'|'+p.fixture_index+'|'+p.side?' selected':'')+'>'+esc(o.label)+'</option>').join('');
}
function editGroupBet(id){
 if(!loggedIn||me!=='Joe')return;
 groupEdit=id?groupRows.find(r=>r.id===id):{id:crypto.randomUUID(),revision:0,data:{title:'Group bet',date:new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'}),picks:PLAYERS.map(player=>({player,team:'',opponent:'',game_id:'',fixture_index:null,side:'home',result:'pending',goals:'pending'})),resultBet:{placed:false,stake:0,odds:null,actual_return:null},goalsBet:{placed:false,stake:0,odds:null,actual_return:null}}};
 if(!groupEdit)return;
 const d=groupEdit.data,editor=document.getElementById('groupEditor');
 const input=(label,name,value,type='text')=>'<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value??'')+'" '+(type==='number'?'min="0" step="0.01"':'')+'></label>';
 const status=(name,v)=>'<select name="'+name+'">'+['pending','won','lost','void'].map(s=>'<option'+(s===v?' selected':'')+' value="'+s+'">'+s+'</option>').join('')+'</select>';
 editor.innerHTML='<form id="groupForm" class="card"><h3>'+ (id?'Edit':'New')+' group bet</h3><p class="small">Choose fixtures from the next three weeks, or enter any other match manually. Each person’s chosen match is used in both four-folds. Over 2.5 means three or more goals in the whole match.</p>'+input('Name','title',d.title)+input('Date','date',d.date,'date')+d.picks.map((p,i)=>'<fieldset style="margin:16px 0;border:1px solid #ddd;border-radius:12px"><legend><b>'+esc(p.player)+'</b></legend><label>Fixture / team<select name="fixture'+i+'">'+groupFixtureOptions(p)+'</select></label><div id="groupManual'+i+'">'+input('Chosen team','team'+i,p.team)+input('Opponent','opponent'+i,p.opponent)+'<label>Team win result'+status('result'+i,p.result)+'</label><label>Over 2.5 match goals result'+status('goals'+i,p.goals)+'</label></div><p class="small" id="groupAuto'+i+'">Linked fixtures settle from recorded final results. A draw loses the team-win pick.</p></fieldset>').join('')+['result','goals'].map(m=>{const b=d[m==='result'?'resultBet':'goalsBet'];return '<fieldset style="margin:16px 0;border:1px solid #ddd;border-radius:12px"><legend><b>'+(m==='result'?'Match result':'Over 2.5 goals')+' four-fold</b></legend><label><input style="width:auto" type="checkbox" name="'+m+'Placed" '+(b.placed?'checked':'')+'> Bet placed — include stake in running total</label>'+input('Total stake (£)',m+'Stake',b.stake,'number')+input('Combined decimal odds (optional)',m+'Odds',b.odds,'number')+input('Actual total return including stake (£, optional)',m+'Return',b.actual_return,'number')+'</fieldset>';}).join('')+'<p class="small">Winning returns use stake × combined odds unless an actual return is entered. If a leg is void, enter the bookmaker’s adjusted return; an entirely void bet refunds its stake. Marking a postponed match void should follow the betting slip.</p><div id="groupSaveMessage" role="status"></div><button type="submit" class="submit">Save group bet</button> <button type="button" id="groupCancel">Cancel</button></form>';
 const form=document.getElementById('groupForm');
 d.picks.forEach((p,i)=>{const f=form.elements['fixture'+i],toggle=()=>{document.getElementById('groupManual'+i).classList.toggle('hidden',!!f.value);document.getElementById('groupAuto'+i).classList.toggle('hidden',!f.value);};f.onchange=toggle;toggle();});
 document.getElementById('groupCancel').onclick=()=>{groupEdit=null;editor.innerHTML='';};
 form.onsubmit=saveGroupBet;
 editor.scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveGroupBet(event){
 event.preventDefault();const form=event.target,msg=document.getElementById('groupSaveMessage'),button=form.querySelector('[type=submit]');
 const val=n=>form.elements[n].value.trim();
 const amount=n=>val(n)===''?null:Number(val(n));
 button.disabled=true;msg.textContent='Saving…';
 try{
  if(!loggedIn||me!=='Joe'||!pin)throw Error('Log in as Joe to manage group bets.');
  const data={title:val('title'),date:val('date'),picks:PLAYERS.map((player,i)=>{
   const key=val('fixture'+i);
   if(!key)return {player,team:val('team'+i),opponent:val('opponent'+i),game_id:'',fixture_index:null,side:'home',result:val('result'+i),goals:val('goals'+i)};
   const [game_id,index,side]=key.split('|'),fixture_index=Number(index),f=games.find(g=>g.id===game_id)?.fixtures[fixture_index];
   if(!f)throw Error('Fixture no longer available. Refresh and try again.');
   return {player,team:f[side==='home'?0:1],opponent:f[side==='home'?1:0],game_id,fixture_index,side,result:'pending',goals:'pending'};
  })};
  if(!data.title||!data.date||data.picks.some(p=>!p.team||!p.opponent))throw Error('Enter the name, date, and one team and opponent for each person.');
  for(const m of ['result','goals']){
   const b={placed:form.elements[m+'Placed'].checked,stake:amount(m+'Stake')??0,odds:amount(m+'Odds'),actual_return:amount(m+'Return')};
   if(b.placed&&b.stake<=0)throw Error('Enter a positive stake for each placed bet.');
   if(b.odds!==null&&b.odds<1)throw Error('Use decimal odds of at least 1.');
   data[m==='result'?'resultBet':'goalsBet']=b;
  }
  if(data.resultBet.placed||data.goalsBet.placed){
   const matches=data.picks.map(p=>[p.team.toLowerCase().trim(),p.opponent.toLowerCase().trim()].sort().join('|'));
   if(new Set(matches).size!==4)throw Error('A four-fold needs four different matches. Two picks use the same match.');
  }
  const {error}=await sb.rpc('save_group_bet_with_pin',{p_id:groupEdit.id,p_season:SEASON_KEY,p_data:data,p_revision:groupEdit.revision,p_player:me,p_pin:pin});
  if(error)throw error;
  await refreshGroupBets();
 }catch(e){msg.textContent=e.message||String(e);button.disabled=false;}
}
