'use strict';

// Réception de stock : tout l'état tient dans localStorage, rien ne quitte le
// téléphone tant qu'un export n'est pas partagé explicitement.
const STORAGE_KEY = 'stock-reception-v1';

const $ = (id) => document.getElementById(id);

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyDraft() {
  return { date: today(), supplier: '', bl: '', lines: [] };
}

function loadState() {
  const base = { draft: emptyDraft(), receptions: [], catalog: {}, suppliers: [], separator: ',' };
  try {
    localStorage.removeItem('saucisson-state-v1'); // ancienne version "jeu", plus utilisée
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const s = JSON.parse(raw);
    return {
      draft: s.draft && Array.isArray(s.draft.lines) ? s.draft : base.draft,
      receptions: Array.isArray(s.receptions) ? s.receptions : [],
      catalog: s.catalog && typeof s.catalog === 'object' ? s.catalog : {},
      suppliers: Array.isArray(s.suppliers) ? s.suppliers : [],
      separator: s.separator === ';' ? ';' : ',',
    };
  } catch {
    return base;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Impossible d\'enregistrer sur cet appareil (stockage plein ou navigation privée).');
  }
}

let state = loadState();
let editingLineId = null;

// ---------------------------------------------------------------- utilitaires

const nf3 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

function lineKg(line) {
  return (line.pieces * line.weight) / 1000;
}

function totals(lines) {
  return {
    pieces: lines.reduce((s, l) => s + l.pieces, 0),
    kg: lines.reduce((s, l) => s + lineKg(l), 0),
  };
}

function formatKg(kg) {
  return `${nf3.format(Math.round(kg * 1000) / 1000)} kg`;
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function plural(n, word) {
  return n > 1 ? word + 's' : word;
}

function normName(name) {
  return name.trim().replace(/\s+/g, ' ');
}

function catalogKey(name) {
  return normName(name).toLocaleLowerCase('fr-FR');
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------- navigation

const TITLES = { reception: 'Réception', history: 'Historique', products: 'Produits' };

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  $('view-title').textContent = TITLES[name];
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

// ---------------------------------------------------------------- rendu

function renderDraft() {
  const d = state.draft;
  $('in-date').value = d.date;
  $('in-supplier').value = d.supplier;
  $('in-bl').value = d.bl;
  renderLines();
}

function renderLines() {
  const lines = state.draft.lines;
  $('lines').replaceChildren(...lines.map((l) => {
    const main = el('button', { className: 'line-main', type: 'button' },
      el('span', { className: 'line-name', textContent: l.product }),
      el('span', { className: 'line-meta', textContent: `${l.weight} g/pièce · ${formatKg(lineKg(l))}` }));
    main.addEventListener('click', () => startEditLine(l.id));

    const del = el('button', { className: 'del-btn', type: 'button', ariaLabel: `Supprimer ${l.product}` });
    del.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    del.addEventListener('click', () => deleteLine(l.id));

    const li = el('li', {}, main, el('span', { className: 'line-qty', textContent: `× ${l.pieces}` }), del);
    li.classList.toggle('editing', l.id === editingLineId);
    return li;
  }));

  const t = totals(lines);
  $('lines-count').textContent = lines.length;
  $('lines-empty').hidden = lines.length > 0;
  $('totals').hidden = lines.length === 0;
  $('tot-pieces').textContent = t.pieces;
  $('tot-weight').textContent = formatKg(t.kg);
  $('btn-validate').disabled = lines.length === 0;
}

function renderDatalists() {
  const products = Object.values(state.catalog).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  $('dl-products').replaceChildren(...products.map((p) => el('option', { value: p.name, label: `${p.weight} g` })));
  $('dl-suppliers').replaceChildren(...state.suppliers.map((s) => el('option', { value: s })));
}

function renderHistory() {
  const pending = state.receptions.filter((r) => !r.exportedAt);
  $('badge-pending').hidden = pending.length === 0;
  $('badge-pending').textContent = pending.length;
  $('btn-export-pending').disabled = pending.length === 0;
  $('btn-export-pending').textContent = pending.length
    ? `Exporter les réceptions en attente (${pending.length})`
    : 'Tout est exporté ✓';
  $('history-empty').hidden = state.receptions.length > 0;

  $('history').replaceChildren(...state.receptions.map((r) => {
    const t = totals(r.lines);
    const head = el('button', { className: 'h-head', type: 'button' },
      el('span', { className: 'h-main' },
        el('span', { className: 'h-title', textContent: `${r.supplier || 'Fournisseur non précisé'}${r.bl ? ' · n° ' + r.bl : ''}` }),
        el('span', { className: 'h-sub', textContent: `${formatDate(r.date)} · ${t.pieces} pcs · ${formatKg(t.kg)}` })),
      el('span', { className: `status ${r.exportedAt ? 'done' : 'pending'}`, textContent: r.exportedAt ? 'Exporté' : 'À exporter' }));

    const table = el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { textContent: 'Produit' }), el('th', { className: 'num', textContent: 'Pcs' }),
        el('th', { className: 'num', textContent: 'g/pc' }), el('th', { className: 'num', textContent: 'Total' }))),
      el('tbody', {}, ...r.lines.map((l) => el('tr', {},
        el('td', { textContent: l.product }),
        el('td', { className: 'num', textContent: l.pieces }),
        el('td', { className: 'num', textContent: l.weight }),
        el('td', { className: 'num', textContent: formatKg(lineKg(l)) })))));

    const exportBtn = el('button', { className: 'primary-btn', type: 'button', textContent: r.exportedAt ? 'Ré-exporter' : 'Exporter CSV' });
    exportBtn.addEventListener('click', () => exportReceptions([r]));
    const delBtn = el('button', { className: 'text-btn danger', type: 'button', textContent: 'Supprimer' });
    delBtn.addEventListener('click', () => deleteReception(r.id));

    const li = el('li', {}, head, el('div', { className: 'h-body' },
      el('p', { className: 'muted small', textContent: `Réf. ${r.id}${r.exportedAt ? ' · exporté le ' + new Date(r.exportedAt).toLocaleString('fr-FR') : ''}`, style: 'margin-top:10px' }),
      table, el('div', { className: 'h-actions' }, delBtn, exportBtn)));
    head.addEventListener('click', () => li.classList.toggle('open'));
    return li;
  }));
}

