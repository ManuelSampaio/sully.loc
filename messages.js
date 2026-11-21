export const MESSAGE_PAGE_SIZE=40;
export const MESSAGE_LIMIT=2000;
export function mergeMessages(...pages){
 const map=new Map();for(const page of pages)for(const row of page||[]){if(row?.id)map.set(row.id,{...map.get(row.id),...row});}
 return [...map.values()].sort((a,b)=>a.ts-b.ts||a.id.localeCompare(b.id));
}
export function messageState(event,cloud=true){return !cloud?'Neste navegador':event.failed?'Não enviada':event.pending?'A enviar…':'Enviada';}
export function draftKey(uid,pair){return uid&&pair?`sully.draft.${uid}.${pair}`:'';}
export function createDraftStore(storage){
 return{
  read(uid,pair){try{return(storage.getItem(draftKey(uid,pair))||'').slice(0,MESSAGE_LIMIT);}catch{return'';}},
  write(uid,pair,text){const key=draftKey(uid,pair);if(!key)return;try{text?storage.setItem(key,text.slice(0,MESSAGE_LIMIT)):storage.removeItem(key);}catch{}},
  clear(uid){try{for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith(`sully.draft.${uid}.`))storage.removeItem(key);}}catch{}}
 };
}
