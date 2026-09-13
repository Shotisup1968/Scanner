// Détection des bords d'un document + redressement de perspective
// (warp quadrilatère → rectangle), sans dépendance externe (pas d'OpenCV.js
// : tout tient dans ce fichier, en JS + Canvas).

const WORK_SIZE = 520; // taille de travail pour la détection post-capture (écran de recadrage)

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function toWorkingCanvas(img, maxDim) {
  const scale = maxDim / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return { ctx, w, h };
}

/* ------------------------------------------------------------------ */
/* détection : masque local -> plus grande région connectée -> enveloppe */
/* convexe -> quadrilatère. Remplace l'ancienne heuristique (extrêmes de */
/* TOUS les pixels clairs, sans vérifier qu'ils forment une seule région) */
/* qui se faisait dérouter par un simple reflet ou objet clair isolé, et */
/* qui ne représentait de toute façon pas le contour réel du document.  */
/* ------------------------------------------------------------------ */

// Sépare premier plan (document, supposé plus clair) et fond par un seuil
// GLOBAL (moyenne de luminance du cadre + marge) — pas un seuil local :
// contrairement à la normalisation d'éclairage de imaging.js (où la zone à
// aplatir, une ombre de pli, est petite par rapport à toute la page), ici
// l'objet à isoler (le document) peut occuper une grosse partie du cadre.
// Un flou local plus petit que l'objet estimerait alors un "fond" qui
// inclut déjà l'objet lui-même, et ne détecterait plus rien. Le filet de
// sécurité contre un fond non uniforme n'est pas ce seuil mais l'étape
// suivante : ne garder que la plus grande RÉGION CONNECTÉE de pixels
// clairs, pas les pixels clairs pris individuellement.
function foregroundMask(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = v;
    sum += v;
  }
  const threshold = sum / gray.length + 12;

  const mask = new Uint8Array(w * h);
  for (let p = 0; p < gray.length; p++) {
    mask[p] = gray[p] > threshold ? 1 : 0;
  }
  return mask;
}

// Étiquetage en composantes connexes (4-connexité, remplissage itératif par
// pile — pas de récursion, pour éviter tout risque de dépassement de pile
// sur une grande image). Renvoie uniquement le masque de la PLUS GRANDE
// région trouvée : c'est ce qui évite qu'un reflet ou un objet clair isolé,
// non connecté au document, ne fausse la détection.
function largestComponent(mask, w, h) {
  const labels = new Int32Array(w * h).fill(-1);
  let bestLabel = -1, bestCount = 0, label = 0;
  const stack = [];

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1 || labels[start] !== -1) continue;
    let count = 0;
    stack.length = 0;
    stack.push(start);
    labels[start] = label;
    while (stack.length) {
      const idx = stack.pop();
      count++;
      const x = idx % w, y = (idx / w) | 0;
      if (x > 0) { const n = idx - 1; if (mask[n] === 1 && labels[n] === -1) { labels[n] = label; stack.push(n); } }
      if (x < w - 1) { const n = idx + 1; if (mask[n] === 1 && labels[n] === -1) { labels[n] = label; stack.push(n); } }
      if (y > 0) { const n = idx - w; if (mask[n] === 1 && labels[n] === -1) { labels[n] = label; stack.push(n); } }
      if (y < h - 1) { const n = idx + w; if (mask[n] === 1 && labels[n] === -1) { labels[n] = label; stack.push(n); } }
    }
    if (count > bestCount) { bestCount = count; bestLabel = label; }
    label++;
  }

  if (bestLabel === -1) return { blobMask: null, count: 0 };
  const blobMask = new Uint8Array(w * h);
  for (let i = 0; i < labels.length; i++) if (labels[i] === bestLabel) blobMask[i] = 1;
  return { blobMask, count: bestCount };
}

