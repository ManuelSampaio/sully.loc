import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,updateDoc,writeBatch,runTransaction} from 'firebase/firestore';
import * as sdk from 'firebase/firestore';
import {pairingActions} from '../pairing.js';
let env;
const code='0123456789abcdef0123456789abcdef';
const profile=(uid,sharing={mood:false,status:false,location:false})=>({id:uid,name:uid,pairId:'',sharing,ts:1});
const db=uid=>env.authenticatedContext(uid).firestore();
async function register(uid){const store=db(uid);await setDoc(doc(store,'profiles',uid),profile(uid));return store;}
async function invite(store,uid){const batch=writeBatch(store);batch.set(doc(store,'pairs',code),{members:[uid],createdBy:uid,ts:1});batch.update(doc(store,'profiles',uid),{pairId:code});await batch.commit();}
async function join(store,uid){await runTransaction(store,async t=>{const self=doc(store,'profiles',uid),pair=doc(store,'pairs',code);await t.get(self);const room=await t.get(pair);t.update(pair,{members:[...room.data().members,uid]});t.update(self,{pairId:code});});}
async function couple(){const alice=await register('alice'),bob=await register('bob');await invite(alice,'alice');await join(bob,'bob');return{alice,bob};}
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-sully-loc',firestore:{rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});});
beforeEach(async()=>{await env.clearFirestore();});
after(async()=>{await env?.cleanup();});
test('novos estados respeitam autoria, partilha e revogação',async()=>{
  const {alice,bob}=await couple();
  const path=['pairs',code,'states','alice'];
  for(const status of ['trabalhar','estudar','deslocacao','treinar']){
    await assertSucceeds(setDoc(doc(alice,...path),{id:'alice',name:'Alice',status,until:0,ts:1}));
    await assertFails(getDoc(doc(bob,...path)));
  }
  await assertFails(setDoc(doc(alice,...path),{id:'alice',name:'Alice',status:'invalido',until:0,ts:1}));
  await assertFails(setDoc(doc(bob,...path),{id:'alice',name:'Alice',status:'trabalhar',until:0,ts:1}));
  await updateDoc(doc(alice,'profiles','alice'),{sharing:{mood:false,status:true,location:false}});
  await assertSucceeds(getDoc(doc(bob,...path)));
  await updateDoc(doc(alice,'profiles','alice'),{sharing:{mood:false,status:false,location:false}});
  await assertFails(getDoc(doc(bob,...path)));
});
test('sem login não lê perfis e uma conta não edita o perfil da outra',async()=>{const alice=await register('alice');await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'profiles','alice')));await assertFails(setDoc(doc(alice,'profiles','bob'),profile('bob')));await assertFails(getDocs(collection(alice,'profiles')));});
test('registo independente não dá acesso a outro perfil',async()=>{await register('alice');const bob=await register('bob');await assertFails(getDoc(doc(bob,'profiles','alice')));});
test('convite precisa de transação conjunta com o perfil',async()=>{const alice=await register('alice');await assertFails(setDoc(doc(alice,'pairs',code),{members:['alice'],createdBy:'alice',ts:1}));await assertSucceeds(invite(alice,'alice'));});
test('convite liga duas contas e recusa uma terceira',async()=>{const{alice,bob}=await couple();await assertSucceeds(getDoc(doc(bob,'profiles','alice')));const third=await register('third');await assertFails(join(third,'third'));await assertFails(updateDoc(doc(alice,'pairs',code),{members:['alice','third']}));await assertFails(getDoc(doc(third,'pairs',code)));});
test('humor é privado até autorizar e volta a ser privado quando revogado',async()=>{const{alice,bob}=await couple();const id='alice_2026-11-17_manha',path=['pairs',code,'moods','alice','entries',id];await setDoc(doc(alice,...path),{id,from:'alice',day:'2026-11-17',period:'manha',mood:'bem',note:'',ts:1});await assertFails(getDoc(doc(bob,...path)));await updateDoc(doc(alice,'profiles','alice'),{sharing:{mood:true,status:false,location:false}});await assertSucceeds(getDocs(collection(bob,'pairs',code,'moods','alice','entries')));await updateDoc(doc(alice,'profiles','alice'),{sharing:{mood:false,status:false,location:false}});await assertFails(getDoc(doc(bob,...path)));});
test('localização exige autorização e não pode ser colocada no chat comum',async()=>{const{alice,bob}=await couple();const position={id:'alice',from:'alice',kind:'location',text:'Aqui',ts:1,lat:-8.8,lng:13.2};const path=['pairs',code,'locations','alice'];await assertFails(setDoc(doc(alice,...path),position));await assertFails(setDoc(doc(alice,'pairs',code,'events','alice'),position));await updateDoc(doc(alice,'profiles','alice'),{sharing:{mood:false,status:false,location:true}});await assertSucceeds(setDoc(doc(alice,...path),position));await assertSucceeds(getDoc(doc(bob,...path)));await updateDoc(doc(alice,'profiles','alice'),{sharing:{mood:false,status:false,location:false}});await assertFails(getDoc(doc(bob,...path)));});
test('mensagens não permitem forjar remetente nem ler outro casal',async()=>{const{alice}=await couple();const third=await register('third');const message={id:'msg',from:'alice',kind:'text',text:'Olá',ts:1};await assertSucceeds(setDoc(doc(alice,'pairs',code,'events','msg'),message));await assertFails(setDoc(doc(alice,'pairs',code,'events','fake'),{...message,id:'fake',from:'bob'}));await assertFails(getDoc(doc(third,'pairs',code,'events','msg')));});

