const CACHE = 'sully-shell-v19-mapa-estradas';
const SHELL = ['./', './index.html', './style.css?rev=hoje-atalhos', './sx-ui.css?rev=hoje-atalhos', './sx-ui.js?rev=hoje-atalhos', './sx-today.js?rev=hoje-atalhos', './sx-location.js?rev=mapa-estradas', './sx-map.js?rev=mapa-estradas', './sx-globe.js?rev=mapa-estradas', './vendor/d3-geo.js', './sx-location-store.js', './sx-date-store.js', './sx-dates.js?rev=hoje-atalhos', './sx-today.css?rev=mapa-estradas', './app.js?rev=mapa-estradas', './core.js?rev=home-focus', './icons.js?rev=period-moods', './sky.js', './theme.js', './alerts.js', './push.js?rev=push-firebase', './activity.js', './messages.js', './pairing.js', './cloud.js?rev=shared-alerts', './config.js', './icon.svg', './manifest.webmanifest', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('sully-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  if (['./sx-cities.json', './sx-globe-land.json?rev=globo-v2', './sx-map-roads.json?v=1'].some(asset => new URL(asset, self.registration.scope).href === e.request.url)) {
    e.respondWith(caches.open(CACHE).then(async cache => {
      const saved = await cache.match(e.request);
      if (saved) return saved;
      const response = await fetch(e.request);
      if (response.ok) await cache.put(e.request,response.clone());
      return response;
    }));
    return;
  }
  if (!SHELL.some(p => new URL(p, self.registration.scope).href === e.request.url)) return;
  e.respondWith(fetch(e.request).then(response => {
    if (response.ok) { const copy = response.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy))); }
    return response;
  }).catch(() => caches.match(e.request)));
});

// Account binding is local and cleared before logout. Never cache Firebase tokens here.
async function pushSession(){
  const cache=await caches.open('sully-push-session-v1');
  const response=await cache.match(new URL('__sully_push_session__',self.registration.scope).href);
  try{return response?await response.json():null;}catch{return null;}
}
self.addEventListener('push',event=>event.waitUntil((async()=>{
  let payload;try{payload=event.data?.json();}catch{return;}
  if(!payload||typeof payload.eventId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(payload.eventId))return;
  const session=await pushSession();
  if(!session?.enabled||!session.id||session.quietUntil===-1||session.quietUntil>Date.now())return;
  const subscription=await self.registration.pushManager.getSubscription();
  if(!subscription)return;
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(subscription.endpoint));
  const id=btoa(String.fromCharCode(...new Uint8Array(hash))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  if(id!==session.id)return;
  const latest=await pushSession();if(!latest?.enabled||latest.generation!==session.generation||latest.id!==session.id||latest.quietUntil===-1||latest.quietUntil>Date.now())return;
  // Generic text also protects against a late packet after an account change.
  await self.registration.showNotification('Sully',{
    body:({message:'Tens uma nova mensagem.',quick:'Recebeste um toque do teu par.',note:'O teu par partilhou uma nota.',drawing:'O teu par enviou um desenho.',mood:'O teu par partilhou ou atualizou um check-in.',status:'O teu par atualizou o estado.',location:'O teu par partilhou a localização.'}[payload.category]||'Tens uma nova mensagem.')+' Abre a Sully.',
    icon:new URL('icons/icon-192.png',self.registration.scope).href,
    badge:new URL('icons/icon-192.png',self.registration.scope).href,
    tag:'sully-'+payload.eventId,
    data:{url:self.registration.scope},
  });
})()));
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const scope=self.registration.scope;
    const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const tab=tabs.find(client=>client.url.startsWith(scope));
    if(tab){await tab.focus();return;}
    await self.clients.openWindow(scope);
  })());
});
