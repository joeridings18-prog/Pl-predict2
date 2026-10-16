import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";
export const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
export const site="https://joeridings18-prog.github.io/Pl-predict2/";
export async function config(){
 let {data,error}=await sb.rpc("pl_push_config");if(error)throw error;
 if(!data){
  const pub=Deno.env.get("VAPID_PUBLIC_KEY"),priv=Deno.env.get("VAPID_PRIVATE_KEY");
  const candidate=pub&&priv?{publicKey:pub,privateKey:priv}:webpush.generateVAPIDKeys();
  const saved=await sb.rpc("pl_push_config",{p_candidate:candidate});if(saved.error)throw saved.error;data=saved.data;
 }
 return data;
}
export function validEndpoint(value:string){
 try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&(!u.port||u.port==="443")&&(
 u.hostname==="fcm.googleapis.com"||u.hostname==="android.googleapis.com"||u.hostname==="updates.push.services.mozilla.com"||u.hostname.endsWith(".push.services.mozilla.com")||u.hostname==="web.push.apple.com"||u.hostname.endsWith(".notify.windows.com"));}catch{return false;}
}
export async function deliver(subscription:any,payload:any,keys:any){
 if(!validEndpoint(subscription?.endpoint))throw Object.assign(new Error("Unsupported push service"),{statusCode:400});
 return await webpush.sendNotification(subscription,JSON.stringify(payload),{
 vapidDetails:{subject:site,publicKey:keys.publicKey,privateKey:keys.privateKey},
 TTL:3600,urgency:"high",timeout:12000
 });
}
