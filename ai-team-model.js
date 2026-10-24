/* Goals-based estimates. No shot xG, private picks, credentials or database writes. */
(function(root){
"use strict";
const VERSION="goals-form-v1", DAY=86400000;
const SETTINGS=Object.freeze({window:10,halfLifeDays:45,priorGames:5,venueWeight:.5,opponentPasses:2,lagHours:4});
const aliases={manutd:"manchesterunited",manunited:"manchesterunited",mancity:"manchestercity",wolves:"wolverhamptonwanderers",spurs:"tottenhamhotspur",tottenham:"tottenhamhotspur",brighton:"brightonhovealbion",brightonandhovealbion:"brightonhovealbion",nottmforest:"nottinghamforest",nottforest:"nottinghamforest",sheffwed:"sheffieldwednesday",sheffweds:"sheffieldwednesday",sheffutd:"sheffieldunited",qpr:"queensparkrangers",westbrom:"westbromwichalbion",birmingham:"birminghamcity",coventry:"coventrycity",hull:"hullcity",ipswich:"ipswichtown",leicester:"leicestercity",norwich:"norwichcity",stoke:"stokecity",swansea:"swanseacity",watford:"watford",oxford:"oxfordunited",charlton:"charltonathletic",blackburn:"blackburnrovers",preston:"prestonnorthend",derby:"derbycounty",sunderland:"sunderland",leeds:"leedsunited",newcastle:"newcastleunited",westham:"westhamunited",bournemouth:"bournemouth",burnley:"burnley",luton:"lutontown",portsmouth:"portsmouth",wrexham:"wrexham"};
Object.assign(aliases,{shakhtardonetsk:"fkshakhtardonetsk",atleticomadrid:"clubatleticodemadrid",bayernmunich:"bayernmunchen",intermilan:"internazionalemilano",slovanbratislava:"skslovanbratislava",aekathens:"paeaek",psveindhoven:"psv",lens:"racingclubdelens",como:"como1907",slaviaprague:"skslaviapraha",slaviapraha:"skslaviapraha",sabah:"sabahfk",bodoglimt:"fkbodoglimt"});
function canonical(name){
 const key=String(name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(football club|fc|afc)\b/g,"").replace(/[^a-z0-9]/g,"");
 return aliases[key]||key;
}
function competition(f,g){
 const label=String(f?.[4]||g?.competition||"").toLowerCase();
 if(/championship|^elc$/.test(label))return "ELC";
 if(/champions league|^ucl$|^cl$/.test(label))return "CL";
 if(/premier league|^pl$/.test(label)||(!label&&/^pw/i.test(g?.round_label||"")))return "PL";
 return null;
}
function clean(matches,season,cutoff){
 const start=Date.UTC(season,6,1),end=Date.UTC(season+1,6,1),seen=new Set();
 return (matches||[]).filter(m=>{
  const t=Date.parse(m.utcDate),key=canonical(m.home)+"|"+canonical(m.away)+"|"+t;
  if(m.status!=="FINISHED"||!Number.isFinite(t)||t<start||t>=end||t>=cutoff||!canonical(m.home)||!canonical(m.away)||canonical(m.home)===canonical(m.away)||!Number.isInteger(m.homeScore)||!Number.isInteger(m.awayScore)||m.homeScore<0||m.awayScore<0||seen.has(key))return false;
  seen.add(key);return true;
 }).sort((a,b)=>Date.parse(a.utcDate)-Date.parse(b.utcDate));
}
function resolve(name,matches){
 const wanted=canonical(name),found=new Set();
 for(const m of matches)for(const side of ["home","away"]){
  if(canonical(m[side])===wanted||canonical(m[side+"Short"])===wanted)found.add(canonical(m[side]));
 }
 return found.size===1?[...found][0]:null;
}
const clamp=n=>Math.min(6,Math.max(.1,n));
function estimate(matches,fixture,{season,now=Date.now()}={}){
 const kickoff=Date.parse(fixture?.[3]);
 if(!Number.isInteger(season)||!Number.isFinite(now)||!Number.isFinite(kickoff)||kickoff<=now)throw Error("Automatic estimates are available for upcoming fixtures with a known kickoff.");
 // Four-hour buffer prevents overlapping matches from entering training data.
 const cutoff=Math.min(now,kickoff)-4*3600000,rows=clean(matches,season,cutoff);
 if(rows.length<20)throw Error("Not enough current-season data: at least 20 completed competition matches are required.");
 const home=resolve(fixture[0],rows),away=resolve(fixture[1],rows);
 if(!home||!away||home===away)throw Error("Could not uniquely match both teams to this competition’s completed results.");
 const weight=m=>Math.pow(.5,(cutoff-Date.parse(m.utcDate))/(45*DAY));
 const mass=rows.reduce((s,m)=>s+weight(m),0);
 const baseH=clamp(rows.reduce((s,m)=>s+weight(m)*m.homeScore,0)/mass),baseA=clamp(rows.reduce((s,m)=>s+weight(m)*m.awayScore,0)/mass);
 const teams=[...new Set(rows.flatMap(m=>[canonical(m.home),canonical(m.away)]))];
 const teamRows=team=>rows.filter(m=>canonical(m.home)===team||canonical(m.away)===team).slice(-10).reverse();
 const samples=new Map(teams.map(t=>[t,teamRows(t)]));
 if(samples.get(home).length<3||samples.get(away).length<3)throw Error("At least three completed current-season matches per team are required.");
 // Ratios are relative to league venue scoring. Five prior games shrink sparse records.
 let ratings=new Map(teams.map(t=>[t,{attack:1,defence:1}]));
 function ratio(team,venue,previous){
  const sample=samples.get(team).filter(m=>!venue||(canonical(m.home)===team?"home":"away")===venue);
  let attack=5,defence=5,total=5;
  for(const m of sample){
   const atHome=canonical(m.home)===team,opponent=previous.get(canonical(atHome?m.away:m.home)),w=weight(m);
   attack+=w*(atHome?m.homeScore:m.awayScore)/((atHome?baseH:baseA)*opponent.defence);
   defence+=w*(atHome?m.awayScore:m.homeScore)/((atHome?baseA:baseH)*opponent.attack);
   total+=w;
  }
  return {attack:attack/total,defence:defence/total};
 }
 for(let iteration=0;iteration<2;iteration++)ratings=new Map(teams.map(t=>[t,ratio(t,null,ratings)]));
 const hVenue=ratio(home,"home",ratings),aVenue=ratio(away,"away",ratings),hr=ratings.get(home),ar=ratings.get(away);
 const blend=(a,b)=>(a+b)/2;
 const h=clamp(baseH*blend(hr.attack,hVenue.attack)*blend(ar.defence,aVenue.defence));
 const a=clamp(baseA*blend(ar.attack,aVenue.attack)*blend(hr.defence,hVenue.defence));
 function summary(team,venue){
  const all=rows.filter(m=>canonical(m.home)===team||canonical(m.away)===team).reverse();
  const recent=all.slice(0,10),venueRows=all.filter(m=>(canonical(m.home)===team?"home":"away")===venue);
  const average=(list,against=false)=>list.length?list.reduce((s,m)=>s+((canonical(m.home)===team)!==against?m.homeScore:m.awayScore),0)/list.length:null;
  return {n:all.length,last5:Math.min(5,all.length),last10:recent.length,scored5:average(all.slice(0,5)),conceded5:average(all.slice(0,5),true),scored10:average(recent),conceded10:average(recent,true),venueN:venueRows.length,venueScored:average(venueRows),venueConceded:average(venueRows,true),recent:recent.map(m=>({date:m.utcDate,home:m.home,away:m.away,h:m.homeScore,a:m.awayScore}))};
 }
 const hs=summary(home,"home"),as=summary(away,"away"),warnings=[];
 if(hs.n<10||as.n<10)warnings.push("Fewer than 10 current-season matches for at least one team.");
 if(hs.venueN<5||as.venueN<5)warnings.push("Small home/away sample; estimates are pulled towards competition averages.");
 return {version:VERSION,settings:SETTINGS,h,a,r:0,season,cutoff,trainingMatches:rows.length,latestMatch:rows.at(-1).utcDate,baseH,baseA,home:hs,away:as,warnings};
}
const api={VERSION,canonical,competition,clean,estimate};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.AiTeamModel=api;
})(globalThis);
