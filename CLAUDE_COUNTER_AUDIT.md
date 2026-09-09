# Contre-audit Claude — travail de Vega sur Scanner

Date : 9 septembre 2026
Méthode : lecture ligne à ligne du code réel dans `Scanner_Vega_Corrected.zip`
(pas seulement de `VEGA_AUDIT_SCANNER.md`), diff complet contre l'original,
recherche indépendante (documentation officielle Tesseract.js, avis de
sécurité jsPDF, spec Storage API) et test d'exécution réel en navigateur
pour le point le plus disputé (OCR `corePath`).

Consigne suivie : je ne défends pas mon travail original par défaut, et je
ne valide pas Vega par défaut. Chaque point est vérifié indépendamment.

---

## 1 — Comparaison des modifications

### 1.1 Caméra — capture trop précoce (`js/app.js`, `startStream`/`capturePhoto`/`stopStream`)

- **Original** : `startStream()` assigne `cameraVideo.srcObject` puis
  retourne sans attendre que la vidéo ait des dimensions. `capturePhoto()`
  utilise `video.videoWidth`/`videoHeight` sans garde.
- **Vega** : bouton obturateur désactivé jusqu'à `loadedmetadata` +
  `video.play()` résolu ; garde supplémentaire dans `capturePhoto()` ;
  `stopStream()` réinitialise `srcObject` et redésactive le bouton.
- **Analyse** : race condition réelle et confirmée — un tap très rapide sur
  l'obturateur juste après ouverture de la caméra peut produire un canvas
  0×0. `<video autoplay playsinline muted>` est déjà présent dans
  `index.html`, donc l'appel explicite à `.play()` est redondant sur le
  papier mais reste une bonne défense (Safari peut être capricieux sur
  l'autoplay effectif d'un flux fraîchement attaché).
- **Risque introduit** : aucun trouvé. Pas de scénario où le bouton reste
  bloqué désactivé (toute réouverture de la caméra repasse par
  `startStream()`, qui le réactive en cas de succès).
- **Décision** : ✅ **CORRECTION À CONSERVER**.
- **Version finale** : celle de Vega, reprise telle quelle.

### 1.2 Stockage persistant iOS (`js/app.js`, `requestPersistentStorage`)

- **Original** : `navigator.storage.persist()` jamais appelé.
- **Vega** : appel non bloquant au chargement, avec vérification de
  disponibilité de l'API et `try/catch`.
- **Analyse** : vérifié indépendamment (pas juste répété) — Safari/WebKit
  supporte réellement l'API Storage, `persist()` compris, **depuis Safari
  17 / iOS 17** (WebKit change log, cf. section 6). Fin 2026, la quasi-
  totalité des iPhones ciblés tournent sous iOS 17+, donc ce n'est pas un
  no-op théorique : ça a un effet réel sur l'appareil visé. WebKit accorde
  la persistance par heuristique (site ajouté à l'écran d'accueil, etc.),
  sans prompt ni geste utilisateur requis — l'appel au chargement du module
  est donc la bonne pratique.
- **Risque introduit** : aucun. Échec silencieux et non bloquant si l'API
  est absente ou refuse.
- **Décision** : ✅ **CORRECTION À CONSERVER**.
- **Version finale** : celle de Vega, reprise telle quelle.

### 1.3 Service worker — cache-busting du JS applicatif (`service-worker.js`)

- **Original** : réseau d'abord pour le HTML de navigation seulement ;
  cache d'abord pour tout le reste (JS, CSS, icônes) — dépend entièrement
  de la discipline de bump manuel de `CACHE_NAME`.
- **Vega** : réseau d'abord étendu à `*.html`, `*.css`, `manifest.json` et
  aux 6 modules `js/*.js` de l'appli ; cache d'abord conservé pour
  vendor/icônes/OCR (gros fichiers, changent rarement) ; garde
  same-origin ajoutée ; logique factorisée (`networkFirst`/`cacheFirst`).
