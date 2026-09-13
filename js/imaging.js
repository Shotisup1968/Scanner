// Traitement d'image local (recadrage, filtres "scanner") — tout se passe
// dans un <canvas>, aucune donnée ne quitte l'appareil.

const MAX_DIMENSION = 2200; // limite raisonnable pour garder des PDF légers
const JPEG_QUALITY = 0.86;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Redimensionne si besoin et renvoie une dataURL JPEG "propre" de départ.
export async function normalizeCapture(dataUrl) {
  const img = await loadImage(dataUrl);
  let { naturalWidth: w, naturalHeight: h } = img;
  let scale = 1;
  if (Math.max(w, h) > MAX_DIMENSION) {
    scale = MAX_DIMENSION / Math.max(w, h);
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

const FILTERS = {
  color: null,
  enhance: 'contrast(1.28) brightness(1.08) saturate(0.9)',
};

// Aplatit les variations d'éclairage locales (ombre le long d'un pli, coin
// plus sombre qu'un autre, etc.) avant de basculer en noir & blanc. Un
// simple contraste global (ce que faisait l'ancienne version) assombrit ou
// sature les zones d'ombre au lieu de les corriger, puisqu'il applique le
// même seuil à toute l'image.
//
// Principe : on estime la "luminosité de fond" localement — une version
// très floutée de l'image, obtenue en la réduisant puis en la ré-agrandissant
// (l'interpolation bilinéaire du canvas fait ici office de flou large et
// bon marché, sans boucle de convolution à écrire à la main) — puis chaque
// pixel est renormalisé par rapport à CE fond local plutôt que par rapport
// à un seuil unique pour toute la page. Un texte dans l'ombre d'un pli
// ressort donc aussi net qu'un texte en pleine lumière.
function localAdaptiveBW(canvas, ctx) {
  const w = canvas.width, h = canvas.height;
  const src = ctx.getImageData(0, 0, w, h).data;

  const gray = new Float32Array(w * h);
  const grayCanvas = document.createElement('canvas');
  grayCanvas.width = w; grayCanvas.height = h;
  const grayCtx = grayCanvas.getContext('2d');
  const grayImg = grayCtx.createImageData(w, h);
  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    const v = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
    gray[p] = v;
    grayImg.data[i] = v; grayImg.data[i + 1] = v; grayImg.data[i + 2] = v; grayImg.data[i + 3] = 255;
  }
  grayCtx.putImageData(grayImg, 0, 0);

  // Réduction très agressive (≈1/36e) puis ré-agrandissement : approxime un
  // flou de rayon large (variations lentes d'éclairage) sans affecter le
  // texte, qui est à une échelle bien plus fine.
  const smallW = Math.max(24, Math.round(w / 36));
  const smallH = Math.max(24, Math.round(h / 36));
  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = smallW; smallCanvas.height = smallH;
  smallCanvas.getContext('2d').drawImage(grayCanvas, 0, 0, smallW, smallH);

  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = w; blurCanvas.height = h;
  const blurCtx = blurCanvas.getContext('2d');
  blurCtx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in blurCtx) blurCtx.imageSmoothingQuality = 'high';
  blurCtx.drawImage(smallCanvas, 0, 0, w, h);
  const blurred = blurCtx.getImageData(0, 0, w, h).data;

  const CONTRAST = 2.4;
  const out = ctx.createImageData(w, h);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const normalized = gray[p] - blurred[i] + 128;
    const v = Math.min(255, Math.max(0, (normalized - 128) * CONTRAST + 128));
    out.data[i] = v; out.data[i + 1] = v; out.data[i + 2] = v; out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
}

// Applique un filtre "scanner" à une image source (à partir de l'ORIGINAL,
// pour pouvoir changer d'avis sans cumuler les effets) et renvoie une dataURL.
export async function applyFilter(originalDataUrl, mode) {
  const img = await loadImage(originalDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');

  if (mode === 'bw') {
    ctx.drawImage(img, 0, 0);
    localAdaptiveBW(canvas, ctx);
  } else {
    const filter = FILTERS[mode];
    if (filter) ctx.filter = filter;
    ctx.drawImage(img, 0, 0);
  }
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export async function makeThumbnail(dataUrl, maxSize = 220) {
  const img = await loadImage(dataUrl);
  const scale = maxSize / Math.max(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.75);
}
