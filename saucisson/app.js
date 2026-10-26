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

// email : boîte qui reçoit les réceptions ; serverUrl/serverKey : script
// d'envoi automatique hébergé chez OVH (voir serveur-ovh/).
const DEFAULT_EMAIL = 'commandes@notoriouspig.eu';
const DEFAULT_SETTINGS = { email: DEFAULT_EMAIL, serverUrl: '', serverKey: '' };

// Types de produits reçus. Les données d'avant leur ajout sont des saucissons.
const CATEGORIES = ['Saucisson', 'Fuet', 'Noix d\'épaule', 'Terrine', 'Rillettes'];
const DEFAULT_CATEGORY = CATEGORIES[0];
const PLACEHOLDERS = {
  Saucisson: 'ex. Piment fort',
  Fuet: 'ex. Fuet nature',
  'Noix d\'épaule': 'ex. Noix d\'épaule au poivre',
  Terrine: 'ex. Terrine de campagne',
  Rillettes: 'ex. Rillettes de canard',
};

function validCategory(c) {
  return CATEGORIES.includes(c) ? c : DEFAULT_CATEGORY;
}

function normalizeLines(lines) {
  lines.forEach((l) => { l.category = validCategory(l.category); });
  return lines;
}

// Re-clé le catalogue par type + nom (une terrine « Canard » n'est pas un
// saucisson « Canard », et n'a pas le même grammage).
function normalizeCatalog(catalog) {
  const out = {};
  Object.values(catalog || {}).forEach((p) => {
    if (!p || !p.name || !(p.weight > 0)) return;
    const category = validCategory(p.category);
    out[catalogKey(p.name, category)] = { name: p.name, weight: p.weight, category };
  });
  return out;
}

