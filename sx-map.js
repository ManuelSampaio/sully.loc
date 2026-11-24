const svgNS = 'http://www.w3.org/2000/svg';
const width = 640;
const height = 360;

export function mapCamera(first, second) {
  const x = first.lngE2 / 100;
  const delta = ((second.lngE2 - first.lngE2 + 54000) % 36000 - 18000) / 100;
  const y = -first.latE2 / 100, otherY = -second.latE2 / 100;
  const centerX = x + delta / 2, centerY = (y + otherY) / 2;
  const scale = Math.min(95, 480 / (Math.abs(delta) || 1), 250 / (Math.abs(y - otherY) || 1));
  return {
    landTransform:`translate(${width/2} ${height/2}) scale(${scale}) translate(${-centerX} ${-centerY})`,
    points:[[width/2 - delta*scale/2,height/2+(y-centerY)*scale],
      [width/2+delta*scale/2,height/2+(otherY-centerY)*scale]]
  };
}

export function createMapDialog(refreshOwn) {
  const dialog = document.createElement('dialog');
  dialog.className = 'sx-sheet sx-map-sheet';
  dialog.setAttribute('aria-labelledby','sx-map-title');
  dialog.innerHTML = `<div class="sx-sheet-heading"><h2 id="sx-map-title">Mapa de nós dois</h2>
    <button type="button" class="secondary sx-map-close">Fechar</button></div>
    <p class="sx-map-distance" role="status"></p>
    <svg viewBox="0 0 640 360" class="sx-map-preview" aria-hidden="true" hidden>
      <g class="sx-map-land" fill-rule="evenodd"></g>
      <line class="sx-map-connection"></line>
      <g class="sx-map-dot sx-map-you"><circle r="15"/><circle r="7"/></g>
      <g class="sx-map-dot sx-map-partner"><circle r="15"/><circle r="7"/></g>
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
  let loaded, previousLegend;

  async function loadLand() {
    if (loaded) return;
    try {
      const response = await fetch('./sx-map-land.json');
      if (!response.ok) throw new Error('Mapa indisponível');
      const paths = await response.json();
      if (!Array.isArray(paths)) throw new Error('Mapa inválido');
      const fragment = document.createDocumentFragment();
      for (const shift of [-360,0,360]) {
        const group = document.createElementNS(svgNS,'g');
        group.setAttribute('transform',`translate(${shift} 0)`);
        const path = document.createElementNS(svgNS,'path');
        path.setAttribute('d',paths.join(' '));
        group.append(path);
        fragment.append(group);
      }
      land.replaceChildren(fragment);
      loaded = true;
    } catch {
      feedback.textContent = 'O fundo do mapa está indisponível. Os pontos continuam visíveis quando há duas posições.';
    }
  }

  function render({current, distanceLabel, own, other, ownSharing, canUpdate, descriptions}) {
    if (!dialog.open) return;
    refresh.hidden = !ownSharing;
    refresh.disabled = refresh.dataset.sxUpdating === 'true' || !canUpdate;
    if (distance.textContent !== distanceLabel) distance.textContent = distanceLabel;
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
    image.toggleAttribute('hidden',!current);
    if (!current) return;
    const camera = mapCamera(own,other);
    land.setAttribute('transform',camera.landTransform);
    const [a,b] = camera.points;
    const overlap = Math.hypot(a[0]-b[0],a[1]-b[1]) < 16;
    const connection = q('line');
    connection.setAttribute('x1',a[0]); connection.setAttribute('y1',a[1]);
    connection.setAttribute('x2',b[0]); connection.setAttribute('y2',b[1]);
    const dots = image.querySelectorAll('.sx-map-dot');
    for (const [index,[x,y]] of camera.points.entries()) {
      dots[index].setAttribute('transform',`translate(${x+(overlap?(index?7:-7):0)} ${y})`);
    }
  }

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
      loadLand();
    },
    close() { if (dialog.open) dialog.close(); },
    render
  };
}
