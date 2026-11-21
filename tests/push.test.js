import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createECDH} from 'node:crypto';
import {createPushClient,pushSupport,DEVICE_KEY,PUSH_CACHE} from '../push.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{for(let i=0;i<5;i++)await tick();};
const pairId='a'.repeat(32),scope='https://manuelsampaio.github.io/sully.loc/';
function cacheMock(){const all=new Map();return{async open(name){if(!all.has(name))all.set(name,new Map());const map=all.get(name);return{async put(key,value){map.set(String(key),value);},async match(key){return map.get(String(key))?.clone();},async addAll(){}};},async keys(){return [...all.keys()];},async delete(name){all.delete(name);}};}
function fixture(){
 const memory=new Map(),requests=[],timers=[];let nativeSub=null,permissionCalls=0,unsubscribed=0,quietUntil=0,offline=false;
 const storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
 const caches=cacheMock(),dh=createECDH('prime256v1');dh.generateKeys();
 const id='d'.repeat(43),closed=[];
 const reg={scope,async getNotifications(){return[{close(){closed.push(true);}}];},pushManager:{async getSubscription(){return nativeSub;},async subscribe(options){assert.equal(options.userVisibleOnly,true);assert.equal(options.applicationServerKey.length,65);nativeSub={endpoint:'https://fcm.googleapis.com/fcm/send/test',toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{auth:'not-persisted',p256dh:'not-persisted'}}),async unsubscribe(){unsubscribed++;nativeSub=null;return true;}};return nativeSub;}}};
 const env={isSecureContext:true,PushManager:function(){},Notification:{permission:'default',requestPermission(){permissionCalls++;env.Notification.permission='granted';return Promise.resolve('granted');}},navigator:{userAgent:'Android',serviceWorker:{},onLine:true},matchMedia:()=>({matches:false})};
 const fetchImpl=async(url,options)=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;requests.push({path,body,method:options.method});
  if(offline)throw new Error('offline');
  return new Response(JSON.stringify(path==='/v1/key'?{publicKey:dh.getPublicKey().toString('base64url')}:path==='/v1/subscriptions'?{enabled:true,id,quietUntil}:path==='/v1/preferences'?{quietUntil}:{sent:1}));
 };
 const controller=createPushClient({getToken:async()=> 'private-id-token',getRegistration:async()=>reg,env,storage,cacheStorage:caches,fetchImpl,schedule:(fn,delay)=>{const timer=setTimeout(fn,delay);timer.unref();timers.push(timer);return timer;}});
 const session=(uid='a',extra={})=>controller.setSession({uid,pairId,quietUntil,...extra});
 const gate=async()=>{const cache=await caches.open(PUSH_CACHE);return (await cache.match(new URL('__sully_push_session__',scope).href))?.json();};
 return{controller,env,storage,caches,requests,reg,id,session,gate,closed,memory,get subscription(){return nativeSub;},get permissionCalls(){return permissionCalls;},get unsubscribed(){return unsubscribed;},set quiet(value){quietUntil=value;},set offline(value){offline=value;}};
}
test('iPhone activation explains home-screen installation; denied and unsupported permissions stay explicit',()=>{
 assert.match(pushSupport({navigator:{userAgent:'iPhone'}}),/ecrã principal/);
 const f=fixture();f.env.Notification.permission='denied';assert.match(pushSupport(f.env),/bloqueadas/);
 f.env.Notification.permission='granted';assert.equal(pushSupport(f.env),'');
 assert.match(pushSupport({navigator:{userAgent:'Android'}}),/não suporta/);
});
test('explicit activation asks permission from the tap and persists no token, content or push endpoint',async()=>{
 const f=fixture();f.session();await settle();
 assert.equal(f.permissionCalls,0);const activation=f.controller.enable();assert.equal(f.permissionCalls,1);await activation;
 assert.equal(f.controller.state().enabled,true);assert.equal((await f.gate()).enabled,true);
 const registration=f.requests.find(r=>r.path==='/v1/subscriptions');assert.equal(registration.body.preview,false);
 const saved=f.storage.getItem(DEVICE_KEY);assert.equal(JSON.parse(saved).uid,'a');
 for(const secret of ['private-id-token','fcm.googleapis.com','not-persisted'])assert(!saved.includes(secret));
});
test('restoring the same account waits for its pair without destroying the active subscription',async()=>{
 const f=fixture();f.session();await settle();await f.controller.enable();
 f.session('a',{pairId:''});await settle();assert.equal(f.unsubscribed,0);assert(f.subscription);
 f.session();await settle();assert.equal(f.unsubscribed,0);assert.equal(f.controller.state().enabled,true);
});
test('disable and logout clear browser subscription and visible notices even if server cleanup is offline',async()=>{
 const f=fixture();f.session();await settle();await f.controller.enable();f.offline=true;
 await f.controller.logout();assert.equal(f.unsubscribed,1);assert.equal(f.storage.getItem(DEVICE_KEY),null);assert.equal((await f.gate()).enabled,false);assert(f.closed.length>0);
});
test('switching accounts revokes the previous device and never activates the new account automatically',async()=>{
 const f=fixture();f.session();await settle();await f.controller.enable();f.session('b');await settle();
 assert.equal(f.unsubscribed,1);assert.equal(f.controller.state().enabled,false);assert.equal((await f.gate()).enabled,false);assert.equal(f.storage.getItem(DEVICE_KEY),null);
});
test('pending sleep mutes the local service worker before server confirmation, then syncs the private state',async()=>{
 const f=fixture();f.session();await settle();await f.controller.enable();const before=f.requests.filter(r=>r.path==='/v1/preferences').length;
 f.quiet=-1;f.session('a',{pending:true});await settle();assert.equal((await f.gate()).quietUntil,-1);assert.equal(f.requests.filter(r=>r.path==='/v1/preferences').length,before);
 f.session('a',{pending:false});await settle();assert(f.requests.filter(r=>r.path==='/v1/preferences').length>before);assert.equal((await f.gate()).quietUntil,-1);
});
test('outbox stores IDs only, sends once online and refuses events from another account',async()=>{
 const f=fixture();f.session();await settle();f.env.navigator.onLine=false;
 f.controller.send('event-a','a');f.controller.send('event-b','different-user');
 const queued=JSON.parse(f.storage.getItem('sully.push.outbox.a'));assert.deepEqual(queued.map(x=>x.id),['event-a']);assert.deepEqual(Object.keys(queued[0]).sort(),['id','pairId','ts']);
 f.env.navigator.onLine=true;await f.controller.refresh();await settle();
 const sent=f.requests.filter(r=>r.path==='/v1/send');assert.deepEqual(sent.map(r=>r.body),[{eventId:'event-a'}]);assert.deepEqual(JSON.parse(f.storage.getItem('sully.push.outbox.a')),[]);
});

