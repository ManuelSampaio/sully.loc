import { noticeText } from './activity.js';
import { mergeMessages, messageState, createDraftStore } from './messages.js';
import { parseInvite } from './pairing.js';
import { createPushClient } from './push.js?rev=push-feedback';
import { createTouchInbox, createEventCursor } from './alerts.js';
import { applyTheme } from './theme.js';
import { renderSky, skyState } from './sky.js';
import { icon, mountIcons } from './icons.js?rev=period-moods';
import { MOODS, MOOD_PERIODS, moodsForPeriod, QUICK, dayKey, period, effectiveStatus, statusExpiry, STATUS_LIFETIME, waterAdd, validEvent, isDrawing } from './core.js?rev=home-focus';
import { cloudConfig } from './config.js';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const KEY = 'sully.demo.v1';
mountIcons();
const activeTasks=new Map();
let pendingWrites=0,reconnecting=false;
function refreshNetwork(){const icon=$('#network-indicator');if(!icon)return;icon.classList.toggle('is-working',activeTasks.size>0||pendingWrites>0||reconnecting);icon.classList.toggle('is-offline',!navigator.onLine);icon.setAttribute('data-state',!navigator.onLine?'offline':activeTasks.size||pendingWrites||reconnecting?'loading':'ready');}
function beginLoading(label){const token=Symbol();activeTasks.set(token,label);$('#loader-label').textContent=label;$('#app-loader').hidden=false;if(!$('#app-loader').open)$('#app-loader').showModal();$('#hide-loader').hidden=true;refreshNetwork();const timer=setTimeout(()=>{if(activeTasks.has(token)){$('#loader-label').textContent=navigator.onLine?'A ligação está a demorar um pouco…':'À espera de rede…';$('#hide-loader').hidden=false;}},12000);return()=>{clearTimeout(timer);activeTasks.delete(token);if(!activeTasks.size){$('#app-loader').close();$('#app-loader').hidden=true;}else $('#loader-label').textContent=[...activeTasks.values()].at(-1);refreshNetwork();};}
$('#hide-loader').onclick=()=>{$('#app-loader').close();$('#app-loader').hidden=true;};
function requireNetwork(){if(navigator.onLine)return true;toast('Precisas de rede para entrar, criar conta ou aceitar um convite.');return false;}

