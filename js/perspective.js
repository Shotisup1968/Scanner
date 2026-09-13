// Détection heuristique des bords d'un document + redressement de
// perspective (warp quadrilatère → rectangle), sans dépendance externe
// (pas d'OpenCV.js : tout tient dans ce fichier, en JS + Canvas).

const WORK_SIZE = 520; // taille de travail pour l'analyse (vitesse)

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function toWorkingCanvas(img) {
  const scale = WORK_SIZE / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return { ctx, w, h };
}

/**
 * Heuristique de détection des bords, volontairement simple (pas de
 * détection de contours ni de composantes connexes) : on ne calcule PAS la
 * plus grande région claire — chaque pixel plus clair que la luminance
 * moyenne + un seuil est retenu individuellement, puis les points extrêmes
 * de CET ENSEMBLE selon les deux diagonales de l'image (x+y et x-y)
 * approximent les 4 coins du document. Fiable pour un document assez clair
 * posé sur un fond qui contraste (le cas le plus courant : papier sur
 * table/bureau), mais un point clair isolé et non connecté au document
 * (reflet, lampe, zone claire du fond) peut tirer un coin vers l'extérieur
 * puisque rien ne vérifie que les pixels retenus forment une seule région.
 * Le recadrage manuel (coins ajustables) reste le filet de sécurité pour
 * les cas où cette heuristique se trompe.
 *
 * Cœur partagé entre detectDocumentCorners() (sur une image déjà capturée,
 * via dataURL) et detectCornersFromCanvas() (sur une frame vidéo en direct,
 * pour le contour affiché pendant la prise de vue) : travaille directement
 * sur un canvas déjà dessiné, renvoie les coins dans l'espace pixel de CE
 * canvas, ou null si rien d'assez fiable n'est détecté.
 */
function analyzeCorners(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h);

  const lum = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lum[p] = l;
    sum += l;
  }
  const mean = sum / (w * h);
  const threshold = mean + 12;

  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
  let pMinSum, pMaxSum, pMinDiff, pMaxDiff;
  let count = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (lum[y * w + x] < threshold) continue;
      count++;
      const s = x + y, d = x - y;
      if (s < minSum) { minSum = s; pMinSum = [x, y]; }
      if (s > maxSum) { maxSum = s; pMaxSum = [x, y]; }
      if (d < minDiff) { minDiff = d; pMinDiff = [x, y]; }
      if (d > maxDiff) { maxDiff = d; pMaxDiff = [x, y]; }
    }
  }

  const area = count / (w * h);
  if (!pMinSum || area < 0.12 || area > 0.97) {
    return null;
  }

  return {
    tl: { x: pMinSum[0], y: pMinSum[1] },
    tr: { x: pMaxDiff[0], y: pMaxDiff[1] },
    br: { x: pMaxSum[0], y: pMaxSum[1] },
    bl: { x: pMinDiff[0], y: pMinDiff[1] },
  };
}

/**
 * Renvoie null si la détection n'est pas assez fiable — l'appelant doit
 * alors proposer un cadrage par défaut (image entière).
 */
export async function detectDocumentCorners(dataUrl) {
  const img = await loadImage(dataUrl);
  const { ctx, w, h } = toWorkingCanvas(img);
  const corners = analyzeCorners(ctx, w, h);
  if (!corners) return null;

  const scaleX = img.naturalWidth / w;
  const scaleY = img.naturalHeight / h;
  const toFull = (p) => ({ x: p.x * scaleX, y: p.y * scaleY });

  return {
    tl: toFull(corners.tl),
    tr: toFull(corners.tr),
    br: toFull(corners.br),
    bl: toFull(corners.bl),
  };
}

// Variante "temps réel" pour le contour affiché pendant la prévisualisation
// caméra : prend un canvas DÉJÀ rempli (une frame vidéo réduite, dessinée
// par l'appelant) plutôt qu'une dataURL — encoder/décoder une dataURL à
// chaque frame serait inutilement coûteux pour un suivi répété plusieurs
// fois par seconde. Coins renvoyés dans l'espace pixel de ce canvas ; à
// l'appelant de les remettre à l'échelle de l'écran.
export function detectCornersFromCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  return analyzeCorners(ctx, canvas.width, canvas.height);
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