function renderCatalog() {
  const products = Object.values(state.catalog).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  $('catalog-empty').hidden = products.length > 0;
  $('catalog').replaceChildren(...products.map((p) => {
    const btn = el('button', { type: 'button' },
      el('span', { className: 'c-name', textContent: p.name }),
      el('span', { className: 'c-weight', textContent: `${p.weight} g` }));
    btn.addEventListener('click', () => openProductDialog(p));
    return el('li', {}, btn);
  }));
}

function renderAll() {
  renderDraft();
  renderDatalists();
  renderHistory();
  renderCatalog();
}

// ---------------------------------------------------------------- saisie d'une ligne

function readForm() {
  return {
    product: normName($('in-product').value),
    pieces: parseInt($('in-pieces').value, 10),
    weight: parseInt($('in-weight').value, 10),
  };
}

function updatePreview() {
  const f = readForm();
  $('line-preview').textContent = f.pieces > 0 && f.weight > 0
    ? `${f.pieces} × ${f.weight} g = ${formatKg((f.pieces * f.weight) / 1000)}`
    : ' ';
}

function resetForm() {
  editingLineId = null;
  $('in-product').value = '';
  $('in-pieces').value = 1;
  $('in-weight').value = '';
  $('form-line-title').textContent = 'Ajouter un produit';
  $('btn-add-line').textContent = 'Ajouter la ligne';
  $('btn-cancel-edit').hidden = true;
  updatePreview();
}

