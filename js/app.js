import { saveDocument, getAllDocuments, getDocument, deleteDocument, renameDocument } from './db.js';
import { buildPdf, pdfFileName } from './pdf.js';
import { normalizeCapture, applyFilter, cropDataUrl, makeThumbnail } from './imaging.js';

/* ---------------------------------------------------------------- */
/* utilitaires                                                       */
/* ---------------------------------------------------------------- */

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function formatDate(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------------------------------------------------------------- */
/* éléments                                                           */
/* ---------------------------------------------------------------- */

const views = {
  home: document.getElementById('view-home'),
  camera: document.getElementById('view-camera'),
  review: document.getElementById('view-review'),
  crop: document.getElementById('view-crop'),
  doc: document.getElementById('view-doc'),
};

function showView(name) {
  for (const key in views) {
    views[key].classList.toggle('hidden', key !== name);
  }
}

const homeEmpty = document.getElementById('home-empty');
const docListEl = document.getElementById('doc-list');
const btnFab = document.getElementById('btn-fab');
const btnEmptyScan = document.getElementById('btn-empty-scan');

const cameraVideo = document.getElementById('camera-video');
const cameraCount = document.getElementById('camera-count');
const cameraThumbs = document.getElementById('camera-thumbs');
const cameraError = document.getElementById('camera-error');
const btnShutter = document.getElementById('btn-shutter');
const btnCameraClose = document.getElementById('btn-camera-close');
const btnCameraDone = document.getElementById('btn-camera-done');
const btnCameraReview = document.getElementById('btn-camera-review');

const reviewList = document.getElementById('review-list');
const btnReviewBack = document.getElementById('btn-review-back');
const btnAddPage = document.getElementById('btn-add-page');
const docNameInput = document.getElementById('doc-name-input');
const btnSaveDoc = document.getElementById('btn-save-doc');

const cropImage = document.getElementById('crop-image');
const cropOverlay = document.getElementById('crop-overlay');
const cropStage = document.getElementById('crop-stage');
const btnCropCancel = document.getElementById('btn-crop-cancel');
const btnCropApply = document.getElementById('btn-crop-apply');

const docTitle = document.getElementById('doc-title');
const docThumb = document.getElementById('doc-thumb');
const docMeta = document.getElementById('doc-meta');
const btnDocBack = document.getElementById('btn-doc-back');
const btnDocShare = document.getElementById('btn-doc-share');
const btnDocOpen = document.getElementById('btn-doc-open');
const btnDocRename = document.getElementById('btn-doc-rename');
const btnDocDelete = document.getElementById('btn-doc-delete');

const pdfViewer = document.getElementById('pdf-viewer');
const pdfViewerFrame = document.getElementById('pdf-viewer-frame');
const pdfViewerTitle = document.getElementById('pdf-viewer-title');
const btnPdfViewerClose = document.getElementById('btn-pdf-viewer-close');

/* ---------------------------------------------------------------- */
/* état                                                               */
/* ---------------------------------------------------------------- */

const FILTER_LABELS = { color: 'Couleur', enhance: 'Amélioré', bw: 'Noir & blanc' };
const FILTER_ORDER = ['color', 'enhance', 'bw'];

let session = { pages: [] }; // { uid, source (dataURL courante après crop/rotation), filter, dataUrl (rendu final) }
let mediaStream = null;
let currentDocId = null;
let currentDoc = null; // gardé en mémoire pour que Partager/Voir le PDF restent des actions synchrones (sinon Safari bloque window.open déclenché après un await)
let cropTargetUid = null;
let cropBox = null; // {left, top, width, height} du <img> relatif à #crop-stage
let cropRectState = null; // {x1,y1,x2,y2} relatif à #crop-stage

/* ---------------------------------------------------------------- */
/* accueil                                                            */
/* ---------------------------------------------------------------- */

async function renderHome() {
  const docs = await getAllDocuments();
  docListEl.innerHTML = '';
  if (docs.length === 0) {
    homeEmpty.classList.remove('hidden');
    docListEl.classList.add('hidden');
    return;
  }
  homeEmpty.classList.add('hidden');
  docListEl.classList.remove('hidden');

  for (const doc of docs) {
    const li = document.createElement('li');
    li.className = 'doc-card';

    const img = document.createElement('img');
    img.src = doc.thumb;
    img.alt = '';

    const info = document.createElement('div');
    info.className = 'doc-card-info';
    const name = document.createElement('div');
    name.className = 'doc-card-name';
    name.textContent = doc.name;
    const sub = document.createElement('div');
    sub.className = 'doc-card-sub';
    sub.textContent = `${doc.pageCount} page${doc.pageCount > 1 ? 's' : ''} · ${formatDate(doc.createdAt)}`;
    info.append(name, sub);

    const chevron = document.createElement('span');
    chevron.className = 'doc-card-chevron';
    chevron.textContent = '›';

    li.append(img, info, chevron);
    li.addEventListener('click', () => openDocDetail(doc.id));
    docListEl.appendChild(li);
  }
}

function goHome() {
  stopStream();
  showView('home');
  renderHome();
}

btnFab.addEventListener('click', openCamera);
btnEmptyScan.addEventListener('click', openCamera);

/* ---------------------------------------------------------------- */
/* caméra                                                             */
/* ---------------------------------------------------------------- */

async function openCamera() {
  showView('camera');
  cameraError.classList.add('hidden');
  renderCameraThumbs();
  await startStream();
}

async function startStream() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    cameraVideo.srcObject = mediaStream;
  } catch (err) {
    console.error('Camera error', err);
    cameraError.classList.remove('hidden');
  }
}

