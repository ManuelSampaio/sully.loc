const accents={
  areia:{light:'#765955',dark:'#d4b39f',softLight:'#eee8e2',softDark:'#40332d'},
  salvia:{light:'#426b56',dark:'#a7c3ac',softLight:'#e5eee7',softDark:'#2a3b31'},
  lavanda:{light:'#685588',dark:'#c0b0d9',softLight:'#eee9f4',softDark:'#353043'},
  azul:{light:'#3f6783',dark:'#a6c3da',softLight:'#e7eef4',softDark:'#293641'}
};
export function themeState(preference={},date=new Date()){
  const mode=['auto','light','dark'].includes(preference?.mode)?preference.mode:'auto';
  const accent=Object.hasOwn(accents,preference?.accent)?preference.accent:'areia';
  const hour=date.getHours(),dark=mode==='dark'||(mode==='auto'&&(hour<6||hour>=18));
  return{mode,accent,theme:dark?'dark':'light',colors:accents[accent],periodBackground:hour<12?'#faf9f6':'#f7f3ee'};
}
export function applyTheme(preference,date=new Date()){
  const state=themeState(preference,date),root=document.documentElement;
  root.dataset.theme=state.theme;root.dataset.accent=state.accent;
  root.style.setProperty('--accent',state.colors[state.theme]);
  root.style.setProperty('--selected',state.colors[state.theme==='dark'?'softDark':'softLight']);
  root.style.setProperty('--period-bg',state.periodBackground);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',state.theme==='dark'?'#1b1b1d':state.periodBackground);
  return state;
}