function startEditLine(id) {
  const l = state.draft.lines.find((x) => x.id === id);
  if (!l) return;
  editingLineId = id;
  $('in-product').value = l.product;
  $('in-pieces').value = l.pieces;
  $('in-weight').value = l.weight;
  $('form-line-title').textContent = 'Modifier la ligne';
  $('btn-add-line').textContent = 'Enregistrer';
  $('btn-cancel-edit').hidden = false;
  updatePreview();
  renderLines();
  $('form-line').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Garde l'orthographe déjà connue ("rosette de lyon" ne remplace pas "Rosette de Lyon").
function rememberProduct(name, weight) {
  const key = catalogKey(name);
  const known = state.catalog[key];
  state.catalog[key] = { name: known ? known.name : name, weight };
}

function rememberSupplier(name) {
  const n = normName(name);
  if (!n) return;
  state.suppliers = [n, ...state.suppliers.filter((s) => s.toLocaleLowerCase('fr-FR') !== n.toLocaleLowerCase('fr-FR'))].slice(0, 50);
}

$('form-line').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = readForm();
  if (!f.product || !(f.pieces > 0) || !(f.weight > 0)) {
    toast('Renseigne le nom, le nombre de pièces et le grammage.');
    return;
  }

  const lines = state.draft.lines;
  if (editingLineId) {
    const l = lines.find((x) => x.id === editingLineId);
    if (l) Object.assign(l, f);
    toast('Ligne modifiée');
  } else {
    // Même produit au même grammage : on cumule plutôt que dupliquer la ligne.
    const same = lines.find((l) => catalogKey(l.product) === catalogKey(f.product) && l.weight === f.weight);
    if (same) {
      same.pieces += f.pieces;
      toast(`${same.product} : ${same.pieces} pièces au total`);
    } else {
      lines.push({ id: uid(), ...f });
    }
  }
  rememberProduct(f.product, f.weight);
  saveState();
  resetForm();
  renderLines();
  renderDatalists();
  renderCatalog();
  $('in-product').focus();
});

$('btn-cancel-edit').addEventListener('click', () => { resetForm(); renderLines(); });

// Choisir un produit connu pré-remplit son grammage habituel.
$('in-product').addEventListener('input', () => {
  const known = state.catalog[catalogKey($('in-product').value)];
  if (known && !editingLineId) $('in-weight').value = known.weight;
  updatePreview();
});
$('in-pieces').addEventListener('input', updatePreview);
$('in-weight').addEventListener('input', updatePreview);

function stepPieces(delta) {
  const v = Math.max(1, (parseInt($('in-pieces').value, 10) || 0) + delta);
  $('in-pieces').value = v;
  updatePreview();
}
$('btn-pieces-minus').addEventListener('click', () => stepPieces(-1));
$('btn-pieces-plus').addEventListener('click', () => stepPieces(1));

function deleteLine(id) {
  const l = state.draft.lines.find((x) => x.id === id);
  if (!l || !confirm(`Supprimer la ligne « ${l.product} » ?`)) return;
  state.draft.lines = state.draft.lines.filter((x) => x.id !== id);
  if (editingLineId === id) resetForm();
  saveState();
  renderLines();
}

['in-date', 'in-supplier', 'in-bl'].forEach((id) => {
  $(id).addEventListener('input', () => {
    state.draft.date = $('in-date').value || today();
    state.draft.supplier = $('in-supplier').value;
    state.draft.bl = $('in-bl').value;
    saveState();
  });
});

$('btn-clear-draft').addEventListener('click', () => {
  if (!state.draft.lines.length && !state.draft.supplier && !state.draft.bl) return;
  if (!confirm('Effacer toute la réception en cours ?')) return;
  state.draft = emptyDraft();
  saveState();
  resetForm();
  renderDraft();
});

// ---------------------------------------------------------------- validation