- **Analyse** : corrige un risque réel et documenté (utilisateur coincé sur
  un vieux JS après déploiement si `CACHE_NAME` n'est pas bumpé). Le
  compromis (une vérification réseau à chaque chargement en ligne) est
  négligeable pour des fichiers texte de quelques Ko, et le repli sur cache
  reste intact hors-ligne.
- **Risque introduit** : aucun trouvé. La garde same-origin est un no-op
  défensif (l'appli ne fait déjà aucun appel cross-origin).
- **Décision** : ✅ **CORRECTION À CONSERVER** (voir 1.9 pour le bump de
  version supplémentaire que j'ai ajouté par-dessus).
- **Version finale** : celle de Vega + `CACHE_NAME` rebumpé à `v11` par mes
  soins (nouveau fichier vendor OCR ajouté, voir section 4).

### 1.4 Message d'erreur — quota IndexedDB à la création du PDF (`js/app.js`)

- **Original** : message générique « Erreur lors de la création du PDF »
  pour toute exception, y compris un quota dépassé.
- **Vega** : détection de `QuotaExceededError`/`NS_ERROR_DOM_QUOTA_REACHED`
  avec message dédié.
- **Analyse** : vérifié dans `js/db.js` — `saveDocument()` rejette bien avec
  `tx.error`, une vraie `DOMException` dont `.name` vaut
  `'QuotaExceededError'` en cas de dépassement de quota IndexedDB sous
  Safari/WebKit. La condition est donc correctement câblée sur une erreur
  qui peut réellement se produire (l'appli stocke PDF + images source en
  pleine résolution par document).
- **Risque introduit** : aucun.
- **Décision** : ✅ **CORRECTION À CONSERVER**.
- **Version finale** : celle de Vega, **complétée** — le même risque existe
  à l'identique dans le flux OCR (`btnDocOcr`, qui réappelle
  `saveDocument()` avec un PDF reconstruit) et n'était pas couvert. J'ai
  ajouté la même détection à ce second endroit (voir section 4/11).

### 1.5 Recadrage — validation du quadrilatère (`js/app.js`, `isValidCropQuad`)

- **Original** : aucune validation avant `warpPerspective()` ; des coins
  croisés ou une surface quasi nulle sont envoyés tels quels.
- **Vega** : test de convexité (signe constant du produit vectoriel à
  chaque sommet) + surface minimale (formule du lacet), plus nettoyage
  `pointercancel` sur le drag tactile.
- **Analyse** : j'ai recontrôlé la géométrie à la main. Le test de
  convexité est le test standard « direction de virage à chaque sommet » —
  il rejette correctement un quadrilatère croisé (« bowtie ») et le cas
  dégénéré (points alignés, produit vectoriel nul, ni `>1` ni `<-1`). Le
  calcul d'aire par la formule du lacet est correct. Le seuil
  `max(400, 0.5% de la zone de crop)` est assez bas pour ne jamais gêner un
  recadrage légitime, y compris serré. Le `pointercancel` comble un vrai
  trou : sans lui, une interruption système (appel entrant, geste iOS) en
  plein drag laisse les listeners `pointermove`/`pointerup` accrochés à
  `window` indéfiniment — un point de contact ultérieur sans rapport
  pourrait alors continuer à déplacer le coin resté « collé ».
- **Risque introduit** : aucun trouvé — pas de faux rejet identifié pour un
  usage réel.
- **Décision** : ✅ **CORRECTION À CONSERVER**.
- **Version finale** : celle de Vega, reprise telle quelle.

### 1.6 Partage — message d'erreur inversé (`js/app.js`, `btnDocShare`)

- **Original** : `if (err.name !== 'AbortError') showToast('Partage
  annulé')` — message affiché précisément quand ce N'EST PAS une annulation
  utilisateur, donc sur une vraie erreur. Les annulations volontaires
  (AbortError), elles, ne montrent rien du tout.
- **Vega** : message « Le partage a échoué » sur vraie erreur (même
  condition, texte corrigé) + `console.error` pour le diagnostic.
  L'annulation reste silencieuse.
- **Analyse** : c'est un bug de logique/formulation confirmé dans mon
  propre code original — la condition était correcte, le texte était
  trompeur et laissait croire à l'utilisateur qu'il avait annulé lui-même
  alors que le partage avait réellement échoué.
- **Risque introduit** : aucun.
- **Décision** : ✅ **CORRECTION À CONSERVER** — bonne prise de Vega, erreur
  que je n'avais pas vue.
- **Version finale** : celle de Vega, reprise telle quelle.

### 1.7 Code mort — `cropDataUrl()` (`js/imaging.js`)

- **Original** : fonction exportée, jamais importée nulle part.
- **Vega** : suppression.
- **Analyse** : `grep` sur tout le projet confirme zéro import ailleurs
  (seules mentions restantes : dans `HANDOFF_AUDIT.md`, qui la documentait
  déjà comme probablement morte). Suppression sûre.
- **Décision** : ✅ **CORRECTION À CONSERVER**.
- **Version finale** : celle de Vega, reprise telle quelle.

### 1.8 OCR — Promise rejetée mémorisée pour toujours (`js/ocr.js`)

- **Original** : `scriptPromise`/`workerPromise` sont des singletons de
  module jamais réinitialisés après un rejet — un échec réseau ponctuel au
  premier chargement du moteur OCR cassait l'OCR jusqu'au rechargement
  complet de l'appli.
- **Vega** : remise à `null` de ces variables dans les gestionnaires
  d'erreur, avant de relancer l'erreur.
- **Analyse** : pattern classique et correctement corrigé — j'ai retracé le
  chaînage de promesses à la main : l'appelant en cours reçoit bien le rejet
  attendu, et la variable de module est réinitialisée pour que le *prochain*
  appel reparte de zéro. Vérifié correct.
- **Décision** : ✅ **CORRECTION À CONSERVER**.
- **Version finale** : celle de Vega, **complétée** par un filet de sécurité
  supplémentaire pour le cas « worker bloqué » (recognize() qui ne répond
  jamais) — voir section 4.

### 1.9 OCR — `isOcrEngineLoaded()` (`js/ocr.js`)

- **Original** : `return !!window.Tesseract` — vrai dès que le petit script
  glue (~65 Ko) est chargé, indépendamment du worker/core/langue réels
  (~5 Mo) qui font le vrai travail.
- **Vega** : `return !!window.Tesseract && !!workerPromise`.
- **Analyse** : plus correct. Avec l'original, un premier échec de
  `createWorker()` après chargement réussi du petit script laissait
  `isOcrEngineLoaded()` répondre « oui » à tort, donc l'utilisateur n'était
  plus prévenu du téléchargement de ~5 Mo à venir lors d'une nouvelle
  tentative — alors qu'il devait bel et bien se reproduire.
- **Risque introduit** : négligeable (fenêtre où `workerPromise` existe
  mais n'est pas encore résolu compte comme « chargé » — sans conséquence
  pratique ici, rien d'autre ne lit ce signal en concurrence).
- **Décision** : ✅ **CORRECTION À CONSERVER**.
- **Version finale** : celle de Vega, reprise telle quelle.

### 1.10 README — formulation « zéro appel réseau » (`README.md`)

- **Original** : « aucun appel réseau après le premier chargement ».
- **Vega** : reformulation — aucune donnée de document envoyée ; le service
  worker peut vérifier les mises à jour de l'appli auprès de l'hébergeur
  statique quand l'appareil est en ligne.
- **Analyse** : l'affirmation originale était déjà inexacte **avant même**
  la modification du service worker par Vega, puisque la stratégie
  « réseau d'abord » pour le HTML de navigation existait déjà dans ma
  version d'origine. La reformulation de Vega est plus honnête et reste
  cohérente avec les valeurs du projet (zéro donnée personnelle envoyée,
  ce qui est la promesse qui compte réellement).
- **Décision** : ✅ **CORRECTION À CONSERVER**.
- **Version finale** : celle de Vega, reprise telle quelle.

### 1.11 Point non tranché par Vega — `corePath` Tesseract.js

Vega a délibérément **laissé ce point ouvert** (ne l'a pas corrigé,
faute d'avoir les 4 fichiers de variantes). Traité en détail en section 4
— c'est le point prioritaire demandé, et j'ai tranché avec vérification
indépendante + test d'exécution réel.

**Résumé du verdict** (détails section 4) : Vega a raison sur le fond —
la doc officielle recommande bien un dossier — mais son diagnostic « ça
peut coûter en performance/compatibilité » sous-estimait un peu le
problème : sans la variante SIMD, l'app utilise systématiquement le moteur
non-SIMD même sur un iPhone récent qui supporte le WASM SIMD (perf OCR
significativement plus lente que nécessaire). J'ai implémenté le correctif
complet (dossier + variante SIMD vendorisée) et vérifié son bon
fonctionnement par un test d'exécution réel dans le navigateur.

### 1.12 Point non tranché par Vega — détection des bords (`perspective.js`)

Vega a identifié un vrai décalage entre le commentaire du code (« plus
grande région claire ») et le comportement réel (aucune analyse de
composantes connexes — simple seuil de luminance sur tous les pixels).
J'ai confirmé ce constat à la lecture du code : c'est exact. Vega n'a pas
touché à l'algorithme, faute de photos réelles pour valider un
remplacement — je suis d'accord avec cette prudence (consigne explicite :
ne pas remplacer par OpenCV.js ou une grosse dépendance sans nécessité
démontrée). J'ai seulement corrigé le commentaire pour qu'il décrive
honnêtement ce que fait le code (aucun changement de comportement).

- **Décision** : ℹ️ **AMÉLIORATION OPTIONNELLE** (documentation seulement,
  algorithme conservé à l'identique).

---

## 2 — Caméra

Points vérifiés :

- `getUserMedia({ video: { facingMode: { ideal: 'environment' }, ... } })` —
  `ideal` (pas `exact`) est le bon choix : demande la caméra arrière sans
  faire échouer la capture sur un appareil qui ne l'a pas.
- Démarrage/arrêt du stream : `stopStream()` arrête bien chaque piste
  (`t.stop()`) — pas de fuite de flux caméra active en arrière-plan une
  fois qu'on quitte l'écran caméra. Le patch Vega ajoute la remise à `null`
  de `srcObject`, qui détache proprement l'élément `<video>` du flux.
- Attente de disponibilité vidéo : corrigée par Vega (section 1.1).
- Capture trop rapide : corrigée par Vega (section 1.1).
- Dimensions `videoWidth`/`videoHeight` : gardées à deux endroits après le
  patch Vega (activation du bouton + re-contrôle dans `capturePhoto`),
  défense en profondeur correcte.
- Refus de la caméra par l'utilisateur : `catch` affiche `camera-error`
  (déjà géré avant Vega ; Vega ajoute `stopStream()` par hygiène, sans
  incidence puisque `mediaStream` est `null` dans ce cas).
- Retour après changement de permission dans Réglages Safari : aucun bouton
  « réessayer » dans l'UI (l'utilisateur doit fermer et rouvrir via le FAB).
  **Ni l'original ni Vega ne comblent ce trou UX** — à vérifier sur iPhone
  réel, et éventuellement ajouter un bouton retry si c'est gênant à l'usage.
- Mode PWA standalone : rien de spécifique à `getUserMedia` ne change en
  mode standalone vs. onglet Safari ; le point réellement bloquant
  (accès caméra impossible dans le navigateur de prévisualisation
  sandboxé) reste un test à faire sur device réel.

**Conclusion** : le patch Vega améliore réellement la fiabilité de la
capture (élimine une vraie race condition). Rien d'exagéré dans son
diagnostic.

---

## 3 — Recadrage et perspective

- `detectDocumentCorners` : algorithme heuristique confirmé fidèle à sa
  description corrigée (section 1.12) — pas de bug de calcul trouvé dans
  la détection des extrêmes ou le passage en coordonnées image → écran
  (`toScreenCorners`), revérifié à la main.
- Coins utilisateur / coins qui se croisent / quadrilatères invalides :
  couverts par `isValidCropQuad` (section 1.5), vérifiés corrects.
- Dimensions de sortie : `outW`/`outH` dérivées des longueurs de bords
  réelles du quadrilatère, bornées par `maxDim=2200`, `Math.max(1, ...)`
  empêche une dimension nulle. Pas de cas trouvé où `warpPerspective`
  pourrait produire un canvas 0×0 même avec un quadrilatère limite — et de
  toute façon `isValidCropQuad` filtre déjà ces cas en amont.
- Transformation projective (mapping de Heckbert) : relue et revérifiée
  manuellement, y compris le cas `det≈0` (repli sur `g=h=0`, approximation
  affine plutôt qu'une division par zéro/NaN).
- Interpolation bilinéaire : correcte, clamp `x1/y1` sur les bords de
  l'image source pour éviter un accès hors tableau sur le dernier pixel.
- Performance sur téléphone : `WORK_SIZE = 520` pour la détection (rapide),
  warp fait sur l'image pleine résolution mais borné à `maxDim=2200px` en
  sortie — raisonnable pour un iPhone récent, mais **non mesuré sur device
  réel** (le navigateur de prévisualisation sandboxé ne donne pas une
  mesure représentative des perfs CPU d'un iPhone).
- Tactile `pointerdown/move/up` + `pointercancel` : couvert, voir 1.5.
- Interaction avec pinch/zoom iOS : `touch-action: none` déjà présent sur
  `.crop-stage` ET `.crop-handle` dans `css/style.css` **avant même le
  patch Vega** — ce point n'était donc pas un trou, contrairement à ce
  qu'on pourrait croire en lisant seulement la liste de vérifications
  demandées. Le correctif `pointercancel` de Vega comble un angle mort
  complémentaire (interruption système, pas geste multi-doigts natif).

**Conclusion** : les protections ajoutées par Vega sont correctes et
suffisantes pour les cas qu'elles ciblent. Aucun remplacement de
l'algorithme n'est justifié à ce stade (pas de jeu de photos réelles pour
prouver qu'il faut mieux).

---

## 4 — OCR / Tesseract.js (point prioritaire)

### Versions présentes dans le ZIP (vérifiées, pas supposées)

- `tesseract.min.js` et `worker.min.js` : chaîne `5.1.1` trouvée une seule
  fois dans chacun (numéro de version embarqué par le bundler, pas une
  simple mention dans une URL de repli).
- `tesseract-core-lstm.wasm.js` : 3 938 277 octets, variante autonome
  (WASM encodé en base64 dans le JS).
- `fra.traineddata` : 1 130 365 octets.
- Fichiers **identiques byte-à-byte** entre ma version originale et la
  copie Vega (`cmp` confirmé) — aucune divergence, aucune falsification.

### Vérification indépendante du désaccord `corePath`

Je n'ai utilisé ni ma conclusion précédente ni celle de Vega comme point de
départ. Deux vérifications indépendantes, convergentes :

**1) Lecture du code source réel de `worker.min.js`** (désobscurci à la
main, pas deviné) : la fonction qui charge le core fait, en substance :

```js
f = corePath || <URL CDN par défaut>;
if (f.slice(-2) !== 'js') {
  // f est traité comme un DOSSIER : détection SIMD au runtime (WebAssembly),
  // puis sélection du fichier parmi les 4 variantes possibles
  h = f + (simdSupporté
    ? (lstmOnly ? '/tesseract-core-simd-lstm.wasm.js' : '/tesseract-core-simd.wasm.js')
    : (lstmOnly ? '/tesseract-core-lstm.wasm.js'      : '/tesseract-core.wasm.js'));
} else {
  // f se termine par ".js" : traité comme un FICHIER PRÉCIS, utilisé tel quel,
  // AUCUNE détection SIMD n'a lieu
  h = f;
}
importScripts(h);
```

Donc : pointer `corePath` vers un fichier `.js` précis (ce que fait ma
version originale) est un mode **explicitement prévu et fonctionnel** du
code — ce n'est pas un bug, l'app n'était pas cassée. Mais ce mode
**désactive volontairement** la sélection automatique SIMD/non-SIMD.

**2) Documentation officielle** (`docs/local-installation.md` du dépôt
`naptha/tesseract.js`, vérifiée par recherche web indépendante) :

> Si vous fixez `corePath`, pointez-le vers un dossier contenant les 4
> fichiers (`tesseract-core.wasm.js`, `tesseract-core-simd.wasm.js`,
> `tesseract-core-lstm.wasm.js`, `tesseract-core-simd-lstm.wasm.js`).
> Pointer `corePath` vers un fichier précis ne sert qu'à la rétro-
> compatibilité et est **fortement déconseillé**, car ça charge ce fichier
> **indépendamment du support SIMD de l'appareil**.

Les deux sources (code réel + doc officielle) concordent parfaitement :
**Vega avait raison sur le fond**. Ma conclusion précédente (« pointer
directement vers le fichier `.wasm.js` est préférable ») était **fausse** —
je confondais « fonctionne sans planter » (vrai, à cause du contournement
du bug `document.currentScript` dans un Worker) avec « configuration
recommandée » (faux — ce contournement n'a jamais eu besoin de sacrifier la
sélection SIMD ; il suffisait de vendoriser les variantes `.wasm.js`
autonomes ET de pointer sur leur dossier, pas sur un fichier précis).

### Ce que Vega n'a pas fait, et que j'ai fait

Vega a correctement diagnostiqué le problème mais ne l'a **pas corrigé**,
faute d'avoir les 4 fichiers de variantes sous la main. J'ai :

1. Vérifié que l'app ne demande jamais le moteur « legacy » (OEM par
   défaut de `createWorker('fra', 1, ...)` = `1` = `LSTM_ONLY`), donc
   seules les 2 variantes LSTM (SIMD et non-SIMD) sont jamais atteignables
   — pas besoin des 4 fichiers, 2 suffisent pour notre usage réel.
2. Téléchargé `tesseract-core-simd-lstm.wasm.js` en version **5.1.1**
   exacte (vérifiée via l'en-tête `X-JSD-Version: 5.1.1` du CDN jsDelivr,
   pour matcher précisément `tesseract.min.js`/`worker.min.js`), vendorisé
   à côté de la variante non-SIMD déjà présente.
3. Changé `CORE_PATH` de `BASE + 'tesseract-core-lstm.wasm.js'` vers
   `BASE` (le dossier) dans `js/ocr.js`.
4. **Testé l'exécution réelle** dans le navigateur (pas seulement une
   relecture de code) : import du module, création d'un worker complet,
   reconnaissance d'une image synthétique — succès en ~1,5 s, texte
   « bonjour » correctement reconnu, `isOcrEngineLoaded()` retourne `true`
   après coup. Le navigateur de prévisualisation sandboxé ne remonte pas
   les requêtes réseau internes au Worker (limitation déjà documentée dans
   `HANDOFF_AUDIT.md`), donc je n'ai pas pu confirmer *visuellement*
   laquelle des deux variantes a été choisie — mais le succès de bout en
   bout prouve que le mécanisme dossier + sélection + `importScripts` +
   chargement de la langue fonctionne réellement, pas seulement en théorie.

**Coût réseau réel pour l'utilisateur** : contrairement à une intuition
« vendoriser 2 fichiers core = télécharger 2 fois plus » — **faux**. Le
Worker ne fait la détection SIMD et le `importScripts` que sur **un seul**
des deux fichiers par appareil ; le second reste sur le serveur mais n'est
jamais demandé par un appareil donné (son profil SIMD ne change pas d'une
session à l'autre). J'ai donc mis à jour `OCR_ESTIMATED_SIZE_MB` de `4.2`
à `5.0` — l'estimation originale était déjà légèrement fausse (somme
réelle mesurée des fichiers effectivement téléchargés ≈ 5,02 Mo :
script + worker + langue + UNE variante core), et cette correction est
indépendante de l'ajout du second fichier.

### Autres points demandés

- **Récupération après erreur OCR** : couverte par le patch Vega
  (section 1.8), gardée.
- **Worker bloqué** (`recognize()` qui ne répond jamais) : **ni l'original
  ni Vega ne couvraient ce cas** — c'est un vrai trou que j'ai trouvé en
  répondant à la consigne explicite de l'audit (« vérifie... worker
  bloqué »). Tesseract.js n'a pas de timeout intégré sur `recognize()`.
  **Correctif ajouté** : `recognizePage()` course désormais le `recognize()`
  contre un délai de 90 s (généreux — une page iPhone typique prend
  quelques secondes à ~20 s) ; en cas de dépassement, le worker est détruit
  (`worker.terminate()`) et sa promesse de module réinitialisée, pour
  qu'une nouvelle tentative reparte sur une base saine sans recharger toute
  l'application.
- **Destruction/recréation du worker** : gérée par le nouveau
  `resetWorker()`, appelé sur timeout et cohérente avec le pattern déjà
  posé par Vega pour les autres échecs (reset de `workerPromise`).
- **Données françaises** : `fra.traineddata`, chargé avec `gzip: false`
  (cohérent — le fichier vendorisé n'est pas compressé), testé
  fonctionnellement (reconnaissance réussie du mot « bonjour »).
- **Couche de texte invisible du PDF / coordonnées OCR** : voir section 5,
  déjà vérifié dans une session antérieure via inspection des octets bruts
  du PDF généré (opérateur `Tr 3`), non remis en cause ici — Vega n'y a pas
  touché non plus.
- **Rotation** : les rotations de page se font uniquement dans l'écran de
  relecture, **avant** la création du document et donc avant tout appel
  OCR ; l'OCR s'exécute toujours sur l'image finale déjà orientée
  (`doc.pageImages`, figées à la création). Pas de désynchronisation
  rotation/coordonnées possible dans le flux actuel.
- **Caractères français** : accents/ligatures non re-testés spécifiquement
  au-delà du mot « bonjour » (pas d'accent) — **à tester sur un vrai
  document français avec accents avant de considérer ce point clos**.
- **Performances sur iPhone** : non mesurables depuis cet environnement
  (CPU du navigateur sandboxé sans rapport avec un iPhone) — **test réel
  sur device obligatoire**, la sélection SIMD ajoutée devrait justement
  améliorer ce point sur les iPhones récents par rapport à la config
  d'origine.

---

## 5 — PDF / jsPDF

### Fonctionnalités

`js/pdf.js` utilise exclusivement `new jsPDF(...)`, `pdf.addPage()`,
`pdf.addImage(dataUrl, 'JPEG', ...)`, `pdf.setFontSize()`,
`pdf.text(..., { renderingMode: 'invisible' })` et `pdf.output('blob')`.
Multipage, orientation portrait/paysage par page selon le ratio de l'image
(revu et correct), placement centré avec marge (`computePlacement`,
revérifié). Aucun changement de Vega sur ce fichier — je confirme qu'il
n'y avait rien à corriger ici.

### Vulnérabilités connues de jsPDF (recherche indépendante, pas généraliste)

Recherche faite spécifiquement sur la version **2.5.1**. Vulnérabilités
publiques identifiées (CVE + avis Snyk) et confrontées ligne à ligne à
l'usage réel de Scanner :

| Vulnérabilité | API concernée | Utilisée par Scanner ? | Exposé ? |
|---|---|---|---|
| CVE-2025-68428 (traversée de chemin, 9.2 critique) | `loadFile`/`addFont`/`html`/`addImage` **en environnement Node.js** | Non — Scanner tourne 100% navigateur, jamais Node | Non — condition d'exploitation absente |
| CVE-2025-29907 (ReDoS via URL/data-URL malveillante) | `addImage`, `html`, `addSvgAsImage` avec une chaîne **contrôlée par un attaquant externe** | `addImage` oui, mais uniquement avec des data-URL **générées localement par `canvas.toDataURL()`**, jamais une chaîne externe/importée | Non — le vecteur d'attaque (chaîne externe non fiable) n'existe pas dans le flux de données de Scanner |
| Allocation mémoire non bornée (GIF malveillant) | `addImage`/`html` avec un GIF fourni par l'utilisateur | Scanner force toujours `'JPEG'` en 2ᵉ argument, jamais de GIF, jamais de fichier importé par l'utilisateur | Non |
| XSS via `pdfObjectUrl`/`pdfJsUrl`/options `filename` de `output()` | `pdf.output(...)` avec ces options | Scanner appelle seulement `pdf.output('blob')`, sans ces options | Non |
| `addJS()`, `createAnnotation()`, AcroForm (choix/case à cocher/radio), `addMetadata()` | Fonctions non utilisées par Scanner | — | Non — fonctions jamais appelées |

**Conclusion** : chaque vulnérabilité publique trouvée pour 2.5.1 nécessite
soit un environnement Node.js (absent ici), soit de faire transiter une
chaîne **externe/non fiable** dans une API que Scanner n'utilise que sur
des données **qu'il génère lui-même** (jamais d'import de fichier externe,
jamais de saisie utilisateur injectée dans une de ces API). Le seul vecteur
théorique restant serait une compromission de la chaîne
d'approvisionnement du fichier vendorisé lui-même — hors de portée d'une
mise à jour de version, couvert par le fait que le fichier n'a pas changé
et reste identique à ce qui a été vendorisé initialement (vérifié
`cmp` byte-à-byte).

**Verdict** : **C. Version actuelle acceptable pour notre utilisation.**
Pas de mise à jour aveugle — je confirme la prudence de Vega sur ce point,
avec une analyse plus précise (CVE nommées, vecteurs vérifiés un par un)
plutôt qu'une impression générale. Recommandation non urgente : une mise à
jour majeure (jsPDF 4.x+) reste une bonne hygiène à faire un jour, mais
seulement accompagnée de tests de non-régression sur la génération
PDF/OCR (pas encore automatisés à ce stade, cf. section 10).

---

## 6 — IndexedDB et stockage iOS

- Structure de base (`js/db.js`) : un seul store `documents`, `keyPath:
  'id'`, index secondaire sur `createdAt`. Simple, pas de sur-ingénierie,
  cohérent avec les contraintes du projet.
- Transactions : `saveDocument`/`deleteDocument` utilisent `readwrite`,
  résolvent sur `oncomplete` (pas `onsuccess` de la requête individuelle —
  bon réflexe, garantit que la transaction entière est validée avant de
  considérer l'opération terminée). `getAllDocuments`/`getDocument` en
  `readonly`, corrects.
- Stockage du PDF et des images source : les deux sont conservés par
  document (`pdfBlob` + `pageImages[]`, images pleine résolution) — c'est
  un vrai doublon de données, déjà identifié dans `HANDOFF_AUDIT.md`
  original comme compromis assumé (nécessaire pour permettre l'OCR à la
  demande après coup sans recapturer les photos). Ni Vega ni moi n'avons
  changé cette architecture — c'est un compromis raisonnable, pas un bug,
  mais il rapproche réellement l'app du plafond de quota sur de gros
  documents multi-pages, ce qui rend d'autant plus utile le message
  `QuotaExceededError` (sections 1.4/1.9).
- `navigator.storage.persist()` (ajout Vega) : pertinent et vérifié
  fonctionnel sur la plateforme cible réelle (Safari 17+/iOS 17+, cf.
  section 1.2). Ce n'est pas un placebo.
- Réponse quand `persist()` absent/refusé : gérée par `try/catch` +
  vérification d'existence de l'API avant appel — dégrade proprement vers
  le comportement best-effort d'origine, sans jamais bloquer l'app.

**Conclusion** : l'ajout de Vega est pertinent et vérifié fonctionnel sur
la cible réelle. Le doublon PDF+images reste un risque réaliste sur un
usage intensif (beaucoup de documents multi-pages haute résolution) mais
c'est un compromis délibéré documenté, pas une négligence — la meilleure
mitigation disponible sans réécrire l'architecture de stockage est le
message d'erreur clair en cas de dépassement, maintenant présent aux deux
endroits où l'écriture peut échouer (création + OCR).

---

## 7 — Service worker / PWA

Couvert en détail section 1.3. Complément sur les points explicitement
demandés :

- Installation/activation : logique inchangée par Vega dans sa structure
  (juste reformatée), toujours correcte — `skipWaiting()` à l'install,
  nettoyage des anciens caches + `clients.claim()` à l'activation.
- Cache busting / suppression des anciennes versions : `CACHE_NAME` reste
  la source de vérité pour la purge à l'activation ; toujours nécessaire de
  le bumper pour les fichiers en cache-d'abord (vendor/icônes/OCR) — je
  l'ai fait (`v10` → `v11`) suite à l'ajout du fichier OCR SIMD.
- Réseau d'abord / cache d'abord : étendu par Vega de façon cohérente avec
  le risque qu'il corrige (section 1.3).
- Fonctionnement offline : le repli sur cache reste intact pour la
  navigation ET pour les fichiers applicatifs (juste vérifié avec le
  fallback réseau→cache codé dans `networkFirst()`).
- **Utilisateur coincé sur une vieille version du JS après mise à jour** :
  c'est précisément le risque documenté et corrigé par le patch 1.3 —
  confirmé nettement réduit (plus éliminé à 100%, un utilisateur qui reste
  hors-ligne en continu depuis avant la mise à jour restera sur l'ancienne
  version jusqu'à son prochain passage en ligne, ce qui est le
  comportement attendu et correct d'un PWA offline-first).

---

## 8 — Web Share API

- `navigator.share`/`canShare` avec `files: [file]` (PDF) : logique
  inchangée par Vega dans sa structure, seul le message d'erreur était à
  corriger (section 1.6).
- Fallback téléchargement : présent si `canShare` indisponible ou renvoie
  `false` — inchangé, correct.
- Distinction erreur réelle / annulation volontaire : **corrigée par
  Vega** — c'était le vrai problème (section 1.6), pas la logique de
  détection elle-même qui était déjà correcte.
- Comportement Safari iOS / PWA standalone : non testable depuis cet
  environnement (le navigateur de prévisualisation bloque les popups et
  n'a pas de vraie feuille de partage iOS) — **à valider sur iPhone réel**,
  aucune des deux parties n'a pu le faire.

**Conclusion** : la correction de Vega sur ce point est ciblée, correcte,
et corrige une vraie erreur de formulation de ma part (pas juste un
perfectionnement cosmétique).

---

## 9 — Sécurité

Vérifications indépendantes, pas une simple relecture du rapport Vega :

- **`innerHTML` avec données utilisateur** : `grep` de tous les usages
  d'`innerHTML` dans `js/app.js` — **aucun** n'interpole de donnée
  utilisateur ; soit `= ''` (vidage de conteneur), soit du SVG statique
  écrit en dur dans le code source. Confirmé indépendamment, pas juste
  répété depuis le rapport Vega.
- **Injection via nom du document / texte OCR** : noms de document et
  titre du visualiseur PDF assignés via `.textContent` (jamais
  `innerHTML`), vérifié aux 3 endroits (`renderHome`, `openDocDetail`,
  `btnPdfViewerClose`/`btnDocOpen`). Le texte OCR n'est jamais réinjecté
  dans le DOM — il part directement vers `pdf.text()` de jsPDF (chaîne,
  pas HTML).
- **XSS** : aucune surface identifiée dans le code applicatif.
- **URLs Blob** : `URL.createObjectURL` utilisé pour le blob PDF
  (visualiseur, téléchargement) et révoqué correctement
  (`closePdfViewer`, `downloadBlob` avec délai de 4 s) — pas de fuite de
  mémoire identifiée.
- **Permissions caméra** : demandées uniquement au moment de l'ouverture
  de l'écran caméra, jamais de façon anticipée/cachée.
- **Fichiers vendorisés** : `cmp` byte-à-byte confirme qu'aucun fichier
  tiers (jsPDF, Tesseract.js, worker, données de langue) n'a été modifié
  entre ma version et celle de Vega — pas de risque de falsification
  introduit par l'aller-retour entre les deux audits.
- **Requêtes réseau involontaires** : aucune requête vers un tiers externe
  identifiée dans le code applicatif ; les seules requêtes réseau
  possibles sont (a) le service worker qui revérifie ses propres fichiers
  statiques auprès de son propre hébergeur, et (b) le téléchargement à la
  demande, explicitement confirmé par l'utilisateur, du moteur OCR — tous
  deux vers l'origine de l'app elle-même, jamais un tiers.
- **Données personnelles** : aucun compte, aucun tracker, aucun SDK
  analytics dans le code — confirmé par lecture complète des fichiers, pas
  seulement absence de mention dans le README.

**Conclusion** : rien à corriger ici. L'app respecte ses contraintes
(sans compte/cloud/pub/analytics/tracker/upload) au niveau du code, pas
seulement au niveau de la documentation.

---

## 10 — Code mort / qualité

- `cropDataUrl()` : confirmé mort (section 1.7), suppression sûre.
- Fonctions inutilisées : aucune autre trouvée après relecture complète de
  `app.js`, `db.js`, `pdf.js`, `imaging.js`, `perspective.js`, `ocr.js`.
- Imports inutiles : aucun trouvé (chaque import en tête de fichier est
  utilisé).
- Variables mortes / doublons / branches impossibles : aucun trouvé.
- Événements enregistrés plusieurs fois : `renderReviewList()` et
  `renderCropOverlay()` recréent leurs éléments DOM à chaque appel
  (`innerHTML = ''` puis reconstruction complète), donc les
  `addEventListener` posés dedans ne s'accumulent pas d'un rendu à l'autre
  — pattern correct, pas de fuite de listeners.
- Objets Blob jamais révoqués : vérifiés, tous révoqués (voir section 9).
- Streams caméra non libérés : `stopStream()` arrête bien toutes les
  pistes à chaque sortie de l'écran caméra (`goHome`, `btnCameraDone`,
  `btnCameraReview`).
- Ressources OCR non nettoyées : **trou trouvé et comblé** — avant mon
  ajout de `resetWorker()`, un worker dans un état bloqué n'était jamais
  détruit (section 4).
- Promesses non catchées : `navigator.serviceWorker.register(...)` a un
  `.catch()` ; `requestPersistentStorage()` a un `try/catch` interne ;
  `recognizePage()` propage ses erreurs à l'appelant qui les catch bien.
  Aucune promesse non gérée trouvée.

---

## 11 — Régressions introduites par Vega

Recherche active, pas seulement liste des améliorations. **Aucune
régression fonctionnelle confirmée trouvée** dans les 8 modifications de
Vega — chacune a été rejouée mentalement contre les scénarios d'usage
existants (voir section 1) sans trouver de cas où le nouveau comportement
casse un cas qui marchait avant.

Deux points **partiels/asymétriques**, pas des régressions à proprement
parler mais des trous que le patch Vega laissait ouverts et que j'ai
comblés :

1. **Section 1.4** : le message `QuotaExceededError` n'était ajouté par
   Vega qu'au flux de création initiale du PDF, pas au flux OCR (qui
   réappelle pourtant `saveDocument()` avec les mêmes risques). Gravité :
   mineure (message d'erreur générique restait affiché à la place, pas de
   perte de données). Corrigé (section 4).
2. **Section 4** : Vega a identifié le risque « worker bloqué » dans le
   brief d'audit sans le corriger. Gravité : moyenne (bouton OCR resterait
   bloqué indéfiniment sur un vrai hang, récupérable seulement par
   rechargement complet de l'app). Corrigé (section 4).

---

## 12 — Contraintes à conserver

Aucune des deux parties n'a introduit React/Vue/npm/build-step/backend/
cloud. Vérifié : `index.html`, `css/style.css`, `manifest.json`, tous les
scripts (`scripts/*.ps1`) sont identiques entre ma version et celle de
Vega — palette noir/gris/rouge, interface française, architecture vanilla
JS sans dépendance de build, tout intact. Mes propres ajouts (variante OCR
vendorisée, fichier de notices de licence) suivent la même logique
(fichiers statiques locaux, zéro dépendance réseau au runtime, zéro
build-step).

---

## 13 — VERDICT FINAL

### 1. Corrections Vega validées

Les 8 modifications de code de Vega (sections 1.1 à 1.10) : capture caméra
trop précoce, stockage persistant iOS, service worker réseau-d'abord pour
le JS applicatif, message quota IndexedDB (création PDF), validation du
quadrilatère de recadrage + `pointercancel`, message d'erreur de partage
corrigé, suppression de `cropDataUrl()`, retry OCR après échec,
`isOcrEngineLoaded()` plus précis, reformulation README. Toutes vérifiées
correctes par relecture indépendante du code réel (pas seulement du
rapport), sans régression trouvée.

### 2. Corrections Vega à modifier

Aucune des corrections livrées par Vega n'avait besoin d'être modifiée —
toutes sont conservées telles quelles. (Deux ont été **complétées** par un
ajout séparé plutôt que modifiées : le message quota IndexedDB étendu au
flux OCR, section 1.4/11 ; le point `corePath` que Vega avait
intentionnellement laissé ouvert a été implémenté, section 4.)

### 3. Corrections Vega à annuler

Aucune.

### 4. Nouveaux bugs découverts par Claude

- **OCR `corePath` fichier-précis vs dossier** : confirmé comme vraie
  perte de performance potentielle (pas juste une non-conformité
  documentaire) — sans la variante SIMD, un iPhone récent utilise
  systématiquement le moteur non-optimisé. Corrigé (dossier + variante
  SIMD vendorisée + vérifié par test d'exécution réel).
- **Worker OCR bloqué sans timeout** : `recognize()` pouvait rester
  indéfiniment pendant sans jamais résoudre ni rejeter, gelant le bouton
  OCR jusqu'à rechargement complet de l'app. Corrigé (timeout 90 s +
  destruction/recréation du worker).
- **Message quota IndexedDB manquant côté OCR** : présent côté création de
  PDF (patch Vega) mais pas côté régénération du PDF avec OCR, qui peut
  pourtant échouer pour la même raison. Corrigé.
- **Licences tierces absentes** : signalé par Vega comme point à traiter
  avant distribution publique, non traité par Vega. J'ai ajouté
  `js/vendor/THIRD_PARTY_NOTICES.md` (jsPDF MIT, Tesseract.js/tesseract.js-
  core Apache-2.0, `tessdata_fast` Apache-2.0, avec liens vers le texte
  complet faisant foi).

### 5. Points nécessitant obligatoirement un test réel sur iPhone

Aucun des deux audits (Vega ou Claude) n'a pu tester sur device physique —
c'est la limite structurelle commune aux deux. À tester avant de considérer
l'app fiable :

1. OCR français avec accents (`é`, `è`, `à`, `ç`, œ...) — seul « bonjour »
   (sans accent) a été testé ici.
2. Quelle variante core (SIMD ou non) un iPhone réel sélectionne
   effectivement, et le gain de performance concret par rapport à l'ancien
   comportement figé sur la variante non-SIMD.
3. Détection automatique des bords sur de vraies photos (lampe/reflet/
   fond clair — le point faible identifié en section 1.12/3).
4. `navigator.storage.persist()` réellement accordé (heuristiques WebKit
   non documentées en détail publiquement) sur un iPhone réel avec l'app
   ajoutée à l'écran d'accueil.
5. Partage vers Mail/Gmail/AirDrop en PWA standalone, y compris le cas
   d'annulation volontaire (le message corrigé section 1.6/8).
6. Mise à jour d'une version déployée vers une nouvelle version (le
   scénario exact que corrige le patch service worker, section 1.3/7).
7. Stockage presque plein / gros document multi-pages (déclenchement réel
   du message `QuotaExceededError`, sections 1.4/6).
8. Comportement du timeout OCR de 90 s en conditions réelles (ni trop
   court sur un vieil iPhone, ni trop long en cas de vrai blocage) — la
   valeur a été choisie par marge de sécurité, pas mesurée sur device.

### 6. Risques restant ouverts

- Détection automatique des bords : heuristique simple, peut se tromper
  sur fond non uniforme — filet de sécurité = recadrage manuel, toujours
  disponible.
- Doublon PDF + images source en pleine résolution par document — compromis
  assumé, pas un bug, mais rapproche réellement du plafond de quota sur
  gros usage.
- Pas de bouton « réessayer » sur l'écran d'erreur caméra (il faut fermer
  et rouvrir) — trou UX mineur, ni corrigé ni aggravé par cette passe.
- Pas de tests automatisés (unitaires ou end-to-end) — toujours vrai après
  cette passe, déjà noté dans `HANDOFF_AUDIT.md` d'origine.
- jsPDF 2.5.1 : acceptable pour l'usage actuel (section 5), mais une mise à
  jour future nécessitera des tests de non-régression PDF/OCR qui
  n'existent pas encore.

### 7. État du projet

**Bêta.**

Justification : l'architecture est saine, cohérente avec les valeurs du
projet (zéro pub/compte/cloud/tracker), et deux passes d'audit
indépendantes (Vega puis Claude), chacune ayant vérifié le code réel et
pas seulement le rapport de l'autre, n'ont trouvé aucune régression et
plusieurs corrections de bugs réels et confirmés (course caméra, message
de partage inversé, promesses OCR rejetées mémorisées indéfiniment, worker
OCR sans filet en cas de blocage, quadrilatère de recadrage non validé).
Ça dépasse le stade « prototype ». Mais **aucun test n'a encore eu lieu sur
un iPhone physique** — le seul environnement qui compte réellement pour
cette app — sur des points qui ne peuvent tout simplement pas être validés
autrement : rendu caméra réel, feuille de partage iOS, heuristiques de
stockage persistant WebKit, performance OCR réelle, comportement réel de
la détection de bords sur de vraies photos prises à la main. Tant que ces
points n'ont pas été vérifiés en conditions réelles, l'app ne peut pas
prétendre à « Utilisable » ou plus.

---

## Fichiers modifiés par rapport à `Scanner_Vega_Corrected.zip`

- `js/ocr.js` — `corePath` en mode dossier + variante SIMD, timeout +
  recréation du worker sur blocage, `OCR_ESTIMATED_SIZE_MB` corrigé à 5.0.
- `js/app.js` — message `QuotaExceededError` ajouté au flux OCR (en plus du
  flux création PDF déjà couvert par Vega).
- `js/perspective.js` — commentaire de `detectDocumentCorners` corrigé
  (aucun changement de comportement).
- `service-worker.js` — `CACHE_NAME` rebumpé `v10` → `v11` (nouveau
  fichier vendor OCR).
- `js/vendor/tesseract/tesseract-core-simd-lstm.wasm.js` — nouveau fichier,
  téléchargé et vérifié en version 5.1.1 exacte.
- `js/vendor/THIRD_PARTY_NOTICES.md` — nouveau fichier, notices de licence
  des dépendances vendorisées.
- Tous les autres fichiers : identiques à `Scanner_Vega_Corrected.zip`
  (`js/imaging.js`, `README.md`, `service-worker.js` pour sa structure hors
  bump de version, etc.) — repris tels quels après vérification, sans
  modification.
