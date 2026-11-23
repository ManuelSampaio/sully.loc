export function dateStore({db, f, userId}) {
  const getCollection = room => f.collection(db,'pairs',room,'dates');
  return {
    watch(room, onRows, onError) {
      const collection = getCollection(room);
      const pages = [];
      let stopped = false;
      function discardFrom(index) {
        for (const page of pages.splice(index)) page.stop();
      }
      function listen(index, after) {
        const page = {rows:[], cursor:undefined};
        const orders = [f.orderBy(f.documentId()),f.limit(100)];
        if (after) orders.push(f.startAfter(after));
        pages.push(page);
        page.stop = f.onSnapshot(f.query(collection,...orders), snapshot => {
          if (stopped || pages[index] !== page) return;
          page.rows = snapshot.docs.map(d => ({...d.data(),id:d.id}));
          const cursor = page.rows.length === 100 ? page.rows.at(-1).id : undefined;
          if (page.cursor !== cursor) {
            page.cursor = cursor;
            discardFrom(index+1);
            if (cursor) listen(index+1,cursor);
          }
          onRows(pages.flatMap(item => item.rows));
        }, error => {
          if (stopped || pages[index] !== page) return;
          discardFrom(index);
          onError(error);
        });
      }
      listen(0);
      return () => { stopped = true; discardFrom(0); };
    },
    save(room, event) {
      const {id,tipo,titulo,data,anual} = event;
      const fields = {tipo,titulo,data,anual,atualizadoEm:f.serverTimestamp()};
      const collection = getCollection(room);
      return id ? f.updateDoc(f.doc(collection,id),fields)
        : f.addDoc(collection,{...fields,criadoPor:userId()});
    },
    remove(room,id) { return f.deleteDoc(f.doc(getCollection(room),id)); }
  };
}