function read(key,fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function persist(key,value) { try { localStorage.setItem(key,JSON.stringify(value)); return true; } catch { toast('Não foi possível guardar. O armazenamento pode estar cheio ou bloqueado.'); return false; } }
const initial = () => ({members:{a:{id:'a',name:'O teu perfil',sharing:{mood:false,status:false,location:false}},b:{id:'b',name:'Outro perfil',sharing:{mood:false,status:false,location:false}}},profiles:{},locations:[],moods:[],events:[]});
let data = initial();
let me = null, currentPair=null, authMode='login';
if (!cloudConfig.enabled) { const saved = read(KEY,null); if(saved?.members?.a && saved?.members?.b && Array.isArray(saved.events) && Array.isArray(saved.moods)) data=saved; }
let page='home', selectedPeriod=period(), selectedMood=null, quickKind='quick', cloud=null, toastTimer;
const drafts=createDraftStore(sessionStorage),failedEvents=new Map(),chatRows=new Map(),pageScroll=new Map();
let settingsCategory='';
const settingsLabels={account:'Conta',space:'O nosso espaço',notifications:'Notificações',privacy:'Privacidade',appearance:'Aparência',care:'Cuidados pessoais'};
function openSettings(category=''){settingsCategory=category;$('#settings-menu').hidden=!!category;$('#settings-detail').hidden=!category;$('#settings-title').textContent=settingsLabels[category]||'Perfil';$('#settings-subtitle').hidden=!!category;$$('[data-settings-panel]').forEach(panel=>panel.hidden=panel.dataset.settingsPanel!==category);if(page==='settings'){window.scrollTo(0,0);$('#settings-title').focus({preventScroll:true});}}
$$('[data-settings]').forEach(button=>button.onclick=()=>openSettings(button.dataset.settings));$('#settings-back').onclick=()=>openSettings();
let hasOlder=false,loadingHistory=false,chatSignature='',draftOwner='',pairBusy=false;
let pendingInvite='';try{pendingInvite=parseInvite(new URL(location.href).searchParams.get('invite')||sessionStorage.getItem('sully.pendingInvite'));sessionStorage.setItem('sully.pendingInvite',pendingInvite);const clean=new URL(location.href);clean.searchParams.delete('invite');history.replaceState(null,'',clean.pathname+clean.search+clean.hash);}catch{}
const chatRoom=()=>cloudConfig.enabled?currentPair?.id||'':'demo';
function stashDraft(){drafts.write(me,chatRoom(),$('#chat-text').value);}
function loadDraft(){const key=`${me||''}:${chatRoom()}`;if(key===draftOwner)return;draftOwner=key;$('#chat-text').value=drafts.read(me,chatRoom());resizeComposer();}
function resizeComposer(){const input=$('#chat-text');input.style.height='auto';input.style.height=Math.min(120,Math.max(44,input.scrollHeight))+'px';}

const touchInbox=createTouchInbox(),eventCursor=createEventCursor();
let swRegistrationPromise=null,pushSessionSignature='',pushQuietOwner=null,lastPushQuiet=0;
const push=createPushClient({
 getToken:uid=>{if(!cloud)throw new Error('A ligação à conta ainda está a iniciar.');return cloud.getToken(uid);},
 getRegistration:()=>swRegistrationPromise||Promise.reject(new Error('Atualiza a página para iniciar as notificações.')),
 onChange:renderPush,onWarning:message=>toast(message)
});
function renderPush(state=push.state()){
 const button=$('#notifications-button'),disable=$('#notifications-disable');
 if(!button)return;
 const paired=!!me&&currentPair?.members.length===2;
 button.disabled=!cloudConfig.enabled||!paired||state.busy||state.checking||!!state.support;
 button.hidden=state.enabled;
 button.textContent=state.busy?'A ativar…':state.checking?'A preparar…':'Ativar neste dispositivo';
 disable.hidden=!state.enabled;disable.disabled=state.busy;
 $('#notification-status').textContent=!cloudConfig.enabled?'Demonstração local: não envia notificações para outro telemóvel.':!paired?'Liga primeiro as duas contas em O nosso espaço.':state.support||state.error||(state.enabled?'Ativos: mensagens, toques, notas, desenhos, check-ins, estados e localização partilhada.':'Só depois de tocares em Ativar e autorizares no telemóvel.');
 $('#notification-status').setAttribute('role',state.error?'alert':'status');
}
function updatePushSession(force=false){
 if(!cloudConfig.enabled){renderPush();return;}
 const state=data.members[me],sleeping=['dormir','sesta'].includes(state?.status),until=statusExpiry(state);
 if(pushQuietOwner!==me){pushQuietOwner=me;lastPushQuiet=0;}
 const quiet=state?(sleeping?(until>Date.now()?until:0):0):lastPushQuiet;if(state)lastPushQuiet=quiet;
 const pairId=currentPair?.members.length===2?currentPair.id:'';
 const signature=[me||'',pairId,quiet,state?.status||'',until,state?.ts||'',state?.pending||false].join(':');
 if(force||signature!==pushSessionSignature){pushSessionSignature=signature;push.setSession({uid:me,pairId,quietUntil:quiet,pending:state?.pending});}
 renderPush();
}

let touchEditing=false;
let prefs=read('sully.prefs',{});
const localStateKey = () => `sully.personal.${cloudConfig.enabled?'cloud':'demo'}.${me || 'guest'}`;
let personal=read(localStateKey(),{});
const own = () => ({...(data.members[me]||{}),...(data.profiles?.[me]||{}),name:data.profiles?.[me]?.name||data.members[me]?.name||'Tu'});
const other = () => cloudConfig.enabled ? {id:currentPair?.members.find(id=>id!==me)||'',name:'O teu par'} : data.members[me==='a'?'b':'a'];
function profileName(id) { return data.profiles?.[id]?.name || data.members[id]?.name || 'O teu par'; }
function nicknameOf(id) { const value=personal.nicknames?.[id];return id && id!==me && typeof value==='string' ? value.trim().slice(0,40) : ''; }
function nameOf(id) { return nicknameOf(id) || profileName(id); }
function toast(message) { $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,5500); }
function saveDemo() { return persist(KEY,data); }
function savePersonal() { return persist(localStateKey(),personal); }
function savePrefs() { persist('sully.prefs',prefs); }
function requireIdentity() { if(!me) { $('#entry').hidden=false;$('#workspace').hidden=true;toast('Cria a tua conta ou explora a demonstração.');return false; } return true; }
function setConnection(text) { $('#connection').textContent=text;refreshNetwork(); }
function networkLabel() { if(!navigator.onLine)return cloudConfig.enabled?'Sem rede · alterações em espera':'Sem rede · demonstração disponível';if(reconnecting)return 'A restabelecer ligação…';if(!cloudConfig.enabled) return 'Teste local · sem ligação ao outro telemóvel'; if(!me) return 'Modo privado · entra na tua conta'; if(!currentPair)return 'Conta pessoal · liga-te ao teu par no Perfil'; return navigator.onLine ? 'Ligado à tua conta · confirmação de envio na conversa' : 'Sem rede · alterações em espera neste dispositivo'; }
function setUnread(unread){
 $('#unread').hidden=!unread;
 $('#home-chat').textContent=unread?'Ver novidades na conversa':'Abrir conversa';
}
function showPage(next){
 if(page==='chat')stashDraft();pageScroll.set(page,window.scrollY);page=next;
 document.body.classList.toggle('chat-open',next==='chat');document.body.classList.toggle('settings-open',next==='settings');
 $$('.page').forEach(node=>node.hidden=node.id!==`page-${next}`);
 $$('nav button').forEach(button=>{const active=button.dataset.page===next;button.classList.toggle('active',active);active?button.setAttribute('aria-current','page'):button.removeAttribute('aria-current');});
 $('#page-label').textContent={home:'Hoje',chat:'Conversa',draw:'Desenho',history:'Histórico',settings:'Perfil'}[next];
 if(next==='settings')openSettings(pendingInvite?'space':'');
 if(next==='chat'){loadDraft();setUnread(false);renderChat();requestAnimationFrame(()=>{$('#messages').scrollTop=$('#messages').scrollHeight;resizeComposer();});}
 window.scrollTo({top:next==='chat'?0:pageScroll.get(next)||0,behavior:'instant'});fitViewport();
}
$('#home-link').addEventListener('click',()=>{showPage('settings');openSettings('space');});
$$('[data-page]:not(#home-link)').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
$$('.dialog-close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
function el(tag,cls,text) { const e=document.createElement(tag); if(cls)e.className=cls; if(text!==undefined)e.textContent=text; return e; }
function dateText(ts) { return new Date(ts).toLocaleString('pt-PT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
function moodRecord() { return data.moods.find(m=>m.from===me && m.day===dayKey() && m.period===selectedPeriod); }
const moodDrafts=new Map();
const moodDraftKey=()=>`${me||'guest'}_${dayKey()}_${selectedPeriod}`;
function captureMoodDraft(){moodDrafts.set(moodDraftKey(),{mood:selectedMood,note:$('#mood-note').value});}
function loadMood(){const saved=moodDrafts.get(moodDraftKey())||moodRecord();selectedMood=saved?.mood||null;$('#mood-note').value=saved?.note||'';renderMood();}
function renderMood(){
 const config=MOOD_PERIODS[selectedPeriod],record=moodRecord(),draft=moodDrafts.get(moodDraftKey());
 if(!draft){selectedMood=record?.mood||null;if(document.activeElement!==$('#mood-note'))$('#mood-note').value=record?.note||'';}
 const choices=moodsForPeriod(selectedPeriod,record?.mood),signature=selectedPeriod+':'+choices.map(m=>m[0]).join(',');
 if($('#moods').dataset.choices!==signature){
  $('#moods').replaceChildren();$('#moods').dataset.choices=signature;
  for(const [id,,label] of choices){const b=el('button');b.type='button';b.dataset.mood=id;b.append(icon(id),el('small','',label));b.onclick=()=>{selectedMood=id;captureMoodDraft();renderMood();};$('#moods').append(b);}
 }
 $$('.period-tabs button').forEach(b=>{const yes=b.dataset.period===selectedPeriod;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',yes);});
 $$('#moods button').forEach(b=>{const yes=b.dataset.mood===selectedMood;b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',yes);});
 $('#mood-question').textContent=config.question;$('#mood-note').placeholder=config.prompt;
 $('#mood-note-label').textContent=config.prompt+' (opcional)';
 const old=record&&!config.ids.includes(record.mood);
 $('#mood-feedback').textContent=old?'O teu mood anterior continua disponível.':record?'Atualizar também avisa o teu par, se partilhares o mood.':own().sharing?.mood?'Ao partilhar, avisas o teu par.':'Só para ti. Podes ativar a partilha em Privacidade.';
}
$('#mood-note').addEventListener('input',captureMoodDraft);
$$('[data-period]').forEach(b=>b.addEventListener('click',()=>{selectedPeriod=b.dataset.period;loadMood();}));
function write(collection,id,value,onAck=()=>{}) {
 if(!requireIdentity())return false;
 if(!cloudConfig.enabled) { if(collection==='members')data.members[id]=value; else {const list=data[collection]||(data[collection]=[]);const idx=list.findIndex(x=>x.id===id);idx<0?list.push(value):list.splice(idx,1,value);} if(!saveDemo())return false;render();return true; }
 if(!cloud){toast('A ligação ainda está a iniciar. Tenta novamente.');return false;}
 const sender=me,room=chatRoom();try{pendingWrites++;refreshNetwork();const done=()=>{pendingWrites=Math.max(0,pendingWrites-1);refreshNetwork();};cloud.write(collection,id,value,()=>{done();onAck();if(me!==sender||chatRoom()!==room)return;if(collection==='events'){failedEvents.delete(id);push.send(id,value.from);if(me===sender&&chatRoom()===room)renderChat();}if(collection==='members'){updatePushSession(true);push.syncQuiet(true);}const type={moods:'mood',members:'status',locations:'location'}[collection];if(type&&own().sharing?.[type]===true)push.sendActivity(type,id,value.ts,sender);},error=>{done();if(collection==='events'&&me===sender&&chatRoom()===room){failedEvents.set(id,{...value,failed:true,pending:false});chatSignature='';renderChat();$('#chat-feedback').textContent='Uma mensagem não foi enviada. Podes tentar novamente.';}else toast(`Não foi possível sincronizar: ${friendlyError(error)}`);});return true;}catch(error){pendingWrites=Math.max(0,pendingWrites-1);refreshNetwork();toast(friendlyError(error));return false;}
}
$('#mood-form').addEventListener('submit',e=>{e.preventDefault();if(!selectedMood){toast('Escolhe primeiro como te sentes.');return;}if(!requireIdentity())return;const id=`${me}_${dayKey()}_${selectedPeriod}`;const value={id,from:me,day:dayKey(),period:selectedPeriod,mood:selectedMood,note:$('#mood-note').value.trim(),ts:Date.now()};if(write('moods',id,value))toast(cloudConfig.enabled?'Check-in guardado para sincronizar.':'Check-in guardado neste navegador.');});
function addEvent(kind,text,extra={}) { if(!requireIdentity())return false;const event={id:crypto.randomUUID(),from:me,kind,text,ts:Date.now(),...extra};if(!validEvent(event)){toast('Este conteúdo não pode ser enviado.');return false;}return write(kind==='location'?'locations':'events',kind==='location'?me:event.id,event); }
function compose(kind,title,iconName,text) {if(!requireIdentity())return;quickKind=kind;$('#dialog-title').textContent=title;$('#dialog-emoji').replaceChildren(icon(iconName));$('#quick-text').value=text;$('#send-context').textContent=(cloudConfig.enabled?'Vai para a vossa conversa. A sincronização não confirma leitura.':'Modo local: fica apenas neste navegador.')+(iconName==='onde'?' É só um pedido: o teu par decide se quer partilhar a posição.':'');$('#message-dialog').showModal();}
for(const [id,,title,text] of QUICK){const b=el('button','quick-tile');b.append(icon(id),el('span','',title));b.addEventListener('click',()=>compose('quick',title,id,text));$(id==='saudades'||id==='falar'?'#quick-actions':'#more-quick-actions').append(b);}
$('#quick-form').addEventListener('submit',e=>{e.preventDefault();const text=$('#quick-text').value.trim();if(!text)return;if(addEvent(quickKind,text)){ $('#message-dialog').close();toast(cloudConfig.enabled?'Mensagem guardada para sincronizar.':'Mensagem guardada apenas neste navegador.');}});
$('#send-heart').addEventListener('click',()=>compose('quick','Um coração para ti','heart','Um coração só para ti.'));
const note=()=>compose('note','A minha nota do dia','pencil','');$('#note-button').onclick=note;$('#add-note').onclick=note;
$('#chat-form').addEventListener('submit',e=>{e.preventDefault();const input=$('#chat-text'),text=input.value.trim();if(text&&addEvent('text',text)){input.value='';stashDraft();resizeComposer();$('#chat-feedback').textContent=navigator.onLine?'':'Sem rede. Enviaremos quando a ligação voltar.';$('#messages').scrollTop=$('#messages').scrollHeight;}});
$('#chat-text').addEventListener('input',()=>{stashDraft();resizeComposer();});
$('#chat-text').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();$('#chat-form').requestSubmit();}});
$('#attachments-toggle').onclick=()=>{const menu=$('#chat-tools');menu.hidden=!menu.hidden;$('#attachments-toggle').setAttribute('aria-expanded',!menu.hidden);};
$('#new-messages').onclick=()=>{$('#messages').scrollTo({top:$('#messages').scrollHeight,behavior:'smooth'});$('#new-messages').hidden=true;};
$('#messages').addEventListener('scroll',()=>{const box=$('#messages');if(box.scrollHeight-box.scrollTop-box.clientHeight<80)$('#new-messages').hidden=true;});
window.addEventListener('pagehide',stashDraft);

function empty(iconName,title,text) {const d=el('div','empty'),mark=el('div','empty-icon');mark.append(icon(iconName));d.append(mark,el('h2','',title),el('p','',text));return d;}
async function loadOlderMessages(){
 if(!cloud||loadingHistory)return;loadingHistory=true;chatSignature='';renderChat();
 try{await cloud.loadOlder();}catch(error){$('#chat-feedback').textContent='Não foi possível carregar o histórico. Tenta novamente.';}
 finally{loadingHistory=false;chatSignature='';renderChat();}
}
async function retryMessage(event,button){
 if(!cloud||!requireNetwork())return;button.disabled=true;button.textContent='A tentar…';
 const uid=me,room=chatRoom();
 await cloud.retryEvent(event,()=>{if(me!==uid||chatRoom()!==room)return;failedEvents.delete(event.id);chatSignature='';renderChat();push.send(event.id,uid);$('#chat-feedback').textContent='Mensagem enviada.';},error=>{if(me!==uid||chatRoom()!==room)return;button.disabled=false;button.textContent='Tentar novamente';$('#chat-feedback').textContent=friendlyError(error);});
}
function renderChat(){
 const box=$('#messages'),partner=other();$('#chat-title').textContent=partner.id?nameOf(partner.id):'Conversa';$('#chat-subtitle').textContent=cloudConfig.enabled?(currentPair?.members.length===2?'O vosso espaço privado.':'Liga o teu par no Perfil para conversar.'):'Demonstração neste navegador.';
 loadDraft();
 const locations=(data.locations||[]).filter(e=>e.from===me||(data.profiles?.[e.from]||data.members[e.from])?.sharing?.location===true);
 const list=mergeMessages(data.events,locations,[...failedEvents.values()]).filter(validEvent);
 const signature=JSON.stringify([hasOlder,loadingHistory,list.map(e=>[e,nameOf(e.from)])]);if(signature===chatSignature)return;chatSignature=signature;
 const atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<90,oldTop=box.scrollTop;
 const anchor=[...box.querySelectorAll('[data-event-id]')].find(row=>row.getBoundingClientRect().bottom>box.getBoundingClientRect().top);
 const offset=anchor?anchor.getBoundingClientRect().top-box.getBoundingClientRect().top:0;
 const nodes=[];if(hasOlder){const button=el('button','load-history text-button',loadingHistory?'A carregar…':'Carregar mensagens anteriores');button.type='button';button.disabled=loadingHistory;button.onclick=loadOlderMessages;nodes.push(button);}
 if(!list.length)nodes.push(empty('chat','A vossa conversa.',cloudConfig.enabled?'Envia uma mensagem para começar.':'Experimenta enviar uma mensagem.'));
 const activeIds=new Set();let newIncoming=false;
 for(const event of list){
  activeIds.add(event.id);let row=chatRows.get(event.id);const fingerprint=JSON.stringify([event,nameOf(event.from)]);
  if(!row||row.dataset.signature!==fingerprint){
   if(!row&&event.from!==me)newIncoming=true;
   row=el('article',`message ${event.from===me?'mine':''}`);row.dataset.eventId=event.id;row.dataset.signature=fingerprint;
   const bubble=el('div','bubble');
   if(event.kind==='drawing'&&isDrawing(event.image)){const image=el('img');image.src=event.image;image.alt='Desenho de '+nameOf(event.from);image.onload=()=>{if(page==='chat'&&atBottom)box.scrollTop=box.scrollHeight;};bubble.append(image);}else bubble.append(el('span','',event.text));
   if(event.kind==='location'){const link=el('a','','Ver posição no mapa');link.href=`https://www.openstreetmap.org/?mlat=${event.lat}&mlon=${event.lng}#map=16/${event.lat}/${event.lng}`;link.target='_blank';link.rel='noopener noreferrer';bubble.append(link,el('small','',`Posição de ${dateText(event.ts)}. Não é em tempo real.`));}
   row.append(bubble,el('div','message-meta',`${nameOf(event.from)} · ${dateText(event.ts)}${event.from===me?' · '+messageState(event,cloudConfig.enabled):''}`));
   if(event.failed&&event.from===me){const retry=el('button','retry-message text-button','Tentar novamente');retry.onclick=()=>retryMessage(event,retry);row.append(retry);}
   chatRows.set(event.id,row);
  }nodes.push(row);
 }
 for(const id of chatRows.keys())if(!activeIds.has(id))chatRows.delete(id);
 box.replaceChildren(...nodes);
 if(loadingHistory&&anchor?.isConnected)box.scrollTop=oldTop+(anchor.getBoundingClientRect().top-box.getBoundingClientRect().top-offset);
 else if(atBottom&&!loadingHistory)box.scrollTop=box.scrollHeight;
 else if(anchor?.isConnected)box.scrollTop=oldTop+(anchor.getBoundingClientRect().top-box.getBoundingClientRect().top-offset);
 if(page==='chat'&&!atBottom&&newIncoming&&!loadingHistory)$('#new-messages').hidden=false;
}
const statusLabels={disponivel:'Disponível',trabalhar:'A trabalhar',estudar:'A estudar',ocupado:'Ocupado/a',deslocacao:'Em deslocação',dormir:'A dormir',sesta:'A descansar','sem estado':'Ainda sem estado'};
function render(){const member=own(),partner=other();$('#home-chat').hidden=!partner.id;$('#home-link').hidden=!!partner.id;$('#send-heart').hidden=!partner.id;$('.quick-card').hidden=!partner.id;$('#settings-name').textContent=member.name;$('#settings-avatar').textContent=member.name.slice(0,1).toUpperCase();$('#settings-link-state').textContent=partner.id?'Ligado a '+nameOf(partner.id):currentPair?'Convite à espera de resposta':'Liga-te ao teu par em O nosso espaço';$('#my-name').textContent=member.name;$('#avatar').textContent=member.name.slice(0,1).toUpperCase();$('#partner-name').textContent=nameOf(partner.uid||partner.id);if(document.activeElement!==$('#name-input'))$('#name-input').value=member.name;const partnerData=data.members[partner.uid||partner.id];const partnerProfile=data.profiles?.[partner.id]||partnerData;$('#partner-state').textContent=partner.id?(partnerProfile?.sharing?.status?statusLabels[effectiveStatus(partnerData)]:'Estado privado'):'À espera de ligação';const recent=data.moods.filter(m=>m.from===(partner.uid||partner.id)&&(partnerProfile?.sharing?.mood===true)).sort((a,b)=>b.ts-a.ts)[0];if(recent){const mood=MOODS.find(m=>m[0]===recent.mood);$('#partner-mood').replaceChildren(icon(mood?.[0]||'heart'),document.createTextNode(` ${mood?.[2]||recent.mood} · ${dateText(recent.ts)}`));$('#partner-note').textContent=recent.note||'Partilhou um bocadinho do dia contigo.';}else{$('#partner-mood').textContent=partner.id?(partnerProfile?.sharing?.mood?'Ainda sem check-in.':'Humor privado'):'Liga as duas contas no Perfil.';$('#partner-note').textContent='';}const status=effectiveStatus(data.members[me]);$('#current-status').textContent=statusLabels[status]||'Ao meu ritmo.';$$('[data-status]').forEach(b=>{b.classList.toggle('selected',b.dataset.status===status);b.setAttribute('aria-pressed',b.dataset.status===status);});const count=personal.water?.day===dayKey()?personal.water.count:0;$('#water-count').textContent=count;$('#water-drops').textContent='●'.repeat(Math.min(count,12))+'○'.repeat(Math.max(0,8-count));renderMood();renderChat();renderHistory();renderAccount();updatePushSession();showNextTouch();setConnection(networkLabel());}
function renderHistory(){const box=$('#history');box.replaceChildren();const items=[...data.moods.filter(m=>m.from===me||(data.profiles?.[m.from]||data.members[m.from])?.sharing?.mood===true).map(m=>({...m,kind:'mood'})),...data.events.filter(e=>e.kind==='note')].sort((a,b)=>b.ts-a.ts);if(!items.length){box.append(empty('history','Os dias vão ficando aqui.','Os check-ins e as notas que partilharem aparecem neste espaço.'));return;}for(const item of items){const card=el('article','card history-item');card.append(el('time','',dateText(item.ts)+' · '+nameOf(item.from)));if(item.kind==='mood'){const mood=MOODS.find(m=>m[0]===item.mood);const title=el('h2');title.append(icon(mood?.[0]||'heart'),document.createTextNode(' '+(mood?.[2]||item.mood)));card.append(title,el('p','',`${{manha:'Manhã',tarde:'Tarde',noite:'Noite'}[item.period]||''}${item.note?' · '+item.note:''}`));}else card.append(el('h2','','Nota do dia'),el('p','',item.text));box.append(card);}}
function setStatus(status,minutes=0){if(!requireIdentity())return;const value={id:me,name:own().name,status,...(!cloudConfig.enabled?{sharing:own().sharing||{mood:false,status:false,location:false}}:{}),until:Date.now()+(minutes?minutes*60000:STATUS_LIFETIME),ts:Date.now()};if(write('members',me,value))toast(cloudConfig.enabled?'Estado guardado para sincronizar.':'Estado atualizado neste navegador.');}
$$('[data-status]').forEach(b=>b.onclick=()=>b.dataset.status==='sesta'?$('#nap-dialog').showModal():setStatus(b.dataset.status));$('#nap-form').onsubmit=e=>{e.preventDefault();setStatus('sesta',Number($('#nap-duration').value));$('#nap-dialog').close();};
$('#water-add').onclick=()=>{if(!requireIdentity())return;personal.water=waterAdd(personal.water);if(prefs.waterMinutes)personal.nextWater=Date.now()+prefs.waterMinutes*60000;savePersonal();render();toast('Um pequeno cuidado registado.');};
async function saveProfile(){if(!requireIdentity())return;const name=$('#name-input').value.trim();if(!name){toast('Escreve o teu nome.');return;}const sharing={mood:$('#share-mood').checked,status:$('#share-status').checked,location:$('#share-location').checked};try{if(cloudConfig.enabled){if(!cloud)throw new Error('A ligação ainda não está pronta.');if(!requireNetwork())return;const finish=beginLoading('A guardar o teu perfil…');try{await cloud.saveProfile(name,sharing);}finally{finish();}}else{data.members[me]={...own(),id:me,name,sharing};saveDemo();render();}toast('Perfil e escolhas guardados.');}catch(e){toast(friendlyError(e));}}
function renderNickname(){
 const partner=other(),input=$('#nickname-input'),available=!!me&&!!partner.id;
 const sameTarget=input.dataset.owner===(me||'')&&input.dataset.partner===(partner.id||'');
 if(!sameTarget||document.activeElement!==input)input.value=nicknameOf(partner.id);
 input.dataset.owner=me||'';input.dataset.partner=partner.id||'';
 input.disabled=!available;$('#save-nickname').disabled=!available;
 $('#reset-nickname').disabled=!available||!nicknameOf(partner.id);
 $('#nickname-help').textContent=available?`Nome do perfil: ${profileName(partner.id)}. Só aparece para ti neste navegador.`:'Liga primeiro a tua conta ao teu par para escolheres um nome de carinho.';
}
function saveNickname(value){
 if(!requireIdentity())return;const partner=other();if(!partner.id){toast('Liga primeiro a tua conta ao teu par.');return;}
 const nickname=value.trim();if(nickname.length>40){toast('Usa até 40 caracteres.');return;}
 const previous=personal, nicknames={...personal.nicknames};
 if(nickname)nicknames[partner.id]=nickname;else delete nicknames[partner.id];
 personal={...personal,nicknames};if(!savePersonal()){personal=previous;return;}
 $('#nickname-input').value=nickname;render();toast(nickname?'Nome de carinho guardado só para ti neste navegador.':'Voltaste a usar o nome do perfil.');
}
$('#nickname-form').onsubmit=e=>{e.preventDefault();saveNickname($('#nickname-input').value);};
$('#reset-nickname').onclick=()=>saveNickname('');
$('#save-name').onclick=saveProfile;$('#sharing-form').onsubmit=e=>{e.preventDefault();saveProfile();};
$('#demo-person').value=me||'a';$('#demo-person').onchange=()=>{resetTouches();me=$('#demo-person').value;persist('sully.demo.person',me);personal=read(localStateKey(),{});loadMood();render();toast('Agora estás a experimentar como '+own().name);};
$('#water-reminder').value=String(prefs.waterMinutes||0);$('#water-reminder').onchange=()=>{prefs.waterMinutes=Number($('#water-reminder').value);personal.nextWater=prefs.waterMinutes?Date.now()+prefs.waterMinutes*60000:0;savePrefs();savePersonal();toast('Lembrete atualizado. Funciona com o site aberto.');};
$('#mood-reminder').checked=!!prefs.moodReminder;$('#mood-reminder').onchange=()=>{prefs.moodReminder=$('#mood-reminder').checked;savePrefs();};
async function notify(text,inApp=true,system=true){if(['dormir','sesta'].includes(effectiveStatus(data.members[me])))return;if(inApp)toast(text);if(system&&'Notification' in window && Notification.permission==='granted'){try{const reg=await navigator.serviceWorker?.ready;if(reg)await reg.showNotification('Sully',{body:text,icon:'./icon.svg',tag:'sully-gentle'});else new Notification('Sully',{body:text});}catch{/* The in-app toast remains available. */}}}
function touchesMuted(){return ['dormir','sesta'].includes(effectiveStatus(data.members[me]));}
function resetTouches(){touchEditing=false;touchInbox.reset();if($('#partner-alert').open)$('#partner-alert').close();}
function showNextTouch(){
 if(!me||touchesMuted()){resetTouches();return;}
 if(touchInbox.current||touchEditing||document.hidden||document.querySelector('dialog[open]')||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'))return;
 const event=touchInbox.take();if(!event)return;
 $('#partner-alert-title').textContent=nameOf(event.from);
 $('#partner-alert-text').textContent=event.text;
 $('#partner-alert-time').textContent=dateText(event.ts);
 $('#partner-alert-time').dateTime=new Date(event.ts).toISOString();
 $('#partner-alert').showModal();
}
function receivePartnerEvent(event){
 if(!me||event.from===me||!validEvent(event))return;
 setUnread(page!=='chat');
 const summary=nameOf(event.from)+': '+(event.kind==='drawing'?'Enviou um desenho.':event.text);
 if(event.kind==='quick'){
  if(touchInbox.receive(event,me,touchesMuted())){notify(summary,false,false);showNextTouch();}
 }else notify(summary,true,false);
}
$('#close-partner-alert').onclick=()=>$('#partner-alert').close();
$('#partner-alert').addEventListener('cancel',e=>{e.preventDefault();$('#partner-alert').close();});
$('#partner-alert').addEventListener('close',()=>{touchInbox.finish();setTimeout(showNextTouch,0);});
document.addEventListener('close',()=>setTimeout(showNextTouch,0),true);
document.addEventListener('focusin',e=>{touchEditing=!!e.target.closest?.('input,textarea,select,[contenteditable="true"]');});
document.addEventListener('pointerdown',e=>{touchEditing=!!e.target.closest?.('input,textarea,select,[contenteditable="true"]');if(!touchEditing)setTimeout(showNextTouch,0);},true);
document.addEventListener('focusout',()=>setTimeout(showNextTouch,0));
$('#notifications-button').onclick=async()=>{try{await push.enable();toast('Notificações do teu par ativadas neste dispositivo.');}catch(error){toast(error.message);}};
$('#notifications-disable').onclick=async()=>{try{await push.disable();toast('Notificações do teu par desativadas neste dispositivo.');}catch(error){toast(error.message);}};
$('#location-button').onclick=()=>{if(!requireIdentity())return;if(!own().sharing?.location){toast('Ativa a partilha de localização no Perfil primeiro.');showPage('settings');return;}if(!navigator.geolocation){toast('Localização indisponível neste navegador.');return;}if(!confirm(cloudConfig.enabled?'Partilhar a tua posição atual na conversa? Ficará no histórico até ser apagada.':'Modo de teste: guardar a tua posição atual apenas neste navegador?'))return;const button=$('#location-button');button.disabled=true;navigator.geolocation.getCurrentPosition(pos=>{button.disabled=false;if(addEvent('location','Aqui estou.',{lat:pos.coords.latitude,lng:pos.coords.longitude}))toast(cloudConfig.enabled?'Posição guardada para sincronizar.':'Posição guardada apenas neste navegador.');},error=>{button.disabled=false;toast(error.code===1?'Não autorizaste a localização. Podes escrever onde estás.':'Não foi possível obter a posição. Tenta novamente.');},{enableHighAccuracy:false,timeout:15000,maximumAge:0});};
const canvas=$('#canvas'),ctx=canvas.getContext('2d');let painting=false,hasDrawing=false,color='#765955';ctx.lineCap='round';ctx.lineJoin='round';
for(const c of ['#765955','#c57872','#799587','#c7a766','#77739d']){const b=el('button');b.type='button';b.ariaLabel='Cor '+c;b.classList.toggle('selected',c===color);const swatch=el('span');swatch.style.background=c;b.append(swatch);b.onclick=()=>{color=c;$$('#colors button').forEach(x=>x.classList.toggle('selected',x===b));};$('#colors').append(b);}
function point(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};}
canvas.onpointerdown=e=>{painting=true;hasDrawing=true;canvas.setPointerCapture(e.pointerId);const p=point(e);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=Number($('#brush').value);ctx.beginPath();ctx.arc(p.x,p.y,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(p.x,p.y);};canvas.onpointermove=e=>{if(!painting)return;const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();};canvas.onpointerup=canvas.onpointercancel=()=>{painting=false;};
$('#clear-drawing').onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);hasDrawing=false;};$('#send-drawing').onclick=()=>{if(!hasDrawing){toast('Desenha primeiro um pequeno carinho.');return;}const image=canvas.toDataURL('image/png');if(!isDrawing(image)){toast('O desenho ficou grande. Limpa um pouco e tenta novamente.');return;}if(addEvent('drawing','Um rabisco para ti.',{image})){$('#clear-drawing').click();showPage('chat');toast(cloudConfig.enabled?'Desenho guardado para sincronizar.':'Desenho guardado apenas neste navegador.');}};
$('#export-data').onclick=()=>{if(!requireIdentity())return;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download=`sully-${cloudConfig.enabled?'conta':'teste'}-${dayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};$('#clear-local').onclick=()=>{if(!confirm('Apagar todos os humores, mensagens e desenhos de teste deste navegador?'))return;resetTouches();moodDrafts.clear();data=initial();saveDemo();personal={};savePersonal();loadMood();render();toast('Dados de teste apagados.');};
function friendlyError(error){const code=error?.code||'';if(code==='auth/email-already-in-use')return 'Já existe uma conta com este e-mail. Entra ou recupera a palavra-passe.';if(code==='auth/weak-password')return 'Escolhe uma palavra-passe com pelo menos 8 caracteres.';if(code.includes('permission-denied'))return 'Acesso aos dados bloqueado. Verifica as contas e as regras do Firebase.';if(code.includes('network'))return 'Sem ligação ao serviço. Tenta quando houver rede.';if(code.startsWith('auth/'))return 'Não foi possível entrar. Verifica o e-mail, a palavra-passe e a ligação.';return error?.message||'Ocorreu um problema. Tenta novamente.';}
function openAuth(mode){authMode=mode;const signup=mode==='signup';$('#auth-title').textContent=signup?'Criar a minha conta.':'Entrar na minha conta.';$('#signup-fields').hidden=!signup;$('#signup-name').required=signup;$('#password').minLength=signup?8:1;$('#password').autocomplete=signup?'new-password':'current-password';$('#auth-submit').textContent=signup?'Criar conta':'Entrar';$('#auth-switch').textContent=signup?'Já tenho conta':'Ainda não tenho conta';$('#reset-password').hidden=signup;$('#login-error').textContent=cloudConfig.enabled?'':'O registo real ainda precisa da configuração Firebase. A demonstração não cria uma conta.';if(!$('#login-dialog').open)$('#login-dialog').showModal();if(!matchMedia('(prefers-reduced-motion: reduce)').matches)$('#login-form animate')?.beginElement?.();}
$('#entry-signup').onclick=()=>openAuth('signup');$('#entry-login').onclick=()=>openAuth('login');$('#login-button').onclick=()=>openAuth('login');$('#auth-switch').onclick=()=>openAuth(authMode==='signup'?'login':'signup');
$('#entry-setup').hidden=cloudConfig.enabled;$('#entry-demo').hidden=cloudConfig.enabled;
$('#entry-demo').onclick=()=>$('#demo-dialog').showModal();
$('#demo-form').onsubmit=e=>{e.preventDefault();const name=$('#demo-name').value.trim();if(!name)return;me='a';data.members.a={...data.members.a,id:'a',name};saveDemo();personal=read(localStateKey(),{});$('#demo-person').value='a';$('#demo-dialog').close();$('#entry').hidden=true;$('#workspace').hidden=false;$('#logout-button').hidden=false;loadMood();render();};
$('#logout-button').onclick=async()=>{resetTouches();moodDrafts.clear();stashDraft();if(me)drafts.clear(me);$('#chat-text').value='';draftOwner='';failedEvents.clear();if(cloudConfig.enabled){const button=$('#logout-button');button.disabled=true;try{await push.logout();await cloud?.logout();}catch(error){toast(friendlyError(error));button.disabled=false;}}else{me=null;$('#entry').hidden=false;$('#workspace').hidden=true;showPage('home');}};
$('#login-form').onsubmit=async e=>{e.preventDefault();if(!cloudConfig.enabled||!cloud){$('#login-error').textContent='O registo e o login reais precisam de Firebase configurado.';return;}if(authMode==='signup'&&!$('#signup-name').value.trim()){$('#login-error').textContent='Escreve o teu nome.';return;}if(!requireNetwork())return;const b=$('#auth-submit');b.disabled=true;const finish=beginLoading(authMode==='signup'?'A criar a tua conta…':'A entrar na Sully…');try{const result=authMode==='signup'?await cloud.signup($('#signup-name').value.trim(),$('#email').value.trim(),$('#password').value,$('#trusted').checked):await cloud.login($('#email').value.trim(),$('#password').value,$('#trusted').checked);if(result.reload){$('#password').value='';location.reload();return;}$('#password').value='';$('#login-dialog').close();showPage('settings');}catch(error){$('#login-error').textContent=friendlyError(error);}finally{b.disabled=false;finish();}};
$('#reset-password').onclick=async()=>{const email=$('#email').value.trim();if(!cloud){$('#login-error').textContent='O serviço de contas ainda não está configurado.';return;}if(!email||!$('#email').checkValidity()){$('#login-error').textContent='Escreve o teu e-mail primeiro.';return;}try{await cloud.resetPassword(email);$('#login-error').textContent='Se a conta existir, receberás instruções por e-mail.';}catch(e){$('#login-error').textContent=friendlyError(e);}};
function renderAppearance(){
 const preference=me?personal.appearance:read('sully.appearance.preview',{});
 const state=applyTheme(preference);
 if(me){try{const preview=JSON.stringify({mode:state.mode,accent:state.accent});if(localStorage.getItem('sully.appearance.preview')!==preview)localStorage.setItem('sully.appearance.preview',preview);}catch{/* The account preference still applies in memory. */}}
 $('#theme-mode').value=state.mode;
 $$('#accent-options button').forEach(b=>{const yes=b.dataset.accent===state.accent;b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',yes);});
}
function saveAppearance(change){
 if(!requireIdentity())return;
 const previous=personal;personal={...personal,appearance:{...personal.appearance,...change}};
 if(!savePersonal()){personal=previous;return;}
 persist('sully.appearance.preview',personal.appearance);renderAppearance();toast('Aspeto guardado só para ti neste navegador.');
}
$('#theme-mode').onchange=()=>saveAppearance({mode:$('#theme-mode').value});
$$('#accent-options button').forEach(b=>b.onclick=()=>saveAppearance({accent:b.dataset.accent}));
function renderAccount(){
 renderAppearance();
 renderNickname();
 if(!$('#sharing-form').contains(document.activeElement)){for(const key of ['mood','status','location'])$('#share-'+key).checked=own().sharing?.[key]===true;}
 if(!cloudConfig.enabled){$('#cancel-invite').hidden=true;$('#pair-actions').hidden=true;$('#invite-result').hidden=true;$('#pair-description').textContent='Estás na demonstração local. O registo e a ligação entre telefones precisam de Firebase.';$('#demo-person option[value="a"]').textContent=data.members.a.name;$('#demo-person option[value="b"]').textContent=data.members.b.name;return;}
 const linked=currentPair?.members.length===2,pending=currentPair?.members.length===1;
 $('#pair-actions').hidden=linked;$('#create-invite').hidden=pending;$('#invite-result').hidden=!pending;$('#cancel-invite').hidden=!pending;$('#invite-replace-help').hidden=!pending;
 $('#join-invite').textContent=pending?'Cancelar o meu convite e aceitar este':'Aceitar convite';
 $('#pair-description').textContent=linked?`Ligado a ${nameOf(other().id)}.`:pending?'O teu convite está à espera. Podes cancelá-lo ou aceitar o que recebeste.':'Cria um convite ou cola o código ou link que recebeste.';
 if(pending)$('#invite-code').value=currentPair.id;
 if(pendingInvite&&!$('#invite-input').value)$('#invite-input').value=pendingInvite;
 for(const id of ['create-invite','join-invite','cancel-invite'])$('#'+id).disabled=pairBusy;
}
async function pairAction(button,action,message){
 if(!requireIdentity())return;if(!cloud){toast('A ligação ainda está a iniciar.');return;}if(!requireNetwork()||pairBusy)return;
 pairBusy=true;$('#pair-feedback').textContent='A atualizar a ligação…';renderAccount();
 try{await action();$('#pair-feedback').textContent=message;toast(message);}
 catch(error){$('#pair-feedback').textContent=friendlyError(error);}
 finally{pairBusy=false;renderAccount();}
}
$('#create-invite').onclick=()=>pairAction($('#create-invite'),()=>cloud.createInvite(),'Convite criado. Partilha-o com o teu par.');
$('#cancel-invite').onclick=()=>pairAction($('#cancel-invite'),()=>cloud.cancelInvite(),'Convite cancelado. Já podes aceitar outro.');
$('#join-invite').onclick=()=>pairAction($('#join-invite'),async()=>{await cloud.joinInvite($('#invite-input').value);pendingInvite='';sessionStorage.removeItem('sully.pendingInvite');$('#invite-input').value='';},'As duas contas estão ligadas.');
$('#copy-invite').onclick=async()=>{const link=new URL(location.origin+location.pathname);link.searchParams.set('invite',currentPair.id);try{await navigator.clipboard.writeText(link.href);toast('Link copiado. Partilha-o apenas com o teu par.');}catch{$('#invite-code').select();toast('Seleciona e copia o código.');}};

function updateDate(){renderAppearance();const d=new Date();renderSky($('#day-sky'),d);$('#today').textContent=d.toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long'}).toUpperCase();$('#greeting').textContent={manha:'Bom dia.',tarde:'Boa tarde.',noite:'Boa noite.'}[skyState(d).phase];}
setInterval(()=>{updateDate();if(!me)return;const now=Date.now();if(prefs.waterMinutes && personal.nextWater && now>=personal.nextWater){personal.nextWater=now+prefs.waterMinutes*60000;savePersonal();notify('Uma pausa para beber um pouco de água? 💧');}const h=new Date().getHours();const p=h<14?'manha':h<20?'tarde':'noite';const ready=(h>=8&&h<12)||(h>=14&&h<18)||h>=20;const key=dayKey()+'_'+p;if(prefs.moodReminder&&ready&&personal.moodReminder!==key&&!data.moods.some(m=>m.from===me&&m.day===dayKey()&&m.period===p)){personal.moodReminder=key;savePersonal();notify('Se te apetecer, partilha como estás. ♡');}render();},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(me)render();updateDate();showNextTouch();if(cloudConfig.enabled)push.refresh();}});
window.addEventListener('pageshow',updateDate);
window.addEventListener('online',()=>{if(cloudConfig.enabled)push.refresh();reconnecting=true;setConnection(networkLabel());setTimeout(()=>{reconnecting=false;setConnection(networkLabel());},4000);});window.addEventListener('offline',()=>{reconnecting=false;setConnection(networkLabel());if(activeTasks.size)$('#loader-label').textContent='À espera de rede…';});window.addEventListener('storage',e=>{if(e.key==='sully.push.device.v1'&&cloudConfig.enabled)push.refresh();if(me&&e.key===localStateKey()){personal=read(localStateKey(),{});render();}if(!cloudConfig.enabled && e.key===KEY){const fresh=read(KEY,null);if(fresh?.members?.a&&fresh?.members?.b&&Array.isArray(fresh.events)&&Array.isArray(fresh.moods)){const previous=new Set(data.events.map(x=>x.id));data=fresh;for(const item of data.events)if(!previous.has(item.id)&&item.from!==me){receivePartnerEvent(item);}render();}}});
if('serviceWorker' in navigator){swRegistrationPromise=navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready);swRegistrationPromise.catch(()=>toast('O modo offline e as notificações não ficaram disponíveis neste navegador.'));}
window.sullyReady=true;$('#boot-loader').hidden=true;updateDate();loadMood();render();
if(cloudConfig.enabled){
 data={members:{},profiles:{},locations:[],events:[],moods:[]};$('#demo-switch').hidden=true;$('#clear-local').hidden=true;$('#login-button').hidden=false;$('#trusted').checked=localStorage.getItem('sully.trusted')==='yes';$('#account-description').textContent='Cada pessoa tem a sua conta e o seu perfil.';$('#cloud-title').textContent='O nosso lugar.';$('#cloud-description').textContent='Cria a tua conta e liga-te ao teu par por convite. As permissões são individuais. Ativa as notificações em cada telemóvel, no Perfil.';
 const finishConnecting=beginLoading('A ligar à Sully…');try{const {connectCloud}=await import('./cloud.js?rev=shared-alerts');cloud=await connectCloud({onAuth(uid){resetTouches();if(me)stashDraft();failedEvents.clear();chatRows.clear();chatSignature='';hasOlder=false;moodDrafts.clear();me=uid;setUnread(false);currentPair=null;data={members:{},profiles:{},locations:[],events:[],moods:[]};eventCursor.reset();personal=read(localStateKey(),{});$('#entry').hidden=!!uid;$('#workspace').hidden=!uid;$('#logout-button').disabled=false;$('#logout-button').hidden=!uid;$('#login-button').hidden=!!uid;loadMood();render();showPage(uid&&pendingInvite?'settings':'home');pageScroll.clear();window.scrollTo(0,0);},onPair(pair){currentPair=pair;render();},onData(collection,rows,metadata={}){if(collection==='members'||collection==='profiles')data[collection]=Object.fromEntries(rows.map(r=>[r.id,r]));else data[collection]=rows;if(collection==='events'){hasOlder=metadata.hasMore===true;if(metadata.history)eventCursor.consume(rows,me,{baseline:true});else for(const row of eventCursor.consume(rows,me,metadata))receivePartnerEvent(row);}render();},onActivity(event){if(!me||event.from===me||touchesMuted())return;toast(nameOf(event.from)+': '+(noticeText[event.type]||'Há novidades.').replace('O teu par ',''));},onError(error){toast(friendlyError(error));setConnection('Problema na ligação · verifica o Perfil');}});updatePushSession(true);push.refresh();}catch(error){toast(friendlyError(error));$('#entry-setup').hidden=false;$('#entry-setup').textContent='Não foi possível ligar ao serviço de contas. Tenta recarregar.';setConnection('Não foi possível ligar ao serviço · tenta recarregar');}finally{finishConnecting();}
}

// O teclado virtual pode reduzir a área visível no Safari e no Chrome móvel.
function fitViewport(){const viewport=window.visualViewport;document.documentElement.style.setProperty('--visible-height',`${viewport?.height||window.innerHeight}px`);document.documentElement.style.setProperty('--viewport-top',`${viewport?.offsetTop||0}px`);document.body.classList.toggle('keyboard-open',page==='chat'&&!!document.activeElement?.matches('textarea,input')&&(viewport?.height||window.innerHeight)<window.innerHeight-120);}
window.visualViewport?.addEventListener('scroll',fitViewport);
document.addEventListener('focusin',fitViewport);document.addEventListener('focusout',()=>setTimeout(fitViewport,0));
window.visualViewport?.addEventListener('resize',fitViewport);
window.addEventListener('resize',fitViewport);
fitViewport();

window.sullyReady=true;$('#boot-loader').hidden=true;refreshNetwork();
