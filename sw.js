self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("push",event=>{
 let payload={};try{payload=event.data?.json()||{}}catch{payload={body:event.data?.text()||""}}
 event.waitUntil(self.registration.showNotification(payload.title||"PL Predict",{
  body:payload.body||"Time to check your predictions!",
  icon:"./icon-192.png",badge:"./icon-192.png",
  tag:payload.tag||"pl-predict-reminder",data:{url:payload.url||"./"}
 }));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async clients=>{
  const target=new URL(event.notification.data?.url||"./",self.registration.scope).href;
  for(const client of clients){if(client.url.startsWith(self.registration.scope)){await client.focus();return;}}
  await self.clients.openWindow(target);
 }));
});