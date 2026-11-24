function globeMarkup(gradientId, styleClass, viewBox) {
  return `<svg viewBox="${viewBox}" class="${styleClass}" aria-hidden="true" hidden>
      <defs>
        <radialGradient id="${gradientId}" cx="36%" cy="28%" r="74%">
          <stop stop-color="var(--sx-map-water-light, #a3dce8)"/><stop offset="1" stop-color="var(--sx-map-water-dark, #78c4d9)"/>
        </radialGradient>
      </defs>
      <path class="sx-globe-water" fill="url(#${gradientId})"></path>
      <path class="sx-globe-grid"></path>
      <path class="sx-map-land" fill-rule="evenodd"></path>
      <path class="sx-map-borders" aria-hidden="true"/>
        <path class="sx-map-roads" aria-hidden="true"/>
        <path class="sx-map-road-route" aria-hidden="true" hidden/>
        <g class="sx-map-cities" aria-hidden="true">${'<text hidden/>'.repeat(7)}</g>
      <g class="sx-map-dot sx-map-you" hidden><circle r="8"/></g>
      <g class="sx-map-dot sx-map-partner" hidden><circle r="8"/></g>
    </svg>`;
}

let assets;
function globeAssets() {
  assets ||= Promise.all([
    import('./sx-globe.js?rev=rota-terrestre'),
    fetch('./sx-globe-land.json?rev=costa-en100').then(response => {
      if (!response.ok) throw new Error('Mapa indisponível');
      return response.json();
    })
  ]).catch(error => { assets = undefined; throw error; });
  return assets;
}

let detailAssets, coastalRoute;
async function readMapAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Mapa detalhado indisponível');
  return response.json();
}
function mapDetails() {
  detailAssets ||= Promise.all(['./sx-map-roads.json?v=1', './sx-cities.json'].map(readMapAsset))
    .then(([detail, cities]) => ({ ...detail, cities }))
    .catch(error => { detailAssets = undefined; throw error; });
  return detailAssets;
}
function mapRoadRoute() {
  coastalRoute ||= readMapAsset('./sx-route-luanda-benguela.json?v=1')
    .catch(error => { coastalRoute = undefined; throw error; });
  return coastalRoute;
}
function roadBetween(a, b) {
  const nearby = (place, name, lng, lat) => {
    const distance = Math.hypot(place.lngE2 / 100 - lng, place.latE2 / 100 - lat);
    // The shown trip is city centre to city centre. Shared positions may be in the outskirts.
    return distance <= .29 || (distance <= .65 && place.cidade?.trim().toLowerCase() === name);
  };
  const luanda = place => nearby(place, 'luanda', 13.23, -8.84);
  const benguela = place => nearby(place, 'benguela', 13.41, -12.58);
  return (luanda(a) && benguela(b)) || (luanda(b) && benguela(a));
}

function roadKmLabel(road) {
  return `≈ ${Math.round(road.km / 10) * 10} km`;
}

export function createMapBackdrop(meter) {
  meter.insertAdjacentHTML('afterbegin', globeMarkup('sx-backdrop-ocean', 'sx-map-backdrop', '166 22 308 352'));
  const image = meter.querySelector('.sx-map-backdrop');
  image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  const credit = document.createElement('a');
  credit.href = 'https://www.openstreetmap.org/copyright';
  credit.target = '_blank';
  credit.rel = 'noopener noreferrer';
  credit.className = 'sx-map-card-credit';
  credit.textContent = '© OpenStreetMap';
  credit.hidden = true;
  meter.append(credit);
  const distance = meter.querySelector('.sx-live-distance');
  const distanceLabel = meter.querySelector('.sx-live-label');
  const roadDistance = document.createElement('p');
  roadDistance.className = 'sx-live-road-distance';
  roadDistance.hidden = true;
  const roadName = document.createElement('span');
  roadName.className = 'sx-live-road-name';
  roadName.textContent = 'EN100';
  roadName.hidden = true;
  distanceLabel.after(roadName);
  distance.after(roadDistance);
  let globe, loading, latest, details, road, introStarted = false;
  let loadingDetails = false, loadingRoad = false;
  let visible = typeof IntersectionObserver !== 'function';
  function draw() {
    image.toggleAttribute('hidden', !latest || !globe);
    const hasPair = latest?.current && globe && (visible || introStarted);
    const matchedRoad = hasPair && roadBetween(latest.own, latest.other);
    const hasRoad = Boolean(matchedRoad && road);
    credit.hidden = roadDistance.hidden = roadName.hidden = !hasRoad;
    distance.hidden = hasRoad;
    const heading = hasRoad ? 'Distância por estrada' : 'Distância entre nós';
    if (distanceLabel.textContent !== heading) distanceLabel.textContent = heading;
    if (!roadDistance.hidden) {
      const label = `${roadKmLabel(road)}`;
      if (roadDistance.textContent !== label) roadDistance.textContent = label;
    }
    if (!latest) {
      introStarted = false;
      globe?.stop();
      return;
    }
    if (!globe) return;
    if (hasPair) {
      introStarted = true;
      globe.show(latest.own, latest.other);
      globe.setRoadRoute(matchedRoad ? road?.coordinates : undefined);
      if (!details && !loadingDetails) {
        loadingDetails = true;
        mapDetails().then(data => {
          details = data;
          globe.setDetails(data);
        }).catch(() => {}).finally(() => { loadingDetails = false; });
      }
      if (matchedRoad && !road && !loadingRoad) {
        loadingRoad = true;
        mapRoadRoute().then(data => {
          road = data;
          draw();
        }).catch(() => {}).finally(() => { loadingRoad = false; });
      }
    } else {
      globe.showIdle();
    }
  }
  if (!visible) {
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.intersectionRatio >= .35;
      if (visible) draw();
    }, { threshold: .35 });
    observer.observe(meter);
  }
  return function render(state) {
    latest = state;
    draw();
    if (!state || globe || loading) return;
    loading = true;
    globeAssets().then(([{createGlobe},land]) => {
      globe = createGlobe(image, land, { regional: true, fitRadius: 87 });
      draw();
    }).catch(() => {
      // The card remains fully usable if its decorative background cannot load.
    }).finally(() => { loading = false; });
  };
}

