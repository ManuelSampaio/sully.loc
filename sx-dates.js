import { dayKey } from './core.js?rev=home-focus';

const dayMs = 86400000;
const kinds = {encontro:'Encontro', aniversario:'Aniversário', aniversarioNamoro:'Aniversário de namoro', outra:'Outra data'};
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
function calendarDay(value) {
  if (!isoDate.test(value)) return NaN;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10) === value ? stamp / dayMs : NaN;
}

export function occurrence(event, today) {
  const start = calendarDay(event.data), current = calendarDay(today);
  if (!Number.isFinite(start) || !Number.isFinite(current)) return null;
  if (start >= current || !event.anual) return {date:event.data, days:start-current};
  const monthDay = event.data.slice(5);
  const firstYear = Number(today.slice(0,4));
  for (const year of [firstYear,firstYear+1]) {
    let date = `${String(year).padStart(4,'0')}-${monthDay}`;
    if (monthDay === '02-29' && !Number.isFinite(calendarDay(date))) date = `${year}-02-28`;
    const days = calendarDay(date) - current;
    if (days >= 0) return {date,days};
  }
  return null;
}

const countdown = days => days === 0 ? 'Hoje' : days === 1 ? 'Falta 1 dia'
  : days > 0 ? `Faltam ${days} dias` : `Há ${Math.abs(days)} ${days === -1 ? 'dia' : 'dias'}`;
