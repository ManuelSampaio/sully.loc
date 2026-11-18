export const MOODS = [ ['radiante','🥰','Muito bem'], ['bem','😊','Bem'], ['tranquilo','😌','Tranquilo/a'], ['cansado','🥱','Cansado/a'], ['triste','😔','Em baixo'], ['stressado','😵‍💫','Sob stress'] ];
export const QUICK = [
  ['saudades','💌','Tenho saudades tuas','Tenho saudades tuas.'],
  ['preciso','🫶','Preciso de ti','Preciso de ti. Quando puderes, fala comigo.'],
  ['falar','💬','Quero falar contigo','Quero falar contigo. Tens um momento?'],
  ['ligar','📞','Liga-me quando puderes','Liga-me quando puderes.'],
  ['onde','📍','Podes partilhar onde estás?','Podes partilhar onde estás? Só se te sentires à vontade.'],
  ['agua','💧','Lembra-te de beber água','Lembra-te de beber água. Faz uma pequena pausa para ti.']
];
export function dayKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function period(date = new Date()) { return date.getHours() < 12 ? 'manha' : date.getHours() < 18 ? 'tarde' : 'noite'; }
export function effectiveStatus(member, now = Date.now()) { return member?.until && member.until <= now ? 'disponivel' : member?.status || 'sem estado'; }
export function waterAdd(water, day = dayKey()) { return { day, count: (water?.day === day ? water.count : 0) + 1 }; }
export function isDrawing(value) { return typeof value === 'string' && value.length < 180000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value); }
export function validEvent(e) {
  if (!e || typeof e.id !== 'string' || !['text','quick','note','drawing','location'].includes(e.kind) || typeof e.from !== 'string' || !Number.isFinite(e.ts)) return false;
  if (typeof e.text !== 'string' || e.text.length > 2000) return false;
  if (e.kind === 'drawing') return isDrawing(e.image);
  if (e.kind === 'location') return Number.isFinite(e.lat) && Math.abs(e.lat)<=90 && Number.isFinite(e.lng) && Math.abs(e.lng)<=180;
  return true;
}
