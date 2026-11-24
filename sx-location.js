import { createMapBackdrop, createMapDialog } from './sx-map.js?rev=rota-terrestre';

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
    ? navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,maximumAge:0,timeout:15000})
    : reject(new Error('Este dispositivo não disponibiliza a localização.')));
}

export function configureLocation(openLocationSettings) {
  const q = value => document.querySelector(value);
  const consent = q('#sx-location-consent');
  const enable = q('#sx-location-enable');
  const disable = q('#sx-location-disable');
  const feedback = q('#sx-location-feedback');
  const clock = q('#sx-clock');
  const customCity = q('#sx-city');
  const customCountry = q('#sx-country');
  const indicator = q('#sx-sharing-indicator');
  const saveCity = q('#sx-save-city');
  const meter = document.createElement('div');
  meter.className = 'sx-live-meter';
  meter.innerHTML = `
    <p class="sx-live-label">Distância entre nós</p>
    <p class="sx-live-distance" role="status"></p>
    <p class="sx-live-route" hidden></p>
    <p class="sx-live-age" hidden></p>
    <button class="text-button sx-live-enable" type="button" hidden>Ativar localização</button>
    <button class="text-button sx-live-map" type="button" hidden>Ver globo</button>`;
  q('#page-home .sx-distance').prepend(meter);
  const routeText = meter.querySelector('.sx-live-route');
  const enableFromHome = meter.querySelector('.sx-live-enable');
  enableFromHome.addEventListener('click',openLocationSettings);
  const mapButton = meter.querySelector('.sx-live-map');
  mapButton.setAttribute('aria-haspopup', 'dialog');
  const map = createMapDialog(() => refreshOwnPosition());
  const renderBackdrop = createMapBackdrop(meter);
  mapButton.onclick = () => { map.open(); show(); };
  const distanceText = meter.querySelector('.sx-live-distance');
  const ageText = meter.querySelector('.sx-live-age');
  let live, room, uid, partner;
  let ownSharing, partnerSharing, own, other, otherClock, clockOn;
  let lastPublished, lastTime = 0, suspending = false;
  let revision = 0, active = false, busy = false, clockBusy = false, watchId, refreshId, sending;
  let watchCycle = 0;
  let profileStops = [], todayStops = [], stopPartner, lastToday, cities, cityCache;
  const observations = {};
  const displayKm = new Intl.NumberFormat('pt-PT');
  function show() {
    enable.disabled = busy || !room || ownSharing === undefined;
    enable.hidden = ownSharing === true;
    disable.hidden = ownSharing !== true;
    disable.disabled = busy;
    customCity.disabled = customCountry.disabled = saveCity.disabled = !room;
    clock.disabled = clockBusy || !room || clockOn === undefined;
    clock.checked = clockOn === true;
    indicator.hidden = !active || document.hidden || !room;
    const now = Date.now();
    const otherAge = other ? now - other.atualizadoEm?.toMillis() : NaN;
    const ownAge = own ? now - own.atualizadoEm?.toMillis() : NaN;
    const current = ownSharing && partnerSharing && ownAge < day && otherAge < day;
    const km = current ? distanceKm(own,other) : undefined;
    const place = position => [position?.cidade,position?.pais].filter(Boolean).join(', ');
    const sameCountry = own?.pais && own.pais === other?.pais && own.cidade && other.cidade;
    const route = (sameCountry ? [own.cidade, other.cidade] : [place(own), place(other)])
      .filter(Boolean).join(' · ');
    const distanceLabel = km !== undefined
      ? (km < 1 ? 'Estão perto um do outro' : '≈ ' + displayKm.format(km > 100 ? Math.round(km/10)*10 : Math.round(km)) + ' km')
      : !room ? 'Liga o teu par para veres a distância.'
      : !navigator.onLine ? 'Liga-te à Internet para atualizar a distância.'
      : ownSharing === undefined ? 'A verificar a partilha de localização…'
      : !ownSharing ? 'Ativa a localização para veres a distância.'
      : !partnerSharing ? 'O teu par ainda não partilha a localização.'
      : 'À espera de localizações recentes.';
    if (distanceText.textContent !== distanceLabel) distanceText.textContent = distanceLabel;
    meter.classList.toggle('sx-live-has-distance',km !== undefined);
    routeText.hidden = km === undefined || !route;
    routeText.textContent = routeText.hidden ? '' : route;
    enableFromHome.hidden = !room || ownSharing !== false || !navigator.onLine;
    mapButton.hidden = !room;
    const age = ms => ms >= day ? `${Math.floor(ms/day)} d` : ms >= 3600000
      ? `${Math.floor(ms/3600000)} h` : `${Math.max(1,Math.floor(ms/60000))} min`;
    ageText.textContent = partnerSharing && other
      ? (otherAge >= day ? 'Última localização há ' + age(otherAge)
        : otherAge >= 600000 ? 'Localização atualizada há ' + age(otherAge) : 'O teu par partilha a localização')
        + (place(other) ? ' · perto de ' + place(other) : '')
        + (ownSharing && ownAge >= 600000 ? ' · a tua: ' + (ownAge >= day ? 'última localização há ' : 'atualizada há ') + age(ownAge) : '')
      : '';
    ageText.hidden = !ageText.textContent;
    const describe = (key, label, position, elapsed) => {
      if (!position || !Number.isFinite(elapsed)) return label + ' · sem posição partilhada';
      const freshness = elapsed < 60000 ? 'agora' : 'há ' + age(elapsed);
      const movement = elapsed < 600000 ? observations[key]?.movement : '';
      return [label,place(position),freshness,movement].filter(Boolean).join(' · ');
    };
    renderBackdrop(lastToday ? {current,own,other} : null);
    map.render({current, distanceLabel, own, other, ownSharing,canUpdate:!document.hidden&&navigator.onLine,
      descriptions:ownSharing ? [describe('own','Tu',own,ownAge),describe('other','O teu par',other,otherAge)] : []});
    const time = q('.sx-partner-clock');
    if (time) {
      time.hidden = true;
      if (otherClock && lastToday) {
        try {
          const text = new Intl.DateTimeFormat('pt-PT',{hour:'2-digit',minute:'2-digit',timeZone:otherClock}).format();
          time.textContent = 'Hora local · ' + text;
          time.hidden = false;
        } catch { /* Unknown time zone. */ }
      }
    }
  }
  function stopWatch() {
    watchCycle++;
    if (watchId !== undefined) navigator.geolocation?.clearWatch(watchId);
    watchId = undefined;
    clearInterval(refreshId);
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
  function coordinate(coords, dataset) {
    // Normalize negative zero, which Firestore would store as a double.
    const position = {latE2:Math.round(coords.latitude*100) + 0,lngE2:Math.round(coords.longitude*100) + 0};
    if (!cityCache || cityCache.dataset !== dataset ||
        position.latE2 !== cityCache.position.latE2 || position.lngE2 !== cityCache.position.lngE2) {
      cityCache = {position,dataset,...cityNear(dataset,position)};
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
  function eligible(roomAtStart, cycle) {
    return room && roomAtStart === room && watchCycle === cycle && active && ownSharing === true &&
      !document.hidden && navigator.onLine;
  }
  async function publish(sample, roomAtStart, cycle, force = false) {
    if (!eligible(roomAtStart,cycle)) return false;
    if (sending) {
      if (!force) return false;
      await sending.catch(() => {});
      if (!eligible(roomAtStart,cycle)) return false;
    }
    if (sending) return false;
    const task = (async () => {
      const value = coordinate(sample.coords,await loadCities());
      if (!eligible(roomAtStart,cycle)) return false;
      const now = Date.now();
      if (!force && lastPublished && distanceKm(lastPublished,value) <= .5 && now - lastTime < 300000 &&
          lastPublished.cidade === value.cidade && lastPublished.pais === value.pais) return false;
      const result = await live.update(roomAtStart,value);
      if (result && eligible(roomAtStart,cycle)) { lastPublished = value; lastTime = now; }
      return result;
    })();
    sending = task;
    try { return await task; }
    finally { if (sending === task) sending = undefined; }
  }
  function rememberPermission(allowed) {
    try {
      const key = 'sully.ui.gps.'+uid;
      if (allowed) localStorage.setItem(key,'sim');
      else localStorage.removeItem(key);
    } catch { /* Permission persists only if storage is available. */ }
  }
  function positionError(error,cycle) {
    if (watchCycle !== cycle) return;
    if (error.code === 1) { rememberPermission(false); active = false; stopWatch(); show(); }
    problem(error);
  }
  async function refreshOwnPosition() {
    if (!room || ownSharing !== true || suspending || document.hidden || !navigator.onLine) {
      throw new Error('Partilha indisponível.');
    }
    if (watchId === undefined) {
      active = true;
      startWatch(false);
    }
    const sharingRoom = room, cycle = watchCycle;
    try {
      if (!await publish(await currentPosition(),sharingRoom,cycle,true)) throw new Error('Posição não confirmada.');
      if (eligible(sharingRoom,cycle)) rememberPermission(true);
    } catch (error) {
      positionError(error,cycle);
      throw error;
    }
  }
  function startWatch(refresh = true) {
    if (!active || ownSharing !== true || suspending || document.hidden || !navigator.onLine ||
        watchId !== undefined || !navigator.geolocation) return;
    const sharingRoom = room, cycle = ++watchCycle;
    const inspect = error => positionError(error,cycle);
    watchId = navigator.geolocation.watchPosition(sample => {
      publish(sample,sharingRoom,cycle).catch(inspect);
    },inspect,{enableHighAccuracy:false,maximumAge:0,timeout:15000});
    if (refresh) refreshOwnPosition().catch(() => {});
    refreshId = setInterval(() => {
      if (eligible(sharingRoom,cycle) && Date.now()-lastTime >= 300000) refreshOwnPosition().catch(() => {});
    },300000);
  }
  function resumeAuthorizedWatch(epoch) {
    const remembered = () => {
      try { return localStorage.getItem('sully.ui.gps.'+uid) === 'sim'; }
      catch { return false; }
    };
    const resume = allowed => {
      if (!allowed || revision !== epoch || !ownSharing || suspending || busy) return;
      active = true; startWatch(); show();
    };
    if (!navigator.permissions?.query) { resume(remembered()); return; }
    navigator.permissions.query({name:'geolocation'}).then(permission => {
      resume(permission.state === 'granted');
    }).catch(() => resume(remembered()));
  }
  function observePosition(key, position) {
    if (!position) { delete observations[key]; return position; }
    const previous = observations[key];
    const timestamp = position.atualizadoEm?.toMillis();
    if (Number.isFinite(timestamp) && timestamp !== previous?.timestamp) {
      const movement = previous && timestamp > previous.timestamp && timestamp-previous.timestamp < 900000
        ? distanceKm(previous.position,position) > .5 ? 'mudou de posição' : 'sem mudança detetada'
        : '';
      observations[key] = {position,timestamp,movement};
    }
    return position;
  }
  function syncToday(visible) {
    if (lastToday === visible) return;
    lastToday = visible;
    stopToday();
    if (!visible || !room) return;
    const epoch = revision;
    const keep = fn => value => { if (epoch === revision && lastToday) { fn(value); show(); } };
    todayStops.push(live.watch(room,'liveLocations',uid,keep(value => { own = observePosition('own',value); }),() => {}));
    todayStops.push(live.watch(room,'clocks',partner,keep(value => { otherClock = value?.fuso; }),
      keep(() => { otherClock = undefined; })));
    todayStops.push(live.watch(room,'locationSharing',partner,keep(value => {
      if (partnerSharing === (value?.partilha === true)) return;
      stopPartner?.(); stopPartner = undefined;
      partnerSharing = value?.partilha === true;
      other = undefined;
      if (!partnerSharing) delete observations.other;
      if (partnerSharing) stopPartner = live.watch(room,'liveLocations',partner,
        keep(value => { if (partnerSharing) other = observePosition('other',value); }),
        keep(error => {
          other = observePosition('other',null);
          if (error.code === 'permission-denied') partnerSharing = false;
        }));
    }),keep(() => { stopPartner?.(); partnerSharing = false; other = observePosition('other',null); })));
  }
  function sync(api, pair, me, isHome) {
    const nextPartner = pair?.members?.length === 2 && pair.members.includes(me)
      ? pair.members.find(person => person !== me) : undefined;
    const nextRoom = api && nextPartner ? pair.id : undefined;
    if (nextRoom !== room || uid !== me) {
      revision++;
      map.close();
      delete observations.own;
      delete observations.other;
      active = false; busy = false; clockBusy = false; suspending = false;
      lastPublished = cityCache = undefined; lastTime = 0;
      stopWatch();
      profileStops.forEach(stop => stop());
      profileStops = [];
      stopToday();
      lastToday = undefined;
      ownSharing = clockOn = undefined;
      live = api; room = nextRoom; uid = me; partner = nextPartner;
      let override = {};
      if (room) {
        try { override = JSON.parse(localStorage.getItem('sully.ui.localidade.'+uid)) || {}; }
        catch { /* No saved locality override. */ }
      }
      customCity.value = override.cidade || '';
      customCountry.value = override.pais || '';
      feedback.textContent = room ? '' : 'Liga primeiro o teu par.';
      if (room) {
        const epoch = revision;
        profileStops.push(live.watch(room,'locationSharing',uid,value => {
          if (revision !== epoch) return;
          ownSharing = value?.partilha === true;
          if (ownSharing && !suspending && !busy) {
            if (active) startWatch();
            else resumeAuthorizedWatch(epoch);
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
      const value = coordinate(sample.coords,dataset);
      if (revision !== epoch || document.hidden || !navigator.onLine) return;
      active = true;
      await api.enable(sharingRoom,value);
      if (revision === epoch) {
        ownSharing = true;
        rememberPermission(true);
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
    rememberPermission(false);
    feedback.textContent = 'A desligar. A remoção fica confirmada quando houver ligação.';
    show();
    try {
      await live.revoke(room);
      if (revision === epoch) {
        delete observations.own;
        feedback.textContent = 'Partilha desligada e posição apagada.';
      }
    } catch (error) { if (revision === epoch) problem(error); }
    finally { if (revision === epoch) { busy = false; show(); } }
  };
  saveCity.onclick = async () => {
    if (!room) return;
    const epoch = revision;
    const cidade = customCity.value.trim(), pais = customCountry.value.trim();
    try {
      localStorage.setItem('sully.ui.localidade.'+uid, JSON.stringify({cidade,pais}));
      feedback.textContent = 'Preferência de cidade guardada neste dispositivo.';
      if (!active || !ownSharing || !lastPublished || !navigator.onLine) return;
      const corrected = {latE2:lastPublished.latE2,lngE2:lastPublished.lngE2,
        cidade:cidade || cityCache?.cidade || '',pais:pais || cityCache?.pais || ''};
      if (!await live.update(room,corrected)) return;
      if (revision === epoch) {
        lastPublished = corrected;
        lastTime = Date.now();
        feedback.textContent = 'Cidade atualizada.';
      }
    } catch (error) { if (revision === epoch) problem(error); }
  };
  clock.onchange = async () => {
    if (clockBusy || !room) return;
    clockBusy = true;
    const epoch = revision, selected = clock.checked;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    clock.disabled = true;
    try {
      if (selected && zone) await live.updateClock(room,zone,true);
      else await live.removeClock(room);
    } catch (error) { if (revision === epoch) problem(error); }
    finally { if (revision === epoch) { clockBusy = false; show(); } }
  };
  function cleanupBeforeLogout() {
    const hadTracking = active || ownSharing === true;
    if (busy || clockBusy) throw new Error('Aguarda a confirmação das alterações de partilha antes de sair.');
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
