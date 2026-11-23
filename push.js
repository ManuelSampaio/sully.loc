import { activityRequest } from './activity.js';
// Tokens stay in memory; only device identifiers and pending event IDs are stored.
export const PUSH_ENDPOINT='https://sully-notifications.manuelsampaio1235.workers.dev';
export const PUSH_CACHE='sully-push-session-v1';
export const DEVICE_KEY='sully.push.device.v1';
export function pushSupport(env=globalThis){
 const ios=/iPad|iPhone|iPod/.test(env.navigator?.userAgent||'')||(env.navigator?.platform==='MacIntel'&&env.navigator?.maxTouchPoints>1);
 const installed=env.navigator?.standalone===true||env.matchMedia?.('(display-mode: standalone)').matches;
 if(ios&&!installed)return 'No iPhone: Safari → Partilhar → Adicionar ao ecrã principal. Abre a Sully pelo ícone para ativar os avisos.';
 if(!env.isSecureContext||!env.Notification||!env.PushManager||!env.navigator?.serviceWorker)return 'Este navegador não suporta notificações push. Os avisos dentro da Sully continuam disponíveis.';
 if(env.Notification.permission==='denied')return 'As notificações estão bloqueadas. Permite-as nas definições deste site ou da Sully no telemóvel.';
 return '';
}
export function createPushClient({getToken,getRegistration,onChange=()=>{},onWarning=()=>{},env=globalThis,fetchImpl=(...args)=>fetch(...args),storage=env.localStorage,cacheStorage=env.caches,now=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 let context={uid:null,pairId:'',quietUntil:0,pending:false},generation=0,record=null,publicKey='',busy=false,reconciling=false,again=false,lastSync='',lastSyncAt=0,retryTimer=null,syncing=false;
 let state={enabled:false,busy:false,checking:false,error:'',support:pushSupport(env)};
 const emit=change=>{state={...state,...change};onChange({...state});};
 const read=(key,fallback=null)=>{try{return JSON.parse(storage.getItem(key))||fallback;}catch{return fallback;}};
 const save=(key,value)=>{try{value===null?storage.removeItem(key):storage.setItem(key,JSON.stringify(value));}catch{throw new Error('Não foi possível guardar a ativação neste dispositivo.');}};
 const current=g=>g===generation;
 const check=g=>{if(!current(g))throw new Error('A conta mudou. Tenta novamente.');};
 async function registration(){let timer;try{return await Promise.race([getRegistration(),new Promise((_,reject)=>{timer=schedule(()=>reject(new Error('O modo de notificações ainda está a iniciar. Atualiza a página e tenta novamente.')),10000);})]);}finally{cancel(timer);}}
 async function gate(enabled,reg=null){
  reg ||= await registration();
  const cache=await cacheStorage.open(PUSH_CACHE);
  await cache.put(new URL('__sully_push_session__',reg.scope).href,new Response(JSON.stringify({enabled,id:record?.id||'',quietUntil:context.quietUntil,generation:`${context.uid||'off'}:${generation}`})));
  if(!enabled){const notices=await reg.getNotifications();notices.forEach(n=>n.close());}
 }
 async function api(path,data,g=generation,method='POST'){
  const uid=context.uid;check(g);
  if(!uid||!context.pairId)throw new Error('Liga primeiro as duas contas no Perfil.');
  const token=await getToken(uid);check(g);
  const stage=path==='/v1/key'?'obter a chave':path==='/v1/subscriptions'?'registar o dispositivo':path==='/v1/preferences'?'sincronizar as preferências':'enviar o aviso';
  let response;
  try {
   response=await fetchImpl(PUSH_ENDPOINT+path,{method,headers:{Authorization:`Bearer ${token}`,...(method!=='GET'?{'Content-Type':'application/json'}:{})},...(method!=='GET'?{body:JSON.stringify(data||{})}:{}),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});
  } catch(error) {
   check(g);
   const reason=error.name==='TimeoutError'?'tempo de resposta excedido':'sem resposta do serviço';
   throw new Error(`Não foi possível ${stage} (${reason}).`);
  }
  check(g);
  let value={};try{value=await response.json();}catch{/* Do not display arbitrary server text. */}
  if(!response.ok){
   const messages={
    'Unsupported push service':'O servidor ainda não aceita o serviço de avisos deste navegador.',
    'Invalid subscription keys':'O navegador devolveu uma subscrição inválida. Fecha e reabre a Sully.',
    'Device limit reached':'Esta conta atingiu o limite de dispositivos. Desativa os avisos num dispositivo antigo.',
    'Subscription belongs to another account':'Os avisos deste dispositivo estão associados a outra conta.',
    'Remove previous subscription first':'Os avisos deste dispositivo estão associados a outra conta.',
    'Unable to verify account':'O serviço de avisos não conseguiu validar a conta no Firebase.',
   };
   const fallback=response.status===401?'A sessão precisa de ser renovada. Entra novamente.':response.status===409?'Liga as duas contas e tenta novamente.':response.status===429?'Demasiados pedidos. Aguarda um minuto e tenta novamente.':`Não foi possível ${stage}.`;
   const detail=Object.hasOwn(messages,value?.error)?messages[value.error]:fallback;
   const stages={'firebase':'Firebase','d1-schema':'D1: tabelas','d1-limits':'D1: limite de pedidos','vapid-key':'chave VAPID'};
   const source=Object.hasOwn(stages,value?.stage)?` · ${stages[value.stage]}`:'';
   const error=new Error(`${detail} (HTTP ${response.status}${source})`);
   error.status=response.status;
   throw error;
  }
  return value;
 }
 async function removeLocal(){
  const reg=await registration();await gate(false,reg);
  const subscription=await reg.pushManager.getSubscription();if(subscription&&!await subscription.unsubscribe())throw new Error('Não foi possível desligar os avisos. Tenta novamente antes de sair.');
  save(DEVICE_KEY,null);record=null;lastSync='';emit({enabled:false});
 }
 async function registerExisting(reg,subscription,g){
  const value=await api('/v1/subscriptions',{subscription:subscription.toJSON(),preview:false},g);check(g);
  record={uid:context.uid,pairId:context.pairId,id:value.id};save(DEVICE_KEY,record);
  // Use the server-confirmed quiet state; the local state can be newer while offline.
  context.quietUntil=value.quietUntil||context.quietUntil;
  await gate(true,reg);check(g);emit({enabled:true,error:''});lastSync='';
 }
 async function reconcile(){
  if(reconciling||busy){again=true;return;}
  reconciling=true;const g=generation;emit({checking:true,support:pushSupport(env)});
  try{
   const stored=read(DEVICE_KEY);
   if(!context.uid||!context.pairId||state.support){
    if(stored&&(!context.uid||stored.uid!==context.uid||(context.pairId&&stored.pairId!==context.pairId))){await removeLocal();}
    else if(!stored&&env.navigator?.serviceWorker)await gate(false);
    emit({enabled:false});return;
   }
   const reg=await registration();check(g);
   if(stored&&(stored.uid!==context.uid||stored.pairId!==context.pairId)){await removeLocal();check(g);}
   record=read(DEVICE_KEY);const subscription=await reg.pushManager.getSubscription();check(g);
   if(!publicKey){const result=await api('/v1/key',null,g,'GET');publicKey=result.publicKey;}
   if(record&&subscription&&env.Notification.permission==='granted'){
    if(!state.enabled)await registerExisting(reg,subscription,g);
    else await syncQuiet();
   }else{
    if(record){save(DEVICE_KEY,null);record=null;}
    await gate(false,reg);check(g);emit({enabled:false,error:''});
   }
   flush();
  }catch(error){if(current(g))emit({error:error.message});}
  finally{reconciling=false;emit({checking:false});if(again){again=false;schedule(reconcile,0);}}
 }
 async function syncQuiet(force=false){
  if(!record||record.uid!==context.uid||!state.enabled)return;
  await gate(true);
  if(context.pending||syncing)return;
  const signature=`${context.uid}:${context.pairId}:${context.quietUntil}`;
  if(!force&&signature===lastSync&&now()-lastSyncAt<60000)return;
  const g=generation;
  syncing=true;
  try{const result=await api('/v1/preferences',{},g);check(g);lastSync=signature;lastSyncAt=now();if(signature===`${context.uid}:${context.pairId}:${context.quietUntil}`&&!context.pending){context.quietUntil=result.quietUntil||0;await gate(true);}emit({error:''});}
  catch(error){if(current(g)){emit({error:'O silêncio dos avisos externos ainda não ficou confirmado. Volta a tentar com rede.'});if(force)onWarning(state.error);}}
  finally{syncing=false;if(current(g)&&signature!==`${context.uid}:${context.pairId}:${context.quietUntil}`&&!context.pending)schedule(()=>syncQuiet(),0);}
 }
 function setSession(next){
  const changed=next.uid!==context.uid||next.pairId!==context.pairId;
  context={uid:next.uid||null,pairId:next.pairId||'',quietUntil:next.quietUntil||0,pending:!!next.pending};
  if(changed){generation++;cancel(retryTimer);record=null;publicKey='';lastSync='';emit({enabled:false,error:''});}
  if(!changed&&state.enabled)syncQuiet();
  if(changed)reconcile();
 }
 async function enable(){
  const problem=pushSupport(env);if(problem)throw new Error(problem);
  if(!context.uid||!context.pairId)throw new Error('Liga primeiro as duas contas no Perfil.');
  if(busy) return;
  // Ask immediately from the tap, before awaiting any network operation (Safari).
  const permission=env.Notification.requestPermission();
  busy=true;const g=generation;emit({busy:true,error:''});let created=null;
  try{
   if(await permission!=='granted')throw new Error('Não autorizaste as notificações. Podes continuar a usar os avisos dentro da Sully.');check(g);
   const reg=await registration();check(g);
   if(!publicKey)publicKey=(await api('/v1/key',null,g,'GET')).publicKey;
   let subscription=await reg.pushManager.getSubscription();check(g);
   if(subscription&&read(DEVICE_KEY)?.uid!==context.uid){if(!await subscription.unsubscribe())throw new Error('Desativa primeiro os avisos da conta anterior.');subscription=null;}
   if(!subscription){const bytes=Uint8Array.from(atob(publicKey.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});created=subscription;}
   check(g);await registerExisting(reg,subscription,g);await syncQuiet(true);
  }catch(error){if(created)await created.unsubscribe().catch(()=>{});if(current(g)){save(DEVICE_KEY,null);record=null;await gate(false).catch(()=>{});emit({enabled:false,error:error.message});}throw error;}
  finally{busy=false;emit({busy:false});if(again){again=false;schedule(reconcile,0);}}
 }
 async function disable(){
  if(busy)throw new Error('Aguarda a conclusão da ativação antes de sair.');
  busy=true;emit({busy:true});const previous=record||read(DEVICE_KEY),g=generation;
  try{
   if(!previous&&!env.PushManager){emit({enabled:false,error:''});return;}
   await removeLocal();
   if(previous?.uid===context.uid&&context.pairId)await api('/v1/subscriptions',{id:previous.id},g,'DELETE').catch(()=>{});
   emit({enabled:false,error:''});
  }finally{busy=false;emit({busy:false});}
 }
 const queueKey=uid=>'sully.push.outbox.'+uid;
 const queue=key=>{const value=read(key,[]);return Array.isArray(value)?value:[];};
 let flushing=false;
 async function flush(){
  if(flushing||!context.uid||!context.pairId||env.navigator?.onLine===false)return;
  flushing=true;const g=generation,uid=context.uid,key=queueKey(uid);let retry=false;
  try{
   const rows=queue(key).filter(row=>row&&typeof row.id==='string'&&row.pairId===context.pairId&&now()-row.ts<300000);
   save(key,rows);
   for(const row of rows){
    check(g);
    try{await api('/v1/send',row.activity?{activity:row.activity}:{eventId:row.id},g);}
    catch(error){if(!current(g))return;if(row.activity&&error.status===400)onWarning('A alteração ficou guardada. O serviço de avisos precisa de atualização.');if(!error.status||error.status>=500||error.status===429){retry=true;break;}}
    const rest=queue(key).filter(item=>item.id!==row.id);save(key,rest);
   }
  }catch{/* Keep event IDs only; retry on next connection. */}
  finally{flushing=false;if(retry&&current(g)){cancel(retryTimer);retryTimer=schedule(flush,15000);onWarning('Alteração sincronizada. O aviso do telemóvel ainda está em espera.');}}
 }
 function send(eventId,uid,activity=null){
  if(uid!==context.uid||!context.pairId)return;
  const key=queueKey(uid),rows=queue(key).filter(row=>row&&now()-row.ts<300000);
  if(!rows.some(row=>row.id===eventId))rows.push({id:eventId,pairId:context.pairId,ts:now(),...(activity?{activity}:{})});
  try{save(key,rows.slice(-30));flush();}catch{onWarning('Mensagem sincronizada. Não foi possível preparar o aviso do telemóvel.');}
 }
 async function logout(){
  const uid=context.uid;
  await disable();generation++;cancel(retryTimer);
  if(uid)save(queueKey(uid),null);
  context={uid:null,pairId:'',quietUntil:0};if(env.PushManager)await gate(false);
 }
 function sendActivity(type,id,revision,uid){const {activity}=activityRequest(type,id,revision);send(`activity:${type}:${id}:${revision}`,uid,activity);}
 return {setSession,enable,disable,logout,send,sendActivity,refresh:reconcile,syncQuiet,state:()=>({...state})};
}