// Pixels de la région ayant au moins un voisin hors de la région (ou sur le
// bord du cadre) : le contour de la plus grande région connectée.
function extractBoundaryPoints(blobMask, w, h) {
  const pts = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!blobMask[idx]) continue;
      const onEdge =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        !blobMask[idx - 1] || !blobMask[idx + 1] || !blobMask[idx - w] || !blobMask[idx + w];
      if (onEdge) pts.push({ x, y });
    }
  }
  return pts;
}

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// Enveloppe convexe (Andrew's monotone chain) — algorithme standard, O(n log n).
function convexHull(points) {
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const n = pts.length;
  if (n < 3) return pts;

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = n - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// Les 4 coins extrêmes de l'enveloppe convexe selon les deux diagonales
// (x+y et x-y) : suffisant pour un document à peu près rectangulaire, et
// bien plus fiable ici que sur l'ensemble brut des pixels clairs puisque
// l'enveloppe convexe ne contient déjà que les points de LA région du
// document.
function quadFromHull(hull) {
  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
  let tl, br, tr, bl;
  for (const p of hull) {
    const s = p.x + p.y, d = p.x - p.y;
    if (s < minSum) { minSum = s; tl = p; }
    if (s > maxSum) { maxSum = s; br = p; }
    if (d > maxDiff) { maxDiff = d; tr = p; }
    if (d < minDiff) { minDiff = d; bl = p; }
  }
  return { tl, tr, br, bl };
}

/**
 * Cœur de la détection : renvoie { hull, quad } (hull = contour complet
 * pour l'affichage, quad = 4 coins pour le redressement de perspective) en
 * coordonnées pixel du canvas fourni, ou null si rien d'assez fiable n'a
 * été trouvé (l'appelant doit alors proposer un cadrage par défaut).
 */
function analyzeDocument(ctx, w, h) {
  const mask = foregroundMask(ctx, w, h);
  const { blobMask, count } = largestComponent(mask, w, h);
  const area = count / (w * h);
  if (!blobMask || area < 0.06 || area > 0.97) return null;

  const boundary = extractBoundaryPoints(blobMask, w, h);
  if (boundary.length < 8) return null;

  const hull = convexHull(boundary);
  if (hull.length < 4) return null;

  return { hull, quad: quadFromHull(hull) };
}

/**
 * Détection sur une image déjà capturée (dataURL) — utilisée par l'écran
 * de recadrage manuel pour proposer un cadrage de départ. Renvoie les 4
 * coins en coordonnées pixel de l'image d'origine, ou null.
 */
export async function detectDocumentCorners(dataUrl) {
  const img = await loadImage(dataUrl);
  const { ctx, w, h } = toWorkingCanvas(img, WORK_SIZE);
  const result = analyzeDocument(ctx, w, h);
  if (!result) return null;

  const scaleX = img.naturalWidth / w;
  const scaleY = img.naturalHeight / h;
  const toFull = (p) => ({ x: p.x * scaleX, y: p.y * scaleY });
  const q = result.quad;
  return { tl: toFull(q.tl), tr: toFull(q.tr), br: toFull(q.br), bl: toFull(q.bl) };
}

// Variante "temps réel" pour le contour affiché pendant la prévisualisation
// caméra : prend un canvas DÉJÀ rempli (une frame vidéo réduite, dessinée
// par l'appelant) plutôt qu'une dataURL — encoder/décoder une dataURL à
// chaque frame serait inutilement coûteux pour un suivi répété plusieurs
// fois par seconde. Renvoie { hull, quad } dans l'espace pixel de ce
// canvas ; à l'appelant de les remettre à l'échelle de l'écran/de la vidéo.
export function detectDocumentOutline(canvas) {
  const ctx = canvas.getContext('2d');
  return analyzeDocument(ctx, canvas.width, canvas.height);
}

// Mapping carré unité → quadrilatère quelconque (méthode de Heckbert).
// mapUV(u, v) avec u,v dans [0,1] renvoie le point source correspondant.
function buildQuadMap(corners) {
  const { tl, tr, br, bl } = corners;
  const x0 = tl.x, y0 = tl.y, x1 = tr.x, y1 = tr.y, x2 = br.x, y2 = br.y, x3 = bl.x, y3 = bl.y;

  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;

  let g = 0, h = 0;
  const det = dx1 * dy2 - dx2 * dy1;
  if (!(Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) && Math.abs(det) > 1e-9) {
    g = (dx3 * dy2 - dx2 * dy3) / det;
    h = (dx1 * dy3 - dx3 * dy1) / det;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const c = x0;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  const f = y0;

  return (u, v) => {
    const denom = g * u + h * v + 1;
    return { x: (a * u + b * v + c) / denom, y: (d * u + e * v + f) / denom };
  };
}

function dist(p1, p2) { return Math.hypot(p1.x - p2.x, p1.y - p2.y); }

/**
 * Redresse le quadrilatère {tl,tr,br,bl} (coordonnées pixel dans l'image
 * source) en un rectangle. Échantillonnage bilinéaire, dimension de sortie
 * dérivée des longueurs de bords du quadrilatère.
 */
export async function warpPerspective(dataUrl, corners, maxDim = 2200) {
  const img = await loadImage(dataUrl);
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.naturalWidth;
  srcCanvas.height = img.naturalHeight;
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const sPix = srcData.data;

  const widthTop = dist(corners.tl, corners.tr);
  const widthBottom = dist(corners.bl, corners.br);
  const heightLeft = dist(corners.tl, corners.bl);
  const heightRight = dist(corners.tr, corners.br);
  let outW = Math.max(1, Math.round(Math.max(widthTop, widthBottom)));
  let outH = Math.max(1, Math.round(Math.max(heightLeft, heightRight)));
  const downscale = Math.min(1, maxDim / Math.max(outW, outH));
  outW = Math.max(1, Math.round(outW * downscale));
  outH = Math.max(1, Math.round(outH * downscale));

  const mapUV = buildQuadMap(corners);
  const destCanvas = document.createElement('canvas');
  destCanvas.width = outW;
  destCanvas.height = outH;
  const destCtx = destCanvas.getContext('2d');
  const destData = destCtx.createImageData(outW, outH);
  const dPix = destData.data;

  for (let py = 0; py < outH; py++) {
    const v = (py + 0.5) / outH;
    for (let px = 0; px < outW; px++) {
      const u = (px + 0.5) / outW;
      const { x, y } = mapUV(u, v);
      const di = (py * outW + px) * 4;
      if (x < 0 || y < 0 || x > sw - 1 || y > sh - 1) {
        dPix[di] = 255; dPix[di + 1] = 255; dPix[di + 2] = 255; dPix[di + 3] = 255;
        continue;
      }
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
      const fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 4; c++) {
        const top = sPix[i00 + c] + (sPix[i10 + c] - sPix[i00 + c]) * fx;
        const bot = sPix[i01 + c] + (sPix[i11 + c] - sPix[i01 + c]) * fx;
        dPix[di + c] = top + (bot - top) * fy;
      }
    }
  }

  destCtx.putImageData(destData, 0, 0);
  return destCanvas.toDataURL('image/jpeg', 0.88);
}
