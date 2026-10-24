const {test}=require('node:test');
const assert=require('node:assert/strict');
const {canonical,competition,clean,estimate}=require('../ai-team-model.js');
const now=Date.parse('2026-10-24T10:00:00Z');
const fixture=['Alpha','Beta','', '2026-10-25T15:00:00Z','Premier League'];
const teams=['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta'];
const rows=Array.from({length:8},(_,week)=>Array.from({length:4},(_,i)=>({id:week*4+i,utcDate:new Date(Date.UTC(2026,7,1+week*7)).toISOString(),status:'FINISHED',home:teams[(i*2+week)%8],away:teams[(i*2+week+1)%8],homeScore:2,awayScore:1}))).flat();
const opts={season:2026,now};
test('aliases resolve exact known names without substring guesses',()=>{
 assert.equal(canonical('Manchester United FC'),canonical('Man Utd'));
 assert.equal(canonical('AFC Bournemouth'),canonical('Bournemouth'));
 assert.equal(canonical('Wolverhampton Wanderers FC'),canonical('Wolves'));
 assert.notEqual(canonical('Manchester City'),canonical('Manchester United'));
});
test('mixed rounds use each fixture competition',()=>{
 assert.equal(competition(['','','','','Championship'],{competition:'PL'}),'ELC');
 assert.equal(competition(['','','','','Champions League'],{}),'CL');
 assert.equal(competition(['',''],{competition:'UCL'}),'CL');
 assert.equal(competition(['',''],{round_label:'PW8'}),'PL');
 assert.equal(competition(['','','','','Unknown'],{}),null);
});
test('clean excludes unfinished, invalid, duplicate and out-of-season rows',()=>{
 const extras=[rows[0],{...rows[0],status:'IN_PLAY',utcDate:'2026-10-01T15:00:00Z'},{...rows[0],homeScore:null,utcDate:'2026-10-02T15:00:00Z'},{...rows[0],homeScore:-1,utcDate:'2026-10-03T15:00:00Z'},{...rows[0],utcDate:'2025-09-01T15:00:00Z'},{...rows[0],utcDate:'2027-08-01T15:00:00Z'}];
 assert.equal(clean([...rows,...extras],2026,now).length,rows.length);
});
test('uniform venue results reproduce the competition scoring baseline',()=>{
 const d=estimate(rows,fixture,opts);
 assert.ok(Math.abs(d.h-2)<1e-10);assert.ok(Math.abs(d.a-1)<1e-10);
 assert.equal(d.trainingMatches,32);assert.equal(d.home.last10,8);
 assert.ok(d.warnings.length);assert.equal(d.r,0);
});
test('future, overlapping and previous-season scores cannot affect estimates',()=>{
 const extra=['2026-10-24T08:00:00Z','2026-10-25T15:00:00Z','2025-10-01T12:00:00Z'].map(utcDate=>({...rows[0],utcDate,homeScore:18,awayScore:12}));
 assert.deepEqual(estimate([...rows,...extra],fixture,opts),estimate(rows,fixture,opts));
});
test('feed order and duplicate rows do not change the estimate',()=>{
 assert.deepEqual(estimate([...rows].reverse().concat(rows[0]),fixture,opts),estimate(rows,fixture,opts));
});
test('higher team scoring changes the model in the expected direction',()=>{
 const improved=rows.map(m=>({...m,homeScore:m.home==='Alpha'?5:m.homeScore,awayScore:m.away==='Alpha'?4:m.awayScore}));
 assert.ok(estimate(improved,fixture,opts).h>estimate(rows,fixture,opts).h);
});
test('missing team or insufficient competition/team sample does not invent inputs',()=>{
 assert.throws(()=>estimate(rows.slice(0,12),fixture,opts),/20 completed/);
 assert.throws(()=>estimate(rows,['No such club',...fixture.slice(1)],opts),/uniquely match/);
 const rare=rows.map(m=>m.home==='Alpha'?{...m,home:'Iota'}:m.away==='Alpha'?{...m,away:'Iota'}:m);
 rare.push({...rows[0],utcDate:'2026-10-01T12:00:00Z'});
 assert.throws(()=>estimate(rare,fixture,opts),/three completed/);
});
test('ambiguous provider short names are refused',()=>{
 const ambiguous=rows.map(m=>({...m,homeShort:'United',awayShort:'United'}));
 assert.throws(()=>estimate(ambiguous,['United',...fixture.slice(1)],opts),/uniquely match/);
});
test('started or unknown kickoff cannot be automatically predicted',()=>{
 assert.throws(()=>estimate(rows,[...fixture.slice(0,3),'2026-10-24T09:00:00Z'],opts),/upcoming/);
 assert.throws(()=>estimate(rows,[...fixture.slice(0,3),'unknown'],opts),/upcoming/);
});
