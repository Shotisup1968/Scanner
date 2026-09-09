# Licences des bibliothèques vendorisées

Scanner embarque localement (aucun appel CDN au runtime) les bibliothèques
tierces suivantes. Ce fichier existe parce que les paquets minifiés
distribués ci-dessous ne contiennent pas leurs fichiers `LICENSE`/`NOTICE`
d'origine — point relevé lors de l'audit croisé Claude/Vega de septembre
2026. Les liens pointent vers le texte de licence complet et faisant foi.

## jsPDF (`jspdf.umd.min.js`)

- Projet : https://github.com/parallax/jsPDF
- Version vendorisée : 2.5.1
- Licence : MIT
- Texte complet : https://github.com/parallax/jsPDF/blob/v2.5.1/LICENSE

## Tesseract.js (`tesseract/tesseract.min.js`, `tesseract/worker.min.js`)

- Projet : https://github.com/naptha/tesseract.js
- Version vendorisée : 5.1.1
- Licence : Apache License 2.0
- Texte complet : https://github.com/naptha/tesseract.js/blob/v5.1.1/LICENSE.md

## tesseract.js-core (`tesseract/tesseract-core-lstm.wasm.js`, `tesseract/tesseract-core-simd-lstm.wasm.js`)

- Projet : https://github.com/naptha/tesseract.js-core
- Version vendorisée : 5.1.1
- Licence : Apache License 2.0
- Texte complet : https://github.com/naptha/tesseract.js/blob/v5.1.1/LICENSE.md
  (le sous-projet core est distribué sous la même licence que Tesseract.js)

## Données d'entraînement françaises (`tesseract/lang/fra.traineddata`)

- Projet : https://github.com/tesseract-ocr/tessdata_fast
- Fichier : `fra.traineddata`
- Licence : Apache License 2.0
- Texte complet : https://github.com/tesseract-ocr/tessdata_fast/blob/main/LICENSE

---

Aucune de ces licences n'impose de conditions incompatibles avec un usage
personnel/interne de Scanner. Avant toute distribution publique du projet
(publication de l'app elle-même, pas seulement de son code source), vérifier
si le mode de distribution choisi exige de joindre ces textes de licence
tels quels plutôt que par lien.