function stopStream() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
}

function renderCameraThumbs() {
  cameraThumbs.innerHTML = '';
  for (const page of session.pages) {
    const img = document.createElement('img');
    img.src = page.dataUrl;
    cameraThumbs.appendChild(img);
  }
  const n = session.pages.length;
  cameraCount.textContent = `${n} page${n > 1 ? 's' : ''}`;
  cameraCount.classList.toggle('hidden', n === 0);
  btnCameraDone.disabled = n === 0;
  btnCameraReview.disabled = n === 0;
}

async function capturePhoto() {
  if (!mediaStream) return;
  const video = cameraVideo;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const raw = canvas.toDataURL('image/jpeg', 0.92);

  btnShutter.disabled = true;
  try {
    const normalized = await normalizeCapture(raw);
    session.pages.push({ uid: uid(), source: normalized, filter: 'color', dataUrl: normalized });
    renderCameraThumbs();
  } finally {
    btnShutter.disabled = false;
  }
}

btnShutter.addEventListener('click', capturePhoto);

btnCameraClose.addEventListener('click', () => {
  if (session.pages.length > 0) {
    const ok = confirm('Abandonner ce scan ? Les pages capturées seront perdues.');
    if (!ok) return;
  }
  session.pages = [];
  goHome();
});

btnCameraDone.addEventListener('click', () => {
  stopStream();
  showView('review');
  renderReviewList();
});
btnCameraReview.addEventListener('click', () => {
  stopStream();
  showView('review');
  renderReviewList();
});

/* ---------------------------------------------------------------- */
/* relecture des pages                                               */
/* ---------------------------------------------------------------- */

function findPage(pageUid) {
  return session.pages.find((p) => p.uid === pageUid);
}

async function recomputePage(page) {
  page.dataUrl = await applyFilter(page.source, page.filter);
}

