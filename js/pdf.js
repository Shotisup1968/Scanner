// Assemble une série d'images (une par page) en un seul PDF, localement,
// via jsPDF (bibliothèque embarquée dans js/vendor — aucun appel réseau).

function loadImageSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

const A4_PORTRAIT = { w: 210, h: 297 };
const MARGIN_MM = 8;

function computePlacement(width, height, pageW, pageH) {
  const availW = pageW - MARGIN_MM * 2;
  const availH = pageH - MARGIN_MM * 2;
  const imgRatio = width / height;
  const areaRatio = availW / availH;

  let drawW, drawH;
  if (imgRatio > areaRatio) {
    drawW = availW;
    drawH = availW / imgRatio;
  } else {
    drawH = availH;
    drawW = availH * imgRatio;
  }
  return { x: (pageW - drawW) / 2, y: (pageH - drawH) / 2, drawW, drawH };
}

// pages: [{ dataUrl, ocr? }] — ocr, s'il est fourni, est le résultat de
// recognizePage() (js/ocr.js) : { width, height, words: [{text, bbox}] }.
// Quand présent, une couche de texte invisible est superposée à l'image,
// alignée sur chaque mot détecté, pour rendre le PDF cherchable/copiable
// sans changer son apparence visuelle.
export async function buildPdf(pages, docName) {
  const { jsPDF } = window.jspdf;
  let pdf = null;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = await loadImageSize(page.dataUrl);
    const isLandscape = width > height;
    const orientation = isLandscape ? 'landscape' : 'portrait';
    const pageW = isLandscape ? A4_PORTRAIT.h : A4_PORTRAIT.w;
    const pageH = isLandscape ? A4_PORTRAIT.w : A4_PORTRAIT.h;

    if (i === 0) {
      pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    } else {
      pdf.addPage('a4', orientation);
    }

    const { x, y, drawW, drawH } = computePlacement(width, height, pageW, pageH);
    pdf.addImage(page.dataUrl, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');

    if (page.ocr && page.ocr.words && page.ocr.words.length) {
      const ocrW = page.ocr.width || width;
      const ocrH = page.ocr.height || height;
      const scaleX = drawW / ocrW;
      const scaleY = drawH / ocrH;
      for (const word of page.ocr.words) {
        const text = word.text && word.text.trim();
        if (!text) continue;
        const b = word.bbox;
        const wx = x + b.x0 * scaleX;
        const wy = y + b.y1 * scaleY; // ligne de base ≈ bas de la boîte
        const boxHmm = (b.y1 - b.y0) * scaleY;
        const fontSizePt = Math.max(4, boxHmm * 2.834645669); // mm → pt
        pdf.setFontSize(fontSizePt);
        pdf.text(text, wx, wy, { renderingMode: 'invisible' });
      }
    }
  }

  const blob = pdf.output('blob');
  return blob;
}

export function pdfFileName(docName) {
  const safe = (docName || 'document')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .slice(0, 80) || 'document';
  return `${safe}.pdf`;
}