function loadState() {
  const base = {
    draft: emptyDraft(), receptions: [], catalog: {}, suppliers: [], separator: ';',
    settings: { ...DEFAULT_SETTINGS }, lastBackupAt: null, lastCategory: DEFAULT_CATEGORY,
  };
  try {
    localStorage.removeItem('saucisson-state-v1'); // ancienne version "jeu", plus utilisée
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const s = JSON.parse(raw);
    const loaded = {
      draft: s.draft && Array.isArray(s.draft.lines) ? s.draft : base.draft,
      receptions: Array.isArray(s.receptions) ? s.receptions : [],
      catalog: s.catalog && typeof s.catalog === 'object' ? s.catalog : {},
      suppliers: Array.isArray(s.suppliers) ? s.suppliers : [],
      separator: s.separator === ',' ? ',' : ';',
      settings: { ...DEFAULT_SETTINGS, ...(s.settings && typeof s.settings === 'object' ? s.settings : {}) },
      lastBackupAt: s.lastBackupAt || null,
    };
    normalizeLines(loaded.draft.lines);
    loaded.receptions.forEach((r) => normalizeLines(Array.isArray(r.lines) ? r.lines : (r.lines = [])));
    loaded.catalog = normalizeCatalog(loaded.catalog);
    loaded.lastCategory = validCategory(s.lastCategory);
    // Adresse de Notorious PIG par défaut si aucune n'a été saisie.
    if (!loaded.settings.email) loaded.settings.email = DEFAULT_EMAIL;
    return loaded;
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

function catalogKey(name, category) {
  return `${validCategory(category)}|${normName(name).toLocaleLowerCase('fr-FR')}`;
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

// Confirmation dans la page plutôt que confirm() : même rendu partout, et
// confirm() est désactivé dans certains contextes (aperçus intégrés).
function ask(message, okLabel = 'Supprimer') {
  return new Promise((resolve) => {
    const dlg = $('dlg-confirm');
    $('confirm-message').textContent = message;
    $('confirm-ok').textContent = okLabel;
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
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
      el('span', { className: 'line-meta', textContent: `${l.category} · ${l.weight} g/pièce · ${formatKg(lineKg(l))}` }));
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
  $('tot-cats').textContent = categorySummary(lines);
  $('btn-validate').disabled = lines.length === 0;
}

// "Saucisson : 23 pcs · Terrine : 5 pcs" (rien s'il n'y a qu'un seul type).
function categorySummary(lines) {
  const byCat = CATEGORIES
    .map((c) => ({ c, pieces: lines.filter((l) => l.category === c).reduce((sum, l) => sum + l.pieces, 0) }))
    .filter((x) => x.pieces > 0);
  return byCat.length > 1 ? byCat.map((x) => `${x.c} : ${x.pieces} pcs`).join(' · ') : '';
}

function renderCategoryChips() {
  $('cat-chips').replaceChildren(...CATEGORIES.map((c) => {
    const chip = el('button', { type: 'button', className: 'chip', textContent: c });
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', String(c === selectedCategory));
    chip.addEventListener('click', () => selectCategory(c));
    return chip;
  }));
  $('in-product').placeholder = PLACEHOLDERS[selectedCategory];
}

function selectCategory(c) {
  selectedCategory = validCategory(c);
  if (!editingLineId) {
    state.lastCategory = selectedCategory;
    saveState();
  }
  renderCategoryChips();
  renderDatalists();
  prefillWeight();
}

function renderDatalists() {
  const products = Object.values(state.catalog)
    .filter((p) => p.category === selectedCategory)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  $('dl-products').replaceChildren(...products.map((p) => el('option', { value: p.name, label: `${p.weight} g` })));
  $('dl-suppliers').replaceChildren(...state.suppliers.map((s) => el('option', { value: s })));
}

function isDelivered(r) {
  return Boolean(r.exportedAt || r.sentAt);
}

function statusOf(r) {
  if (r.sentAt) return { cls: 'done', text: 'Envoyé' };
  if (r.exportedAt) return { cls: 'done', text: 'Exporté' };
  if (r.queued) return { cls: 'pending', text: 'Envoi en attente' };
  return { cls: 'pending', text: 'À exporter' };
}

function renderHistory() {
  const pending = state.receptions.filter((r) => !isDelivered(r));
  $('badge-pending').hidden = pending.length === 0;
  $('badge-pending').textContent = pending.length;
  $('btn-export-pending').disabled = pending.length === 0;
  $('btn-export-pending').textContent = pending.length
    ? `${deliveryMode() === 'share' ? 'Exporter' : 'Envoyer'} les réceptions en attente (${pending.length})`
    : 'Tout est envoyé ✓';
  $('history-empty').hidden = state.receptions.length > 0;

  $('history').replaceChildren(...state.receptions.map((r) => {
    const t = totals(r.lines);
    const head = el('button', { className: 'h-head', type: 'button' },
      el('span', { className: 'h-main' },
        el('span', { className: 'h-title', textContent: `${r.supplier || 'Fournisseur non précisé'}${r.bl ? ' · n° ' + r.bl : ''}` }),
        el('span', { className: 'h-sub', textContent: `${formatDate(r.date)} · ${t.pieces} pcs · ${formatKg(t.kg)}` })),
      el('span', { className: `status ${statusOf(r).cls}`, textContent: statusOf(r).text }));

    const table = el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { textContent: 'Produit' }), el('th', { className: 'num', textContent: 'Pcs' }),
        el('th', { className: 'num', textContent: 'g/pc' }), el('th', { className: 'num', textContent: 'Total' }))),
      el('tbody', {}, ...r.lines.map((l) => el('tr', {},
        el('td', {}, el('span', { className: 'td-cat', textContent: l.category }), l.product),
        el('td', { className: 'num', textContent: l.pieces }),
        el('td', { className: 'num', textContent: l.weight }),
        el('td', { className: 'num', textContent: formatKg(lineKg(l)) })))));

    const actions = [];
    const delBtn = el('button', { className: 'text-btn danger', type: 'button', textContent: 'Supprimer' });
    delBtn.addEventListener('click', () => deleteReception(r.id));
    actions.push(delBtn);

    const fileBtn = el('button', { className: 'text-btn accent', type: 'button', textContent: 'Fichier CSV' });
    fileBtn.addEventListener('click', () => exportReceptions([r]));
    actions.push(fileBtn);

    if (state.settings.serverUrl) {
      const sendBtn = el('button', { className: 'primary-btn', type: 'button', textContent: r.sentAt ? 'Renvoyer' : 'Envoyer' });
      sendBtn.addEventListener('click', () => sendToServer([r], { manual: true }));
      actions.push(sendBtn);
    } else if (state.settings.email) {
      const mailBtn = el('button', { className: 'primary-btn', type: 'button', textContent: 'Envoyer par mail' });
      mailBtn.addEventListener('click', () => openMail([r]));
      actions.push(mailBtn);
    }

    const info = [`Réf. ${r.id}`];
    if (r.sentAt) info.push(`envoyé le ${new Date(r.sentAt).toLocaleString('fr-FR')}`);
    else if (r.exportedAt) info.push(`exporté le ${new Date(r.exportedAt).toLocaleString('fr-FR')}`);

    const li = el('li', {}, head, el('div', { className: 'h-body' },
      el('p', { className: 'muted small', textContent: info.join(' · '), style: 'margin-top:10px' }),
      table, el('div', { className: 'h-actions' }, ...actions)));
    head.addEventListener('click', () => li.classList.toggle('open'));
    return li;
  }));
}

