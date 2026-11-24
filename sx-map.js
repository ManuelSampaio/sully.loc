export function createMapDialog(refreshOwn) {
  const dialog = document.createElement('dialog');
  dialog.className = 'sx-sheet sx-map-sheet';
  dialog.setAttribute('aria-labelledby','sx-map-title');
  dialog.innerHTML = `<div class="sx-sheet-heading"><h2 id="sx-map-title">Globo de nós dois</h2>
    <button type="button" class="secondary sx-map-close">Fechar</button></div>
    <p class="sx-map-distance" role="status"></p>
    <svg viewBox="0 0 640 398" class="sx-map-preview" aria-hidden="true" hidden>
      <defs>
        <radialGradient id="sx-globe-ocean" cx="36%" cy="28%" r="74%">
          <stop stop-color="#335870"/><stop offset="1" stop-color="#14283d"/>
        </radialGradient>
      </defs>
      <path class="sx-globe-water" fill="url(#sx-globe-ocean)"></path>
      <path class="sx-globe-grid"></path>
      <path class="sx-map-land" fill-rule="evenodd"></path>
      <path class="sx-map-connection" fill="none"></path>
      <g class="sx-map-dot sx-map-you" hidden><circle r="8"/></g>
      <g class="sx-map-dot sx-map-partner" hidden><circle r="8"/></g>
    </svg>
    <ul class="sx-map-legend" aria-label="Posições"></ul>
    <button type="button" class="secondary sx-map-refresh">Atualizar a minha localização</button>
    <p class="sx-map-feedback" role="status"></p>
    <p class="footnote">Posições aproximadas. Cada posição atualiza quando a pessoa está com o Sully aberto.</p>`;
  document.body.append(dialog);
  const q = value => dialog.querySelector(value);
  const image = q('svg');
  const land = q('.sx-map-land');
  const distance = q('.sx-map-distance');
  const legend = q('.sx-map-legend');
  const refresh = q('.sx-map-refresh');
  const feedback = q('.sx-map-feedback');
  let globe, loading, failed = false, previousLegend, latest;

  async function loadGlobe() {
    if (globe || loading) return;
    loading = true;
    failed = false;
    try {
      const [{createGlobe},land] = await Promise.all([
        import('./sx-globe.js?rev=globo-v2'),
        fetch('./sx-globe-land.json?rev=globo-v2').then(response => {
          if (!response.ok) throw new Error('Mapa indisponível');
          return response.json();
        })
      ]);
      globe = createGlobe(image,land);
    } catch {
      failed = true;
      if (dialog.open) feedback.textContent = 'O globo não carregou. A distância continua disponível.';
    } finally {
      loading = false;
      if (latest) render(latest);
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
    image.toggleAttribute('hidden',!globe);
    if (!current || !globe) {
      globe?.showIdle();
      setDistance(current && !failed ? 'A abrir o globo…' : distanceLabel);
      return;
    }
    globe.show(own,other,() => {
      if (dialog.open && latest?.current) setDistance(latest.distanceLabel);
    });
  }

  dialog.addEventListener('close',() => { latest = undefined; globe?.stop(); });
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
      loadGlobe();
    },
    close() { if (dialog.open) dialog.close(); },
    render
  };
}
