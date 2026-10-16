import {sb,config,deliver,validEndpoint,site} from "./shared.ts";
const origin="https://joeridings18-prog.github.io";
const headers={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers});
 if(req.method==="GET"){try{const keys=await config();return reply({publicKey:keys.publicKey,reminders:["24h","2h"]});}catch{return reply({error:"Push setup unavailable"},503);}}
 if(req.method!=="POST"||req.headers.get("origin")!==origin)return reply({error:"Forbidden"},403);
 try{
  const {player,pin,subscription,action="register",endpoint}=await req.json();
  if(!["Joe","Josh","Russ","Scott"].includes(player)||typeof pin!=="string"||!/^\d{4}$/.test(pin))return reply({error:"Log in with your player PIN first."},400);
  const auth=await sb.rpc("claim_or_login_player",{p_player:player,p_pin:pin});
  if(auth.error||auth.data!==true)return reply({error:"Incorrect PIN"},401);
  const keys=await config();
  const target=endpoint||subscription?.endpoint;
  if(!validEndpoint(target))return reply({error:"Unsupported push service"},400);
  if(action==="status"){
   const r=await sb.from("pl_push_subscriptions").select("enabled,vapid_public_key").eq("player",player).eq("endpoint",target).maybeSingle();if(r.error)throw r.error;
   return reply({ok:true,registered:!!r.data?.enabled&&r.data.vapid_public_key===keys.publicKey});
  }
  if(action==="unsubscribe"){
   const r=await sb.from("pl_push_subscriptions").update({enabled:false,updated_at:new Date().toISOString()}).eq("player",player).eq("endpoint",target);if(r.error)throw r.error;return reply({ok:true});
  }
  if(action==="test"){
   const r=await sb.from("pl_push_subscriptions").select("id,subscription,enabled,vapid_public_key,updated_at").eq("player",player).eq("endpoint",target).maybeSingle();
   if(r.error)throw r.error;if(!r.data?.enabled||r.data.vapid_public_key!==keys.publicKey)return reply({error:"Enable automatic reminders on this phone first."},400);
   try{await deliver(r.data.subscription,{title:"PL Predict test ⚽",body:"Remote push is working. Prediction reminders are ready on this phone.",tag:"pl-remote-test",url:site},keys);}
   catch(e){if([404,410].includes(e.statusCode))await sb.from("pl_push_subscriptions").update({enabled:false}).eq("id",r.data.id);return reply({error:"Push delivery failed. Enable reminders again, then retry.",status:e.statusCode||null},502);}
   return reply({ok:true,accepted:true});
  }
  if(action!=="register"||!subscription?.keys?.p256dh||!subscription?.keys?.auth)return reply({error:"Invalid registration"},400);
  const r=await sb.from("pl_push_subscriptions").upsert({player,endpoint:target,subscription,enabled:true,vapid_public_key:keys.publicKey,updated_at:new Date().toISOString()},{onConflict:"endpoint"});if(r.error)throw r.error;
  return reply({ok:true});
 }catch{return reply({error:"Could not complete notification setup. Try again."},500);}
});
