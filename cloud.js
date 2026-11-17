// Só é carregado quando o proprietário configura o Firebase.
import { cloudConfig } from './config.js';
export async function connectCloud({ onAuth, onData, onError }) {
  const version = '12.19.0';
  const [appSDK, authSDK, f] = await Promise.all(['app','auth','firestore'].map(name => import(`https://www.gstatic.com/firebasejs/${version}/firebase-${name}.js`)));
  const app = appSDK.initializeApp(cloudConfig.firebase);
  const auth = authSDK.getAuth(app);
  const trusted = localStorage.getItem('sully.trusted') === 'yes';
  const db = f.initializeFirestore(app, {localCache: trusted ? f.persistentLocalCache({tabManager:f.persistentMultipleTabManager()}) : f.memoryLocalCache()});
  let unsubscribers = [];
  let current = null;
  function stop() { unsubscribers.forEach(fn => fn()); unsubscribers=[]; current=null; }
  const authReady = new Promise(resolve => {
    authSDK.onAuthStateChanged(auth, async user => {
      stop();
      if (user && !cloudConfig.members.some(m => m.uid === user.uid)) { await authSDK.signOut(auth); onError(new Error('Esta conta não pertence a este espaço.')); resolve(); return; }
      current = user;
      onAuth(user ? user.uid : null);
      if (user) {
        const watch = (name, count) => {
          const q = f.query(f.collection(db,name),f.orderBy('ts','desc'),f.limit(count));
          unsubscribers.push(f.onSnapshot(q,{includeMetadataChanges:true}, snapshot => onData(name,snapshot.docs.map(d => ({...d.data(),id:d.id,pending:d.metadata.hasPendingWrites}))),onError));
        };
        watch('events',150); watch('moods',180);
        unsubscribers.push(f.onSnapshot(f.collection(db,'members'), snapshot => onData('members',snapshot.docs.map(d=>({...d.data(),id:d.id}))),onError));
      }
      resolve();
    },onError);
  });
  await authReady;
  return {
    async login(email,password,trust) {
      // Persistent cache requires a reload before login so initialization matches the choice.
      if (trust !== trusted) { localStorage.setItem('sully.trusted',trust?'yes':'no'); return {reload:true}; }
      await authSDK.setPersistence(auth,trust ? authSDK.browserLocalPersistence : authSDK.browserSessionPersistence);
      await authSDK.signInWithEmailAndPassword(auth,email,password);
      return {reload:false};
    },
    async logout() {
      stop(); await authSDK.signOut(auth);
      // Shut down Firestore and remove its offline data before returning to the login screen.
      await f.terminate(db);
      try { await f.clearIndexedDbPersistence(db); } catch { onError(new Error('Fecha os outros separadores deste site para limpar todos os dados offline.')); }
      localStorage.removeItem('sully.trusted'); location.reload();
    },
    write(collection,id,data,onAck,onFail) {
      if (!current) throw new Error('Entra na tua conta primeiro.');
      // Firestore queues writes offline; do not await network acknowledgement to update UI.
      f.setDoc(f.doc(db,collection,id),data).then(onAck,onFail);
    }
  };
}