const displayDate = new Intl.DateTimeFormat('pt-PT',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'});

export function configureDates() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary sx-date-chip';
  button.hidden = true;
  button.textContent = 'Datas';
  button.setAttribute('aria-haspopup','dialog');
  const distance = document.querySelector('#page-home .sx-distance');
  distance.append(button);
  const dialog = document.createElement('dialog');
  dialog.id = 'sx-dates';
  dialog.className = 'sx-sheet';
  dialog.setAttribute('aria-labelledby','sx-dates-title');
  dialog.innerHTML = `<div class="sx-sheet-heading"><h2 id="sx-dates-title">Datas importantes</h2><button type="button" class="secondary sx-close-dates">Fechar</button></div>
    <p class="sx-date-feedback" role="status"></p>
    <ul class="sx-date-list"></ul>
    <button type="button" class="secondary sx-add-date">Adicionar data</button>
    <button type="button" class="text-button sx-migrate-date" hidden>Copiar a data de reencontro deste dispositivo</button>
    <form hidden>
      <label>Tipo <select name="kind"><option value="encontro">Encontro</option><option value="aniversario">Aniversário</option><option value="aniversarioNamoro">Aniversário de namoro</option><option value="outra">Outra data</option></select></label>
      <label>Título <input name="title" required maxlength="80"></label>
      <label>Data <input type="date" name="date" required></label>
      <label class="check-label"><input type="checkbox" name="annual"> Repetir todos os anos</label>
      <button class="primary" type="submit">Guardar</button>
      <button type="button" class="secondary sx-cancel-date">Cancelar</button>
    </form>
    <div class="sx-delete-date" hidden><p>Queres apagar esta data para os dois?</p><button class="primary" type="button">Apagar</button> <button class="secondary" type="button">Cancelar</button></div>`;
  document.body.append(dialog);
  const list = dialog.querySelector('ul');
  const feedback = dialog.querySelector('.sx-date-feedback');
  const form = dialog.querySelector('form');
  const deletion = dialog.querySelector('.sx-delete-date');
  const migrate = dialog.querySelector('.sx-migrate-date');
  const editLocal = distance.querySelector('.sx-date-edit');
  const reunionLabel = distance.querySelector('.sx-reunion-label');
  let api, room, owner, stop, rows = [], editId, deleteId, busy = false, drawn;
  function localReunion() {
    try { return localStorage.getItem('sully.ui.reencontro') || ''; } catch { return ''; }
  }
  function hideEditor(focus = false) {
    editId = deleteId = undefined;
    form.hidden = deletion.hidden = true;
    if (focus && dialog.open) dialog.querySelector('.sx-add-date').focus();
  }
  function editor(event = {}) {
    hideEditor();
    editId = event.id;
    form.elements.kind.value = event.tipo || 'encontro';
    form.elements.title.value = event.titulo || '';
    form.elements.date.value = event.data || '';
    form.elements.date.setCustomValidity('');
    form.elements.annual.checked = event.anual === true;
    form.hidden = false;
    form.elements.title.focus();
  }
  function draw() {
    const today = dayKey();
    const ordered = rows.map(row => ({...row, next:occurrence(row,today)})).filter(row => row.next);
    const upcoming = ordered.filter(row => row.next.days >= 0).sort((a,b) => a.next.days - b.next.days);
    const past = ordered.filter(row => row.next.days < 0).sort((a,b) => b.next.days - a.next.days);
    const next = upcoming[0];
    const reunion = upcoming.find(row => row.tipo === 'encontro');
    const migration = localReunion();
    button.hidden = !room;
    button.textContent = next ? `${next.titulo} · ${next.next.days === 0 ? 'hoje' : `${next.next.days} d`}` : 'Datas';
    const hadReunion = distance.classList.contains('sx-shared-reunion');
    distance.classList.toggle('sx-shared-reunion',Boolean(reunion));
    if (reunion) {
      reunionLabel.hidden = false;
      reunionLabel.textContent = reunion.next.days === 0 ? 'O próximo encontro é hoje.' : `Próximo encontro em ${reunion.next.days} ${reunion.next.days === 1 ? 'dia' : 'dias'}.`;
    }
    if (!reunion && hadReunion) {
      const remaining = (calendarDay(migration) - calendarDay(today));
      reunionLabel.hidden = !(remaining >= 0);
      reunionLabel.textContent = remaining === 0 ? 'É hoje que se vão ver.' : countdown(remaining) + ' para se verem.';
    }
    editLocal.hidden = Boolean(reunion) || !distance.querySelector('form').hidden;
    migrate.hidden = !Number.isFinite(calendarDay(migration)) || rows.some(row => row.tipo === 'encontro' && row.data === migration);
    const signature = JSON.stringify([today, ...[...upcoming,...past].map(({id,tipo,titulo,data,anual})=>[id,tipo,titulo,data,anual])]);
    if (drawn === signature) return;
    drawn = signature;
    list.replaceChildren();
    for (const row of [...upcoming,...past]) {
      const li = document.createElement('li');
      const title = document.createElement('strong');
      const description = document.createElement('p');
      const edit = document.createElement('button');
      const remove = document.createElement('button');
      title.textContent = row.titulo;
      description.textContent = `${kinds[row.tipo]} · ${displayDate.format(new Date(row.next.date))} · ${countdown(row.next.days)}`;
      edit.type = remove.type = 'button';
      edit.className = remove.className = 'text-button';
      edit.textContent = 'Editar';
      remove.textContent = 'Apagar';
      edit.setAttribute('aria-label','Editar ' + row.titulo);
      remove.setAttribute('aria-label','Apagar ' + row.titulo);
      edit.onclick = () => editor(row);
      remove.onclick = () => {
        hideEditor();
        deleteId = row.id;
        deletion.hidden = false;
        deletion.querySelector('button').focus();
      };
      li.append(title,description,edit,remove);
      list.append(li);
    }
    if (!list.childElementCount) {
      const empty = document.createElement('li');
      empty.textContent = 'Ainda não têm datas guardadas.';
      list.append(empty);
    }
  }
  function sync(nextApi, pair, me, isHome) {
    const nextRoom = nextApi && pair?.members?.length === 2 && pair.members.includes(me) && isHome
      ? pair.id : undefined;
    if (nextRoom !== room || me !== owner) {
      stop?.();
      stop = undefined;
      room = nextRoom;
      api = nextApi;
      owner = me;
      rows = [];
      feedback.textContent = '';
      hideEditor();
      if (dialog.open) dialog.close();
      if (room) {
        const snapshotRoom = room, snapshotOwner = owner;
        stop = api.watch(room, value => {
          if (room !== snapshotRoom || owner !== snapshotOwner) return;
          rows = value;
          draw();
        }, () => {
          if (room !== snapshotRoom || owner !== snapshotOwner) return;
          rows = [];
          feedback.textContent = 'Não foi possível carregar as datas partilhadas.';
          draw();
        });
      }
    }
    draw();
  }
  async function change(action) {
    if (busy || !room) return;
    const ownerAtStart = owner, roomAtStart = room;
    busy = true;
    feedback.textContent = 'A sincronizar…';
    form.querySelector('[type="submit"]').disabled = true;
    deletion.querySelector('button').disabled = true;
    try {
      await action();
      if (owner === ownerAtStart && room === roomAtStart) {
        feedback.textContent = 'Datas atualizadas.';
        hideEditor(true);
      }
    } catch {
      if (owner === ownerAtStart && room === roomAtStart) feedback.textContent = 'Não foi possível guardar a alteração. Tenta novamente.';
    } finally {
      busy = false;
      form.querySelector('[type="submit"]').disabled = false;
      deletion.querySelector('button').disabled = false;
    }
  }
  button.onclick = () => { draw(); dialog.showModal(); };
  dialog.querySelector('.sx-close-dates').onclick = () => dialog.close();
  dialog.querySelector('.sx-add-date').onclick = () => editor();
  dialog.querySelector('.sx-cancel-date').onclick = () => hideEditor(true);
  migrate.onclick = () => editor({tipo:'encontro',titulo:'Reencontro',data:localReunion()});
  form.elements.date.oninput = () => form.elements.date.setCustomValidity('');
  form.onsubmit = event => {
    event.preventDefault();
    const data = form.elements.date.value;
    if (!Number.isFinite(calendarDay(data))) {
      form.elements.date.setCustomValidity('Escolhe uma data válida.');
      form.elements.date.reportValidity();
      return;
    }
    const titulo = form.elements.title.value.trim();
    if (!titulo) { feedback.textContent = 'Escreve um título para esta data.'; return; }
    change(() => api.save(room,{id:editId,tipo:form.elements.kind.value,titulo,data,anual:form.elements.annual.checked}));
  };
  deletion.querySelector('.primary').onclick = () => change(() => api.remove(room,deleteId));
  deletion.querySelector('.secondary').onclick = () => hideEditor(true);
  dialog.addEventListener('close', () => hideEditor());
  return {sync};
}
