import { saveDocument, getAllDocuments, getDocument, deleteDocument, renameDocument } from './db.js';
import { buildPdf, pdfFileName } from './pdf.js';
import { normalizeCapture, applyFilter, makeThumbnail } from './imaging.js';
import { detectDocumentCorners, warpPerspective } from './perspective.js';
import { recognizePage, isOcrEngineLoaded, OCR_ESTIMATED_SIZE_MB } from './ocr.js';

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
const homeSearch = document.getElementById('home-search');
const homeSearchInput = document.getElementById('home-search-input');
const homeNoResults = document.getElementById('home-noresults');

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
const btnCropReset = document.getElementById('btn-crop-reset');
const cropHint = document.getElementById('crop-hint');

const docTitle = document.getElementById('doc-title');
const docThumb = document.getElementById('doc-thumb');
const docMeta = document.getElementById('doc-meta');
const btnDocBack = document.getElementById('btn-doc-back');
const btnDocShare = document.getElementById('btn-doc-share');
const btnDocOpen = document.getElementById('btn-doc-open');
const btnDocOcr = document.getElementById('btn-doc-ocr');
const docOcrDone = document.getElementById('doc-ocr-done');
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
let cropCorners = null; // {tl,tr,br,bl} — chaque coin {x,y} relatif à #crop-stage
const CORNER_KEYS = ['tl', 'tr', 'br', 'bl'];

/* ---------------------------------------------------------------- */
/* accueil                                                            */
/* ---------------------------------------------------------------- */

let homeSearchQuery = '';

async function renderHome() {
  const allDocs = await getAllDocuments();
  docListEl.innerHTML = '';

  if (allDocs.length === 0) {
    homeEmpty.classList.remove('hidden');
    homeSearch.classList.add('hidden');
    homeNoResults.classList.add('hidden');
    docListEl.classList.add('hidden');
    return;
  }
  homeEmpty.classList.add('hidden');
  homeSearch.classList.remove('hidden');

  const q = homeSearchQuery.trim().toLowerCase();
  const docs = q ? allDocs.filter((d) => d.name.toLowerCase().includes(q)) : allDocs;

  if (docs.length === 0) {
    homeNoResults.classList.remove('hidden');
    docListEl.classList.add('hidden');
    return;
  }
  homeNoResults.classList.add('hidden');
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

homeSearchInput.addEventListener('input', () => {
  homeSearchQuery = homeSearchInput.value;
  renderHome();
});

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

    const upBtn = document.createElement('button');
    upBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    upBtn.title = 'Monter la page';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => {
      if (index === 0) return;
      [session.pages[index - 1], session.pages[index]] = [session.pages[index], session.pages[index - 1]];
      renderReviewList();
    });

    const downBtn = document.createElement('button');
    downBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    downBtn.title = 'Descendre la page';
    downBtn.disabled = index === session.pages.length - 1;
    downBtn.addEventListener('click', () => {
      if (index === session.pages.length - 1) return;
      [session.pages[index], session.pages[index + 1]] = [session.pages[index + 1], session.pages[index]];
      renderReviewList();
    });

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

    actions.append(upBtn, downBtn, cropBtn, rotateBtn, delBtn);
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
      pageImages: session.pages.map((p) => p.dataUrl), // conservées pour l'OCR à la demande
      ocrDone: false,
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

function defaultCorners() {
  const inset = 0.045;
  const l = cropBox.left, t = cropBox.top, w = cropBox.width, h = cropBox.height;
  return {
    tl: { x: l + w * inset, y: t + h * inset },
    tr: { x: l + w * (1 - inset), y: t + h * inset },
    br: { x: l + w * (1 - inset), y: t + h * (1 - inset) },
    bl: { x: l + w * inset, y: t + h * (1 - inset) },
  };
}

async function openCrop(pageUid) {
  cropTargetUid = pageUid;
  const page = findPage(pageUid);
  if (!page) return;
  cropOverlay.innerHTML = '';
  cropCorners = null;
  cropHint.textContent = 'Détection des bords…';
  btnCropApply.disabled = true;

  await new Promise((resolve) => {
    cropImage.onload = resolve;
    cropImage.src = page.source;
  });
  showView('crop');

  const stageRect = cropStage.getBoundingClientRect();
  const imgRect = cropImage.getBoundingClientRect();
  cropBox = {
    left: imgRect.left - stageRect.left,
    top: imgRect.top - stageRect.top,
    width: imgRect.width,
    height: imgRect.height,
  };

  // détection auto en tâche de fond ; le cadrage par défaut (image entière)
  // s'affiche tout de suite pour que l'utilisateur ne reste jamais bloqué
  cropCorners = defaultCorners();
  renderCropOverlay();
  btnCropApply.disabled = false;
  cropHint.textContent = 'Ajuste les 4 coins sur les bords du document';

  try {
    const detected = await detectDocumentCorners(page.source);
    if (detected && cropTargetUid === pageUid) {
      cropCorners = toScreenCorners(detected, page);
      renderCropOverlay();
    }
  } catch (err) {
    console.warn('Détection des bords impossible', err);
  }
}

function toScreenCorners(pixelCorners, page) {
  // pixelCorners sont en coordonnées pixel de l'image source (page.source) ;
  // on les ramène en coordonnées écran via le ratio taille affichée / taille naturelle.
  const scaleX = cropBox.width / cropImage.naturalWidth;
  const scaleY = cropBox.height / cropImage.naturalHeight;
  const toScreen = (p) => ({ x: cropBox.left + p.x * scaleX, y: cropBox.top + p.y * scaleY });
  return {
    tl: toScreen(pixelCorners.tl),
    tr: toScreen(pixelCorners.tr),
    br: toScreen(pixelCorners.br),
    bl: toScreen(pixelCorners.bl),
  };
}