function renderCatalog() {
  const products = Object.values(state.catalog);
  $('catalog-empty').hidden = products.length > 0;
  const items = [];
  CATEGORIES.forEach((c) => {
    const inCat = products.filter((p) => p.category === c).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    if (!inCat.length) return;
    items.push(el('li', { className: 'c-group', textContent: c }));
    inCat.forEach((p) => {
      const btn = el('button', { type: 'button' },
        el('span', { className: 'c-name', textContent: p.name }),
        el('span', { className: 'c-weight', textContent: `${p.weight} g` }));
      btn.addEventListener('click', () => openProductDialog(p));
      items.push(el('li', {}, btn));
    });
  });
  $('catalog').replaceChildren(...items);
}

function renderAll() {
  renderDraft();
  renderDatalists();
  renderHistory();
  renderCatalog();
}

// ---------------------------------------------------------------- saisie d'une ligne

let selectedCategory = state.lastCategory;

function readForm() {
  return {
    category: selectedCategory,
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
  selectedCategory = state.lastCategory;
  renderCategoryChips();
  renderDatalists();
  updatePreview();
}

function startEditLine(id) {
  const l = state.draft.lines.find((x) => x.id === id);
  if (!l) return;
  editingLineId = id;
  selectedCategory = l.category;
  renderCategoryChips();
  renderDatalists();
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
function rememberProduct(name, weight, category) {
  const key = catalogKey(name, category);
  const known = state.catalog[key];
  state.catalog[key] = { name: known ? known.name : name, weight, category: validCategory(category) };
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
    const same = lines.find((l) => catalogKey(l.product, l.category) === catalogKey(f.product, f.category) && l.weight === f.weight);
    if (same) {
      same.pieces += f.pieces;
      toast(`${same.product} : ${same.pieces} pièces au total`);
    } else {
      lines.push({ id: uid(), ...f });
    }
  }
  rememberProduct(f.product, f.weight, f.category);
  saveState();
  resetForm();
  renderLines();
  renderDatalists();
  renderCatalog();
  $('in-product').focus();
});

$('btn-cancel-edit').addEventListener('click', () => { resetForm(); renderLines(); });

// Choisir un produit connu pré-remplit son grammage habituel.
function prefillWeight() {
  const known = state.catalog[catalogKey($('in-product').value, selectedCategory)];
  if (known && !editingLineId) $('in-weight').value = known.weight;
  updatePreview();
}
$('in-product').addEventListener('input', prefillWeight);
$('in-pieces').addEventListener('input', updatePreview);
$('in-weight').addEventListener('input', updatePreview);

