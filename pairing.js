export function parseInvite(value){
 const text=String(value||'').trim();
 if(/^[a-f0-9]{32}$/i.test(text))return text.toLowerCase();
 try{const url=new URL(text);if(url.protocol==='https:'&&url.hostname==='manuelsampaio.github.io'&&/^\/sully\.loc\/?$/.test(url.pathname))return parseInvite(url.searchParams.get('invite'));}catch{}
 throw new Error('Cola o código de 32 caracteres ou o link de convite da Sully.');
}
const pending=(room,uid)=>room?.createdBy===uid&&room.members?.length===1&&room.members[0]===uid&&!room.revoked;
export function pairingActions({db,sdk,getUid,newCode=()=>crypto.randomUUID().replaceAll('-','')}){
 const identity=()=>{const uid=getUid();if(!uid)throw new Error('Entra na tua conta primeiro.');return uid;};
 return{
  async createInvite(){
   const uid=identity(),code=newCode(),self=sdk.doc(db,'profiles',uid),room=sdk.doc(db,'pairs',code);
   await sdk.runTransaction(db,async t=>{const p=await t.get(self);if(!p.exists())throw new Error('Guarda primeiro o teu perfil.');if(p.data().pairId)throw new Error('Já tens um convite ou uma ligação. Podes cancelar o convite pendente.');t.set(room,{members:[uid],createdBy:uid,ts:Date.now()});t.update(self,{pairId:code});});return code;
  },
  async cancelInvite(){
   const uid=identity(),self=sdk.doc(db,'profiles',uid);
   await sdk.runTransaction(db,async t=>{
    const p=await t.get(self);if(!p.exists()||!p.data().pairId)return;
    const room=sdk.doc(db,'pairs',p.data().pairId),r=await t.get(room);
    if(!r.exists()||!pending(r.data(),uid))throw new Error('Este convite já foi aceite. A ligação não foi cancelada.');
    t.update(room,{revoked:true});t.update(self,{pairId:''});
   });
  },
  async joinInvite(value){
   const uid=identity(),code=parseInvite(value),self=sdk.doc(db,'profiles',uid),room=sdk.doc(db,'pairs',code);
   await sdk.runTransaction(db,async t=>{
    const p=await t.get(self);if(!p.exists())throw new Error('Guarda primeiro o teu perfil.');
    const previous=p.data().pairId;
    if(previous===code)throw new Error('Este é o teu convite. Envia-o ao teu par ou cola o convite que recebeste.');
    const r=await t.get(room);
    let oldRoom=null;
    if(previous){oldRoom=sdk.doc(db,'pairs',previous);const old=await t.get(oldRoom);if(!old.exists()||!pending(old.data(),uid))throw new Error('Já estás ligado a outra conta.');}
    if(!r.exists()||r.data().revoked||r.data().members.length!==1||r.data().members.includes(uid))throw new Error('Este convite foi cancelado ou já foi aceite. Pede um novo código.');
    // All reads precede writes. Replacing two pending invites is one atomic action.
    if(oldRoom)t.update(oldRoom,{revoked:true});
    t.update(room,{members:[...r.data().members,uid]});t.update(self,{pairId:code});
   });
  }
 };
}