function newReceptionId(date) {
  const n = state.receptions.filter((r) => r.date === date).length + 1;
  return `R${date.replace(/-/g, '')}-${String(n).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

$('btn-validate').addEventListener('click', () => {
  const d = state.draft;
  if (!d.lines.length) return;

  const pending = readForm();
  if (pending.product && !editingLineId) {
    toast('Une ligne est en cours de saisie : ajoute-la ou vide le champ avant de valider.');
    $('in-product').focus();
    return;
  }

  const date = $('in-date').value || today();
  const reception = {
    id: newReceptionId(date),
    date,
    supplier: normName($('in-supplier').value),
    bl: normName($('in-bl').value),
    lines: d.lines.map(({ product, pieces, weight }) => ({ product, pieces, weight })),
    createdAt: Date.now(),
    exportedAt: null,
  };
  state.receptions.unshift(reception);
  rememberSupplier(reception.supplier);
  state.draft = emptyDraft();
  saveState();
  resetForm();
  renderAll();

  // Même geste utilisateur : la feuille de partage iOS s'ouvre directement.
  exportReceptions([reception]);
});

function deleteReception(id) {
  const r = state.receptions.find((x) => x.id === id);
  if (!r) return;
  const warn = r.exportedAt ? '' : '\nAttention : elle n\'a pas encore été exportée.';
  if (!confirm(`Supprimer la réception du ${formatDate(r.date)} ?${warn}`)) return;
  state.receptions = state.receptions.filter((x) => x.id !== id);
  saveState();
  renderHistory();
}

// ---------------------------------------------------------------- export CSV

const CSV_COLUMNS = ['reception_id', 'date_reception', 'fournisseur', 'bon_livraison', 'produit', 'pieces', 'grammage_g', 'poids_total_kg'];

function csvField(value, sep) {
  const s = String(value ?? '');
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(receptions) {
  const sep = state.separator;
  const rows = [CSV_COLUMNS];
  // Ordre chronologique dans le fichier, plus naturel pour un import.
  [...receptions].sort((a, b) => a.createdAt - b.createdAt).forEach((r) => {
    r.lines.forEach((l) => {
      rows.push([r.id, r.date, r.supplier, r.bl, l.product, l.pieces, l.weight, lineKg(l).toFixed(3)]);
    });
  });
  return rows.map((row) => row.map((v) => csvField(v, sep)).join(sep)).join('\r\n') + '\r\n';
}

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function csvFileName(receptions) {
  if (receptions.length === 1) {
    const r = receptions[0];
    return `reception_${r.date}${r.supplier ? '_' + slug(r.supplier) : ''}.csv`;
  }
  return `receptions_${today()}_${receptions.length}.csv`;
}

async function exportReceptions(receptions) {
  if (!receptions.length) return;
  const name = csvFileName(receptions);
  const file = new File([buildCsv(receptions)], name, { type: 'text/csv' });

  let done = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      done = true;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        toast('Export annulé — la réception reste « à exporter » dans l\'historique.');
        return;
      }
      // Partage refusé (ex. plus de geste utilisateur actif) : on télécharge.
    }
  }
  if (!done) {
    const url = URL.createObjectURL(file);
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    done = true;
  }

  const now = Date.now();
  receptions.forEach((r) => {
    const stored = state.receptions.find((x) => x.id === r.id);
    if (stored) stored.exportedAt = now;
  });
  saveState();
  renderHistory();
  toast(`${name} exporté`);
}

$('btn-export-pending').addEventListener('click', () => {
  exportReceptions(state.receptions.filter((r) => !r.exportedAt));
});

// ---------------------------------------------------------------- dialogues

$('btn-settings').addEventListener('click', () => {
  $('in-separator').value = state.separator;
  $('dlg-settings').showModal();
});
$('dlg-settings').addEventListener('close', () => {
  if ($('dlg-settings').returnValue !== 'ok') return;
  state.separator = $('in-separator').value === ';' ? ';' : ',';
  saveState();
  toast('Réglages enregistrés');
});

let editingProductKey = null;
function openProductDialog(p) {
  editingProductKey = catalogKey(p.name);
  $('in-cat-name').value = p.name;
  $('in-cat-weight').value = p.weight;
  $('dlg-product').showModal();
}
$('dlg-product').addEventListener('close', () => {
  const action = $('dlg-product').returnValue;
  if (!editingProductKey) return;
  if (action === 'delete') {
    delete state.catalog[editingProductKey];
  } else if (action === 'ok') {
    const name = normName($('in-cat-name').value);
    const weight = parseInt($('in-cat-weight').value, 10);
    if (!name || !(weight > 0)) return;
    delete state.catalog[editingProductKey];
    rememberProduct(name, weight);
  } else {
    return;
  }
  editingProductKey = null;
  saveState();
  renderDatalists();
  renderCatalog();
});

// ---------------------------------------------------------------- démarrage

renderAll();
resetForm();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