function stepPieces(delta) {
  const v = Math.max(1, (parseInt($('in-pieces').value, 10) || 0) + delta);
  $('in-pieces').value = v;
  updatePreview();
}
$('btn-pieces-minus').addEventListener('click', () => stepPieces(-1));
$('btn-pieces-plus').addEventListener('click', () => stepPieces(1));

async function deleteLine(id) {
  const l = state.draft.lines.find((x) => x.id === id);
  if (!l || !(await ask(`Supprimer la ligne « ${l.product} » ?`))) return;
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

$('btn-clear-draft').addEventListener('click', async () => {
  if (!state.draft.lines.length && !state.draft.supplier && !state.draft.bl) return;
  if (!(await ask('Effacer toute la réception en cours ?', 'Effacer'))) return;
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
    lines: d.lines.map(({ category, product, pieces, weight }) => ({ category, product, pieces, weight })),
    createdAt: Date.now(),
    exportedAt: null,
  };
  state.receptions.unshift(reception);
  rememberSupplier(reception.supplier);
  state.draft = emptyDraft();
  saveState();
  resetForm();
  renderAll();

  deliver([reception]);
});

// Serveur configuré : envoi automatique. Sinon adresse mail : mail
// prérempli. Sinon : feuille de partage avec le fichier CSV.
function deliveryMode() {
  if (state.settings.serverUrl) return 'server';
  if (state.settings.email) return 'mail';
  return 'share';
}

function deliver(receptions) {
  const mode = deliveryMode();
  if (mode === 'server') sendToServer(receptions);
  else if (mode === 'mail') openMail(receptions);
  else exportReceptions(receptions); // même geste : la feuille de partage s'ouvre
}

function updateValidateLabel() {
  $('btn-validate').textContent = { server: 'Valider et envoyer', mail: 'Valider et envoyer par mail', share: 'Valider et exporter' }[deliveryMode()];
}

async function deleteReception(id) {
  const r = state.receptions.find((x) => x.id === id);
  if (!r) return;
  const warn = r.exportedAt ? '' : '\nAttention : elle n\'a pas encore été exportée.';
  if (!(await ask(`Supprimer la réception du ${formatDate(r.date)} ?${warn}`))) return;
  state.receptions = state.receptions.filter((x) => x.id !== id);
  saveState();
  renderHistory();
}

// ---------------------------------------------------------------- export CSV

// Deux formats : "Excel" (point-virgule) lisible en français — dates
// JJ/MM/AAAA, virgule décimale, en-têtes avec unités — et "base de données"
// (virgule) technique — dates AAAA-MM-JJ, point décimal, en-têtes codés.
const CSV_COLUMNS = ['reception_id', 'date_reception', 'fournisseur', 'bon_livraison', 'categorie', 'produit', 'pieces', 'grammage_g', 'poids_total_kg'];
const CSV_COLUMNS_FR = ['Réf. réception', 'Date', 'Fournisseur', 'N° bon de livraison', 'Type', 'Produit', 'Pièces', 'Grammage (g)', 'Poids total (kg)'];

function frDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const nfCsvFr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3, useGrouping: false });