test('moods novos pertencem ao período certo e os antigos continuam editáveis',async()=>{
 const {alice}=await couple();
 const write=(period,mood)=>{const id=`alice_2026-11-18_${period}`;return setDoc(doc(alice,'pairs',code,'moods','alice','entries',id),{id,from:'alice',day:'2026-11-18',period,mood,note:'',ts:1});};
 for(const [period,ids] of [['manha',['energia','sono']],['tarde',['foco']],['noite',['paz','grato','exausto']]])for(const mood of ids)await assertSucceeds(write(period,mood));
 await assertFails(write('tarde','energia'));
 await assertFails(write('manha','paz'));
 await assertFails(write('noite','desconhecido'));
 for(const period of ['manha','tarde','noite'])await assertSucceeds(write(period,'radiante'));
});

const actions=(store,uid,nextCode)=>pairingActions({db:store,sdk,getUid:()=>uid,newCode:()=>nextCode});
test('cancelar o próprio convite permite aceitar outro e invalida o código antigo',async()=>{
 const alice=await register('alice'),bob=await register('bob'),third=await register('third'),second='b'.repeat(32);
 const a=actions(alice,'alice',code),b=actions(bob,'bob',second);
 await a.createInvite();await b.createInvite();await assertSucceeds(a.cancelInvite());
 assert.equal((await getDoc(doc(alice,'profiles','alice'))).data().pairId,'');
 await assertFails(getDoc(doc(third,'pairs',code)));
 await assertSucceeds(a.joinInvite(second));
 assert.deepEqual((await getDoc(doc(bob,'pairs',second))).data().members,['bob','alice']);
});
test('dois convites pendentes são substituídos atomicamente ao aceitar o outro',async()=>{
 const alice=await register('alice'),bob=await register('bob'),second='b'.repeat(32);
 const a=actions(alice,'alice',code),b=actions(bob,'bob',second);
 await a.createInvite();await b.createInvite();
 await assertSucceeds(a.joinInvite(`https://manuelsampaio.github.io/sully.loc/?invite=${second}`));
 assert.equal((await getDoc(doc(alice,'pairs',code))).data().revoked,true);
 assert.equal((await getDoc(doc(alice,'profiles','alice'))).data().pairId,second);
 await assertFails(getDoc(doc(bob,'pairs',code)));
 await assert.rejects(b.cancelInvite(),/já foi aceite/);
});
test('não se pode limpar o perfil sem revogar o convite, nem cancelar um convite alheio',async()=>{
 const alice=await register('alice'),bob=await register('bob');await invite(alice,'alice');
 await assertFails(updateDoc(doc(alice,'profiles','alice'),{pairId:''}));
 await assertFails(updateDoc(doc(alice,'pairs',code),{revoked:true}));
 const batch=writeBatch(bob);batch.update(doc(bob,'pairs',code),{revoked:true});batch.update(doc(bob,'profiles','bob'),{pairId:''});await assertFails(batch.commit());
});
test('um convite revogado não pode ser reativado ou aceite por outra conta',async()=>{
 const alice=await register('alice'),bob=await register('bob');const a=actions(alice,'alice',code);await a.createInvite();await a.cancelInvite();
 await assertFails(updateDoc(doc(alice,'pairs',code),{revoked:false}));
 const batch=writeBatch(bob);batch.set(doc(bob,'pairs',code),{members:['alice','bob'],createdBy:'alice',ts:1});batch.update(doc(bob,'profiles','bob'),{pairId:code});await assertFails(batch.commit());
});
test('uma ligação já aceite não pode ser cancelada pelo fluxo de convites',async()=>{
 const {alice,bob}=await couple();await assert.rejects(actions(alice,'alice',code).cancelInvite(),/já foi aceite/);
 const batch=writeBatch(alice);batch.update(doc(alice,'pairs',code),{revoked:true});batch.update(doc(alice,'profiles','alice'),{pairId:''});await assertFails(batch.commit());
 assert.equal((await getDoc(doc(bob,'pairs',code))).data().members.length,2);
});
test('aceitar um convite inválido conserva o convite pendente anterior',async()=>{
 const alice=await register('alice');const a=actions(alice,'alice',code);await a.createInvite();
 await assert.rejects(a.joinInvite('invalid'));assert.equal((await getDoc(doc(alice,'profiles','alice'))).data().pairId,code);
 await assert.rejects(a.joinInvite(code),/teu convite/);
});

