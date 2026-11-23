import { locationStore } from './sx-location-store.js';
import { createActivityCursor } from './activity.js';
import { pairingActions } from './pairing.js';
import { mergeMessages, MESSAGE_PAGE_SIZE } from './messages.js';
import { cloudConfig } from './config.js';

// Cada conta tem um perfil. Um convite secreto liga, no máximo, duas contas.
export async function connectCloud({ onAuth, onData, onPair, onError, onActivity=()=>{} }) {
  const version='12.19.0';
  const [appSDK,a,f]=await Promise.all(['app','auth','firestore'].map(name=>import(`https://www.gstatic.com/firebasejs/${version}/firebase-${name}.js`)));
  const app=appSDK.initializeApp(cloudConfig.firebase), auth=a.getAuth(app);
  const trusted=localStorage.getItem('sully.trusted')==='yes';
  const db=f.initializeFirestore(app,{localCache:trusted?f.persistentLocalCache({tabManager:f.persistentMultipleTabManager()}):f.memoryLocalCache()});
  let user=null,profile=null,pairId='',authUnsub=null,roomUnsubs=[],memberUnsubs={},generation=0;
  let profiles={},moods={},states={},locations={},roomEpoch=0,latestEvents=[],olderEvents=[],olderCursor=null,hasMoreEvents=false,loadingOlder=false,historyStarted=false;
  const live = locationStore({db,f,userId:()=>user?.uid});
  const roomToken=()=>`${generation}:${roomEpoch}`;
  const emitEvents=(metadata={})=>onData('events',mergeMessages(olderEvents,latestEvents),{hasMore:hasMoreEvents,...metadata});
  const defaultProfile=(uid,name='Tu')=>({id:uid,name,pairId:'',sharing:{mood:false,status:false,location:false},ts:Date.now()});
  const emitProfiles=()=>onData('profiles',Object.values(profiles));
  function clearMember(uid){(memberUnsubs[uid]||[]).forEach(fn=>fn());delete memberUnsubs[uid];delete moods[uid];delete states[uid];delete locations[uid];}
  function emitPrivate(){onData('moods',Object.values(moods).flat());onData('members',Object.values(states));onData('locations',Object.values(locations));}
  function stopRoom(){roomEpoch++;latestEvents=[];olderEvents=[];olderCursor=null;hasMoreEvents=false;loadingOlder=false;historyStarted=false;roomUnsubs.forEach(fn=>fn());roomUnsubs=[];Object.keys(memberUnsubs).forEach(clearMember);moods={};states={};locations={};pairId='';onData('events',[],{reset:true});emitPrivate();}
  function watchPrivate(p,room,token){
    clearMember(p.id);memberUnsubs[p.id]=[];emitPrivate();
    const allow=key=>p.id===user?.uid||p.sharing?.[key]===true;
    const watch=(path,cb)=>memberUnsubs[p.id].push(f.onSnapshot(path,{includeMetadataChanges:true},snap=>{if(token===roomToken())cb(snap);},error=>{if(error.code==='permission-denied'){delete moods[p.id];delete states[p.id];delete locations[p.id];emitPrivate();}else onError(error);}));
    const activity={mood:createActivityCursor(),status:createActivityCursor(),location:createActivityCursor()};
    const arrived=(type,rows,snapshot)=>{for(const row of activity[type].consume(rows,{fromCache:snapshot.metadata.fromCache}))if(p.id!==user?.uid)onActivity({type,from:p.id,id:row.id,ts:row.ts});};
    if(allow('mood'))watch(f.query(f.collection(db,'pairs',room,'moods',p.id,'entries'),f.orderBy('ts','desc'),f.limit(90)),s=>{moods[p.id]=s.docs.map(d=>({...d.data(),id:d.id,pending:d.metadata.hasPendingWrites}));emitPrivate();arrived('mood',moods[p.id],s);});
    if(allow('status'))watch(f.doc(db,'pairs',room,'states',p.id),s=>{if(s.exists())states[p.id]={...s.data(),id:p.id,pending:s.metadata.hasPendingWrites};else delete states[p.id];emitPrivate();arrived('status',states[p.id]?[states[p.id]]:[],s);});
    if(allow('location'))watch(f.doc(db,'pairs',room,'locations',p.id),s=>{if(s.exists())locations[p.id]={...s.data(),id:p.id};else delete locations[p.id];emitPrivate();arrived('location',locations[p.id]?[locations[p.id]]:[],s);});
  }
  function startRoom(nextId){
    stopRoom();pairId=nextId;const token=roomToken();
    if(!nextId){onPair(null);return;}
    let wasLinked = false;
    roomUnsubs.push(f.onSnapshot(f.doc(db,'pairs',nextId),s=>{
      if(token!==roomToken())return;
      if(!s.exists()&&s.metadata.fromCache)return;
      if(!s.exists()||s.data().revoked||(wasLinked&&s.data().members.length!==2)){
        if(user && pairId) live.revoke(pairId,{clock:true}).catch(onError);
        stopRoom();onPair(null);return;
      }
      const pair=s.data();
      wasLinked ||= pair.members.length===2;
      onPair({id:nextId,...pair});
      for(const uid of pair.members){
        if(profiles[uid]?._watching)continue;
        profiles[uid]={...profiles[uid],id:uid,_watching:true};
        roomUnsubs.push(f.onSnapshot(f.doc(db,'profiles',uid),ps=>{
          if(token!==roomToken()||!ps.exists())return;
          const p={...ps.data(),id:uid,_watching:true};profiles[uid]=p;
          if(uid===user?.uid)profile=p;
          emitProfiles();watchPrivate(p,nextId,token);
        },onError));
      }
    },error=>{
      if(token===roomToken()&&error.code==='permission-denied'){
        if(user&&pairId) live.revoke(pairId,{clock:true}).catch(onError);
        stopRoom();onPair(null);
      }else onError(error);
    }));
    let eventsReady=false;
    roomUnsubs.push(f.onSnapshot(f.query(f.collection(db,'pairs',nextId,'events'),f.orderBy('ts','desc'),f.limit(MESSAGE_PAGE_SIZE)),{includeMetadataChanges:true},s=>{
      if(token===roomToken()){
        const rows=s.docs.map(d=>({...d.data(),id:d.id,pending:d.metadata.hasPendingWrites}));
        if(rows.length===MESSAGE_PAGE_SIZE){const ids=new Set(rows.map(r=>r.id)),oldest=rows.at(-1).ts;olderEvents=mergeMessages(olderEvents,latestEvents.filter(r=>!ids.has(r.id)&&!r.pending&&r.ts<=oldest));}
        latestEvents=rows;if(!historyStarted){olderCursor=s.docs.at(-1)||null;hasMoreEvents=s.size===MESSAGE_PAGE_SIZE;}
        emitEvents({baseline:!eventsReady});if(!s.metadata.fromCache)eventsReady=true;
      }
    },onError));
  }
  // One timestamp per account. A closed or hidden page ages out automatically.
  let nextPresenceAt = 0;
  function recordPresence() {
    if (!user || document.hidden || !navigator.onLine || Date.now() < nextPresenceAt) return;
    nextPresenceAt = Date.now() + 120000;
    // REST avoids queuing a stale presence write during an offline session.
    const active = user;
    active.getIdToken().then(token => {
      if (active !== user || document.hidden) return;
      const root = `projects/${cloudConfig.firebase.projectId}/databases/(default)/documents`;
      return fetch(`https://firestore.googleapis.com/v1/${root}:commit`, {
        method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type':'application/json'},
        body: JSON.stringify({writes:[{transform:{document: `${root}/presence/${active.uid}`,
          fieldTransforms:[{fieldPath:'seenAt',setToServerValue:'REQUEST_TIME'}]}}]})
      });
    }).catch(() => {});
  }
  document.addEventListener('visibilitychange',recordPresence);
  window.addEventListener('online',recordPresence);
  setInterval(recordPresence,60000);
  const ready=new Promise(resolve=>a.onAuthStateChanged(auth,next=>{
    generation++;authUnsub?.();stopRoom();user=next;profile=null;profiles={};onPair(null);onAuth(next?.uid||null);emitProfiles();
    nextPresenceAt=0;recordPresence();
    if(next){const token=generation;authUnsub=f.onSnapshot(f.doc(db,'profiles',next.uid),s=>{
      if(token!==generation)return;
      profile=s.exists()?{...s.data(),id:next.uid}:defaultProfile(next.uid,next.displayName||'Tu');
      profiles[next.uid]={...profile,_watching:profiles[next.uid]?._watching||false};emitProfiles();
      if(profile.pairId!==pairId){
        if(pairId)live.revoke(pairId,{clock:true}).catch(onError);
        profiles={[next.uid]:profile};startRoom(profile.pairId);}
    },onError);}
    resolve();
  },error=>{onError(error);resolve();}));
  await ready;
  function needUser(){if(!user)throw new Error('Entra na tua conta primeiro.');}
  async function persistence(trust){localStorage.setItem('sully.trusted',trust?'yes':'no');await a.setPersistence(auth,trust?a.browserLocalPersistence:a.browserSessionPersistence);return true;}
  return {
    live,
    async getToken(expectedUid){needUser();const active=user;if(active.uid!==expectedUid)throw new Error('A conta mudou.');const token=await active.getIdToken();if(user!==active)throw new Error('A conta mudou.');return token;},
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
    ...pairingActions({db,sdk:f,getUid:()=>user?.uid}),
    async loadOlder(){
      needUser();if(!pairId||!hasMoreEvents||!olderCursor||loadingOlder)return;
      loadingOlder=true;const token=roomToken(),cursor=olderCursor,room=pairId;historyStarted=true;
      try{const page=await f.getDocs(f.query(f.collection(db,'pairs',room,'events'),f.orderBy('ts','desc'),f.startAfter(cursor),f.limit(MESSAGE_PAGE_SIZE)));
        if(token!==roomToken())return;
        olderEvents=mergeMessages(olderEvents,page.docs.map(d=>({...d.data(),id:d.id,pending:d.metadata.hasPendingWrites})));olderCursor=page.docs.at(-1)||cursor;hasMoreEvents=page.size===MESSAGE_PAGE_SIZE;emitEvents({history:true});
      }finally{if(token===roomToken())loadingOlder=false;}
    },
    async retryEvent(event,onAck,onFail){
      needUser();const uid=user.uid,room=pairId;if(!room)throw new Error('Liga primeiro as duas contas.');
      try{const ref=f.doc(db,'pairs',room,'events',event.id),snap=await f.getDocFromServer(ref);if(user?.uid!==uid||room!==pairId)return;
       if(snap.exists()){if(snap.data().from!==uid)throw new Error('Esta mensagem não pertence à tua conta.');onAck();}else{const {failed,pending,...content}=event;await f.setDoc(ref,content).then(onAck,onFail);}
      }catch(error){onFail(error);}
    },
    async logout(){generation++;authUnsub?.();stopRoom();await a.signOut(auth);await f.terminate(db);try{await f.clearIndexedDbPersistence(db);}catch{onError(new Error('Fecha os outros separadores para limpar a cache offline.'));}localStorage.removeItem('sully.trusted');location.reload();},
    write(collection,id,data,onAck,onFail){
      needUser();if(!pairId)throw new Error('Liga primeiro o teu perfil ao teu par, no Perfil.');
      let ref;
      if(collection==='members')ref=f.doc(db,'pairs',pairId,'states',user.uid);
      else if(collection==='moods')ref=f.doc(db,'pairs',pairId,'moods',user.uid,'entries',id);
      else if(collection==='locations'){if(!profile?.sharing.location)throw new Error('Ativa primeiro a partilha de localização no Perfil.');ref=f.doc(db,'pairs',pairId,'locations',user.uid);data={...data,id:user.uid};}
      else ref=f.doc(db,'pairs',pairId,'events',id);
      f.setDoc(ref,data).then(onAck,onFail);
    }
  };
}