function csvField(value, sep) {
  const s = String(value ?? '');
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(receptions) {
  const sep = state.separator;
  const excel = sep === ';';
  const rows = [excel ? CSV_COLUMNS_FR : CSV_COLUMNS];
  // Ordre chronologique dans le fichier, plus naturel pour un import.
  [...receptions].sort((a, b) => a.createdAt - b.createdAt).forEach((r) => {
    r.lines.forEach((l) => {
      const kg = Math.round(lineKg(l) * 1000) / 1000;
      rows.push(excel
        ? [r.id, frDate(r.date), r.supplier, r.bl, l.category, l.product, l.pieces, l.weight, nfCsvFr.format(kg)]
        : [r.id, r.date, r.supplier, r.bl, l.category, l.product, l.pieces, l.weight, kg.toFixed(3)]);
    });
  });
  // BOM UTF-8 : sans lui, Excel affiche mal les accents (« JÃ©sus »).
  return '\uFEFF' + rows.map((row) => row.map((v) => csvField(v, sep)).join(sep)).join('\r\n') + '\r\n';
}

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function csvFileName(receptions) {
  if (receptions.length === 1) {
    const r = receptions[0];
    return `reception_${frDate(r.date).replace(/\//g, '-')}${r.supplier ? '_' + slug(r.supplier) : ''}.csv`;
  }
  return `receptions_${frDate(today()).replace(/\//g, '-')}_${receptions.length}.csv`;
}

function markExported(receptions) {
  const now = Date.now();
  receptions.forEach((r) => {
    const stored = state.receptions.find((x) => x.id === r.id);
    if (stored) stored.exportedAt = now;
  });
  saveState();
  renderHistory();
}

async function exportReceptions(receptions) {
  if (!receptions.length) return;
  const name = csvFileName(receptions);
  const csv = buildCsv(receptions);
  const file = new File([csv], name, { type: 'text/csv' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      markExported(receptions);
      toast(`${name} exporté`);
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        toast('Export annulé. La réception reste « à exporter » dans l\'historique.');
        return;
      }
      // Partage indisponible : on passe à la fenêtre d'export.
    }
  }
  openExportDialog(receptions, name, csv, file);
}

// Repli sans feuille de partage : le CSV s'affiche, à copier ou télécharger.
let pendingExport = null;

function openExportDialog(receptions, name, csv, file) {
  pendingExport = { receptions, name, file };
  $('export-name').textContent = name;
  $('export-csv').value = csv.replace(/^\uFEFF/, ''); // le BOM ne sert qu'au fichier
  $('dlg-export').showModal();
}

$('export-copy').addEventListener('click', async () => {
  if (!pendingExport) return;
  const { receptions } = pendingExport;
  try {
    await navigator.clipboard.writeText($('export-csv').value);
    toast('CSV copié : colle-le dans ta base de données');
  } catch {
    $('export-csv').select();
    toast('Texte sélectionné : utilise « Copier » du menu');
  }
  markExported(receptions);
});

$('export-download').addEventListener('click', () => {
  if (!pendingExport) return;
  const { receptions, name, file } = pendingExport;
  const url = URL.createObjectURL(file);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  markExported(receptions);
  $('dlg-export').close();
  toast(`${name} téléchargé`);
});

$('dlg-export').addEventListener('close', () => { pendingExport = null; });

$('btn-export-pending').addEventListener('click', () => {
  deliver(state.receptions.filter((r) => !isDelivered(r)));
});

// ---------------------------------------------------------------- envoi par mail

function receptionSummary(r) {
  const t = totals(r.lines);
  return [
    `Réception du ${formatDate(r.date)}`,
    `Fournisseur : ${r.supplier || 'non précisé'}`,
    `N° bon de livraison : ${r.bl || '-'}`,
    `Référence : ${r.id}`,
    '',
    ...CATEGORIES.flatMap((c) => {
      const inCat = r.lines.filter((l) => l.category === c);
      if (!inCat.length) return [];
      return [`${c} :`, ...inCat.map((l) => `- ${l.product} : ${l.pieces} pcs × ${l.weight} g = ${formatKg(lineKg(l))}`), ''];
    }),
    `Total : ${t.pieces} ${plural(t.pieces, 'pièce')}, ${formatKg(t.kg)}`,
  ].join('\n');
}

function mailSubject(receptions) {
  if (receptions.length === 1) {
    const r = receptions[0];
    return `Réception stock ${r.date}${r.supplier ? ' - ' + r.supplier : ''}`;
  }
  return `Réceptions stock (${receptions.length}) - ${today()}`;
}

