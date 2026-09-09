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
  bw: 'grayscale(1) contrast(1.55) brightness(1.12)',
};

// Applique un filtre "scanner" à une image source (à partir de l'ORIGINAL,
// pour pouvoir changer d'avis sans cumuler les effets) et renvoie une dataURL.
export async function applyFilter(originalDataUrl, mode) {
  const filter = FILTERS[mode];
  const img = await loadImage(originalDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (filter) ctx.filter = filter;
  ctx.drawImage(img, 0, 0);
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