function renderReviewList() {
  reviewList.innerHTML = '';
  session.pages.forEach((page, index) => {
    const li = document.createElement('li');
    li.className = 'page-row';

    const img = document.createElement('img');
    img.src = page.dataUrl;

    const main = document.createElement('div');
    main.className = 'page-row-main';
    const title = document.createElement('div');
    title.className = 'page-row-title';
    title.textContent = `Page ${index + 1}`;
    const chips = document.createElement('div');
    chips.className = 'filter-chips';
    for (const mode of FILTER_ORDER) {
      const chip = document.createElement('button');
      chip.className = 'chip' + (page.filter === mode ? ' active' : '');
      chip.textContent = FILTER_LABELS[mode];
      chip.addEventListener('click', async () => {
        page.filter = mode;
        await recomputePage(page);
        renderReviewList();
      });
      chips.appendChild(chip);
    }
    main.append(title, chips);

    const actions = document.createElement('div');
    actions.className = 'page-row-actions';

    const cropBtn = document.createElement('button');
    cropBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    cropBtn.title = 'Recadrer';
    cropBtn.addEventListener('click', () => openCrop(page.uid));

    const rotateBtn = document.createElement('button');
    rotateBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 12a8 8 0 1 1 3 6.2M4 12V6m0 6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    rotateBtn.title = 'Rotation';
    rotateBtn.addEventListener('click', async () => {
      page.source = await rotate90(page.source);
      await recomputePage(page);
      renderReviewList();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-9 0 1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    delBtn.title = 'Supprimer la page';
    delBtn.addEventListener('click', () => {
      session.pages = session.pages.filter((p) => p.uid !== page.uid);
      if (session.pages.length === 0) {
        showView('camera');
        renderCameraThumbs();
        startStream();
      } else {
        renderReviewList();
      }
    });

    actions.append(cropBtn, rotateBtn, delBtn);
    li.append(img, main, actions);
    reviewList.appendChild(li);
  });
}

function rotate90(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

btnReviewBack.addEventListener('click', () => {
  const ok = session.pages.length === 0 || confirm('Retourner à l’accueil ? Ce scan non enregistré sera perdu.');
  if (!ok) return;
  session.pages = [];
  goHome();
});

btnAddPage.addEventListener('click', openCamera);

btnSaveDoc.addEventListener('click', async () => {
  if (session.pages.length === 0) return;
  btnSaveDoc.disabled = true;
  btnSaveDoc.textContent = 'Création du PDF…';
  try {
    const name = docNameInput.value.trim() || `Document du ${formatDate(Date.now())}`;
    const blob = await buildPdf(session.pages.map((p) => ({ dataUrl: p.dataUrl })), name);
    const thumb = await makeThumbnail(session.pages[0].dataUrl, 300);
    const doc = {
      id: uid(),
      name,
      createdAt: Date.now(),
      pageCount: session.pages.length,
      thumb,
      pdfBlob: blob,
    };
    await saveDocument(doc);
    session.pages = [];
    docNameInput.value = '';
    showToast('Document créé ✅');
    await openDocDetail(doc.id);
  } catch (err) {
    console.error(err);
    showToast('Erreur lors de la création du PDF');
  } finally {
    btnSaveDoc.disabled = false;
    btnSaveDoc.textContent = 'Créer le PDF';
  }
});

/* ---------------------------------------------------------------- */
/* recadrage                                                          */
/* ---------------------------------------------------------------- */

function openCrop(pageUid) {
  cropTargetUid = pageUid;
  const page = findPage(pageUid);
  if (!page) return;
  cropOverlay.innerHTML = '';
  cropImage.onload = initCropRect;
  cropImage.src = page.source;
  showView('crop');
}

function initCropRect() {
  const stageRect = cropStage.getBoundingClientRect();
  const imgRect = cropImage.getBoundingClientRect();
  cropBox = {
    left: imgRect.left - stageRect.left,
    top: imgRect.top - stageRect.top,
    width: imgRect.width,
    height: imgRect.height,
  };
  const inset = 0.045;
  cropRectState = {
    x1: cropBox.left + cropBox.width * inset,
    y1: cropBox.top + cropBox.height * inset,
    x2: cropBox.left + cropBox.width * (1 - inset),
    y2: cropBox.top + cropBox.height * (1 - inset),
  };
  renderCropOverlay();
}

function renderCropOverlay() {
  cropOverlay.innerHTML = '';
  const { x1, y1, x2, y2 } = cropRectState;
  const rectEl = document.createElement('div');
  rectEl.className = 'crop-rect';
  rectEl.style.left = `${x1}px`;
  rectEl.style.top = `${y1}px`;
  rectEl.style.width = `${x2 - x1}px`;
  rectEl.style.height = `${y2 - y1}px`;
  rectEl.addEventListener('pointerdown', (e) => startDrag(e, 'move'));
  cropOverlay.appendChild(rectEl);

  const corners = [
    { cls: 'nw', x: x1, y: y1 },
    { cls: 'ne', x: x2, y: y1 },
    { cls: 'sw', x: x1, y: y2 },
    { cls: 'se', x: x2, y: y2 },
  ];
  for (const c of corners) {
    const h = document.createElement('div');
    h.className = `crop-handle ${c.cls}`;
    h.style.left = `${c.x}px`;
    h.style.top = `${c.y}px`;
    h.addEventListener('pointerdown', (e) => startDrag(e, c.cls));
    cropOverlay.appendChild(h);
  }
}

function startDrag(e, mode) {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const start = { ...cropRectState };
  const MIN = 40;

  function clampX(x) { return Math.min(Math.max(x, cropBox.left), cropBox.left + cropBox.width); }
  function clampY(y) { return Math.min(Math.max(y, cropBox.top), cropBox.top + cropBox.height); }

  function onMove(ev) {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    const s = cropRectState;
    if (mode === 'move') {
      let w = start.x2 - start.x1;
      let h = start.y2 - start.y1;
      let nx1 = start.x1 + dx;
      let ny1 = start.y1 + dy;
      nx1 = Math.min(Math.max(nx1, cropBox.left), cropBox.left + cropBox.width - w);
      ny1 = Math.min(Math.max(ny1, cropBox.top), cropBox.top + cropBox.height - h);
      s.x1 = nx1; s.y1 = ny1; s.x2 = nx1 + w; s.y2 = ny1 + h;
    } else {
      if (mode.includes('w')) s.x1 = Math.min(clampX(start.x1 + dx), s.x2 - MIN);
      if (mode.includes('e')) s.x2 = Math.max(clampX(start.x2 + dx), s.x1 + MIN);
      if (mode.includes('n')) s.y1 = Math.min(clampY(start.y1 + dy), s.y2 - MIN);
      if (mode.includes('s')) s.y2 = Math.max(clampY(start.y2 + dy), s.y1 + MIN);
    }
    renderCropOverlay();
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

btnCropCancel.addEventListener('click', () => {
  cropTargetUid = null;
  showView('review');
});

btnCropApply.addEventListener('click', async () => {
  const page = findPage(cropTargetUid);
  if (!page || !cropBox || !cropRectState) { showView('review'); return; }
  const { x1, y1, x2, y2 } = cropRectState;
  const frac = {
    x: (x1 - cropBox.left) / cropBox.width,
    y: (y1 - cropBox.top) / cropBox.height,
    w: (x2 - x1) / cropBox.width,
    h: (y2 - y1) / cropBox.height,
  };
  frac.x = Math.min(Math.max(frac.x, 0), 1);
  frac.y = Math.min(Math.max(frac.y, 0), 1);
  frac.w = Math.min(Math.max(frac.w, 0.02), 1 - frac.x);
  frac.h = Math.min(Math.max(frac.h, 0.02), 1 - frac.y);

  page.source = await cropDataUrl(page.source, frac);
  await recomputePage(page);
  cropTargetUid = null;
  showView('review');
  renderReviewList();
});

/* ---------------------------------------------------------------- */
/* détail document                                                    */
/* ---------------------------------------------------------------- */

async function openDocDetail(id) {
  const doc = await getDocument(id);
  if (!doc) { goHome(); return; }
  currentDocId = id;
  currentDoc = doc;
  docTitle.textContent = doc.name;
  docThumb.src = doc.thumb;
  docMeta.textContent = `${doc.pageCount} page${doc.pageCount > 1 ? 's' : ''} · ${formatDate(doc.createdAt)}`;
  showView('doc');
}

btnDocBack.addEventListener('click', goHome);

// Ces gestionnaires restent synchrones jusqu'à window.open()/navigator.share() :
// après un await, Safari ne considère plus l'appel comme déclenché par le tap
// de l'utilisateur et bloque la pop-up / le partage silencieusement.
btnDocShare.addEventListener('click', () => {
  if (!currentDoc) return;
  const filename = pdfFileName(currentDoc.name);
  const file = new File([currentDoc.pdfBlob], filename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: currentDoc.name }).catch((err) => {
      if (err && err.name !== 'AbortError') showToast('Partage annulé');
    });
  } else {
    downloadBlob(currentDoc.pdfBlob, filename);
    showToast('Partage de fichiers non supporté ici — PDF téléchargé');
  }
});

let pdfViewerUrl = null;
btnDocOpen.addEventListener('click', () => {
  if (!currentDoc) return;
  pdfViewerUrl = URL.createObjectURL(currentDoc.pdfBlob);
  pdfViewerFrame.src = pdfViewerUrl;
  pdfViewerTitle.textContent = currentDoc.name;
  pdfViewer.classList.remove('hidden');
});

function closePdfViewer() {
  pdfViewer.classList.add('hidden');
  pdfViewerFrame.src = 'about:blank';
  if (pdfViewerUrl) { URL.revokeObjectURL(pdfViewerUrl); pdfViewerUrl = null; }
}
btnPdfViewerClose.addEventListener('click', closePdfViewer);

btnDocRename.addEventListener('click', async () => {
  if (!currentDoc) return;
  const name = prompt('Nouveau nom du document', currentDoc.name);
  if (!name || !name.trim()) return;
  await renameDocument(currentDocId, name.trim());
  currentDoc.name = name.trim();
  docTitle.textContent = currentDoc.name;
});

btnDocDelete.addEventListener('click', async () => {
  if (!currentDoc) return;
  const ok = confirm(`Supprimer « ${currentDoc.name} » ? Cette action est définitive.`);
  if (!ok) return;
  await deleteDocument(currentDocId);
  currentDoc = null;
  showToast('Document supprimé');
  goHome();
});

/* ---------------------------------------------------------------- */
/* service worker + démarrage                                        */
/* ---------------------------------------------------------------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('SW registration failed', err);
    });
  });
}

renderHome();