// iOS ne permet pas de joindre un fichier via un lien mailto : le détail et
// le CSV (à coller dans Excel) sont dans le corps du mail.
function openMail(receptions) {
  if (!receptions.length) return;
  const body = [
    ...receptions.map(receptionSummary).join('\n\n----------\n\n').split('\n'),
    '',
    '--- CSV (à coller dans Excel) ---',
    buildCsv(receptions).replace(/^\uFEFF/, '').trimEnd(),
  ].join('\r\n');
  const url = `mailto:${encodeURIComponent(state.settings.email).replace(/%40/g, '@')}`
    + `?subject=${encodeURIComponent(mailSubject(receptions))}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
  markExported(receptions);
  toast('Mail prêt : appuie sur « Envoyer » dans Mail');
}

// ---------------------------------------------------------------- envoi automatique (serveur)

let sending = false;

async function sendToServer(receptions, { manual = false } = {}) {
  const { serverUrl, serverKey } = state.settings;
  if (!serverUrl || !receptions.length || sending) return;
  receptions.forEach((r) => {
    const stored = state.receptions.find((x) => x.id === r.id);
    if (stored && !stored.sentAt) stored.queued = true;
  });
  saveState();
  renderHistory();

  sending = true;
  try {
    const res = await postToServer({
      cle: serverKey,
      receptions: receptions.map(({ id, date, supplier, bl, lines, createdAt }) => ({ id, date, supplier, bl, createdAt,
        lines: lines.map(({ category, product, pieces, weight }) => ({ category, product, pieces, weight })) })),
    });
    const now = Date.now();
    (res.recues || []).forEach((id) => {
      const stored = state.receptions.find((x) => x.id === id);
      if (stored) { stored.sentAt = now; stored.queued = false; }
    });
    saveState();
    renderHistory();
    toast(receptions.length > 1 ? `${receptions.length} réceptions envoyées` : 'Réception envoyée');
  } catch (err) {
    toast(manual || !navigator.onLine
      ? `Envoi impossible (${err.message}). Nouvel essai automatique plus tard.`
      : 'Envoi en attente : nouvel essai dès que le réseau revient.');
  } finally {
    sending = false;
  }
}

async function postToServer(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const resp = await fetch(state.settings.serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    let data = null;
    try { data = await resp.json(); } catch { /* réponse non JSON */ }
    if (!resp.ok || !data || !data.ok) {
      throw new Error((data && data.erreur) || `erreur serveur ${resp.status}`);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('délai dépassé');
    if (err instanceof TypeError) throw new Error('serveur injoignable');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function retryQueue() {
  const queued = state.receptions.filter((r) => r.queued && !r.sentAt);
  if (queued.length && navigator.onLine) sendToServer(queued);
}
window.addEventListener('online', retryQueue);

// ---------------------------------------------------------------- sauvegarde / restauration

const BACKUP_APP = 'saucisson-reception';

function renderBackupInfo() {
  $('backup-info').textContent = state.lastBackupAt
    ? `Dernière sauvegarde : ${new Date(state.lastBackupAt).toLocaleString('fr-FR')}`
    : 'Aucune sauvegarde pour l\'instant.';
}

async function saveBackup() {
  const data = {
    app: BACKUP_APP,
    version: 1,
    savedAt: new Date().toISOString(),
    receptions: state.receptions,
    catalog: state.catalog,
    suppliers: state.suppliers,
    separator: state.separator,
    settings: { email: state.settings.email, serverUrl: state.settings.serverUrl }, // pas la clé secrète
  };
  const name = `saucisson-sauvegarde-${today()}.json`;
  const file = new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' });

  let saved = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      saved = true;
    } catch (err) {
      if (err && err.name === 'AbortError') { toast('Sauvegarde annulée'); return; }
    }
  }
  if (!saved) {
    const url = URL.createObjectURL(file);
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  state.lastBackupAt = Date.now();
  saveState();
  renderBackupInfo();
  toast('Sauvegarde créée : garde le fichier dans Fichiers, Drive ou un mail');
}

// Restauration par fusion : rien de ce qui est déjà dans l'appli n'est effacé.
async function restoreBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('Ce fichier n\'est pas une sauvegarde lisible.');
    return;
  }
  if (!data || data.app !== BACKUP_APP || !Array.isArray(data.receptions)) {
    toast('Ce fichier n\'est pas une sauvegarde de l\'appli Saucisson.');
    return;
  }
  const known = new Set(state.receptions.map((r) => r.id));
  const newReceptions = data.receptions.filter((r) => r && r.id && Array.isArray(r.lines) && !known.has(r.id));
  newReceptions.forEach((r) => normalizeLines(r.lines));
  const catalog = normalizeCatalog(data.catalog && typeof data.catalog === 'object' ? data.catalog : {});
  const newProducts = Object.keys(catalog).filter((k) => !state.catalog[k]);

  if (!newReceptions.length && !newProducts.length) {
    toast('Rien de nouveau dans cette sauvegarde : tout est déjà dans l\'appli.');
    return;
  }
  const msg = `Ajouter ${newReceptions.length} ${plural(newReceptions.length, 'réception')} et ${newProducts.length} ${plural(newProducts.length, 'produit')} depuis la sauvegarde du ${new Date(data.savedAt).toLocaleDateString('fr-FR')} ?\nCe qui est déjà dans l'appli est conservé.`;
  if (!(await ask(msg, 'Restaurer'))) return;

  state.receptions = [...state.receptions, ...newReceptions].sort((a, b) => b.createdAt - a.createdAt);
  newProducts.forEach((k) => { state.catalog[k] = catalog[k]; });
  (Array.isArray(data.suppliers) ? data.suppliers : []).forEach((sup) => {
    if (!state.suppliers.includes(sup)) state.suppliers.push(sup);
  });
  if (data.settings) {
    if (!state.settings.email && data.settings.email) state.settings.email = data.settings.email;
    if (!state.settings.serverUrl && data.settings.serverUrl) state.settings.serverUrl = data.settings.serverUrl;
  }
  saveState();
  renderAll();
  toast('Sauvegarde restaurée');
}

