import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createECDH,randomBytes} from 'node:crypto';
import ece from 'http_ece';
import {createWorker,validateSubscription} from '../worker-source.js';

const origin='https://manuelsampaio.github.io', pair='a'.repeat(32), instant=Date.now();
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const tokenFor=uid=>`${encode({alg:'RS256'})}.${encode({sub:uid,aud:'sully-97787',iss:'https://securetoken.google.com/sully-97787'})}.signature-${uid}`;
const tokens={a:tokenFor('a'),b:tokenFor('b')};
const firestoreValue=value=>typeof value==='boolean'?{booleanValue:value}:typeof value==='string'?{stringValue:value}:typeof value==='number'?{doubleValue:value}:Array.isArray(value)?{arrayValue:{values:value.map(firestoreValue)}}:{mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,firestoreValue(v)]))}};
const document=(data,createdAt=instant)=>new Response(JSON.stringify({fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,firestoreValue(v)])),createTime:new Date(createdAt).toISOString()}));
class D1 {
  sql=new DatabaseSync(':memory:');
  prepare(sql){
    const prepare=()=>this.sql.prepare(sql);let values=[];
    const api={bind(...args){values=args;return api;},async first(){return prepare().get(...values)||null;},async all(){return {results:prepare().all(...values)};},async run(){const result=prepare().run(...values);return {meta:{changes:Number(result.changes)}};}};
    return api;
  }
  async batch(statements){this.sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());this.sql.exec('COMMIT');return result;}catch(error){this.sql.exec('ROLLBACK');throw error;}}
}
function receiver(endpoint='https://fcm.googleapis.com/fcm/send/test-device') {
  const dh=createECDH('prime256v1');dh.generateKeys();const auth=randomBytes(16);
  return {dh,auth,subscription:{endpoint,keys:{p256dh:dh.getPublicKey().toString('base64url'),auth:auth.toString('base64url')}}};
}
function fixture() {
  const db=new D1(), pushes=[], states={}, events={}, activities={}, profiles={a:{mood:true,status:true,location:true},b:{mood:true,status:true,location:true}}, subscriptions=[];
  let pushStatus=201;
  const worker=createWorker({now:()=>instant,fetchImpl:async(url,options)=>{
    if(!url.startsWith('https://firestore.googleapis.com/')){pushes.push({url,options});return new Response('',{status:pushStatus});}
    const token=options.headers.Authorization.slice(7);
    // Stand-in for Google's actual signature verification; unknown/changed tokens are rejected.
    const uid=Object.keys(tokens).find(uid=>tokens[uid]===token);
    if(!uid)return new Response('',{status:401});
    const path=url.split('/documents/')[1];
    if(path==='profiles/a'||path==='profiles/b')return document({id:path.at(-1),name:path.at(-1)==='a'?'Manuel':'Sully',pairId:pair,sharing:profiles[path.at(-1)]});
    if(path===`pairs/${pair}`)return document({members:['a','b']});
    if(activities[path])return document(activities[path].data,activities[path].updatedAt);
    if(path===`pairs/${pair}/states/${uid}`)return states[uid]?document(states[uid]):new Response('',{status:404});
    if(path.startsWith(`pairs/${pair}/events/`)){const event=events[path.split('/').at(-1)];return event?document(event.data,event.createdAt):new Response('',{status:404});}
    return new Response('',{status:403});
  }});
  const request=async(path,{uid='a',method='POST',data={},token=tokens[uid],site=origin}={})=>{
    const headers={Origin:site,'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;
    const res=await worker.fetch(new Request('https://sully.test'+path,{method,headers,...(method==='GET'?{}:{body:JSON.stringify(data)})}),{DB:db});
    return {status:res.status,data:await res.json(),headers:res.headers};
  };
  const register=async(uid='b',preview=false)=>{const target=receiver(`https://fcm.googleapis.com/fcm/send/${uid}-${subscriptions.length}`);subscriptions.push(target);const response=await request('/v1/subscriptions',{uid,data:{subscription:target.subscription,preview}});assert.equal(response.status,200,JSON.stringify(response.data));return {...target,id:response.data.id};};
  const event=(id='e1',from='a',text='Tenho saudades tuas.',createdAt=instant)=>{events[id]={data:{id,from,text,kind:'quick'},createdAt};return id;};
  return {db,worker,pushes,states,events,activities,profiles,request,register,event,setPushStatus:value=>{pushStatus=value;}};
}

test('rejects absent/forged tokens and disallowed origins; serves a safe health response',async()=>{
  const f=fixture();
  assert.equal((await f.request('/v1/key',{method:'GET',token:null})).status,401);
  const forged=tokens.a.replace('signature-a','tampered');
  assert.equal((await f.request('/v1/key',{method:'GET',token:forged})).status,401);
  const denied=await f.request('/v1/key',{method:'GET',site:'https://evil.test'});
  assert.equal(denied.status,403);assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);
  assert.equal((await f.request('/',{method:'GET',token:null})).data.database,'connected');
  assert.equal(f.pushes.length,0);
});

