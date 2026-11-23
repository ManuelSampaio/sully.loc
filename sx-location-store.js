export function locationStore({db, f, userId}) {
  const ref = (room, type, uid = userId()) => f.doc(db, 'pairs', room, type, uid);
  const location = value => ({...value, atualizadoEm:f.serverTimestamp()});
  return {
    watch(room, type, uid, data, error) {
      return f.onSnapshot(ref(room, type, uid), {includeMetadataChanges:true},
        snap => { if (!snap.metadata.fromCache) data(snap.exists() ? snap.data() : null); }, error);
    },
    async enable(room, value) {
      const batch = f.writeBatch(db);
      batch.set(ref(room,'locationSharing'), {partilha:true});
      batch.set(ref(room,'liveLocations'), location(value));
      await batch.commit();
    },
    async update(room, value) {
      // Transactions never queue a stale coordinate for later delivery while offline.
      await f.runTransaction(db, async tx => {
        const sharing = await tx.get(ref(room,'locationSharing'));
        if (sharing.data()?.partilha) tx.set(ref(room,'liveLocations'), location(value));
      });
    },
    async revoke(room, {clock = false} = {}) {
      const batch = f.writeBatch(db);
      batch.set(ref(room,'locationSharing'), {partilha:false});
      batch.delete(ref(room,'liveLocations'));
      if (clock) batch.delete(ref(room,'clocks'));
      await batch.commit();
    },
    async updateClock(room, fuso, explicit = false) {
      const clock = ref(room,'clocks');
      await f.runTransaction(db, async tx => {
        const snap = await tx.get(clock);
        if (explicit || (snap.exists() && snap.data().fuso !== fuso)) tx.set(clock,{fuso});
      });
    },
    removeClock(room) { return f.deleteDoc(ref(room,'clocks')); }
  };
}