$('btn-backup').addEventListener('click', saveBackup);
$('btn-restore').addEventListener('click', () => $('in-restore').click());
$('in-restore').addEventListener('change', () => {
  const file = $('in-restore').files[0];
  $('in-restore').value = '';
  if (file) restoreBackup(file);
});

$('btn-test-server').addEventListener('click', async () => {
  const url = $('in-server-url').value.trim();
  if (!url) { toast('Renseigne d\'abord l\'adresse du script.'); return; }
  const previous = state.settings.serverUrl;
  state.settings.serverUrl = url; // test avec les valeurs saisies, sans les enregistrer
  try {
    await postToServer({ cle: $('in-server-key').value.trim(), test: true });
    toast('Connexion au serveur OK');
  } catch (err) {
    toast(`Échec du test : ${err.message}`);
  } finally {
    state.settings.serverUrl = previous;
  }
});

// ---------------------------------------------------------------- dialogues

$('btn-settings').addEventListener('click', () => {
  $('in-separator').value = state.separator;
  $('in-email').value = state.settings.email;
  $('in-server-url').value = state.settings.serverUrl;
  $('in-server-key').value = state.settings.serverKey;
  renderBackupInfo();
  $('dlg-settings').showModal();
});
$('dlg-settings').addEventListener('close', () => {
  if ($('dlg-settings').returnValue !== 'ok') return;
  state.separator = $('in-separator').value === ';' ? ';' : ',';
  state.settings.email = $('in-email').value.trim();
  state.settings.serverUrl = $('in-server-url').value.trim();
  state.settings.serverKey = $('in-server-key').value.trim();
  saveState();
  updateValidateLabel();
  renderHistory();
  toast('Réglages enregistrés');
  retryQueue();
});

let editingProductKey = null;
function openProductDialog(p) {
  editingProductKey = catalogKey(p.name, p.category);
  $('in-cat-category').value = p.category;
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
    rememberProduct(name, weight, $('in-cat-category').value);
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
updateValidateLabel();
retryQueue();

// Demande à l'iPhone de ne pas effacer les données de l'appli quand il
// manque de place (même principe que le Scanner).
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted()
    .then((already) => already || navigator.storage.persist())
    .catch(() => {});
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