const livePosition=(fields={})=>({latE2:-888,lngE2:1324,cidade:'',pais:'',atualizadoEm:sdk.serverTimestamp(),...fields});
const livePath=(name,uid='alice')=>['pairs',code,name,uid];
function shareLive(store, value, position=livePosition()) {
 const batch=writeBatch(store);
 batch.set(doc(store,...livePath('locationSharing')),{partilha:value});
 if(value)batch.set(doc(store,...livePath('liveLocations')),position);
 else batch.delete(doc(store,...livePath('liveLocations')));
 return batch.commit();
}
test('localização ao vivo exige consentimento atómico, campos exatos e coordenadas inteiras',async()=>{
 const {alice,bob}=await couple();
 const here=doc(alice,...livePath('liveLocations'));
 await assertFails(setDoc(here,livePosition()));
 await assertFails(setDoc(doc(alice,...livePath('locationSharing')),{partilha:true}));
 await assertFails(getDoc(doc(bob,...livePath('liveLocations'))));
 for(const fields of [{latE2:1.5},{lngE2:18001},{latE2:-9001},{altitude:12},{atualizadoEm:sdk.Timestamp.fromMillis(0)}]){
   await assertFails(shareLive(alice,true,livePosition(fields)));
 }
 await assertSucceeds(shareLive(alice,true));
 await assertSucceeds(getDoc(doc(bob,...livePath('liveLocations'))));
 await assertFails(setDoc(doc(alice,...livePath('locationSharing')),{partilha:false}));
 await assertFails(setDoc(doc(bob,...livePath('locationSharing')),{partilha:false}));
 await assertSucceeds(shareLive(alice,false));
 assert.equal((await getDoc(here)).exists(),false);
 await assertFails(getDoc(doc(bob,...livePath('liveLocations'))));
 await assertFails(setDoc(here,livePosition()));
});
test('par revogado perde acesso, mas o próprio pode apagar a posição e a hora',async()=>{
 const {alice,bob}=await couple();
 await shareLive(alice,true);
 const ownClock=doc(alice,...livePath('clocks'));
 await assertSucceeds(setDoc(ownClock,{fuso:'Africa/Luanda'}));
 await assertSucceeds(getDoc(doc(bob,...livePath('clocks'))));
 await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'pairs',code),{revoked:true}));
 await assertFails(getDoc(doc(bob,...livePath('liveLocations'))));
 await assertFails(getDoc(doc(bob,...livePath('clocks'))));
 const cleanup=writeBatch(alice);
 cleanup.set(doc(alice,...livePath('locationSharing')),{partilha:false});
 cleanup.delete(doc(alice,...livePath('liveLocations')));
 cleanup.delete(ownClock);
 await assertSucceeds(cleanup.commit());
 assert.equal((await getDoc(ownClock)).exists(),false);
});

test('datas permitem edição pelos dois e apenas consultas limitadas ao par',async()=>{
 const {alice,bob}=await couple(),third=await register('third');
 const path=['pairs',code,'dates','encontro'];
 const event={tipo:'encontro',titulo:'Reencontro',data:'2027-01-05',anual:false,criadoPor:'alice',atualizadoEm:sdk.serverTimestamp()};
 await assertSucceeds(setDoc(doc(alice,...path),event));
 await assertSucceeds(updateDoc(doc(bob,...path),{titulo:'O nosso encontro',atualizadoEm:sdk.serverTimestamp()}));
 await assertFails(updateDoc(doc(bob,...path),{criadoPor:'bob',atualizadoEm:sdk.serverTimestamp()}));
 await assertFails(updateDoc(doc(bob,...path),{extra:true,atualizadoEm:sdk.serverTimestamp()}));
 await assertFails(getDoc(doc(third,...path)));
 const events=collection(bob,'pairs',code,'dates');
 await assertFails(getDocs(events));
 await assertFails(getDocs(sdk.query(events,sdk.limit(101))));
 await assertSucceeds(getDocs(sdk.query(events,sdk.limit(100))));
 await assertSucceeds(sdk.deleteDoc(doc(bob,...path)));
});
