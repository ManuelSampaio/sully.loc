function globeMarkup(gradientId, styleClass, viewBox, showRoute = false, detailed = false) {
  const routeMask = gradientId + '-route';
  const trace = showRoute ? `<mask id="${routeMask}" maskUnits="userSpaceOnUse" x="90" y="0" width="460" height="398">
          <path class="sx-map-trace" pathLength="1" fill="none" stroke="white" stroke-width="10"/>
        </mask>` : '';
  return `<svg viewBox="${viewBox}" class="${styleClass}" aria-hidden="true" hidden>
      <defs>
        <radialGradient id="${gradientId}" cx="36%" cy="28%" r="74%">
          <stop stop-color="#335870"/><stop offset="1" stop-color="#14283d"/>
        </radialGradient>
        ${trace}
      </defs>
      <path class="sx-globe-water" fill="url(#${gradientId})"></path>
      <path class="sx-globe-grid"></path>
      <path class="sx-map-land" fill-rule="evenodd"></path>
      ${detailed ? `<path class="sx-map-borders" aria-hidden="true"/>
        <path class="sx-map-roads" aria-hidden="true"/>
        <g class="sx-map-cities" aria-hidden="true">${'<text hidden/>'.repeat(7)}</g>` : ''}
      ${showRoute ? `<path class="sx-map-connection" mask="url(#${routeMask})" fill="none" hidden/>` : ''}
      <g class="sx-map-dot sx-map-you" hidden><circle r="8"/></g>
      <g class="sx-map-dot sx-map-partner" hidden><circle r="8"/></g>
    </svg>`;
}

let assets;
function globeAssets() {
  assets ||= Promise.all([
    import('./sx-globe.js?rev=mapa-estradas'),
    fetch('./sx-globe-land.json?rev=globo-v2').then(response => {
      if (!response.ok) throw new Error('Mapa indisponível');
      return response.json();
    })
  ]).catch(error => { assets = undefined; throw error; });
  return assets;
}

export function createMapBackdrop(meter) {
  meter.insertAdjacentHTML('afterbegin', globeMarkup('sx-backdrop-ocean', 'sx-map-backdrop', '144 22 352 352', true));
  const image = meter.querySelector('.sx-map-backdrop');
  let globe, loading, latest, introStarted = false;
  let visible = typeof IntersectionObserver !== 'function';
  function draw() {
    image.toggleAttribute('hidden', !latest || !globe);
    if (!latest) {
      introStarted = false;
      globe?.stop();
      return;
    }
    if (!globe) return;
    if (latest.current && (visible || introStarted)) {
      introStarted = true;
      globe.show(latest.own, latest.other);
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
    <div class="sx-map-stage" hidden>
      ${globeMarkup('sx-globe-ocean','sx-map-preview','100 8 440 380', true, true)}
      <div class="sx-map-controls" role="group" aria-label="Controlos do globo">
        <button type="button" aria-label="Reduzir" class="sx-map-out">−</button>
        <button type="button" aria-label="Ampliar" class="sx-map-in">+</button>
        <button type="button" class="sx-map-fit" disabled>Centrar nos dois</button>
      </div>
    </div>
    <ul class="sx-map-legend" aria-label="Posições"></ul>
    <p class="sx-map-source" hidden>Estradas principais de Angola e da região · Natural Earth</p>
    <button type="button" class="secondary sx-map-refresh">Atualizar a minha localização</button>
    <p class="sx-map-feedback" role="status"></p>
    <p class="footnote">Posições aproximadas. Cada posição atualiza quando a pessoa está com o Sully aberto.</p>`;
  document.body.append(dialog);
  const q = value => dialog.querySelector(value);
  const stage = q('.sx-map-stage');
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
  const refresh = q('.sx-map-refresh');
  const feedback = q('.sx-map-feedback');
  let globe, loading, failed = false, previousLegend, latest, detailStatus;
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
      if (latest) render(latest);
      if (dialog.open) loadDetails();
    }
  }

  async function loadDetails() {
    if (!globe || detailStatus === 'loading' || detailStatus === 'ready') return;
    detailStatus = 'loading';
    try {
      const [detail, cities] = await Promise.all(['./sx-map-roads.json?v=1', './sx-cities.json'].map(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Mapa detalhado indisponível');
        return response.json();
      }));
      globe.setDetails({ ...detail, cities });
      source.hidden = false;
      detailStatus = 'ready';
    } catch {
      detailStatus = undefined;
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
      if (globe) loadDetails();
      else loadGlobe();
    },
    close() { if (dialog.open) dialog.close(); },
    render
  };
}
