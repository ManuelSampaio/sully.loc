// Original inline SVG icons: no downloads, fonts or third-party scripts.
const face = '<circle cx="12" cy="12" r="9"/>';
const paths = {
  radiante: face + '<path d="m7 8 1 1 1-1m6 0 1 1 1-1M7.5 12h9a4.5 4.5 0 0 1-9 0Z"/>',
  bem: face + '<path d="M8 9h.01M16 9h.01M8 13a4 4 0 0 0 8 0"/>',
  tranquilo: face + '<path d="M6.5 9.5q1.5 2 3 0m5 0q1.5 2 3 0M9 15q3 1.5 6 0"/>',
  cansado: face + '<path d="M6.5 10h3m5 0h3"/><ellipse cx="12" cy="15" rx="1.5" ry="2"/>',
  triste: face + '<path d="M8 9h.01M16 9h.01M8 16a4 4 0 0 1 8 0"/>',
  stressado: face + '<path d="m6.5 7.5 3 1m5 0 3-1M8 11h.01M16 11h.01M7.5 16l2-1 2 1 2-1 3 1"/>',
  heart: '<path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z"/>',
  hands: '<path d="m2 12 4-7 4 2m12 5-4-7-4 2M5 14l5 5q2 2 4 0l5-5M8 8l3-2q1-1 3 0l4 3-4 5-3-2-2 2-3-3M10 16l3 3m0-6 4 4"/>',
  chat: '<path d="M21 11a9 9 0 0 1-9 9H4l-2 2v-10a10 10 0 0 1 19-1Z"/><path d="M7 10h10M7 14h6"/>',
  phone: '<path d="m8 3 3 5-3 3q2 4 5 5l3-3 5 3-1 4c-9 3-19-7-17-15l1-2Z"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  drop: '<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/><path d="M9 16a3 3 0 0 0 3 3"/>',
  sunrise: '<path d="M3 18h18M6 15a6 6 0 0 1 12 0M12 3v3M3 9l2 2m14 0 2-2M2 15h2m16 0h2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/>',
  leaf: '<path d="M20 3C8 2 2 10 6 17s16 4 14-14ZM4 21l11-11"/>',
  cup: '<path d="M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM16 9h2a3 3 0 0 1 0 6h-2M7 2v3m6-3v3"/>',
  cloud: '<path d="M6 19a4 4 0 0 1-1-8 7 7 0 0 1 13-1 4.5 4.5 0 0 1 0 9Z"/>',
  home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
  pencil: '<path d="m15 4 5 5M4 20l1-6L17 2l5 5-12 12Z"/>',
  history: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6m3-4v6l4 2"/>',
  arrow: '<path d="M6 18 18 6M6 6h12v12"/>',
  down: '<path d="m6 9 6 6 6-6"/>'
};
const aliases = {saudades:'heart',preciso:'hands',falar:'chat',ligar:'phone',onde:'pin',agua:'drop'};

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  for (const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'20',height:'20',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'s-icon'})) svg.setAttribute(key,value);
  svg.innerHTML = paths[aliases[name] || name] || paths.heart;
  return svg;
}

export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(node => node.replaceWith(icon(node.dataset.icon)));
}
