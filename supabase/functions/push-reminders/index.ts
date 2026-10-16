import {sb,config,deliver,site} from "./shared.ts";
Deno.serve(async req=>{
 if(req.method!=="POST")return Response.json({error:"Method not allowed"},{status:405});
 const auth=await sb.rpc("verify_final_sync_token",{p_token:req.headers.get("x-sync-token")||""});
 if(auth.error||auth.data!==true)return Response.json({error:"Unauthorized"},{status:401});
 try{
  const body=await req.json().catch(()=>({})),keys=await config(),now=Date.now();
  const [games,devices]=await Promise.all([
   sb.from("pl_games").select("id,round_label,reveal_at,fixtures").gt("reveal_at",new Date(now).toISOString()).lte("reveal_at",new Date(now+24*3600000).toISOString()),
   sb.from("pl_push_subscriptions").select("id,player,subscription,vapid_public_key").eq("enabled",true).eq("vapid_public_key",keys.publicKey)
  ]);
  if(games.error)throw games.error;if(devices.error)throw devices.error;
  const counters={ok:true,configured:true,registered_devices:(devices.data||[]).length,eligible:0,sent:0,failed:0,skipped:0,dry_run:!!body.dry_run};
  for(const g of games.data||[]){
   const remaining=Date.parse(g.reveal_at)-now;
   const stage=remaining<=2*3600000?"2h":remaining>23*3600000?"24h":null;
   if(!stage)continue;
   const picks=await sb.from("pl_predictions").select("player,predictions").eq("game_id",g.id);if(picks.error)throw picks.error;
   const byPlayer=new Map((picks.data||[]).map(p=>[p.player,p.predictions]));
   for(const d of devices.data||[]){
    const values=byPlayer.get(d.player)||[];
    const missing=(g.fixtures||[]).filter((f:any,i:number)=>Date.parse(f[3])>now&&!(Array.isArray(values[i])&&values[i].length===2&&values[i].every((v:any)=>v!==null&&v!==""&&Number.isFinite(Number(v))))).length;
    if(!missing){counters.skipped++;continue;}counters.eligible++;
    if(body.dry_run)continue;
    const claim=await sb.rpc("pl_claim_push_delivery",{p_subscription_id:d.id,p_game_id:g.id,p_stage:stage});if(claim.error)throw claim.error;if(!claim.data){counters.skipped++;continue;}
    // Recheck submitted predictions immediately before delivery.
    const latest=await sb.from("pl_predictions").select("predictions").eq("game_id",g.id).eq("player",d.player).maybeSingle();if(latest.error)throw latest.error;
    const left=(g.fixtures||[]).filter((f:any,i:number)=>Date.parse(f[3])>Date.now()&&!(Array.isArray(latest.data?.predictions?.[i])&&latest.data.predictions[i].length===2&&latest.data.predictions[i].every((v:any)=>v!==null&&v!==""&&Number.isFinite(Number(v))))).length;
    if(!left){counters.skipped++;await sb.from("pl_push_deliveries").update({sent_at:new Date().toISOString(),last_status:204}).eq("subscription_id",d.id).eq("game_id",g.id).eq("stage",stage);continue;}
    const deadline=new Intl.DateTimeFormat("en-GB",{weekday:"short",hour:"2-digit",minute:"2-digit",timeZone:"Europe/London"}).format(new Date(g.reveal_at));
    try{
     const response=await deliver(d.subscription,{title:g.round_label+" predictions ⚽",body:left+" prediction"+(left===1?"":"s")+" still needed. Deadline "+deadline+" UK time.",tag:"pl-"+g.id+"-"+stage,url:site},keys);
     const done=await sb.from("pl_push_deliveries").update({sent_at:new Date().toISOString(),last_status:response.statusCode,updated_at:new Date().toISOString()}).eq("subscription_id",d.id).eq("game_id",g.id).eq("stage",stage);if(done.error)throw done.error;counters.sent++;
    }catch(e){
     counters.failed++;
     await sb.from("pl_push_deliveries").update({last_status:Number(e.statusCode)||500,updated_at:new Date().toISOString()}).eq("subscription_id",d.id).eq("game_id",g.id).eq("stage",stage);
     if([404,410].includes(e.statusCode))await sb.from("pl_push_subscriptions").update({enabled:false}).eq("id",d.id);
    }
   }
  }
  return Response.json(counters);
 }catch(e){console.error("Reminder dispatch failed",e?.code||"internal");return Response.json({error:"Reminder dispatch failed"},{status:500});}
});
