// Reconnaissance de texte (OCR) via Tesseract.js, entièrement vendorisé
// dans js/vendor/tesseract/ — chargé à la demande seulement (l'utilisateur
// n'en a pas toujours besoin), jamais au démarrage de l'appli.

// URLs absolues : dans le Worker que crée Tesseract.js, la résolution des
// chemins relatifs ne correspond pas à celle de la page principale (d'où
// des "Failed to parse URL" sur le .wasm si on ne donne que des chemins
// relatifs) — on ancre donc tout sur document.baseURI.
const BASE = new URL('js/vendor/tesseract/', document.baseURI).href;
const SCRIPT_PATH = BASE + 'tesseract.min.js';
const WORKER_PATH = BASE + 'worker.min.js';
// La variante .wasm.js (autonome, WASM encodé en base64 à l'intérieur du
// JS) est indispensable ici : la variante .js "nue" tente de re-fetcher son
// .wasm via un chemin relatif basé sur document.currentScript, qui n'existe
// pas dans un Worker — ça échoue silencieusement et bloque le chargement.
const CORE_PATH = BASE + 'tesseract-core-lstm.wasm.js';
const LANG_PATH = BASE + 'lang';

let scriptPromise = null;
function loadTesseractScript() {
  if (window.Tesseract) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_PATH;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Impossible de charger le moteur OCR'));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

let workerPromise = null;
async function getWorker() {
  await loadTesseractScript();
  if (!workerPromise) {
    workerPromise = window.Tesseract.createWorker('fra', 1, {
      workerPath: WORKER_PATH,
      corePath: CORE_PATH,
      langPath: LANG_PATH,
      gzip: false, // fra.traineddata est fourni non compressé
    });
  }
  return workerPromise;
}

function loadImageSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Reconnaît le texte d'une page (dataURL image) et renvoie
 * { width, height, text, words: [{ text, bbox:{x0,y0,x1,y1} }] } — les
 * coordonnées bbox sont en pixels de l'image fournie.
 */
export async function recognizePage(dataUrl) {
  const worker = await getWorker();
  const [{ width, height }, result] = await Promise.all([
    loadImageSize(dataUrl),
    worker.recognize(dataUrl),
  ]);
  const words = (result.data.words || []).map((w) => ({ text: w.text, bbox: w.bbox }));
  return { width, height, text: result.data.text, words };
}

export const OCR_ESTIMATED_SIZE_MB = 4.2;

// true si le moteur OCR est déjà chargé en mémoire (utile pour savoir si le
// prochain appel va déclencher le téléchargement initial ou non).
export function isOcrEngineLoaded() {
  return !!window.Tesseract;
}
