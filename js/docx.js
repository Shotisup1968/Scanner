// Export du texte reconnu (OCR) vers un document Word éditable.
//
// Ce n'est PAS un vrai fichier .docx (format OOXML = une archive ZIP de
// plusieurs XML) : reconstruire ce format à la main est fragile et
// difficile à vérifier sans pouvoir ouvrir le résultat dans Word depuis cet
// environnement de développement. On utilise à la place une technique
// classique et robuste : un fichier HTML, avec quelques indications
// spécifiques à Word dans l'en-tête, servi avec l'extension .doc — Word
// (et la plupart des autres traitements de texte : LibreOffice, Pages,
// Google Docs) l'ouvre nativement via son filtre d'import HTML, avec le
// texte dans de vrais paragraphes éditables (pas une image). Zéro
// dépendance, zéro bibliothèque à vendoriser.
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// pages : [{ text }] — texte brut par page (voir doc.ocrText dans app.js).
export function buildWordDoc(pages, docName) {
  const body = pages
    .map((page, i) => {
      const lines = (page.text || '').split(/\r?\n/);
      const paragraphs = lines
        .map((line) => `<p>${escapeHtml(line).trim() || '&nbsp;'}</p>`)
        .join('\n');
      const pageBreak = i < pages.length - 1 ? '<br style="page-break-before:always">' : '';
      return paragraphs + pageBreak;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escapeHtml(docName)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; }
  p { margin: 0 0 8pt 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;

  return new Blob(['﻿' + html], { type: 'application/msword' });
}

export function wordFileName(docName) {
  const safe = (docName || 'document')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .slice(0, 80) || 'document';
  return `${safe}.doc`;
}