test('rejects SSRF endpoints, URL credentials, fake curve points and malformed auth keys',async()=>{
  const target=receiver();
  for(const endpoint of ['http://fcm.googleapis.com/send','https://localhost/send','https://fcm.googleapis.com.evil.test/send','https://secret@fcm.googleapis.com/send','https://fcm.googleapis.com:444/send'])await assert.rejects(validateSubscription({...target.subscription,endpoint}));
  await assert.rejects(validateSubscription({...target.subscription,keys:{...target.subscription.keys,p256dh:Buffer.alloc(65,4).toString('base64url')}}));
  await assert.rejects(validateSubscription({...target.subscription,keys:{...target.subscription.keys,auth:'AA'}}));
  for(const endpoint of ['https://web.push.apple.com/abc','https://updates.push.services.mozilla.com/wpush/v2/test','https://wns2.notify.windows.com/w/?token=x'])assert.equal((await validateSubscription({...target.subscription,endpoint})).endpoint,endpoint);
});

test('keeps VAPID key stable; returns only public key and cannot overwrite another account device',async()=>{
  const f=fixture();const first=await f.request('/v1/key',{method:'GET'}),second=await f.request('/v1/key',{method:'GET'});
  assert.equal(first.status,200);assert.deepEqual(first.data,second.data);assert.deepEqual(Object.keys(first.data),['publicKey']);assert.equal(Buffer.from(first.data.publicKey,'base64url').length,65);
  const target=await f.register('b');
  assert.equal((await f.request('/v1/subscriptions',{uid:'a',data:{subscription:target.subscription,preview:true}})).status,409);
  await f.request('/v1/subscriptions',{method:'DELETE',uid:'a',data:{id:target.id}});
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM push_devices').get().n,1);
  await f.request('/v1/subscriptions',{method:'DELETE',uid:'b',data:{id:target.id}});
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM push_devices').get().n,0);
});

test('encrypts generic notification by default; valid VAPID JWT; deduplicates delivery',async()=>{
  const f=fixture(), target=await f.register('b');f.event();
  const result=await f.request('/v1/send',{data:{eventId:'e1'}});assert.equal(result.status,200);assert.equal(result.data.sent,1);
  const sent=f.pushes[0];assert.equal(sent.options.headers['content-encoding'],'aes128gcm');assert.equal(sent.options.redirect,'error');
  const plaintext=ece.decrypt(Buffer.from(sent.options.body),{version:'aes128gcm',privateKey:target.dh,authSecret:target.auth});
  const payload=JSON.parse(plaintext.toString());assert.equal(payload.title,'Sully');assert.equal(payload.body,'Recebeste um toque do teu par. Abre a Sully.');assert(!plaintext.includes('saudades'));assert(!('url' in payload));
  const auth=sent.options.headers.authorization.match(/^vapid t=(.*), k=(.*)$/);assert(auth);
  const [header,body,signature]=auth[1].split('.');const jwt=JSON.parse(Buffer.from(body,'base64url'));
  assert.equal(jwt.aud,'https://fcm.googleapis.com');assert(jwt.exp>Date.now()/1000);
  const publicKey=await crypto.subtle.importKey('raw',Buffer.from(auth[2],'base64url'),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  assert(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,Buffer.from(signature,'base64url'),new TextEncoder().encode(header+'.'+body)));
  await f.request('/v1/send',{data:{eventId:'e1'}});assert.equal(f.pushes.length,1);
});

test('allows previews only by recipient choice, authorizes stored event owner and refuses arbitrary payloads',async()=>{
  const f=fixture(),target=await f.register('b',true);f.event();
  assert.equal((await f.request('/v1/send',{uid:'b',data:{eventId:'e1'}})).status,403);
  assert.equal((await f.request('/v1/send',{data:{eventId:'e1',recipient:'other',text:'injected'}})).status,400);
  await f.request('/v1/send',{data:{eventId:'e1'}});
  const payload=JSON.parse(ece.decrypt(Buffer.from(f.pushes[0].options.body),{version:'aes128gcm',privateKey:target.dh,authSecret:target.auth}).toString());
  assert.equal(payload.body,'Manuel: Tenho saudades tuas.');
});

test('rejects old events using server createTime, never the sender supplied timestamp',async()=>{
  const f=fixture();await f.register();f.event('old','a','Old',instant-300001);f.events.old.data.ts=instant;
  assert.equal((await f.request('/v1/send',{data:{eventId:'old'}})).status,409);assert.equal(f.pushes.length,0);
});

test('sleep and nap suppress pushes; preferences derive from own Firestore state; expired naps resume',async()=>{
  const f=fixture();f.states.b={status:'dormir',ts:instant,until:0};await f.register();f.event('sleep');
  assert.equal((await f.request('/v1/send',{data:{eventId:'sleep'}})).data.muted,true);
  // Caller cannot request quietUntil=0 to override the actual state.
  assert.equal((await f.request('/v1/preferences',{uid:'b',data:{quietUntil:0}})).data.quietUntil,instant+86400000);
  f.states.b={status:'sesta',until:instant+60000};await f.request('/v1/preferences',{uid:'b'});f.event('nap');
  assert.equal((await f.request('/v1/send',{data:{eventId:'nap'}})).data.muted,true);
  f.db.sql.prepare('UPDATE push_preferences SET quiet_until=? WHERE uid=?').run(instant-1,'b');f.event('awake');
  assert.equal((await f.request('/v1/send',{data:{eventId:'awake'}})).data.sent,1);
});