async function workerFixture(){
 const handlers={},shown=[],caches=cacheMock(),subscription={endpoint:'https://fcm.googleapis.com/fcm/send/worker-test'};
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(subscription.endpoint));const id=Buffer.from(hash).toString('base64url');
 const clients={async matchAll(){return[];},async openWindow(url){clients.opened=url;}};
 const self={registration:{scope,pushManager:{async getSubscription(){return subscription;}},async showNotification(title,options){shown.push({title,options});}},clients,addEventListener(type,fn){handlers[type]=fn;}};
 vm.runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),{self,caches,crypto,TextEncoder,URL,Uint8Array,Date,Promise,JSON,btoa});
 const gate=async(value)=>{const cache=await caches.open(PUSH_CACHE);await cache.put(new URL('__sully_push_session__',scope).href,new Response(JSON.stringify({enabled:true,id,generation:'a:1',quietUntil:0,...value})));};
 const push=async(payload)=>{let pending;handlers.push({data:{json:()=>payload},waitUntil:task=>{pending=task;}});await pending;};
 return{handlers,shown,clients,push,gate,id};
}
test('background worker hides message content, skips logged-out and sleeping sessions, and rejects a mismatched device',async()=>{
 const f=await workerFixture(),payload={eventId:'test-event',body:'Private content',url:'https://evil.test'};
 await f.push(payload);assert.equal(f.shown.length,0);
 await f.gate({quietUntil:-1});await f.push(payload);assert.equal(f.shown.length,0);
 await f.gate({id:'wrong-device'});await f.push(payload);assert.equal(f.shown.length,0);
 await f.gate({});await f.push(payload);assert.equal(f.shown.length,1);assert.equal(f.shown[0].options.body,'Tens uma nova mensagem. Abre a Sully.');assert.equal(f.shown[0].options.data.url,scope);assert(!('actions' in f.shown[0].options));
});
test('notification taps open only the Sully scope and focus an existing Sully window',async()=>{
 const f=await workerFixture();let closed=false,pending;
 f.handlers.notificationclick({notification:{data:{url:'https://evil.test'},close(){closed=true;}},waitUntil:task=>{pending=task;}});await pending;assert(closed);assert.equal(f.clients.opened,scope);
 let focused=false;f.clients.opened=null;f.clients.matchAll=async()=>[{url:'https://manuelsampaio.github.io/another-site/',async focus(){throw Error('wrong site');}},{url:scope+'?open=chat',async focus(){focused=true;}}];
 f.handlers.notificationclick({notification:{close(){}},waitUntil:task=>{pending=task;}});await pending;assert(focused);assert.equal(f.clients.opened,null);
});
