export const ACTIVITY_TYPES=['mood','status','location'];
export const noticeText={message:'Tens uma nova mensagem.',quick:'Recebeste um toque do teu par.',note:'O teu par partilhou uma nota.',drawing:'O teu par enviou um desenho.',mood:'O teu par partilhou ou atualizou um check-in.',status:'O teu par atualizou o estado.',location:'O teu par partilhou a localização.'};
export function activityRequest(type,id,revision){
 if(!ACTIVITY_TYPES.includes(type)||typeof id!=='string'||!id||id.length>200||id.includes('/')||!Number.isFinite(revision))throw new Error('Atividade inválida.');
 return {activity:{type,id,revision}};
}
// One cursor per private stream. Initial data and re-enabled sharing are not arrivals.
export function createActivityCursor(now=()=>Date.now()){
 let ready=false;const versions=new Map();
 return {consume(rows,{fromCache=false}={}){
  const fresh=[];
  for(const row of rows){const previous=versions.get(row.id);versions.set(row.id,row.ts);if(ready&&!fromCache&&!row.pending&&previous!==row.ts&&Number.isFinite(row.ts)&&row.ts>=now()-300000&&row.ts<=now()+30000)fresh.push(row);}
  ready=true;return fresh;
 }};
}