test('removes expired subscriptions and allows retry after a transient provider failure',async()=>{
  const f=fixture();await f.register();f.event('retry');f.setPushStatus(503);
  assert.equal((await f.request('/v1/send',{data:{eventId:'retry'}})).status,503);
  f.setPushStatus(201);assert.equal((await f.request('/v1/send',{data:{eventId:'retry'}})).data.sent,1);
  f.event('gone');f.setPushStatus(410);await f.request('/v1/send',{data:{eventId:'gone'}});
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM push_devices').get().n,0);
});

test('limits authenticated requests and caps devices per account',async()=>{
  const f=fixture();for(let i=0;i<5;i++)await f.register();
  const device=receiver('https://fcm.googleapis.com/fcm/send/sixth');
  assert.equal((await f.request('/v1/subscriptions',{uid:'b',data:{subscription:device.subscription,preview:false}})).status,409);
  for(let i=0;i<30;i++)assert.equal((await f.request('/v1/key',{method:'GET'})).status,200);
  assert.equal((await f.request('/v1/key',{method:'GET'})).status,429);
});


test('shared check-ins and revised moods alert once per server revision without their content',async()=>{
 const f=fixture(),target=await f.register('b',true);const id='a_2026-11-21_manha',path=`pairs/${pair}/moods/a/entries/${id}`;
 f.activities[path]={data:{id,from:'a',ts:100,mood:'triste',note:'Private note'},updatedAt:instant};
 const send=revision=>f.request('/v1/send',{data:{activity:{type:'mood',id,revision}}});
 assert.equal((await send(100)).data.sent,1);assert.equal((await send(100)).data.sent,0);
 let payload=JSON.parse(ece.decrypt(Buffer.from(f.pushes[0].options.body),{version:'aes128gcm',privateKey:target.dh,authSecret:target.auth}).toString());
 assert.equal(payload.category,'mood');assert.equal(payload.body,'O teu par partilhou ou atualizou um check-in. Abre a Sully.');assert(!JSON.stringify(payload).includes('Private note'));
 f.activities[path]={data:{id,from:'a',ts:101,mood:'bem',note:''},updatedAt:instant+1};
 assert.equal((await send(100)).status,409);assert.equal((await send(101)).data.sent,1);
});
test('private, stale, forged or foreign activities cannot produce push alerts',async()=>{
 const f=fixture();await f.register();const id='a_2026-11-21_manha',path=`pairs/${pair}/moods/a/entries/${id}`;
 f.activities[path]={data:{id,from:'a',ts:100},updatedAt:instant};
 const data={activity:{type:'mood',id,revision:100}};
 f.profiles.a.mood=false;assert.equal((await f.request('/v1/send',{data})).data.private,true);assert.equal(f.pushes.length,0);
 f.profiles.a.mood=true;f.activities[path].data.from='b';assert.equal((await f.request('/v1/send',{data})).status,409);
 f.activities[path].data.from='a';f.activities[path].updatedAt=instant-300001;assert.equal((await f.request('/v1/send',{data})).status,409);
 assert.equal((await f.request('/v1/send',{data:{activity:{type:'status',id:'b',revision:100}}})).status,403);
 assert.equal((await f.request('/v1/send',{data:{activity:{type:'mood',id:'../b',revision:100}}})).status,400);assert.equal(f.pushes.length,0);
});
test('shared status and location notices omit coordinates and respect the recipient sleep',async()=>{
 const f=fixture(),target=await f.register();
 f.activities[`pairs/${pair}/states/a`]={data:{id:'a',ts:100,status:'trabalhar'},updatedAt:instant};
 assert.equal((await f.request('/v1/send',{data:{activity:{type:'status',id:'a',revision:100}}})).data.sent,1);
 f.activities[`pairs/${pair}/locations/a`]={data:{id:'a',from:'a',ts:101,lat:-8.9,lng:13.2},updatedAt:instant};
 assert.equal((await f.request('/v1/send',{data:{activity:{type:'location',id:'a',revision:101}}})).data.sent,1);
 const payload=JSON.parse(ece.decrypt(Buffer.from(f.pushes[1].options.body),{version:'aes128gcm',privateKey:target.dh,authSecret:target.auth}).toString());assert.equal(payload.category,'location');assert(!('lat' in payload));assert(!JSON.stringify(payload).includes('13.2'));
 f.states.b={status:'dormir',ts:instant,until:0};await f.request('/v1/preferences',{uid:'b'});
 f.activities[`pairs/${pair}/locations/a`].updatedAt=instant+1;assert.equal((await f.request('/v1/send',{data:{activity:{type:'location',id:'a',revision:101}}})).data.muted,true);
});
