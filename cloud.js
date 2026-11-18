import { cloudConfig } from './config.js';

// Cada conta tem um perfil. Um convite secreto liga, no máximo, duas contas.
export async function connectCloud({ onAuth, onData, onPair, onError }) {
  const version='12.19.0';
  const [appSDK,a,f]=await Promise.all(['app','auth','firestore'].map(name=>import(`https://www.gstatic.com/firebasejs/${version}/firebase-${name}.js`)));
  const app=appSDK.initializeApp(cloudConfig.firebase), auth=a.getAuth(app);
  const trusted=localStorage.getItem('sully.trusted')==='yes';
  const db=f.initializeFirestore(app,{localCache:trusted?f.persistentLocalCache({tabManager:f.persistentMultipleTabManager()}):f.memoryLocalCache()});
  let user=null,profile=null,pairId='',authUnsub=null,roomUnsubs=[],memberUnsubs={},generation=0;
  let profiles={},moods={},states={},locations={};
  const defaultProfile=(uid,name='Tu')=>({id:uid,name,pairId:'',sharing:{mood:false,status:false,location:false},ts:Date.now()});
  const emitProfiles=()=>onData('profiles',Object.values(profiles));
  function clearMember(uid){(memberUnsubs[uid]||[]).forEach(fn=>fn());delete memberUnsubs[uid];delete moods[uid];delete states[uid];delete locations[uid];}
  function emitPrivate(){onData('moods',Object.values(moods).flat());onData('members',Object.values(states));onData('locations',Object.values(locations));}
  function stopRoom(){roomUnsubs.forEach(fn=>fn());roomUnsubs=[];Object.keys(memberUnsubs).forEach(clearMember);moods={};states={};locations={};pairId='';onData('events',[],{reset:true});emitPrivate();}
  function watchPrivate(p,room,token){
    clearMember(p.id);memberUnsubs[p.id]=[];emitPrivate();
    const allow=key=>p.id===user?.uid||p.sharing?.[key]===true;
    const watch=(path,cb)=>memberUnsubs[p.id].push(f.onSnapshot(path,{includeMetadataChanges:true},snap=>{if(token===generation)cb(snap);},error=>{if(error.code==='permission-denied'){delete moods[p.id];delete states[p.id];delete locations[p.id];emitPrivate();}else onError(error);}));
    if(allow('mood'))watch(f.query(f.collection(db,'pairs',room,'moods',p.id,'entries'),f.orderBy('ts','desc'),f.limit(90)),s=>{moods[p.id]=s.docs.map(d=>({...d.data(),id:d.id,pending:d.metadata.hasPendingWrites}));emitPrivate();});
    if(allow('status'))watch(f.doc(db,'pairs',room,'states',p.id),s=>{if(s.exists())states[p.id]={...s.data(),id:p.id};else delete states[p.id];emitPrivate();});
    if(allow('location'))watch(f.doc(db,'pairs',room,'locations',p.id),s=>{if(s.exists())locations[p.id]={...s.data(),id:p.id};else delete locations[p.id];emitPrivate();});
  }
  function startRoom(nextId){
    stopRoom();pairId=nextId;const token=generation;
    if(!nextId){onPair(null);return;}
    roomUnsubs.push(f.onSnapshot(f.doc(db,'pairs',nextId),s=>{
      if(token!==generation||!s.exists())return;
      const pair=s.data();onPair({id:nextId,...pair});
      for(const uid of pair.members){
        if(profiles[uid]?._watching)continue;
        profiles[uid]={...profiles[uid],id:uid,_watching:true};
        roomUnsubs.push(f.onSnapshot(f.doc(db,'profiles',uid),ps=>{
          if(token!==generation||!ps.exists())return;
          const p={...ps.data(),id:uid,_watching:true};profiles[uid]=p;
          if(uid===user?.uid)profile=p;
          emitProfiles();watchPrivate(p,nextId,token);
        },onError));
      }
    },onError));
    let eventsReady=false;
    roomUnsubs.push(f.onSnapshot(f.query(f.collection(db,'pairs',nextId,'events'),f.orderBy('ts','desc'),f.limit(150)),{includeMetadataChanges:true},s=>{
      if(token===generation){onData('events',s.docs.map(d=>({...d.data(),id:d.id,pending:d.metadata.hasPendingWrites})),{baseline:!eventsReady});if(!s.metadata.fromCache)eventsReady=true;}
    },onError));
  }
  const ready=new Promise(resolve=>a.onAuthStateChanged(auth,next=>{
    generation++;authUnsub?.();stopRoom();user=next;profile=null;profiles={};onPair(null);onAuth(next?.uid||null);emitProfiles();
    if(next){const token=generation;authUnsub=f.onSnapshot(f.doc(db,'profiles',next.uid),s=>{
      if(token!==generation)return;
      profile=s.exists()?{...s.data(),id:next.uid}:defaultProfile(next.uid,next.displayName||'Tu');
      profiles[next.uid]={...profile,_watching:profiles[next.uid]?._watching||false};emitProfiles();
      if(profile.pairId!==pairId){profiles={[next.uid]:profile};startRoom(profile.pairId);}
    },onError);}
    resolve();
  },error=>{onError(error);resolve();}));
  await ready;
  function needUser(){if(!user)throw new Error('Entra na tua conta primeiro.');}
  async function persistence(trust){localStorage.setItem('sully.trusted',trust?'yes':'no');await a.setPersistence(auth,trust?a.browserLocalPersistence:a.browserSessionPersistence);return true;}
  return {
    async login(email,password,trust){if(!await persistence(trust))return{reload:true};await a.signInWithEmailAndPassword(auth,email,password);return{reload:false};},
    async signup(name,email,password,trust){
      if(!await persistence(trust))return{reload:true};
      const result=await a.createUserWithEmailAndPassword(auth,email,password);
      await a.updateProfile(result.user,{displayName:name});
      await f.setDoc(f.doc(db,'profiles',result.user.uid),defaultProfile(result.user.uid,name));
      return{reload:false};
    },
    async resetPassword(email){await a.sendPasswordResetEmail(auth,email);},
    async saveProfile(name,sharing){needUser();const next={id:user.uid,name,pairId:profile?.pairId||'',sharing,ts:Date.now()};await f.setDoc(f.doc(db,'profiles',user.uid),next);},
    async createInvite(){
      needUser();const code=crypto.randomUUID().replaceAll('-','');
      const self=f.doc(db,'profiles',user.uid),room=f.doc(db,'pairs',code);
      await f.runTransaction(db,async t=>{const p=await t.get(self);if(!p.exists())throw new Error('Guarda primeiro o teu perfil.');if(p.data().pairId)throw new Error('Já tens um espaço ligado.');t.set(room,{members:[user.uid],createdBy:user.uid,ts:Date.now()});t.update(self,{pairId:code});});
      return code;
    },
    async joinInvite(code){
      needUser();if(!/^[a-f0-9]{32}$/.test(code))throw new Error('O código do convite não é válido.');
      const self=f.doc(db,'profiles',user.uid),room=f.doc(db,'pairs',code);
      await f.runTransaction(db,async t=>{const p=await t.get(self);const r=await t.get(room);if(!p.exists())throw new Error('Guarda primeiro o teu perfil.');if(p.data().pairId)throw new Error('Já tens um espaço ligado.');if(!r.exists()||r.data().members.length!==1||r.data().members.includes(user.uid))throw new Error('Este convite não está disponível.');t.update(room,{members:[...r.data().members,user.uid]});t.update(self,{pairId:code});});
    },
    async logout(){generation++;authUnsub?.();stopRoom();await a.signOut(auth);await f.terminate(db);try{await f.clearIndexedDbPersistence(db);}catch{onError(new Error('Fecha os outros separadores para limpar a cache offline.'));}localStorage.removeItem('sully.trusted');location.reload();},
    write(collection,id,data,onAck,onFail){
      needUser();if(!pairId)throw new Error('Liga primeiro o teu perfil ao teu par, em Ajustes.');
      let ref;
      if(collection==='members')ref=f.doc(db,'pairs',pairId,'states',user.uid);
      else if(collection==='moods')ref=f.doc(db,'pairs',pairId,'moods',user.uid,'entries',id);
      else if(collection==='locations'){if(!profile?.sharing.location)throw new Error('Ativa primeiro a partilha de localização em Ajustes.');ref=f.doc(db,'pairs',pairId,'locations',user.uid);data={...data,id:user.uid};}
      else ref=f.doc(db,'pairs',pairId,'events',id);
      f.setDoc(ref,data).then(onAck,onFail);
    }
  };
}
