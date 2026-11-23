const day = 86400000;
const rad = Math.PI / 18000; // Coordinates are stored in hundredths of a degree.

export function distanceKm(a, b) {
  const x = Math.sin((b.latE2 - a.latE2) * rad / 2) ** 2 +
    Math.cos(a.latE2 * rad) * Math.cos(b.latE2 * rad) *
    Math.sin((b.lngE2 - a.lngE2) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, x)));
}

function cityNear(cities, position) {
  let closest, km = Infinity;
  for (const [city, country, iso, latE2, lngE2] of cities) {
    const distance = distanceKm(position, {latE2,lngE2});
    if (distance < km) {
      closest = {city,country,iso};
      km = distance;
    }
  }
  if (!closest || km > 300) return {cidade:'',pais:''};
  let pais = closest.country;
  try { pais = new Intl.DisplayNames(['pt'], {type:'region'}).of(closest.iso) || pais; } catch { /* Dataset fallback. */ }
  return {cidade:closest.city.slice(0,80),pais:pais.slice(0,56)};
}

function currentPosition() {
  return new Promise((resolve,reject) => navigator.geolocation
    ? navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,maximumAge:120000,timeout:15000})
    : reject(new Error('Este dispositivo não disponibiliza a localização.')));
}

export function configureLocation() {
  const q = value => document.querySelector(value);
  const consent = q('#sx-location-consent');
  const enable = q('#sx-location-enable');
  const disable = q('#sx-location-disable');
  const feedback = q('#sx-location-feedback');
  const clock = q('#sx-clock');
  const customCity = q('#sx-city');
  const customCountry = q('#sx-country');
  const indicator = q('#sx-sharing-indicator');
  const meter = document.createElement('div');
  meter.className = 'sx-live-meter';
  meter.innerHTML = '<div class="sx-live-line" aria-hidden="true"><span></span><span></span></div><p class="sx-live-distance"></p><p class="sx-live-age"></p>';
  q('#page-home .sx-distance').prepend(meter);
  const line = meter.firstElementChild;
  const distanceText = meter.querySelector('.sx-live-distance');
  const ageText = meter.querySelector('.sx-live-age');
  let live, room, uid, partner;
  let ownSharing, partnerSharing, own, other, otherClock, clockOn;
  let lastPublished, lastTime = 0, suspending = false;
  let revision = 0, active = false, busy = false, watchId, sending = false;
  let profileStops = [], todayStops = [], stopPartner, lastToday, cities, cityCache;
  const displayKm = new Intl.NumberFormat('pt-PT');
  function show() {
    enable.disabled = busy || !room || ownSharing === undefined;
    enable.hidden = ownSharing === true;
    disable.hidden = ownSharing !== true;
    disable.disabled = busy;
    customCity.disabled = customCountry.disabled = !room;
    clock.disabled = !room || clockOn === undefined;
    clock.checked = clockOn === true;
    indicator.hidden = !active || document.hidden || !room;
    const now = Date.now();
    const otherAge = other ? now - other.atualizadoEm?.toMillis() : NaN;
    const ownAge = own ? now - own.atualizadoEm?.toMillis() : NaN;
    const current = ownSharing && partnerSharing && ownAge < day && otherAge < day;
    const km = current ? distanceKm(own,other) : undefined;
    line.classList.toggle('sx-live-known', km !== undefined);
    line.style.setProperty('--sx-meter-width', km === undefined ? '100%' : km < 1 ? '0%'
      : Math.max(12, Math.log10(1 + km) / Math.log10(20001) * 100) + '%');
    const initials = [q('#avatar').textContent, q('#partner-name').textContent];
    line.querySelectorAll('span').forEach((el,i) => { el.textContent = [...initials[i].trim()][0]?.toUpperCase() || '·'; });
    const place = position => [position?.cidade,position?.pais].filter(Boolean).join(', ');
    const route = [place(own),place(other)].filter(Boolean).join(' → ');
    distanceText.textContent = km !== undefined
      ? (km < 1 ? 'Estão no mesmo sítio' : displayKm.format(km > 100 ? Math.round(km/10)*10 : Math.round(km)) + ' km') + (route ? ' · ' + route : '')
      : !ownSharing ? 'Ativa a localização no Perfil para ver a distância.'
      : !partnerSharing ? 'O teu par ainda não partilha a localização.'
      : 'Distância atual indisponível.';
    const age = ms => ms >= day ? `${Math.floor(ms/day)} d` : ms >= 3600000
      ? `${Math.floor(ms/3600000)} h` : `${Math.max(1,Math.floor(ms/60000))} min`;
    ageText.textContent = partnerSharing && other
      ? (otherAge >= day ? 'Última localização há ' + age(otherAge)
        : otherAge >= 600000 ? 'Localização atualizada há ' + age(otherAge) : 'O teu par partilha a localização')
        + (!current && place(other) ? ' · perto de ' + place(other) : '')
        + (ownSharing && ownAge >= 600000 ? ' · a tua: ' + (ownAge >= day ? 'última localização há ' : 'atualizada há ') + age(ownAge) : '')
      : '';
    ageText.hidden = !ageText.textContent;
    const time = q('.sx-partner-clock');
    if (time) {
      time.hidden = true;
      if (otherClock && lastToday) {
        try {
          const text = new Intl.DateTimeFormat('pt-PT',{hour:'2-digit',minute:'2-digit',timeZone:otherClock}).format();
          time.textContent = text + ' onde o teu par está.';
          time.hidden = false;
        } catch { /* Unknown time zone. */ }
      }
    }
  }
  function stopWatch() {
    if (watchId !== undefined) navigator.geolocation?.clearWatch(watchId);
    watchId = undefined;
  }
  function stopToday() {
    todayStops.forEach(stop => stop());
    todayStops = [];
    stopPartner?.(); stopPartner = undefined;
    own = other = otherClock = undefined; partnerSharing = false;
  }
  function problem(error) {
    const messages = {1:'A localização ficou desativada porque a permissão foi recusada.',
      2:'O telemóvel não conseguiu obter a localização.',
      3:'A localização demorou demasiado. Podes tentar noutra altura.'};
    feedback.textContent = messages[error.code] || 'Não foi possível atualizar a partilha. Verifica a ligação e tenta de novo.';
  }
  async function coordinate(coords, dataset) {
    const position = {latE2:Math.round(coords.latitude*100),lngE2:Math.round(coords.longitude*100)};
    if (!cityCache || distanceKm(cityCache.position,position) >= 5) {
      cityCache = {position,...cityNear(dataset,position)};
    }
    return {...position, cidade:customCity.value.trim() || cityCache.cidade,
      pais:customCountry.value.trim() || cityCache.pais};
  }
  function loadCities() {
    cities ||= fetch('./sx-cities.json').then(response => {
      if (!response.ok) throw new Error('Lista de cidades indisponível.');
      return response.json();
    }).catch(() => { cities = undefined; return []; });
    return cities;
  }
  function startWatch() {
    if (!active || ownSharing !== true || document.hidden || !navigator.onLine || watchId !== undefined) return;
    const epoch = revision, sharingRoom = room;
    watchId = navigator.geolocation.watchPosition(async sample => {
      if (revision !== epoch || !active || document.hidden || sending) return;
      sending = true;
      try {
        const value = await coordinate(sample.coords,await loadCities());
        if (revision !== epoch || !active || document.hidden || !navigator.onLine) return;
        const now = Date.now();
        if (lastPublished && distanceKm(lastPublished,value) <= .5 && now - lastTime < 300000 &&
            lastPublished.cidade === value.cidade && lastPublished.pais === value.pais) return;
        await live.update(sharingRoom,value);
        lastPublished = value;
        lastTime = now;
      } catch (error) { if (revision === epoch) problem(error); }
      finally { sending = false; }
    },error => {
      if (error.code === 1) { active = false; stopWatch(); show(); }
      problem(error);
    },{enableHighAccuracy:false,maximumAge:120000,timeout:15000});
  }
  function syncToday(visible) {
    if (lastToday === visible) return;
    lastToday = visible;
    stopToday();
    if (!visible || !room) return;
    const epoch = revision;
    const keep = fn => value => { if (epoch === revision && lastToday) { fn(value); show(); } };
    todayStops.push(live.watch(room,'liveLocations',uid,keep(value => { own = value; }),() => {}));
    todayStops.push(live.watch(room,'clocks',partner,keep(value => { otherClock = value?.fuso; }),
      keep(() => { otherClock = undefined; })));
    todayStops.push(live.watch(room,'locationSharing',partner,keep(value => {
      if (partnerSharing === (value?.partilha === true)) return;
      stopPartner?.(); stopPartner = undefined;
      partnerSharing = value?.partilha === true;
      other = undefined;
      if (partnerSharing) stopPartner = live.watch(room,'liveLocations',partner,
        keep(value => { if (partnerSharing) other = value; }),
        keep(error => {
          other = undefined;
          if (error.code === 'permission-denied') partnerSharing = false;
        }));
    }),keep(() => { stopPartner?.(); partnerSharing = false; other = undefined; })));
  }
  function sync(api, pair, me, isHome) {
    const nextPartner = pair?.members?.length === 2 && pair.members.includes(me)
      ? pair.members.find(person => person !== me) : undefined;
    const nextRoom = api && nextPartner ? pair.id : undefined;
    if (nextRoom !== room || uid !== me) {
      revision++;
      active = false; busy = false; suspending = false;
      lastPublished = cityCache = undefined; lastTime = 0;
      stopWatch();
      profileStops.forEach(stop => stop());
      profileStops = [];
      stopToday();
      lastToday = undefined;
      ownSharing = clockOn = undefined;
      live = api; room = nextRoom; uid = me; partner = nextPartner;
      customCity.value = customCountry.value = '';
      feedback.textContent = room ? '' : 'Liga primeiro o teu par.';
      if (room) {
        const epoch = revision;
        profileStops.push(live.watch(room,'locationSharing',uid,value => {
          if (revision !== epoch) return;
          ownSharing = value?.partilha === true;
          if (ownSharing && !suspending && !busy) {
            if (active) startWatch();
            else navigator.permissions?.query({name:'geolocation'}).then(permission => {
              if (permission.state !== 'granted' || revision !== epoch || !ownSharing || suspending || busy) return;
              active = true; startWatch(); show();
            }).catch(() => {});
          } else if (!ownSharing) { active = false; stopWatch(); }
          show();
        },problem));
        profileStops.push(live.watch(room,'clocks',uid,value => {
          if (revision !== epoch) return;
          clockOn = Boolean(value);
          show();
        },problem));
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (zone && navigator.onLine) live.updateClock(room,zone).catch(() => {});
      }
    }
    syncToday(Boolean(room && isHome && !document.hidden && navigator.onLine));
    if (document.hidden || !navigator.onLine) stopWatch();
    else startWatch();
    show();
  }
  enable.onclick = () => consent.showModal();
  consent.querySelector('.sx-consent-cancel').onclick = () => consent.close();
  consent.querySelector('.sx-consent-start').onclick = async () => {
    consent.close();
    if (busy || !room) return;
    if (!navigator.onLine) { feedback.textContent = 'Liga-te à Internet para ativar a partilha.'; return; }
    suspending = false;
    const epoch = revision, api = live, sharingRoom = room;
    busy = true;
    feedback.textContent = 'A pedir a localização ao telemóvel…';
    show();
    try {
      const [sample,dataset] = await Promise.all([currentPosition(),loadCities()]);
      const value = await coordinate(sample.coords,dataset);
      if (revision !== epoch || document.hidden || !navigator.onLine) return;
      active = true;
      await api.enable(sharingRoom,value);
      if (revision === epoch) {
        ownSharing = true;
        lastPublished = value; lastTime = Date.now();
        feedback.textContent = 'Partilha ativa. A posição atualiza com o Sully aberto.';
        startWatch();
      }
    } catch (error) {
      if (revision === epoch) { active = false; stopWatch(); problem(error); }
    } finally {
      if (revision === epoch) { busy = false; show(); }
    }
  };
  disable.onclick = async () => {
    if (!room) return;
    const epoch = revision;
    busy = true; suspending = true; active = false; stopWatch();
    feedback.textContent = 'A desligar. A remoção fica confirmada quando houver ligação.';
    show();
    try {
      await live.revoke(room);
      if (revision === epoch) feedback.textContent = 'Partilha desligada e posição apagada.';
    } catch (error) { if (revision === epoch) problem(error); }
    finally { if (revision === epoch) { busy = false; show(); } }
  };
  clock.onchange = async () => {
    const epoch = revision, selected = clock.checked;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    clock.disabled = true;
    try {
      if (selected && zone) await live.updateClock(room,zone,true);
      else await live.removeClock(room);
    } catch (error) { if (revision === epoch) problem(error); }
    finally { if (revision === epoch) show(); }
  };
  function cleanupBeforeLogout() {
    const hadTracking = active || ownSharing === true;
    if (busy) throw new Error('Aguarda a confirmação da alteração de localização antes de sair.');
    suspending = true; active = false;
    stopWatch();
    if (!room || (!hadTracking && clockOn === false && ownSharing === false)) return;
    if (!navigator.onLine) throw new Error('Liga-te à Internet para remover a localização e a hora antes de sair.');
    let timer;
    return Promise.race([
      live.revoke(room,{clock:true}),
      new Promise((_,reject) => { timer=setTimeout(() =>
        reject(new Error('A remoção ainda não foi confirmada. Tenta sair novamente quando houver ligação.')),10000); })
    ]).finally(() => clearTimeout(timer));
  }
  return {sync, cleanupBeforeLogout};
}
