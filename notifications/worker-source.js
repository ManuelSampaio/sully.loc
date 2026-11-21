import { buildPushPayload } from '@block65/webcrypto-web-push';
import { activityRequest, noticeText } from '../activity.js';

// Served separately from GitHub Pages. No Firebase Admin credentials or public relay.
const ORIGIN = 'https://manuelsampaio.github.io';
const PROJECT = 'sully-97787';
const DOCUMENTS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/`;
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS push_keys (id INTEGER PRIMARY KEY CHECK(id=1), public_key TEXT NOT NULL, private_key TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS push_preferences (uid TEXT PRIMARY KEY, pair_id TEXT NOT NULL, quiet_until INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS push_devices (id TEXT PRIMARY KEY, uid TEXT NOT NULL, pair_id TEXT NOT NULL, subscription TEXT NOT NULL, preview INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS push_devices_recipient ON push_devices(uid,pair_id)',
  'CREATE TABLE IF NOT EXISTS push_deliveries (pair_id TEXT NOT NULL, event_id TEXT NOT NULL, device_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(pair_id,event_id,device_id))',
  'CREATE INDEX IF NOT EXISTS push_deliveries_age ON push_deliveries(created_at)',
  'CREATE TABLE IF NOT EXISTS push_limits (uid TEXT NOT NULL, minute INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(uid,minute))',
];
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function requireThat(condition, status, message) { if (!condition) throw new HttpError(status, message); }
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function bytes(value) {
  requireThat(typeof value === 'string' && /^[A-Za-z0-9_-]+={0,2}$/.test(value), 400, 'Invalid key');
  try { return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')), c=>c.charCodeAt(0)); }
  catch { throw new HttpError(400, 'Invalid key'); }
}
function field(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(field);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k,v])=>[k,field(v)]));
  return null;
}
function claims(token) {
  try {
    const parts = token.split('.');
    requireThat(parts.length === 3 && token.length <= 10000, 401, 'Sign in required');
    const payload = JSON.parse(new TextDecoder().decode(bytes(parts[1])));
    requireThat(payload.aud === PROJECT && payload.iss === `https://securetoken.google.com/${PROJECT}` && typeof payload.sub === 'string' && payload.sub.length > 0 && payload.sub.length <= 128 && !payload.sub.includes('/'),401,'Sign in required');
    // Untrusted until Firestore accepts the complete Bearer token below.
    return payload;
  } catch { throw new HttpError(401, 'Sign in required'); }
}
export async function validateSubscription(input) {
  requireThat(input && typeof input.endpoint === 'string' && input.endpoint.length <= 2048,400,'Invalid subscription');
  let url;
  try { url = new URL(input.endpoint); } catch { throw new HttpError(400,'Invalid subscription'); }
  const allowed = url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com' || url.hostname === 'web.push.apple.com' || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
  requireThat(allowed && url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash,400,'Unsupported push service');
  const publicKey = bytes(input.keys?.p256dh), auth = bytes(input.keys?.auth);
  requireThat(publicKey.length === 65 && publicKey[0] === 4 && auth.length === 16,400,'Invalid subscription keys');
  try { await crypto.subtle.importKey('raw', publicKey, {name:'ECDH',namedCurve:'P-256'},false,[]); }
  catch { throw new HttpError(400,'Invalid subscription keys'); }
  return {endpoint:url.href, expirationTime:null, keys:{p256dh:b64url(publicKey),auth:b64url(auth)}};
}
export function createWorker({fetchImpl = (...args)=>fetch(...args), now = ()=>Date.now()} = {}) {
  const databases = new WeakMap();
  async function initialize(db) {
    if (!databases.has(db)) databases.set(db, db.batch(SCHEMA.map(sql=>db.prepare(sql))).catch(error=>{databases.delete(db);throw error;}));
    await databases.get(db);
  }
  async function getDocument(path, token, optional = false) {
    const response = await fetchImpl(DOCUMENTS + path, {headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(8000)});
    if (optional && response.status === 404) return null;
    requireThat(response.ok, response.status === 401 ? 401 : response.status === 403 ? 403 : 503, 'Unable to verify account');
    const document = await response.json();
    return {data:Object.fromEntries(Object.entries(document.fields || {}).map(([k,v])=>[k,field(v)])),createdAt:Date.parse(document.createTime),updatedAt:Date.parse(document.updateTime||document.createTime)};
  }
  async function account(request) {
    const token = (request.headers.get('Authorization') || '').match(/^Bearer ([^\s]+)$/)?.[1];
    requireThat(token,401,'Sign in required');
    const payload = claims(token);
    const profile = await getDocument(`profiles/${encodeURIComponent(payload.sub)}`,token);
    requireThat(profile.data.id === payload.sub,401,'Invalid account');
    const pairId = profile.data.pairId;
    requireThat(typeof pairId === 'string' && /^[a-f0-9]{32}$/.test(pairId),409,'Connect both accounts first');
    const pair = await getDocument(`pairs/${pairId}`,token);
    requireThat(Array.isArray(pair.data.members) && pair.data.members.length === 2 && new Set(pair.data.members).size === 2 && pair.data.members.includes(payload.sub),409,'Connect both accounts first');
    return {uid:payload.sub,pairId,recipient:pair.data.members.find(uid=>uid!==payload.sub),profile:profile.data,token};
  }
  async function quietState(user) {
    // Read with the recipient's own token; private statuses stay private.
    const state = await getDocument(`pairs/${user.pairId}/states/${encodeURIComponent(user.uid)}`,user.token,true);
    const sleeping = ['dormir','sesta'].includes(state?.data.status);
    const until = Number(state?.data.until);
    return sleeping ? (Number.isFinite(until) && until > 0 ? (until > now() ? until : 0) : -1) : 0;
  }
  async function saveQuiet(db,user) {
    const quiet = await quietState(user);
    await db.prepare('INSERT INTO push_preferences(uid,pair_id,quiet_until) VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET pair_id=excluded.pair_id,quiet_until=excluded.quiet_until').bind(user.uid,user.pairId,quiet).run();
    return quiet;
  }
  async function keyPair(db) {
    let row = await db.prepare('SELECT public_key,private_key FROM push_keys WHERE id=1').first();
    if (!row) {
      const keys = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
      const [publicKey,privateKey] = await Promise.all([crypto.subtle.exportKey('raw',keys.publicKey),crypto.subtle.exportKey('jwk',keys.privateKey)]);
      // Generated inside the Worker, never included in Git, browser code, responses or logs.
      await db.prepare('INSERT OR IGNORE INTO push_keys(id,public_key,private_key) VALUES(1,?,?)').bind(b64url(publicKey),privateKey.d).run();
      row = await db.prepare('SELECT public_key,private_key FROM push_keys WHERE id=1').first();
    }
    return {publicKey:row.public_key,privateKey:row.private_key,subject:'https://manuelsampaio.github.io/sully.loc/'};
  }
  async function limit(db,uid) {
    const minute = Math.floor(now()/60000);
    const row = await db.prepare('INSERT INTO push_limits(uid,minute,count) VALUES(?,?,1) ON CONFLICT(uid,minute) DO UPDATE SET count=count+1 RETURNING count').bind(uid,minute).first();
    requireThat(row.count <= 30,429,'Try again shortly');
    await db.batch([
      db.prepare('DELETE FROM push_limits WHERE uid=? AND minute<?').bind(uid,minute-2),
      db.prepare('DELETE FROM push_deliveries WHERE created_at<?').bind(now()-86400000),
    ]);
  }
  async function body(request) {
    requireThat((request.headers.get('Content-Type') || '').split(';')[0] === 'application/json',415,'JSON required');
    const reader = request.body?.getReader();
    requireThat(reader,400,'Missing request');
    const chunks=[]; let size=0;
    for (;;) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>8192){await reader.cancel();throw new HttpError(413,'Request too large');} chunks.push(value); }
    const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
    try { const value=JSON.parse(new TextDecoder().decode(data)); requireThat(value && typeof value==='object' && !Array.isArray(value),400,'Invalid request'); return value; }
    catch { throw new HttpError(400,'Invalid request'); }
  }
  async function deviceId(endpoint) { return b64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint))); }
  return {
    async fetch(request, env) {
      const origin=request.headers.get('Origin');
      const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
      if(origin===ORIGIN) Object.assign(headers,{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'});
      const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
      try {
        requireThat(!origin || origin===ORIGIN,403,'Origin not allowed');
        if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
        const path=new URL(request.url).pathname;
        if(path==='/' && request.method==='GET') {
          requireThat(env.DB,503,'Database binding DB is missing');
          await env.DB.prepare('SELECT 1 AS ready').first();
          return response({service:'Sully notifications',database:'connected',configured:true,activities:true});
        }
        requireThat(['/v1/key','/v1/subscriptions','/v1/preferences','/v1/send'].includes(path),404,'Not found');
        requireThat((path==='/v1/key' && request.method==='GET') || (path==='/v1/subscriptions' && ['POST','DELETE'].includes(request.method)) || (['/v1/preferences','/v1/send'].includes(path) && request.method==='POST'),405,'Method not allowed');
        if(request.method!=='GET')requireThat(origin===ORIGIN,403,'Origin required');
        const user=await account(request);
        requireThat(env.DB,503,'Database unavailable');
        const db=env.DB; await initialize(db); await limit(db,user.uid);
        if(path==='/v1/key')return response({publicKey:(await keyPair(db)).publicKey});
        const input=await body(request);
        if(path==='/v1/subscriptions' && request.method==='POST') {
          requireThat(typeof input.preview==='boolean',400,'Choose preview preference');
          const subscription=await validateSubscription(input.subscription), id=await deviceId(subscription.endpoint);
          const existing=await db.prepare('SELECT uid FROM push_devices WHERE id=?').bind(id).first();
          requireThat(!existing || existing.uid===user.uid,409,'Remove previous subscription first');
          const count=await db.prepare('SELECT COUNT(*) AS count FROM push_devices WHERE uid=?').bind(user.uid).first();
          requireThat(existing || count.count<5,409,'Device limit reached');
          const quiet=await saveQuiet(db,user);
          await keyPair(db);
          const result=await db.prepare('INSERT INTO push_devices(id,uid,pair_id,subscription,preview,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET pair_id=excluded.pair_id,subscription=excluded.subscription,preview=excluded.preview,updated_at=excluded.updated_at WHERE push_devices.uid=excluded.uid').bind(id,user.uid,user.pairId,JSON.stringify(subscription),input.preview?1:0,now()).run();
          requireThat(result.meta.changes===1,409,'Subscription belongs to another account');
          return response({enabled:true,id,quietUntil:quiet});
        }
        if(path==='/v1/subscriptions' && request.method==='DELETE') {
          requireThat(typeof input.id==='string' && /^[A-Za-z0-9_-]{43}$/.test(input.id),400,'Invalid device');
          await db.prepare('DELETE FROM push_devices WHERE id=? AND uid=?').bind(input.id,user.uid).run();
          return response({enabled:false});
        }
        if(path==='/v1/preferences') {
          const quiet=await saveQuiet(db,user);
          if(typeof input.preview==='boolean') {
            requireThat(typeof input.id==='string',400,'Device required');
            await db.prepare('UPDATE push_devices SET preview=? WHERE id=? AND uid=?').bind(input.preview?1:0,input.id,user.uid).run();
          }
          return response({quietUntil:quiet});
        }
        // Only persisted, owned and currently shared actions can trigger an alert.
        let event=null,deliveryId,category;
        if(Object.keys(input).length===1 && typeof input.eventId==='string'){
          requireThat(/^[a-zA-Z0-9_-]{1,100}$/.test(input.eventId),400,'Event ID required');
          event=await getDocument(`pairs/${user.pairId}/events/${input.eventId}`,user.token);
          requireThat(event.data.from===user.uid && event.data.id===input.eventId && ['quick','text','note','drawing'].includes(event.data.kind),403,'Cannot send this event');
          requireThat(Number.isFinite(event.createdAt) && event.createdAt>=now()-300000 && event.createdAt<=now()+30000,409,'Event expired');
          deliveryId=input.eventId;category=event.data.kind==='text'?'message':event.data.kind;
        }else{
          requireThat(Object.keys(input).length===1 && input.activity && Object.keys(input.activity).length===3,400,'Activity required');
          let action;try{action=activityRequest(input.activity.type,input.activity.id,input.activity.revision).activity;}catch{throw new HttpError(400,'Invalid activity');}
          if(user.profile.sharing?.[action.type]!==true)return response({sent:0,private:true});
          const ownId=encodeURIComponent(user.uid),id=encodeURIComponent(action.id);
          const suffix=action.type==='mood'?`moods/${ownId}/entries/${id}`:action.type==='status'?`states/${ownId}`:`locations/${ownId}`;
          if(action.type!=='mood')requireThat(action.id===user.uid,403,'Cannot send this activity');
          const saved=await getDocument(`pairs/${user.pairId}/${suffix}`,user.token);
          requireThat(saved.data.id===action.id && (action.type==='status'||saved.data.from===user.uid) && saved.data.ts===action.revision,409,'Activity changed');
          requireThat(Number.isFinite(saved.updatedAt)&&saved.updatedAt>=now()-300000&&saved.updatedAt<=now()+30000,409,'Activity expired');
          deliveryId='activity_'+b64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${user.pairId}:${suffix}:${saved.updatedAt}`)));
          category=action.type;
        }
        const partner=await getDocument(`profiles/${encodeURIComponent(user.recipient)}`,user.token);
        requireThat(partner.data.pairId===user.pairId && partner.data.id===user.recipient,403,'Partner is not connected');
        const preferences=await db.prepare('SELECT quiet_until FROM push_preferences WHERE uid=? AND pair_id=?').bind(user.recipient,user.pairId).first();
        if(!preferences || preferences.quiet_until===-1 || preferences.quiet_until>now())return response({sent:0,muted:true});
        const devices=await db.prepare('SELECT id,subscription,preview FROM push_devices WHERE uid=? AND pair_id=? ORDER BY updated_at DESC LIMIT 5').bind(user.recipient,user.pairId).all();
        if(!devices.results.length)return response({sent:0});
        const vapid=await keyPair(db); let sent=0,retry=false;
        for(const device of devices.results) {
          const claimed=await db.prepare('INSERT OR IGNORE INTO push_deliveries(pair_id,event_id,device_id,created_at) VALUES(?,?,?,?)').bind(user.pairId,deliveryId,device.id,now()).run();
          if(!claimed.meta.changes)continue;
          let permanent=false;
          try {
            const subscription=await validateSubscription(JSON.parse(device.subscription));
            const text=event?.data.kind==='drawing'?'Partilhou um desenho contigo.':String(event?.data.text||'Enviou-te uma mensagem.').slice(0,500);
            const payload={title:'Sully',body:event&&device.preview?`${String(user.profile.name).slice(0,40)}: ${text}`:noticeText[category]+' Abre a Sully.',category,eventId:deliveryId,ts:now()};
            const message=await buildPushPayload({data:JSON.stringify(payload),options:{ttl:300,urgency:'normal',topic:deliveryId.replaceAll('-','').slice(0,32)}},subscription,vapid);
            const result=await fetchImpl(subscription.endpoint,{...message,redirect:'error',signal:AbortSignal.timeout(8000)});
            if(result.ok){sent++;continue;}
            permanent=[404,410].includes(result.status);
            if(permanent)await db.prepare('DELETE FROM push_devices WHERE id=?').bind(device.id).run();
          } catch { /* Never log token, subscription endpoint, message or VAPID key. */ }
          if(!permanent){retry=true;await db.prepare('DELETE FROM push_deliveries WHERE pair_id=? AND event_id=? AND device_id=?').bind(user.pairId,deliveryId,device.id).run();}
        }
        return response({sent,retry},retry?503:200);
      } catch(error) { return response({error:error instanceof HttpError?error.message:'Notification service unavailable'},error instanceof HttpError?error.status:503); }
    },
  };
}
export default createWorker();
