export const MOODS = [ ['radiante','🥰','Muito bem'], ['bem','😊','Bem'], ['tranquilo','😌','Tranquilo/a'], ['cansado','🥱','Cansado/a'], ['triste','😔','Em baixo'], ['stressado','😵‍💫','Sob stress'] ];
// Original mood IDs remain readable and editable for existing check-ins.
MOODS.push(['energia','','Com energia'],['sono','','Com sono'],['foco','','Com foco'],['paz','','Em paz'],['grato','','Grato/a'],['exausto','','Exausto/a']);
export const MOOD_PERIODS = {
  manha:{question:'Como acordaste?',prompt:'O que esperas de hoje?',ids:['energia','bem','tranquilo','sono','triste','stressado']},
  tarde:{question:'Como está a correr o teu dia?',prompt:'Queres contar como está a correr?',ids:['foco','bem','tranquilo','cansado','triste','stressado']},
  noite:{question:'Como terminou o teu dia?',prompt:'Queres contar como foi o teu dia?',ids:['paz','bem','grato','exausto','triste','stressado']}
};
export function moodsForPeriod(value,previousMood) {
  const ids=[...(MOOD_PERIODS[value]||MOOD_PERIODS.manha).ids];
  if(previousMood&&!ids.includes(previousMood)&&MOODS.some(m=>m[0]===previousMood))ids.push(previousMood);
  return ids.map(id=>MOODS.find(m=>m[0]===id));
}
export const QUICK = [
  ['saudades','💌','Tenho saudades tuas','Tenho saudades tuas.'],
  ['preciso','🫶','Preciso de ti','Preciso de ti. Quando puderes, fala comigo.'],
  ['falar','💬','Quero falar contigo','Quero falar contigo. Tens um momento?'],
  ['ligar','📞','Liga-me quando puderes','Liga-me quando puderes.'],
  ['onde','📍','Podes partilhar onde estás?','Podes partilhar onde estás? Só se te sentires à vontade.'],
  ['agua','💧','Lembra-te de beber água','Lembra-te de beber água. Faz uma pequena pausa para ti.']
];
export function dayKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function period(date = new Date()) { const h=date.getHours();return h>=6&&h<12?'manha':h>=12&&h<18?'tarde':'noite'; }
export const STATUS_LIFETIME = 24 * 60 * 60 * 1000;
export function statusExpiry(state) {
  const daily = Number.isFinite(state?.ts) ? state.ts + STATUS_LIFETIME : 0;
  const explicit = Number(state?.until);
  if (explicit > 0) return daily ? Math.min(explicit, daily) : explicit;
  return daily;
}
export function effectiveStatus(state, now = Date.now()) {
  return statusExpiry(state) > now ? state.status : 'sem estado';
}
export function waterAdd(water, day = dayKey()) { return { day, count: (water?.day === day ? water.count : 0) + 1 }; }
export function isDrawing(value) { return typeof value === 'string' && value.length < 180000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value); }
export function validEvent(e) {
  if (!e || typeof e.id !== 'string' || !['text','quick','note','drawing','location'].includes(e.kind) || typeof e.from !== 'string' || !Number.isFinite(e.ts)) return false;
  if (typeof e.text !== 'string' || e.text.length > 2000) return false;
  if (e.kind === 'drawing') return isDrawing(e.image);
  if (e.kind === 'location') return Number.isFinite(e.lat) && Math.abs(e.lat)<=90 && Number.isFinite(e.lng) && Math.abs(e.lng)<=180;
  return true;
}
