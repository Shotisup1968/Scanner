'use strict';

// Tout l'état tient dans localStorage : aucune donnée ne quitte le téléphone.
const STORAGE_KEY = 'saucisson-state-v1';
const UNDO_LIMIT = 50;

const $ = (id) => document.getElementById(id);

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultState() {
  const me = { id: uid(), name: 'Moi', count: 0 };
  return { perSausage: 25, people: [me], activeId: me.id, history: [] };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    if (!Array.isArray(s.people) || !s.people.length) return defaultState();
    s.perSausage = Math.max(1, parseInt(s.perSausage, 10) || 25);
    s.history = Array.isArray(s.history) ? s.history : [];
    if (!s.people.some((p) => p.id === s.activeId)) s.activeId = s.people[0].id;
    return s;
  } catch {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Navigation privée / stockage plein : l'appli continue en mémoire.
  }
}

let state = loadState();
const undoStack = [];

function pushUndo() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

function total() {
  return state.people.reduce((sum, p) => sum + p.count, 0);
}

function formatSausages(n) {
  return (Math.round(n * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

function plural(n, word) {
  return n > 1 ? word + 's' : word;
}

// ---------------------------------------------------------------- rendu

function render() {
  const t = total();
  const per = state.perSausage;
  const active = state.people.find((p) => p.id === state.activeId);

  $('total').textContent = active ? active.count : 0;
  $('total-label').textContent = plural(active ? active.count : 0, 'tranche');
  $('target-name').textContent = active ? active.name : '—';

  $('saucissons').textContent = formatSausages(t / per);
  const inCurrent = t % per;
  const current = Math.floor(t / per) + 1;
  $('eaten').style.width = (inCurrent / per) * 100 + '%';
  $('gauge-foot').textContent =
    `${t} ${plural(t, 'tranche')} · saucisson n°${current} : ${inCurrent}/${per}`;

  const max = Math.max(...state.people.map((p) => p.count));
  const leaders = state.people.filter((p) => p.count === max);
  const leaderId = max > 0 && leaders.length === 1 ? leaders[0].id : null;

  const list = $('people-list');
  list.replaceChildren(...state.people.map((p) => {
    const li = document.createElement('li');
    li.classList.toggle('active', p.id === state.activeId);

    const name = document.createElement('button');
    name.className = 'person-name';
    name.textContent = p.name;
    if (p.id === leaderId) {
      const crown = document.createElement('span');
      crown.className = 'crown';
      crown.textContent = '👑';
      crown.setAttribute('aria-label', 'en tête');
      name.append(crown);
    }
    attachLongPress(name, () => openPersonDialog(p));
    name.addEventListener('click', () => selectPerson(p.id));

    const minus = document.createElement('button');
    minus.className = 'round-btn';
    minus.textContent = '−';
    minus.setAttribute('aria-label', `Retirer une tranche à ${p.name}`);
    minus.disabled = p.count === 0;
    minus.addEventListener('click', () => addSlices(p.id, -1));

    const count = document.createElement('span');
    count.className = 'person-count';
    count.textContent = p.count;

    const plus = document.createElement('button');
    plus.className = 'round-btn plus';
    plus.textContent = '+';
    plus.setAttribute('aria-label', `Ajouter une tranche à ${p.name}`);
    plus.addEventListener('click', () => addSlices(p.id, 1));

    li.append(name, minus, count, plus);
    return li;
  }));

  const hist = $('history-list');
  hist.replaceChildren(...state.history.slice(0, 20).map((h) => {
    const li = document.createElement('li');
    const left = document.createElement('div');
    const date = document.createElement('div');
    date.className = 'h-date';
    date.textContent = new Date(h.date).toLocaleDateString('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
    const who = document.createElement('div');
    who.textContent = h.champion ? `👑 ${h.champion}` : `${h.people.length} ${plural(h.people.length, 'convive')}`;
    left.append(date, who);
    const right = document.createElement('div');
    right.className = 'h-stats';
    right.textContent = `${h.total} tr. · ${formatSausages(h.total / h.perSausage)} sauc.`;
    li.append(left, right);
    return li;
  }));
  $('history-empty').hidden = state.history.length > 0;

  $('btn-undo').disabled = undoStack.length === 0;
}

// ---------------------------------------------------------------- actions

function addSlices(personId, delta) {
  const p = state.people.find((x) => x.id === personId);
  if (!p || p.count + delta < 0) return;
  pushUndo();
  const before = total();
  p.count += delta;
  state.activeId = personId;
  saveState();
  render();

  if (delta > 0) {
    if (navigator.vibrate) navigator.vibrate(15);
    const after = total();
    const per = state.perSausage;
    if (Math.floor(after / per) > Math.floor(before / per)) {
      const n = Math.floor(after / per);
      toast(`Saucisson n°${n} terminé ! On en ouvre un autre ? 🎉`);
      if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
    }
  }
}

function selectPerson(id) {
  state.activeId = id;
  saveState();
  render();
}

function undo() {
  const prev = undoStack.pop();
  if (!prev) return;
  state = JSON.parse(prev);
  saveState();
  render();
  toast('Annulé');
}

function newSession() {
  const t = total();
  if (t === 0) {
    toast('Rien à archiver : personne n\'a encore mangé de saucisson.');
    return;
  }
  if (!confirm(`Archiver cette soirée (${t} ${plural(t, 'tranche')}) et remettre les compteurs à zéro ?`)) return;

  const max = Math.max(...state.people.map((p) => p.count));
  const leaders = state.people.filter((p) => p.count === max);
  pushUndo();
  state.history.unshift({
    date: Date.now(),
    total: t,
    perSausage: state.perSausage,
    champion: leaders.length === 1 ? leaders[0].name : null,
    people: state.people.map((p) => ({ name: p.name, count: p.count })),
  });
  state.history = state.history.slice(0, 100);
  state.people.forEach((p) => { p.count = 0; });
  saveState();
  render();
  toast('Soirée archivée. À la prochaine !');
}

// ---------------------------------------------------------------- dialogues

let editingPerson = null;

function openPersonDialog(person) {
  editingPerson = person || null;
  $('dlg-person-title').textContent = person ? 'Modifier le convive' : 'Nouveau convive';
  $('in-person-name').value = person ? person.name : '';
  $('btn-delete-person').hidden = !person || state.people.length <= 1;
  $('dlg-person').showModal();
  $('in-person-name').focus();
}

$('dlg-person').addEventListener('close', () => {
  const action = $('dlg-person').returnValue;
  const name = $('in-person-name').value.trim();

  if (action === 'delete' && editingPerson) {
    if (!confirm(`Supprimer ${editingPerson.name} et ses ${editingPerson.count} tranches ?`)) return;
    pushUndo();
    state.people = state.people.filter((p) => p.id !== editingPerson.id);
    if (state.activeId === editingPerson.id) state.activeId = state.people[0].id;
  } else if (action === 'ok' && name) {
    pushUndo();
    if (editingPerson) {
      const p = state.people.find((x) => x.id === editingPerson.id);
      if (p) p.name = name;
    } else {
      const p = { id: uid(), name, count: 0 };
      state.people.push(p);
      state.activeId = p.id;
    }
  } else {
    return;
  }
  saveState();
  render();
});

$('dlg-settings').addEventListener('close', () => {
  if ($('dlg-settings').returnValue !== 'ok') return;
  const v = parseInt($('in-per-sausage').value, 10);
  if (!v || v < 1) return;
  state.perSausage = Math.min(500, v);
  saveState();
  render();
});

// Appui long sur un prénom = renommer / supprimer.
function attachLongPress(el, fn) {
  let timer = null;
  let fired = false;
  const start = () => {
    fired = false;
    timer = setTimeout(() => { fired = true; fn(); }, 550);
  };
  const cancel = () => clearTimeout(timer);
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); });
  el.addEventListener('click', (e) => {
    if (fired) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------------------------------------------------------------- branchements

$('btn-slice').addEventListener('click', () => {
  const btn = $('btn-slice');
  btn.classList.remove('bump');
  void btn.offsetWidth; // relance l'animation à chaque tap
  btn.classList.add('bump');
  addSlices(state.activeId, 1);
});
$('btn-undo').addEventListener('click', undo);
$('btn-add-person').addEventListener('click', () => openPersonDialog(null));
$('btn-new-session').addEventListener('click', newSession);
$('btn-settings').addEventListener('click', () => {
  $('in-per-sausage').value = state.perSausage;
  $('dlg-settings').showModal();
});

render();

if (!localStorage.getItem('saucisson-hint-seen')) {
  try { localStorage.setItem('saucisson-hint-seen', '1'); } catch { /* ignore */ }
  setTimeout(() => toast('Astuce : appui long sur un prénom pour le renommer'), 800);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
