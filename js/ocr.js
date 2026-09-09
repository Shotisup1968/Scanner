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
// corePath pointe sur le DOSSIER (et non un fichier précis) : c'est la
// configuration documentée par Tesseract.js v5 pour choisir automatiquement,
// au runtime, entre les variantes WASM SIMD/non-SIMD — cf.
// docs/local-installation.md du projet (« set it to a directory that
// contains all of the following 4 files »). Les 2 variantes LSTM-only sont
// vendorisées ici (js/vendor/tesseract/tesseract-core-lstm.wasm.js et
// tesseract-core-simd-lstm.wasm.js) : ce sont les seules jamais atteintes,
// car ce fichier ne demande jamais le moteur "legacy" (OEM par défaut =
// LSTM_ONLY, cf. createWorker plus bas). Un seul des deux fichiers est
// réellement téléchargé par appareil — celui que Tesseract sélectionne via
// une détection WebAssembly SIMD faite au runtime dans le Worker — donc
// vendoriser les deux ne double pas le poids réseau réel par utilisateur.
// Chaque variante est le format autonome « .wasm.js » (WASM encodé en
// base64 dans le JS) : la variante .js "nue" tente de re-fetcher son .wasm
// via un chemin relatif basé sur document.currentScript, qui n'existe pas
// dans un Worker — ça échoue silencieusement et bloque le chargement.
const CORE_PATH = BASE;
const LANG_PATH = BASE + 'lang';

// Le worker.recognize() de Tesseract.js n'a pas de timeout intégré : un état
// interne corrompu (rare, mais déjà observé en dev sur d'autres projets
// Tesseract.js) peut le laisser bloqué indéfiniment sans rejeter ni
// résoudre, ce qui coincerait le bouton "Reconnaissance…" pour de bon tant
// que l'appli n'est pas rechargée. On borne donc chaque page à une durée
// large (un scan iPhone classique prend quelques secondes à ~20s) et on
// détruit puis recrée le worker si elle est dépassée, pour qu'un nouvel
// essai reparte sur une base saine sans recharger toute l'application.
const RECOGNIZE_TIMEOUT_MS = 90_000;

let scriptPromise = null;
function loadTesseractScript() {
  if (window.Tesseract) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_PATH;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null; // autorise une nouvelle tentative après un échec ponctuel
        reject(new Error('Impossible de charger le moteur OCR'));
      };
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
    }).catch((err) => {
      // Ne pas conserver éternellement une Promise rejetée : un échec réseau,
      // cache ou Worker doit pouvoir être retenté sans recharger toute l'app.
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

// Détruit le worker courant (s'il existe) et oublie sa Promise, pour que le
// prochain appel à getWorker() en recrée un propre. Utilisé après un timeout
// de reconnaissance : on ne sait pas dans quel état interne le worker est
// resté, mieux vaut repartir de zéro que de le réutiliser tel quel.
async function resetWorker() {
  const current = workerPromise;
  workerPromise = null;
  if (!current) return;
  try {
    const worker = await current;
    await worker.terminate();
  } catch {
    // Le worker était déjà cassé ou en cours d'échec : rien à nettoyer de plus.
  }
}

function loadImageSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function timeoutAfter(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('OCR_TIMEOUT')), ms);
  });
}

/**
 * Reconnaît le texte d'une page (dataURL image) et renvoie
 * { width, height, text, words: [{ text, bbox:{x0,y0,x1,y1} }] } — les
 * coordonnées bbox sont en pixels de l'image fournie.
 */
export async function recognizePage(dataUrl) {
  const worker = await getWorker();
  let width, height, result;
  try {
    const [size, recognized] = await Promise.all([
      loadImageSize(dataUrl),
      Promise.race([worker.recognize(dataUrl), timeoutAfter(RECOGNIZE_TIMEOUT_MS)]),
    ]);
    ({ width, height } = size);
    result = recognized;
  } catch (err) {
    if (err && err.message === 'OCR_TIMEOUT') {
      await resetWorker();
      throw new Error('La reconnaissance de texte a mis trop de temps à répondre');
    }
    throw err;
  }
  const words = (result.data.words || []).map((w) => ({ text: w.text, bbox: w.bbox }));
  return { width, height, text: result.data.text, words };
}

// Somme des fichiers réellement téléchargés lors du premier OCR : le script
// glue (~65 Ko), le worker (~120 Ko), les données de langue française
// (~1.1 Mo) et UNE SEULE des deux variantes du moteur core (~3.8 Mo) —
// Tesseract choisit laquelle au runtime, les deux ne sont jamais chargées.
export const OCR_ESTIMATED_SIZE_MB = 5.0;

// true si le moteur OCR est déjà chargé en mémoire (utile pour savoir si le
// prochain appel va déclencher le téléchargement initial ou non).
export function isOcrEngineLoaded() {
  return !!window.Tesseract && !!workerPromise;
}