export function createMapDialog(refreshOwn) {
  const dialog = document.createElement('dialog');
  dialog.className = 'sx-sheet sx-map-sheet';
  dialog.setAttribute('aria-labelledby','sx-map-title');
  dialog.innerHTML = `<div class="sx-sheet-heading"><h2 id="sx-map-title">Globo de nós dois</h2>
    <button type="button" class="secondary sx-map-close">Fechar</button></div>
    <p class="sx-map-distance" role="status"></p>
    <p class="sx-map-measure" hidden>Distância em linha reta</p>
    <p class="sx-map-road-summary" aria-live="polite" hidden>
      <strong></strong>
      <span>por estrada · EN100 · ≈ 8 h 12 min de carro</span>
      <small>Luanda ↔ Benguela · ≈ 419 km em linha reta entre as cidades</small>
    </p>
    <div class="sx-map-skeleton" aria-hidden="true" hidden></div>
    <div class="sx-map-stage" hidden>
      ${globeMarkup('sx-globe-ocean','sx-map-preview','100 8 440 380')}
      <div class="sx-map-controls" role="group" aria-label="Controlos do globo">
        <button type="button" aria-label="Reduzir" class="sx-map-out">−</button>
        <button type="button" aria-label="Ampliar" class="sx-map-in">+</button>
        <button type="button" class="sx-map-fit" disabled>Centrar nos dois</button>
      </div>
    </div>
    <ul class="sx-map-legend" aria-label="Posições"></ul>
    <p class="sx-map-road-credit" hidden>Percurso entre os centros das cidades ·
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></p>
    <p class="sx-map-source" hidden>Estradas principais de Angola e da região · Natural Earth</p>
    <button type="button" class="secondary sx-map-refresh">Atualizar a minha localização</button>
    <p class="sx-map-feedback" role="status"></p>
    <p class="footnote">Posições aproximadas. Cada posição atualiza quando a pessoa está com o Sully aberto.</p>`;
  document.body.append(dialog);
  const q = value => dialog.querySelector(value);
  const stage = q('.sx-map-stage');
  const skeleton = q('.sx-map-skeleton');
  const image = q('.sx-map-preview');
  const fit = q('.sx-map-fit');
  image.removeAttribute('aria-hidden');
  image.setAttribute('tabindex', '0');
  image.setAttribute('role', 'group');
  image.setAttribute('aria-label', 'Globo interativo. Usa as setas para girar e mais ou menos para mudar o zoom.');
  const distance = q('.sx-map-distance');
  const measure = q('.sx-map-measure');
  const legend = q('.sx-map-legend');
  const source = q('.sx-map-source');
  const roadSummary = q('.sx-map-road-summary');
  const roadCredit = q('.sx-map-road-credit');
  const refresh = q('.sx-map-refresh');
  const feedback = q('.sx-map-feedback');
  let globe, loading, failed = false, previousLegend, latest, detailStatus;
  let road, loadingRoute = false;
  const pointers = new Map();
  const zoomStep = 1.35;
  q('.sx-map-in').onclick = () => globe?.move(0, 0, zoomStep);
  q('.sx-map-out').onclick = () => globe?.move(0, 0, 1 / zoomStep);
  fit.onclick = () => { if (latest?.current) globe?.focusPair(); };
  image.addEventListener('pointerdown', event => {
    if (!globe || event.button !== 0 || pointers.size >= 2) return;
    image.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    image.classList.add('sx-map-dragging');
  });
  image.addEventListener('pointermove', event => {
    const start = pointers.get(event.pointerId);
    if (!start) return;
    const end = [event.clientX, event.clientY];
    const [dx, dy] = end.map((value, i) => value - start[i]);
    if (!dx && !dy) return;
    pointers.set(event.pointerId, end);
    const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
    const box = image.getBoundingClientRect();
    const units = 1 / Math.min(box.width / 440, box.height / 380);
    if (!Number.isFinite(units)) return;
    if (other) {
      const before = Math.hypot(start[0] - other[0], start[1] - other[1]);
      const after = Math.hypot(end[0] - other[0], end[1] - other[1]);
      globe.move(dx * units / 2, dy * units / 2, after / Math.max(1, before));
    } else {
      globe.move(dx * units, dy * units);
    }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    image.addEventListener(type, event => {
      pointers.delete(event.pointerId);
      if (!pointers.size) image.classList.remove('sx-map-dragging');
    });
  }
  image.addEventListener('wheel', event => {
    if (!globe || !event.deltaY) return;
    event.preventDefault();
    const delta = Math.sign(event.deltaY);
    globe.move(0, 0, Math.exp(-delta * Math.min(.48, event.deltaMode ? .17 : Math.abs(event.deltaY) * .0025)));
  }, { passive: false });
  image.addEventListener('keydown', event => {
    const movement = {
      ArrowLeft: [32, 0], ArrowRight: [-32, 0], ArrowUp: [0, 32], ArrowDown: [0, -32],
      '+': [0, 0, zoomStep], '=': [0, 0, zoomStep], '-': [0, 0, 1 / zoomStep]
    };
    if (!globe || !Object.hasOwn(movement, event.key)) return;
    event.preventDefault();
    globe.move(...movement[event.key]);
  });

  async function loadGlobe() {
    if (globe || loading) return;
    loading = true;
    failed = false;
    try {
      const [{createGlobe},land] = await globeAssets();
      globe = createGlobe(image, land, {regional:true});
    } catch {
      failed = true;
      if (dialog.open) feedback.textContent = 'O globo não carregou. A distância continua disponível.';
    } finally {
      loading = false;
      skeleton.hidden = true;
      stage.removeAttribute('aria-busy');
      if (latest) render(latest);
      if (dialog.open) loadDetails();
    }
  }

  async function loadDetails() {
    if (!globe || detailStatus === 'loading' || detailStatus === 'ready') return;
    detailStatus = 'loading';
    try {
      globe.setDetails(await mapDetails());
      source.hidden = false;
      detailStatus = 'ready';
    } catch {
      detailStatus = undefined;
    }
  }

  async function loadRoadRoute() {
    if (loadingRoute || road) return;
    loadingRoute = true;
    try {
      road = await mapRoadRoute();
      if (latest) render(latest);
    } catch {
      // Keep the location markers and distance available if the route cannot load.
    } finally {
      loadingRoute = false;
    }
  }

  function setDistance(text) {
    if (distance.textContent !== text) distance.textContent = text;
  }

  function render(state) {
    if (!dialog.open) return;
    latest = state;
    const {current,distanceLabel,own,other,ownSharing,canUpdate,descriptions} = state;
    refresh.hidden = !ownSharing;
    refresh.disabled = refresh.dataset.sxUpdating === 'true' || !canUpdate;
    const signature = JSON.stringify(descriptions);
    if (signature !== previousLegend) {
      previousLegend = signature;
      legend.replaceChildren();
      for (const [index, text] of descriptions.entries()) {
        const entry = document.createElement('li');
        entry.className = index === 0 ? 'sx-map-you' : 'sx-map-partner';
        entry.textContent = text;
        legend.append(entry);
      }
    }
    const matchedRoad = current && roadBetween(own, other);
    const activeRoad = matchedRoad ? road : undefined;
    roadSummary.hidden = roadCredit.hidden = !activeRoad;
    if (activeRoad) {
      const label = roadKmLabel(activeRoad);
      const value = roadSummary.querySelector('strong');
      if (value.textContent !== label) value.textContent = label;
    }
    if (matchedRoad && !activeRoad) loadRoadRoute();
    measure.hidden = !current;
    stage.hidden = !globe;
    fit.disabled = !current;
    image.toggleAttribute('hidden',!globe);
    if (!current || !globe) {
      globe?.showIdle();
      setDistance(current && !failed ? 'A abrir o globo…' : distanceLabel);
      return;
    }
    setDistance(distanceLabel);
    globe.show(own, other);
    globe.setRoadRoute(matchedRoad ? activeRoad?.coordinates : undefined);
  }

  dialog.addEventListener('close', () => {
    latest = undefined;
    pointers.clear();
    image.classList.remove('sx-map-dragging');
    globe?.stop();
  });
  q('.sx-map-close').onclick = () => dialog.close();
  refresh.onclick = async () => {
    refresh.dataset.sxUpdating = 'true';
    refresh.disabled = true;
    feedback.textContent = 'A procurar a tua posição…';
    try {
      await refreshOwn();
      feedback.textContent = 'A tua posição foi atualizada.';
    } catch {
      feedback.textContent = 'Não foi possível atualizar. Verifica a ligação e a permissão de localização.';
    } finally {
      refresh.dataset.sxUpdating = 'false';
      refresh.disabled = !navigator.onLine;
    }
  };
  return {
    open() {
      feedback.textContent = '';
      dialog.showModal();
      setDistance('');
      if (globe) {
        loadDetails();
      } else {
        skeleton.hidden = false;
        stage.setAttribute('aria-busy', 'true');
        loadGlobe();
      }
    },
    close() { if (dialog.open) dialog.close(); },
    render
  };
}
