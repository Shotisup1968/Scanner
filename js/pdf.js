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
    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    pdf.addImage(page.dataUrl, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');
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
