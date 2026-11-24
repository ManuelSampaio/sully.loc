import { MOODS } from './core.js?rev=home-focus';
import { icon } from './icons.js?rev=period-moods';

const durations = {
  trabalhar: [60, 120, 240, 480],
  treinar: [45, 60, 90, 120],
  deslocacao: [15, 30, 60, 120]
};
const defaults = {trabalhar:240, treinar:90, deslocacao:30};
const statusIcons = {disponivel:'leaf', trabalhar:'briefcase', treinar:'sun', dormir:'moon',
  deslocacao:'pin', sesta:'cloud', estudar:'book', ocupado:'cup'};
const stateCopy = {
  dormir:'Deixa um coração para quando acordar',
  trabalhar:'Está a trabalhar. Um coração não incomoda.',
  treinar:'A treinar. Vê quando acabar.',
  deslocacao:'A caminho. Pergunta se chegou bem.',
  disponivel:'Está disponível agora.'
};

function sheet(id, title) {
  const dialog = document.createElement('dialog');
  dialog.className = 'sx-sheet';
  dialog.id = id;
  dialog.setAttribute('aria-labelledby', id + '-title');
  dialog.innerHTML = `<div class="sx-sheet-heading"><h2 id="${id}-title">${title}</h2><button type="button" class="secondary" aria-label="Fechar">Fechar</button></div>`;
  dialog.querySelector('button').onclick = () => dialog.close();
  document.body.append(dialog);
  return dialog;
}

