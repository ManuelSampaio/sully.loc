(() => {
  'use strict';

  const entry = document.querySelector('#entry');
  const workspace = document.querySelector('#workspace');
  const home = document.querySelector('#page-home');
  const login = document.querySelector('#login-dialog');
  const demo = document.querySelector('#demo-dialog');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const orbit = entry.querySelector('.sx-orbit');
  const heartMarkup = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21S2 15 2 8.7a5.4 5.4 0 0 1 10-2.8 5.4 5.4 0 0 1 10 2.8C22 15 12 21 12 21Z"/></svg>';

  login.prepend(orbit.cloneNode(true));

  // Observe the existing auth UI. Animated layers never delay navigation or intercept input.
  let interactiveEntry = false;
  for (const dialog of [login, demo]) {
    dialog.querySelector('form').addEventListener('submit', () => {
      if (!entry.hidden && dialog.open) interactiveEntry = true;
    }, { capture: true });
    dialog.addEventListener('close', () => { interactiveEntry = false; });
  }
  new MutationObserver(() => {
    if (!interactiveEntry || !entry.hidden || workspace.hidden) return;
    interactiveEntry = false;
    if (reducedMotion.matches) return;
    const overlay = document.createElement('div');
    overlay.className = 'sx-transition';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<i></i><i></i>' + heartMarkup;
    document.body.append(overlay);
    if (!home.hidden) home.classList.add('sx-reveal');
    const remove = () => {
      overlay.remove();
      home.classList.remove('sx-reveal');
    };
    overlay.addEventListener('animationend', event => {
      if (event.target === overlay) remove();
    });
    setTimeout(remove, 1800);
    overlay.addEventListener('animationcancel', remove, { once: true });
  }).observe(workspace, { attributeFilter: ['hidden'] });

  const error = document.querySelector('#login-error');
  let errorTimer;
  new MutationObserver(() => {
    clearTimeout(errorTimer);
    login.classList.remove('sx-error');
    if (!login.open || reducedMotion.matches || !error.textContent.trim() ||
      error.textContent.startsWith('Se a conta existir,')) return;
    requestAnimationFrame(() => {
      if (!login.open) return;
      login.classList.add('sx-error');
      errorTimer = setTimeout(() => login.classList.remove('sx-error'), 320);
    });
  }).observe(error, { childList: true, characterData: true, subtree: true });

  const partner = home.querySelector('.partner-card');
  const avatar = partner.querySelector('.partner-avatar');
  const name = partner.querySelector('#partner-name');
  const state = partner.querySelector('#partner-state');
  const mood = partner.querySelector('#partner-mood');
  const link = partner.querySelector('#home-link');
  const sendHeart = partner.querySelector('#send-heart');
  const initial = document.createElement('span');
  initial.className = 'sx-initial';
  avatar.append(initial);
  const empty = document.createElement('p');
  empty.className = 'sx-partner-empty';
  empty.hidden = true;
  mood.after(empty);
  const sharedAt = document.createElement('p');
  sharedAt.className = 'sx-shared-at';
  sharedAt.hidden = true;
  empty.after(sharedAt);

  const statusColors = new Map([
    ['Disponível', 'var(--green)'], ['A trabalhar', 'var(--accent)'],
    ['A estudar', 'var(--muted)'], ['Ocupado/a', 'var(--muted)'], ['A treinar', 'var(--green)'],
    ['Em deslocação', 'var(--accent)'], ['A dormir', 'var(--sx-par)'], ['A descansar', 'var(--sx-par)']
  ]);
  const ownStatus = home.querySelector('#current-status');
  function updateRings() {
    avatar.style.setProperty('--sx-ring', statusColors.get(state.textContent) || 'var(--line)');
    ownStatus.style.setProperty('--sx-ring', statusColors.get(ownStatus.textContent) || 'var(--muted)');
  }

  const distance = document.createElement('section');
  distance.className = 'sx-distance';
  distance.setAttribute('aria-label', 'Distância entre nós');
  distance.innerHTML = `<svg class="sx-distance-curve" viewBox="0 0 360 64" aria-hidden="true">
    <g transform="translate(22 32)">
      <path class="sx-line" d="M0 0C75 -44 241 44 316 0"/>
      <circle cx="0" cy="0" r="5" fill="currentColor"/>
      <circle class="sx-end" cx="316" cy="0" r="5"/>
      <circle class="sx-point" r="3.5"/>
    </g></svg>`;
  partner.insertBefore(distance, sendHeart);
  const reunion = document.createElement('div');
  reunion.className = 'sx-reunion';
  reunion.innerHTML = `<button type="button" class="sx-reunion-label" hidden><span>Próximo encontro</span><strong>Marcar</strong></button>
    <form hidden><label for="sx-reunion-date">Data do reencontro</label>
      <input id="sx-reunion-date" type="date" required>
      <button type="submit" class="secondary">Guardar</button>
      <button type="button" class="text-button sx-date-cancel">Cancelar</button>
    </form>`;
  partner.insertBefore(reunion, link);
  const partnerClock = document.createElement('p');
  partnerClock.className = 'sx-partner-clock';
  partnerClock.hidden = true;
  state.after(partnerClock);
  const reunionKey = 'sully.ui.reencontro';
  const timeZoneKey = 'sully.ui.fusoPar';
  function readLocal(key) {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
  }
  const dateForm = reunion.querySelector('form');
  const dateField = reunion.querySelector('input');
  const reunionLabel = reunion.querySelector('.sx-reunion-label');
  const reunionValue = reunionLabel.querySelector('strong');
  distance.after(reunionLabel);
  function updateDistance() {
    const today = new Date();
    const todayNumber = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const saved = readLocal(reunionKey);
    const days = /^\d{4}-\d{2}-\d{2}$/.test(saved) ? (Date.parse(saved) - todayNumber) / 86400000 : NaN;
    if (!reunionLabel.hasAttribute('aria-haspopup')) {
      reunionValue.textContent = !(days >= 0) ? 'Marcar' : days === 0 ? 'Hoje' : days === 1 ? '1 dia' : `${days} dias`;
    }
    if (distance.querySelector('.sx-live-meter')) return;
    const timeZone = readLocal(timeZoneKey);
    partnerClock.hidden = true;
    if (timeZone && !document.hidden && !distance.hidden && !home.hidden && !workspace.hidden) {
      try {
        const time = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone }).format(today);
        partnerClock.textContent = `Hora local · ${time}`;
        partnerClock.hidden = false;
      } catch { /* No local time for an invalid time zone. */ }
    }
  }
  function closeDateForm() {
    dateForm.hidden = true;
    reunionLabel.focus();
  }
  reunionLabel.addEventListener('click', () => {
    if (reunionLabel.hasAttribute('aria-haspopup')) return;
    dateField.value = readLocal(reunionKey);
    dateField.setCustomValidity('');
    dateForm.hidden = false;
    dateField.focus();
  });
  reunion.querySelector('.sx-date-cancel').addEventListener('click', closeDateForm);
  dateField.addEventListener('input', () => dateField.setCustomValidity(''));
  dateForm.addEventListener('submit', event => {
    event.preventDefault();
    try {
      localStorage.setItem(reunionKey, dateField.value);
    } catch {
      dateField.setCustomValidity('Este navegador não deixou guardar a data.');
      dateField.reportValidity();
      return;
    }
    updateDistance();
    closeDateForm();
  });

  // Reuse the timestamp already displayed by the existing privacy-aware check-in.
  const dayLabel = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short' });
  const relative = new Intl.RelativeTimeFormat('pt-PT', { numeric: 'always' });
  function updateSharedTime() {
    const [, label] = mood.textContent.split(' · ');
    sharedAt.hidden = !label || !link.hidden;
    if (sharedAt.hidden) return;
    const match = label.match(/^(.*?)\s*,?\s+(\d{2}):(\d{2})$/);
    const now = new Date();
    const sameDay = match && dayLabel.format(now) === match[1];
    const minutes = sameDay ? (now.getHours() - Number(match[2])) * 60 + now.getMinutes() - Number(match[3]) : -1;
    const wording = !sameDay || minutes < 0 ? label : minutes === 0 ? 'agora mesmo'
      : minutes < 60 ? relative.format(-minutes, 'minute') : relative.format(-Math.floor(minutes / 60), 'hour');
    sharedAt.textContent = `Partilhou ${wording}`;
  }
  function updatePartner() {
    const connected = link.hidden;
    const noCheckIn = connected && mood.textContent === 'Ainda sem check-in.';
    partner.classList.toggle('sx-unpaired', !connected);
    empty.hidden = connected && !noCheckIn;
    empty.textContent = connected
      ? 'Ainda não partilhou o dia.'
      : 'Liga-te ao teu par com um convite para partilharem o dia.';
    mood.classList.toggle('sx-empty', !connected || noCheckIn);
    avatar.firstElementChild.toggleAttribute('hidden', connected);
    initial.hidden = !connected;
    initial.textContent = Array.from(name.textContent.trim())[0]?.toLocaleUpperCase('pt-PT') || '';
    distance.hidden = !connected;
    reunion.hidden = !connected;
    reunionLabel.hidden = !connected;
    updateRings();
    updateSharedTime();
    updateDistance();
  }
  const partnerObserver = new MutationObserver(updatePartner);
  for (const node of [name, state, mood, ownStatus]) {
    partnerObserver.observe(node, { childList: true, characterData: true, subtree: true });
  }
  partnerObserver.observe(link, { attributeFilter: ['hidden'] });
  partnerObserver.observe(home, { attributeFilter: ['hidden'] });
  setInterval(() => {
    if (!document.hidden && !workspace.hidden && !home.hidden) {
      updateDistance();
      updateSharedTime();
    }
  }, 30000);
  document.addEventListener('visibilitychange', updateDistance);
  updatePartner();

  const compose = document.querySelector('#message-dialog');
  const quickForm = document.querySelector('#quick-form');
  let heartComposer = false;
  sendHeart.addEventListener('click', () => { heartComposer = compose.open; });
  compose.addEventListener('close', () => { heartComposer = false; });
  quickForm.addEventListener('submit', () => {
    if (!heartComposer || compose.open || home.hidden || reducedMotion.matches ||
        typeof avatar.animate !== 'function') return;
    const source = document.querySelector('#avatar').getBoundingClientRect();
    const target = avatar.getBoundingClientRect();
    const flight = document.createElement('div');
    flight.className = 'sx-flight';
    flight.setAttribute('aria-hidden', 'true');
    flight.innerHTML = heartMarkup;
    const startX = source.x + (source.width - 24) / 2;
    const startY = source.y + (source.height - 24) / 2;
    flight.style.left = `${startX}px`;
    flight.style.top = `${startY}px`;
    const x = target.x + (target.width - 24) / 2 - startX;
    const y = target.y + (target.height - 24) / 2 - startY;
    document.body.append(flight);
    const animation = flight.animate([
      { transform: 'translate(0, 0)', opacity: .4 },
      { transform: `translate(${x * .45}px, ${y * .25 - 32}px)`, opacity: 1 },
      { transform: `translate(${x}px, ${y}px)`, opacity: .1 }
    ], { duration: 1200, easing: 'ease-in-out' });
    animation.finished.then(() => {
      flight.remove();
      if (!home.hidden) avatar.animate([{ scale: 1 }, { scale: 1.08 }, { scale: 1 }], { duration: 600 });
    }, () => flight.remove());
    try { navigator.vibrate?.(12); } catch { /* Animation can run without haptics. */ }
  });
})();
