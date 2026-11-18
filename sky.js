// An illustrative daily cycle using device time, never location.
const palette = [
  [0,'#e8e7ef','#f4f0f3'], [5,'#e8e7ef','#f4f0f3'],
  [6,'#f4e5da','#fcf3e8'], [9,'#e9f0ed','#faf8f1'],
  [14,'#e9f0ed','#faf8f1'], [17,'#efdfd8','#fbede0'],
  [19,'#e8e7ef','#f4f0f3'], [24,'#e8e7ef','#f4f0f3']
];
function blend(a,b,t) {
  const rgb = hex => hex.match(/[a-f0-9]{2}/gi).map(c=>parseInt(c,16));
  const start=rgb(a),end=rgb(b);
  return `rgb(${start.map((c,i)=>Math.round(c+(end[i]-c)*t)).join(',')})`;
}
export function skyState(date=new Date()) {
  const hour=date.getHours()+date.getMinutes()/60+date.getSeconds()/3600;
  const daytime=hour>=6&&hour<18;
  const progress=(daytime?hour-6:(hour+6)%24)/12;
  const phase=daytime?(hour<12?'manha':'tarde'):'noite';
  const upper=palette.findIndex(p=>p[0]>hour),a=palette[upper-1],b=palette[upper];
  const mix=(hour-a[0])/(b[0]-a[0]);
  return {daytime,phase,x:18+324*progress,y:65-45*Math.sin(Math.PI*progress),
    top:blend(a[1],b[1],mix),bottom:blend(a[2],b[2],mix)};
}
export function renderSky(root,date=new Date()) {
  if(!root)return;
  const sky=skyState(date),label={manha:'Manhã',tarde:'Tarde',noite:'Noite'}[sky.phase];
  const time=date.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'});
  root.dataset.phase=sky.phase;
  root.style.setProperty('--sky-top',sky.top);root.style.setProperty('--sky-bottom',sky.bottom);
  root.querySelector('[data-sky-period]').textContent=label;
  const clock=root.querySelector('[data-sky-time]');clock.textContent=time;
  clock.dateTime=`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  root.querySelector('[data-sky-orb]').setAttribute('transform',`translate(${sky.x.toFixed(2)} ${sky.y.toFixed(2)})`);
  root.querySelector('[data-sky-sun]').toggleAttribute('hidden',!sky.daytime);
  root.querySelector('[data-sky-moon]').toggleAttribute('hidden',sky.daytime);
  root.querySelector('svg').setAttribute('aria-label',`${label}, ${time}. ${sky.daytime?'Sol':'Lua'} a acompanhar a hora local.`);
}