export function configureToday({setStatus}) {
  const q = selector => document.querySelector(selector);
  const statusSheet = sheet('sx-status-sheet', 'O meu estado');
  const touchSheet = sheet('sx-touch-sheet', 'Mais toques');
  const moodSheet = sheet('sx-mood-sheet', 'O meu check-in');
  const home = q('#page-home');
  const partner = q('.partner-card');
  const moodCard = q('.mood-card');
  const statusCard = q('.status-card');
  const quick = q('.quick-card');

  const stateTrigger = document.createElement('button');
  stateTrigger.type = 'button';
  stateTrigger.className = 'secondary sx-state-trigger';
  stateTrigger.innerHTML = '<span class="sx-own-state-copy"><small>O meu estado</small><strong>Ainda sem estado</strong></span>';
  const stateValue = stateTrigger.querySelector('strong');
  stateTrigger.append(icon('down'));
  stateTrigger.setAttribute('aria-haspopup', 'dialog');
  home.querySelector('.page-heading').append(stateTrigger);
  stateTrigger.onclick = () => statusSheet.showModal();
  statusSheet.append(statusCard);
  statusCard.open = true;
  statusCard.querySelector('summary').hidden = true;

  const durationForm = document.createElement('form');
  durationForm.className = 'sx-duration';
  durationForm.hidden = true;
  durationForm.innerHTML = '<fieldset><legend>Quanto tempo?</legend><div class="sx-options"></div></fieldset><label class="sx-until" hidden>Até às <input type="time"></label><button class="primary" type="submit">Definir</button>';
  statusSheet.append(durationForm);
  const options = durationForm.querySelector('.sx-options');
  const fieldset = durationForm.querySelector('fieldset');
  const timeLabel = durationForm.querySelector('.sx-until');
  const time = durationForm.querySelector('input[type=time]');
  let selection = '', minutes = 0;
  function syncTime() {
    timeLabel.hidden = minutes !== -1;
    time.required = minutes === -1;
    time.disabled = minutes !== -1;
  }
  function openDuration(button) {
    selection = button.dataset.status;
    if (selection === 'sesta') {
      statusSheet.close();
      q('#nap-dialog').showModal();
      return;
    }
    minutes = selection === 'dormir' ? -1 : defaults[selection] ?? 0;
    options.replaceChildren();
    fieldset.hidden = !durations[selection];
    for (const value of durations[selection] ? [...durations[selection], -1] : []) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'sx-duration';
      input.checked = value === minutes;
      input.onchange = () => { minutes = value; syncTime(); };
      label.append(input, value < 0 ? 'Personalizado' : value < 60 ? `${value} min`
        : `${Math.floor(value / 60)} h${value % 60 ? ' ' + value % 60 : ''}`);
      options.append(label);
    }
    time.value = '';
    if (selection === 'dormir') {
      try { time.value = localStorage.getItem('sully.ui.horaAcordar') || '07:00'; }
      catch { time.value = '07:00'; }
    }
    syncTime();
    durationForm.hidden = false;
    (options.querySelector(':checked') || (!time.disabled ? time : durationForm.querySelector('button'))).focus();
  }
  statusCard.querySelectorAll('[data-status]:not([hidden])').forEach(button => {
    button.onclick = () => openDuration(button);
  });
  statusSheet.addEventListener('close', () => { durationForm.hidden = true; });
  durationForm.onsubmit = event => {
    event.preventDefault();
    let duration = minutes;
    if (duration < 0) {
      if (!time.reportValidity()) return;
      const now = new Date();
      const [hours, mins] = time.value.split(':').map(Number);
      const end = new Date(now);
      end.setHours(hours, mins, 0, 0);
      if (end <= now) end.setDate(end.getDate() + 1);
      duration = Math.min(1440, (end - now) / 60000);
    }
    if (!setStatus(selection, duration)) return;
    if (selection === 'dormir') {
      try { localStorage.setItem('sully.ui.horaAcordar', time.value); } catch { /* Storage unavailable. */ }
    }
    statusSheet.close();
  };

  const more = q('.more-touches');
  const moreTrigger = document.createElement('button');
  moreTrigger.type = 'button';
  moreTrigger.className = 'text-button sx-more';
  moreTrigger.setAttribute('aria-haspopup', 'dialog');
  moreTrigger.textContent = '⋯ mais';
  more.before(moreTrigger);
  touchSheet.append(more);
  more.open = true;
  more.querySelector('summary').hidden = true;
  moreTrigger.onclick = () => touchSheet.showModal();
  more.addEventListener('click', event => {
    if (event.target.closest('button')) touchSheet.close();
  }, {capture:true});
  const chat = q('#home-chat');
  partner.insertBefore(quick, chat);
  const heart = q('#send-heart');
  const heartText = [...heart.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
  const context = document.createElement('p');
  context.className = 'sx-status-context';
  heart.after(context);
  const state = q('#partner-state');
  const detail = document.createElement('span');
  detail.className = 'sx-state-detail';
  state.after(detail);
  let lastStatus;

  const inviteTitle = document.createElement('h2');
  inviteTitle.className = 'sx-invite-title';
  inviteTitle.textContent = 'Convida a tua pessoa';
  q('#partner-name').before(inviteTitle);
  const optionalNote = document.createElement('details');
  optionalNote.className = 'sx-optional-note';
  const optionalLabel = document.createElement('summary');
  optionalLabel.textContent = 'Acrescentar nota';
  q('#mood-note-label').before(optionalNote);
  optionalNote.append(optionalLabel, q('#mood-note-label'), q('#mood-note'));

  const checkIn = document.createElement('button');
  checkIn.type = 'button';
  checkIn.className = 'secondary sx-checkin';
  checkIn.setAttribute('aria-haspopup', 'dialog');
  moodCard.before(checkIn);
  const calendarPeriod = {manha:'manhã', tarde:'tarde', noite:'noite'};
  let currentPeriod, completed = false;
  checkIn.onclick = () => {
    q(`[data-period="${currentPeriod}"]`)?.click();
    moodSheet.append(moodCard);
    moodCard.open = true;
    moodSheet.showModal();
  };
  moodSheet.addEventListener('close', () => {
    checkIn.after(moodCard);
    moodCard.hidden = completed;
    checkIn.hidden = !completed;
  });
  const settingsConnection = document.createElement('p');
  settingsConnection.id = 'sx-profile-connection';
  settingsConnection.className = 'sx-profile-connection';
  q('#settings-menu').append(settingsConnection);

  return {
    render({status, until, period, checkIn:record, ownStatus}) {
      if (stateValue.textContent !== ownStatus) stateValue.textContent = ownStatus;
      stateTrigger.setAttribute('aria-label', 'O meu estado · ' + ownStatus + ' · alterar');
      chat.classList.toggle('sx-chat-highlight', status === 'disponivel');
      const copy = stateCopy[status] || '';
      heartText.textContent = status === 'dormir' ? 'Deixa um coração' : 'Enviar um coração';
      context.textContent = copy;
      context.hidden = !copy;
      detail.hidden = !status;
      const iconName = statusIcons[status];
      if (lastStatus !== status || until) {
        detail.replaceChildren();
        if (iconName) detail.append(icon(iconName));
        if (until && status !== 'disponivel') {
          detail.append('até às ' + new Date(until).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'}));
        }
        detail.hidden = !detail.childNodes.length;
        lastStatus = status;
      }
      if (currentPeriod !== period && !moodSheet.open) {
        currentPeriod = period;
        q(`[data-period="${period}"]`)?.click();
      }
      completed = Boolean(record);
      if (!moodSheet.open) {
        checkIn.hidden = !completed;
        moodCard.hidden = completed;
      }
      if (completed) {
        const label = MOODS.find(([id]) => id === record.mood)?.[2] || record.mood;
        checkIn.textContent = `Partilhaste: ${label} · ${calendarPeriod[period]}`;
      }
    }
  };
}