function renderCropOverlay() {
  cropOverlay.innerHTML = '';
  const { tl, tr, br, bl } = cropCorners;
  const w = cropStage.clientWidth, h = cropStage.clientHeight;
  const pts = `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.position = 'absolute';
  svg.style.inset = '0';
  svg.style.pointerEvents = 'none';

  const mask = document.createElementNS(svgNS, 'path');
  mask.setAttribute(
    'd',
    `M0,0 H${w} V${h} H0 Z M${tl.x},${tl.y} L${bl.x},${bl.y} L${br.x},${br.y} L${tr.x},${tr.y} Z`
  );
  mask.setAttribute('fill-rule', 'evenodd');
  mask.setAttribute('class', 'crop-quad-mask');
  svg.appendChild(mask);

  const outline = document.createElementNS(svgNS, 'polygon');
  outline.setAttribute('points', pts);
  outline.setAttribute('class', 'crop-quad-outline');
  svg.appendChild(outline);

  cropOverlay.appendChild(svg);

  for (const key of CORNER_KEYS) {
    const p = cropCorners[key];
    const handle = document.createElement('div');
    handle.className = 'crop-handle';
    handle.style.left = `${p.x}px`;
    handle.style.top = `${p.y}px`;
    handle.addEventListener('pointerdown', (e) => startDrag(e, key));
    cropOverlay.appendChild(handle);
  }
}

function startDrag(e, key) {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const start = { ...cropCorners[key] };

  function clampX(x) { return Math.min(Math.max(x, cropBox.left), cropBox.left + cropBox.width); }
  function clampY(y) { return Math.min(Math.max(y, cropBox.top), cropBox.top + cropBox.height); }

  function onMove(ev) {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    cropCorners[key] = { x: clampX(start.x + dx), y: clampY(start.y + dy) };
    renderCropOverlay();
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

btnCropReset.addEventListener('click', () => {
  if (!cropBox) return;
  cropCorners = defaultCorners();
  renderCropOverlay();
});

btnCropCancel.addEventListener('click', () => {
  cropTargetUid = null;
  showView('review');
});

btnCropApply.addEventListener('click', async () => {
  const page = findPage(cropTargetUid);
  if (!page || !cropBox || !cropCorners) { showView('review'); return; }

  btnCropApply.disabled = true;
  btnCropApply.textContent = '…';
  try {
    const scaleX = cropImage.naturalWidth / cropBox.width;
    const scaleY = cropImage.naturalHeight / cropBox.height;
    const toPixel = (p) => ({
      x: Math.min(Math.max((p.x - cropBox.left) * scaleX, 0), cropImage.naturalWidth),
      y: Math.min(Math.max((p.y - cropBox.top) * scaleY, 0), cropImage.naturalHeight),
    });
    const pixelCorners = {
      tl: toPixel(cropCorners.tl),
      tr: toPixel(cropCorners.tr),
      br: toPixel(cropCorners.br),
      bl: toPixel(cropCorners.bl),
    };
    page.source = await warpPerspective(page.source, pixelCorners);
    await recomputePage(page);
    cropTargetUid = null;
    showView('review');
    renderReviewList();
  } catch (err) {
    console.error('Recadrage impossible', err);
    showToast('Le recadrage a échoué');
  } finally {
    btnCropApply.disabled = false;
    btnCropApply.textContent = 'Valider';
  }
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
  updateOcrUI(doc);
  showView('doc');
}

function updateOcrUI(doc) {
  const hasImages = Array.isArray(doc.pageImages) && doc.pageImages.length > 0;
  btnDocOcr.classList.toggle('hidden', !hasImages || !!doc.ocrDone);
  docOcrDone.classList.toggle('hidden', !doc.ocrDone);
  btnDocOcr.disabled = false;
  btnDocOcr.textContent = 'Rendre le texte cherchable (OCR)';
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

btnDocOcr.addEventListener('click', async () => {
  const doc = await getDocument(currentDocId);
  if (!doc || !doc.pageImages || !doc.pageImages.length) return;

  if (!isOcrEngineLoaded()) {
    const ok = confirm(
      `Première utilisation : ça va télécharger le moteur de reconnaissance de texte (~${OCR_ESTIMATED_SIZE_MB} Mo, une seule fois — il reste ensuite en cache pour un usage hors-ligne). Continuer ?`
    );
    if (!ok) return;
  }

  btnDocOcr.disabled = true;
  try {
    const ocrPages = [];
    for (let i = 0; i < doc.pageImages.length; i++) {
      btnDocOcr.textContent = `Reconnaissance du texte… page ${i + 1}/${doc.pageImages.length}`;
      const ocr = await recognizePage(doc.pageImages[i]);
      ocrPages.push({ dataUrl: doc.pageImages[i], ocr });
    }
    btnDocOcr.textContent = 'Génération du PDF…';
    const blob = await buildPdf(ocrPages, doc.name);

    doc.pdfBlob = blob;
    doc.ocrDone = true;
    await saveDocument(doc);
    currentDoc = doc;
    updateOcrUI(doc);
    showToast('Texte rendu cherchable ✅');
  } catch (err) {
    console.error('OCR impossible', err);
    showToast('La reconnaissance de texte a échoué');
    btnDocOcr.disabled = false;
    btnDocOcr.textContent = 'Rendre le texte cherchable (OCR)';
  }
});

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
