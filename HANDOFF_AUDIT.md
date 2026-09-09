# Dossier de passation — Application "Scanner" (PWA)

Document rédigé par Claude (Anthropic) à l'intention d'un autre modèle IA
(ChatGPT) chargé d'auditer ce projet. L'auteur original ne sera pas présent
pour répondre aux questions : ce document doit donc être aussi complet et
honnête que possible, y compris sur les doutes et les points faibles.

**Contexte produit** : l'utilisateur (particulier, pas développeur de métier)
en avait assez des applications de scanner mobile gratuites-mais-pleines-de-
pub ou payantes-pour-une-interface-basique. Objectif : une app de scan de
documents papier → PDF → partage par mail, sur iPhone, sans pub, sans
compte, sans abonnement, avec un fonctionnement 100% local.

**Contrainte de départ qui a orienté toute l'architecture** : l'utilisateur
développe depuis un PC Windows, sans Mac et sans compte Apple Developer
(99$/an). Une vraie app native iOS est donc hors de portée sans dépense ni
matériel supplémentaire. D'où le choix d'une PWA (voir section 6).

---

## 1. Architecture complète

Application 100% client (frontend only), **sans aucun backend, aucun
serveur applicatif, aucune base de données distante**. C'est une PWA
(Progressive Web App) : un ensemble de fichiers statiques (HTML/CSS/JS)
servis par n'importe quel hébergeur statique, installable sur l'écran
d'accueil iOS via Safari.

Flux de données (tout se passe dans le navigateur, rien ne sort du
téléphone sauf action explicite de partage) :

```
Caméra (getUserMedia)
   → capture d'une image par page (canvas)
   → normalisation/redimensionnement (js/imaging.js)
   → [optionnel] détection auto des bords + redressement de perspective
     (js/perspective.js)
   → [optionnel] recadrage manuel (quadrilatère libre, 4 coins glissables)
   → [optionnel] filtre visuel : couleur / amélioré / noir&blanc
     (js/imaging.js, via canvas ctx.filter)
   → assemblage multi-pages en un PDF (js/pdf.js, bibliothèque jsPDF)
   → stockage du PDF + vignette + images de pages dans IndexedDB
     (js/db.js)
   → [optionnel, à la demande] OCR (js/ocr.js, Tesseract.js) : régénère
     le PDF avec une couche de texte invisible superposée aux mots
     détectés → PDF cherchable/copiable
   → partage via Web Share API (feuille de partage native iOS → Mail,
     Gmail, AirDrop…) ou téléchargement direct
```

Aucun framework JS (pas de React/Vue/etc.), pas de bundler, pas d'étape de
build. Le code est du JavaScript vanilla en modules ES natifs
(`<script type="module">`), chargé directement par le navigateur sans
transpilation ni bundling. `index.html` charge `js/app.js` qui importe les
autres modules via `import`.

Un **service worker** (`service-worker.js`) gère :
- le cache "installation" (fichiers cœur de l'app, mis en cache au premier
  chargement) ;
- le cache "à la demande" (tout le reste, mis en cache au fur et à mesure
  qu'il est utilisé — c'est le cas du moteur OCR, volontairement PAS
  précaché pour ne pas alourdir l'installation initiale) ;
- une stratégie **réseau d'abord** pour le HTML (pour ne jamais rester
  bloqué sur une vieille version de l'app), et **cache d'abord** pour le
  reste (JS/CSS/icônes/bibliothèques).

Il n'y a pas de routing côté URL : la navigation entre écrans se fait en
affichant/masquant des `<section class="view">` en JavaScript
(`showView()` dans `js/app.js`), pas de changement d'URL.

## 2. Technologies, frameworks, bibliothèques, versions

| Élément | Détail |
|---|---|
| Langage | JavaScript (ES2020+, modules ES natifs), pas de TypeScript |
| Framework UI | **Aucun** — DOM manipulé directement (vanilla JS) |
| CSS | Écrit à la main, variables CSS custom properties, pas de framework (pas de Tailwind/Bootstrap) |
| Build/bundler | **Aucun** — aucune étape de compilation, les fichiers sont servis tels quels |
| Gestionnaire de paquets | **Aucun** — pas de `package.json`, pas de `node_modules`. Toutes les bibliothèques tierces sont vendorisées (copiées en dur) dans `js/vendor/` |
| PDF | [jsPDF](https://github.com/parallax/jsPDF) **v2.5.1** (licence MIT), fichier UMD minifié, `js/vendor/jspdf.umd.min.js` |
| OCR | [Tesseract.js](https://github.com/naptha/tesseract.js) **v5.1.1** + moteur `tesseract.js-core` **v5.1.1** (licence Apache-2.0), dans `js/vendor/tesseract/` |
| Données linguistiques OCR | `fra.traineddata` (français), issu du dépôt officiel [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) (Apache-2.0), ~1,1 Mo |
| Stockage | IndexedDB natif du navigateur (pas de librairie wrapper type Dexie/localForage côté app — Tesseract.js utilise en interne sa propre couche de cache IndexedDB, indépendante de la nôtre) |
| APIs navigateur utilisées | `getUserMedia` (caméra), `Canvas 2D` (traitement image), `IndexedDB`, `Service Worker` + `Cache API`, `Web App Manifest`, `Web Share API` niveau 2 (partage de fichiers) |
| Outils de dev (facultatifs) | Scripts **PowerShell** (`scripts/server.ps1`, `scripts/make-icons.ps1`) — spécifiques Windows, non nécessaires pour faire tourner l'app elle-même, juste des utilitaires de développement créés parce que la machine de dev n'avait ni Node ni Python fonctionnels |

**Aucune dépendance ne s'exécute côté serveur.** Il n'y a pas de serveur
applicatif : n'importe quel hébergeur de fichiers statiques HTTPS convient
(GitHub Pages, Netlify, Cloudflare Pages, etc.).

## 3. Rôle de chaque dossier et fichier principal

```
index.html                 Structure de toutes les "vues" (écrans) de l'app,
                            une <section class="view"> par écran : accueil,
                            caméra, relecture des pages, recadrage, fiche
                            document. Une seule page HTML, navigation en JS.

manifest.json               Manifeste PWA (nom, icônes, couleurs, mode
                            plein écran).

service-worker.js           Cache offline + logique de mise à jour du cache
                            (voir section 1).

css/style.css                Tous les styles de l'application (~470 lignes).
                            Variables CSS dans :root pour la palette.

js/app.js                    ~750 lignes. Le "contrôleur" principal :
                            - bascule entre les écrans (showView)
                            - gestion de la caméra (démarrage/arrêt du flux,
                              capture d'une photo)
                            - gestion de la session de scan en cours
                              (liste de pages en mémoire avant sauvegarde)
                            - écran de relecture (filtres, rotation,
                              réorganisation, suppression de page)
                            - écran de recadrage (drag des 4 coins,
                              interaction avec js/perspective.js)
                            - fiche document (partage, aperçu PDF intégré,
                              renommer, supprimer, déclenchement OCR)
                            - accueil (liste des documents + recherche)
                            Contient toute la logique "métier" de l'UI ;
                            c'est le fichier le plus gros et le plus central.

js/db.js                     Petite couche d'accès à IndexedDB (CRUD sur les
                            documents : saveDocument, getAllDocuments,
                            getDocument, deleteDocument, renameDocument).
                            Base "scanner-db", store "documents".

js/imaging.js                 Traitement d'image via <canvas> :
                            - normalizeCapture() : redimensionne une capture
                              à une taille max raisonnable (2200px) et la
                              convertit en JPEG
                            - applyFilter() : applique un filtre CSS canvas
                              (couleur / amélioré / N&B) à PARTIR de l'image
                              "source" courante (pas cumulatif)
                            - makeThumbnail() : génère une vignette
                            - cropDataUrl() : recadrage RECTANGULAIRE simple
                              (fonction conservée mais plus utilisée par
                              app.js depuis l'ajout du recadrage en
                              quadrilatère libre — voir section 11)

js/perspective.js             Le module le plus "algorithmique" du projet
                            (~176 lignes) :
                            - detectDocumentCorners() : heuristique de
                              détection automatique des 4 coins d'un
                              document (voir section 6 et 10 pour les
                              limites)
                            - warpPerspective() : redressement de
                              perspective (mapping quadrilatère → rectangle,
                              méthode de Heckbert, implémentée à la main,
                              échantillonnage bilinéaire pixel par pixel)

js/pdf.js                    Assemblage des pages (images) en un fichier PDF
                            via jsPDF. Gère aussi la superposition de texte
                            invisible (couche OCR) quand elle est fournie.

js/ocr.js                    Intégration de Tesseract.js : chargement
                            paresseux du script, création/réutilisation d'un
                            "worker" Tesseract, fonction recognizePage() qui
                            renvoie le texte + les mots avec leurs
                            coordonnées (bounding boxes).

js/vendor/                    Bibliothèques tierces vendorisées telles
                            quelles (voir section 2 et 12).

icons/                       Icônes de l'app (PNG), générées par un script
                            (voir section 12), PAS dessinées à la main.

scripts/server.ps1           Petit serveur HTTP statique en PowerShell (utilise
                            System.Net.HttpListener), pour tester l'app en
                            local sans installer Node/Python. Sert le dossier
                            du projet sur http://localhost:8000.

scripts/make-icons.ps1        Génère les icônes PNG (icons/*.png) par dessin
                            vectoriel procédural via .NET System.Drawing
                            (GDI+) — pas d'IA génératrice d'image, pas de
                            fichier source vectoriel (SVG/AI/Figma).

.claude/launch.json           Config pour l'outil de prévisualisation utilisé
                            pendant le développement (Claude Code) — lance
                            scripts/server.ps1. Sans rapport avec le
                            fonctionnement de l'app elle-même.

README.md                     Documentation utilisateur (installation,
                            déploiement, structure).
```

## 4. Fonctionnalités actuellement implémentées

- Capture multi-pages via l'appareil photo (flux vidéo live + bouton
  obturateur).
- Détection automatique des bords du document + redressement de
  perspective, avec possibilité d'ajuster manuellement les 4 coins (ou de
  réinitialiser au cadrage "page entière").
- Filtres d'image : Couleur / Amélioré (contraste+luminosité) / Noir &
  Blanc.
- Rotation d'une page (90° sens horaire).
- Réorganisation des pages (boutons monter/descendre) avant génération du
  PDF.
- Suppression d'une page en cours de scan.
- Génération d'un PDF (une image par page, ajustée au format A4, marge de
  8mm, orientation portrait/paysage déterminée automatiquement selon le
  ratio de l'image).
- Nommage du document (champ libre, ou nom par défaut horodaté).
- Bibliothèque de documents sur l'écran d'accueil : liste, recherche par
  nom (insensible à la casse), vignette, nombre de pages, date.
- Fiche document : aperçu, visualiseur PDF intégré (iframe, pas de
  dépendance à `window.open`), partage via feuille de partage native
  (Web Share API avec fichier), renommer, supprimer (avec confirmation).
- OCR à la demande : bouton dédié qui relance la génération du PDF avec une
  couche de texte invisible cherchable/copiable, alignée sur les mots
  détectés. Avertissement avant le premier téléchargement du moteur OCR
  (~4 Mo).
- Fonctionnement hors-ligne après premier chargement (service worker).
- Installable sur écran d'accueil iOS (manifest + meta tags Apple).
- Aucune donnée envoyée à un serveur ; aucun compte ; aucune pub ; aucun
  tracker.

## 5. Fonctionnalités prévues mais pas terminées / absentes

- **Déploiement réel non effectué** : l'app n'a encore JAMAIS été testée
  sur un iPhone physique ni servie depuis une vraie URL HTTPS publique.
  Tout le développement s'est fait via un serveur local
  (`http://localhost:8000`) et un navigateur de test **en bac à sable**
  (voir avertissement important en section 10).
- Pas de synthèse/fusion de plusieurs documents déjà créés en un seul PDF.
- Pas de protection par mot de passe / chiffrement du PDF.
- Pas d'annotation, de signature électronique, de surlignage.
- Pas d'écran de réglages (impossible de changer la qualité JPEG, la
  résolution max, la langue OCR, de vider le cache, etc. — tout est codé en
  dur).
- OCR disponible uniquement en français (pas d'anglais ni d'autre langue).
- Pas de sélecteur caméra avant/arrière, pas de flash/torche.
- Pas de corbeille / annulation après suppression d'un document (la
  suppression est immédiate et définitive).
- Pas de sauvegarde/export global de tous les documents en une fois.
- Pas de synchronisation multi-appareils (volontaire, voir section 14).
- **Aucun test automatisé** (voir section 13).
- Pas de mode clair (thème sombre fixe uniquement, volontaire — voir
  section 14).

## 6. Choix techniques importants et pourquoi

- **PWA plutôt qu'app native iOS** : contrainte matérielle/financière de
  l'utilisateur (pas de Mac, pas de compte Apple Developer à 99$/an). Une
  PWA s'installe depuis Safari sans passer par l'App Store ni par Xcode.
  Compromis assumé : moins d'intégration système qu'une app native (pas
  d'icône App Store, dépend du support navigateur pour la caméra/le
  partage/le stockage).
- **Aucun framework, aucun build step** : simplicité, pérennité (pas de
  dépendance à un écosystème npm qui évolue vite), et cohérence avec la
  demande explicite du client de ne pas dépendre de tiers.
- **Tout vendorisé localement, zéro appel réseau au runtime** : les
  bibliothèques (jsPDF, Tesseract.js) sont copiées dans le dépôt plutôt que
  chargées depuis un CDN. Objectif : l'app fonctionne hors-ligne, ne dépend
  d'aucun service tiers en production, et respecte l'exigence de
  confidentialité ("rien ne sort du téléphone").
- **Détection de bords/redressement de perspective fait à la main** plutôt
  qu'avec OpenCV.js : OpenCV.js pèse plusieurs Mo (souvent 8 Mo+) pour des
  fonctionnalités qu'on utilise à peine. Un algorithme maison (~176 lignes)
  couvre le cas d'usage principal (papier clair sur fond contrasté) à
  moindre coût. **Compromis assumé** : heuristique volontairement simple
  (seuillage de luminance + extrêmes diagonaux), pas une vraie détection de
  contours — voir limites en section 10.
- **Tesseract.js variante "LSTM only" + données `tessdata_fast`** plutôt
  que la variante complète ou les données "best" : gain de poids (~4 Mo vs
  potentiellement 15+ Mo) et de vitesse, au prix d'une précision
  légèrement inférieure à la version "best" — jugé suffisant pour scanner
  un document photographié au smartphone (pas un usage d'archivage
  patrimonial haute-fidélité).
- **OCR chargé à la demande (lazy), jamais préchargé** : pour ne pas
  alourdir l'installation initiale de la PWA (le moteur OCR pèse ~4 Mo,
  contre moins de 500 Ko pour le reste de l'app). Compromis : premier usage
  de l'OCR plus lent (téléchargement), ensuite rapide (mis en cache).
- **IndexedDB plutôt que localStorage** : nécessaire pour stocker des
  `Blob` binaires (PDF) et de grandes chaînes base64 (images) sans les
  limites de taille et de performance de `localStorage`.
- **Réorganisation des pages par boutons monter/descendre** plutôt que
  glisser-déposer : plus simple et plus robuste à implémenter/tester
  qu'un vrai drag-and-drop dans une liste défilante, pour un gain UX jugé
  marginal vu le nombre de pages typique d'un scan (rarement plus de 5-10).
- **Couche de texte OCR "best effort", pas pixel-parfaite** : la taille de
  police de chaque mot invisible est dérivée de la hauteur de sa bounding
  box, sans ajustement fin de la largeur. Comme le texte est invisible
  (`renderingMode: 'invisible'`, opérateur PDF `Tr 3`), l'alignement exact
  n'a pas d'impact visuel — seul compte que le texte soit repérable et à
  peu près au bon endroit pour une sélection cohérente. Non vérifié
  finement sur un grand nombre de documents réels.
- **Palette monochrome noir/gris + un seul accent rouge** : demande
  esthétique explicite du client ("sobre", "épuré", "style Hitman"),
  documentée dans l'historique de conversation.
- **Deux scripts PowerShell (server.ps1, make-icons.ps1)** : la machine de
  développement (Windows) n'avait ni Python ni Node.js fonctionnels au
  moment du développement (`python` renvoyait une erreur de type Microsoft
  Store, `node` était introuvable). PowerShell + .NET (System.Net,
  System.Drawing) étaient les seuls outils fiables disponibles sans
  installation. **Ces scripts ne sont pas nécessaires en production**,
  seulement pour le confort de développement local.

## 7. Dépendances nécessaires pour faire fonctionner l'application

**Aucune installation n'est requise.** Il n'y a pas de `package.json`, pas
de `npm install`. Toutes les dépendances (jsPDF, Tesseract.js et son moteur
WASM, les données linguistiques françaises) sont déjà présentes dans le
dépôt sous `js/vendor/`.

Pour **exécuter** l'app, il suffit de :
1. Servir le dossier du projet via n'importe quel serveur de fichiers
   statiques HTTPS (ou `http://localhost` pour le développement local —
   `localhost` est considéré comme un contexte sécurisé par les
   navigateurs, ce qui autorise l'accès caméra même sans HTTPS).
2. Ouvrir l'URL dans un navigateur récent supportant : `getUserMedia`,
   `IndexedDB`, `Service Worker`, `Canvas`, idéalement `Web Share API`
   niveau 2 (partage de fichiers — supporté par Safari iOS 15+).

Pour le développement local sur la machine actuelle (Windows sans
Node/Python), un serveur PowerShell est fourni (voir section 8), mais
**n'importe quel serveur statique fonctionne** (`python -m http.server`,
`npx serve`, extension "Live Server" de VS Code, etc.) si l'environnement
de l'auditeur dispose de ces outils.

## 8. Commandes exactes pour installer, lancer, compiler et tester

**Installer** : aucune commande — cloner/dézipper le dossier suffit.

**Lancer en local** (sur la machine de développement, Windows, PowerShell) :
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/server.ps1
```
puis ouvrir `http://localhost:8000` dans un navigateur.

**Lancer en local** (alternative multiplateforme, si Python est
disponible chez l'auditeur) :
```bash
python3 -m http.server 8000
```

**Régénérer les icônes** (facultatif, nécessite Windows/PowerShell/.NET) :
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-icons.ps1
```

**Compiler** : sans objet — il n'y a aucune étape de build/transpilation.
Les fichiers sont exécutés tels quels par le navigateur.

**Tester** : **il n'existe aucune commande de test** — voir section 13,
c'est un manque assumé qu'il serait utile de combler.

**Déployer** (non fait à ce jour) : le README (`README.md`) documente deux
pistes gratuites — GitHub Pages ou Netlify Drop — mais ni l'une ni l'autre
n'a encore été mise en œuvre pour ce projet.

## 9. Clés API, variables d'environnement, services externes

**Aucune.** L'application ne contient :
- aucune clé API,
- aucun fichier `.env` ou de configuration de secrets,
- aucun appel réseau vers un service tiers au moment de l'exécution
  (aucun `fetch()` vers un domaine externe dans le code applicatif),
- aucune authentification, aucun compte utilisateur.

Note pour l'auditeur : pendant le *développement*, certains fichiers ont
été téléchargés une fois depuis des CDN publics (cdnjs.cloudflare.com,
cdn.jsdelivr.net, raw.githubusercontent.com) via `curl`, puis copiés en dur
dans `js/vendor/`. Ces URLs n'apparaissent dans aucun fichier applicatif et
ne sont pas rappelées à l'exécution — elles ne sont mentionnées que dans le
README à titre de traçabilité/licence. Il n'y a donc **aucune clé secrète
à chercher ni à protéger** dans ce projet.

## 10. Bugs connus, limitations actuelles, éléments incertains

**⚠️ Avertissement méthodologique important** : tous les tests effectués
pendant le développement l'ont été dans un **navigateur intégré en bac à
sable** (outil de prévisualisation de l'environnement de développement),
**pas sur un vrai iPhone, ni même sur un vrai Safari/Chrome de bureau
standard**. Ce bac à sable bloque explicitement l'accès à la caméra et aux
pop-ups (`window.open`), ce qui a d'ailleurs permis de détecter et corriger
un vrai bug (voir section 11). **La capture caméra elle-même — la
fonctionnalité la plus centrale de l'app — n'a donc jamais été testée en
conditions réelles.** C'est la première chose à vérifier.

Limitations et incertitudes connues :

- **Détection automatique des bords** : heuristique simple (seuillage de
  luminance moyenne + extrêmes des diagonales x+y / x−y). Fonctionne bien
  pour un papier clair sur fond contrastant (testé avec des images
  synthétiques). Susceptible d'échouer ou de mal détecter dans ces cas :
  document sombre, fond clair de même tonalité que le papier, plusieurs
  feuilles superposées/qui se chevauchent, document non rectangulaire,
  très mauvais éclairage. Dans ces cas, l'app retombe sur un cadrage par
  défaut (image quasi entière) — pas un crash, mais une détection
  silencieusement inutile.
- **Persistance du stockage sur iOS** : `navigator.storage.persist()`
  n'est appelé nulle part. Sur iOS, Safari peut, sous pression de stockage,
  effacer les données d'une PWA installée si la persistance n'a pas été
  explicitement demandée/accordée. Risque potentiel de perte de documents
  scannés dans certains scénarios (pas vérifié, à investiguer).
- **Performance de l'OCR sur un vrai téléphone non mesurée.** Sur le
  bac à sable de développement (matériel de bureau), une page se reconnaît
  en ~2-3 secondes après le premier chargement du moteur. Sur un iPhone
  réel, ce sera probablement plus lent, sans qu'aucune limite de temps ni
  indicateur d'annulation ne soit implémenté si ça traîne.
- **Positionnement du texte OCR invisible** : approximatif (voir section
  6), non vérifié finement sur un grand échantillon de documents réels.
- **Pas de plafond sur le stockage** : chaque document conserve
  `pageImages` (les images sources de chaque page, en plus du PDF final)
  pour permettre l'OCR a posteriori. Aucune limite de taille, aucun
  nettoyage, aucun avertissement à l'utilisateur si la bibliothèque devient
  volumineuse.
- **Web Share API (partage de fichiers)** : le comportement exact
  (apparition de la feuille de partage, applications proposées) n'a pas pu
  être vérifié sur un vrai iOS — seul le code du chemin `canShare` /
  fallback téléchargement a été relu.
- La **rotation** ne tourne que dans un sens (90° horaire) ; pas de sens
  inverse.
- Les confirmations de suppression/renommage utilisent `confirm()` /
  `prompt()` natifs du navigateur — supposés fonctionner en PWA standalone
  iOS d'après la documentation générale, mais **non vérifiés sur cet
  appareil spécifique**.
- Pas de gestion d'erreur globale (`window.onerror` / `unhandledrejection`)
  — une exception non prévue dans un chemin non testé peut laisser l'UI
  dans un état incohérent sans message clair à l'utilisateur.
- `js/imaging.js` exporte encore `cropDataUrl()` (recadrage rectangulaire
  simple), qui n'est plus appelé nulle part depuis l'ajout du recadrage en
  quadrilatère libre (`js/perspective.js`) — code mort probable, à
  confirmer et supprimer si effectivement inutilisé.

## 11. Zones du code fragiles ou à vérifier en priorité

1. **`js/ocr.js` et le couplage de versions Tesseract.js** — voir l'histoire
   complète en section 15/historique. Un décalage de version entre
   `tesseract.js` (5.1.1) et `tesseract.js-core` (initialement 5.1.0, puis
   corrigé en 5.1.1), combiné à un mauvais fichier "core" (variante non
   autonome au lieu de la variante `.wasm.js` autonome), a provoqué un
   **blocage silencieux et indéfini** (aucune erreur, aucun timeout) du
   moteur OCR — très difficile à diagnostiquer. Le correctif actuel
   fonctionne mais est **fragile** : toute mise à jour future de
   `tesseract.js` DOIT utiliser une version strictement compatible de
   `tesseract.js-core`, ET pointer `corePath` vers le fichier
   `tesseract-core-lstm.wasm.js` (autonome, WASM en base64 intégré) — PAS
   vers `tesseract-core-lstm.js` (qui tente un fetch relatif de son `.wasm`
   qui échoue silencieusement dans le contexte d'un Worker). Ce point est
   documenté en commentaire dans le code mais mérite une vérification
   indépendante.
2. **`js/perspective.js`** — l'algorithme de détection de coins et le
   redressement de perspective (mapping quadrilatère, échantillonnage
   bilinéaire) sont une implémentation maison, testée uniquement avec des
   images synthétiques générées par canvas (rectangles pivotés). Jamais
   testé avec une vraie photo de document. La boucle de warp est en JS pur
   (pas de WebGL/WASM), donc potentiellement lente sur de grandes images —
   à profiler sur un vrai téléphone.
3. **`js/app.js` — interactions tactiles** (`startDrag` pour le recadrage,
   gestion `pointerdown/pointermove/pointerup`) : testées via simulation de
   glissé dans un navigateur de bureau, jamais sur un écran tactile réel.
   Le comportement multi-touch (pincer/zoomer accidentel pendant le
   glissé d'un coin) n'est pas géré explicitement.
4. **`service-worker.js` — discipline de version de cache** : la constante
   `CACHE_NAME` doit être incrémentée manuellement à chaque changement de
   fichier statique, sinon les utilisateurs restent bloqués sur une
   version en cache (**ce bug s'est réellement produit pendant le
   développement** — voir section 15). Aucun mécanisme automatique
   n'empêche d'oublier cette étape à l'avenir.
5. **`js/pdf.js` — superposition du texte OCR** : logique de conversion
   pixel → millimètre PDF, avec une estimation de taille de police assez
   simple (`Math.max(4, boxHmm * 2.834645669)`). Pas de gestion des cas
   limites (mot avec bbox nulle/négative, caractères spéciaux non
   supportés par les polices standard PDF, texte très long débordant du
   cadre).
6. **`js/app.js` global** : fichier de ~750 lignes qui concentre TOUTE la
   logique applicative (état de session, navigation, caméra, recadrage,
   OCR, CRUD documents). Pas de séparation en composants/modules par
   écran. Fonctionnel mais pourrait être difficile à faire évoluer sans
   risque de régression croisée entre écrans — candidat à une éventuelle
   refactorisation si le projet grandit.

## 12. Fichiers ou parties générées automatiquement

- **`icons/*.png`** (icon-192, icon-512, apple-touch-icon, maskable-icon-512,
  favicon-32) : générées par un script (`scripts/make-icons.ps1`) qui
  dessine l'icône par primitives vectorielles (rectangles arrondis, lignes,
  polygones) via .NET GDI+. Pas une image conçue par un designer, pas de
  fichier source éditable (SVG/AI/Figma) — seul le script PowerShell fait
  foi ; pour changer l'icône il faut modifier ce script et le relancer.
- **`js/vendor/jspdf.umd.min.js`** : fichier tiers, téléchargé tel quel
  depuis cdnjs (jsPDF 2.5.1, MIT), non modifié.
- **`js/vendor/tesseract/*`** (`tesseract.min.js`, `worker.min.js`,
  `tesseract-core-lstm.wasm.js`) : fichiers tiers, téléchargés tels quels
  depuis cdnjs/jsdelivr (Tesseract.js 5.1.1, Apache-2.0), non modifiés.
- **`js/vendor/tesseract/lang/fra.traineddata`** : données linguistiques
  tierces, téléchargées telles quelles depuis le dépôt officiel
  `tessdata_fast` du projet Tesseract (Apache-2.0), non modifiées.
- **Tout le reste** (`index.html`, `css/style.css`, tous les fichiers
  `js/*.js` applicatifs hors vendor, `service-worker.js`, `manifest.json`,
  les scripts PowerShell, le `README.md`) a été **écrit intégralement par
  Claude (IA)** au cours de cette session de développement, sans générateur
  de code/scaffolding — pas de template `create-react-app` ou équivalent,
  tout est parti de zéro.

## 13. Tests existants et ce qu'ils vérifient

**Il n'existe aucun test automatisé dans ce projet.** Pas de framework de
test installé (pas de Jest/Vitest/Playwright/Cypress...), pas de dossier
`tests/`, pas de script `npm test` (il n'y a même pas de `package.json`).

Ce qui a été fait à la place, pendant le développement, est de la
**vérification manuelle interactive, non rejouable** : l'auteur (Claude) a
piloté un navigateur de test pas à pas (clics, saisie, capture d'écran) et
a aussi exécuté des bouts de JavaScript ad hoc dans la console pour
valider des morceaux de logique (par exemple : générer une fausse photo de
document pivité sur un `<canvas>`, vérifier que `detectDocumentCorners()`
retrouve les bons coins à quelques pixels près, vérifier que
`warpPerspective()` produit une image redressée correctement, vérifier que
le PDF généré contient bien l'opérateur PDF `Tr 3` (texte invisible) suivi
du texte attendu). **Aucun de ces scripts de vérification n'a été conservé
dans le dépôt** — c'était de l'exploration ponctuelle en session, pas une
suite de tests.

**Recommandation explicite à l'auditeur** : ajouter de vrais tests
(au minimum quelques tests unitaires sur `js/pdf.js`, `js/perspective.js`,
`js/db.js` qui sont les modules les plus "purs"/testables sans DOM
complexe, et idéalement un test end-to-end avec Playwright ou similaire
pour le parcours complet capture→PDF→partage) serait une amélioration à
forte valeur, absente aujourd'hui.

## 14. Décisions à ne pas modifier sans raison (cahier des charges)

Ces choix sont **volontaires et découlent directement de demandes
explicites du client** (visibles dans l'historique de conversation) — à ne
pas "corriger" sans revalider avec lui :

- **Aucun compte, aucun cloud, aucune synchronisation multi-appareils.**
  Les documents restent uniquement sur l'appareil (IndexedDB locale).
  C'est un engagement de confidentialité explicite fait à l'utilisateur,
  pas un oubli.
- **Aucune publicité, aucun tracker, aucun appel analytics.** Raison
  d'être du projet : l'utilisateur voulait fuir précisément ce modèle
  économique des applications de scanner gratuites.
- **Architecture PWA (pas d'app native)**, imposée par l'absence de Mac et
  de compte Apple Developer côté client — ne pas proposer de migrer vers
  du natif sans revalider que ces contraintes ont changé.
- **Palette graphique** : fond noir/quasi-noir, texte gris clair/blanc
  cassé, un seul accent rouge sobre, esthétique volontairement minimaliste
  ("style Hitman" au sens visuel — sobriété, contrastes nets, un seul point
  de couleur). Demande explicite et précise du client ; ne pas réintroduire
  de palette colorée sans qu'il le demande.
- **Zéro dépendance réseau au runtime** (tout vendorisé localement) : choix
  délibéré pour l'indépendance et le fonctionnement hors-ligne, ne pas
  "simplifier" en repointant vers des CDN externes.
- **Interface en français.**
- **Partage via la feuille de partage native du système** (pas d'envoi
  d'email programmatique depuis l'app) : choix explicite du client pour
  éviter d'avoir à gérer des identifiants/mots de passe de messagerie dans
  l'app.

## 15. Résumé du fonctionnement global de l'application

Au premier lancement (ouverture de l'URL dans Safari, ou tap sur l'icône
si déjà installée sur l'écran d'accueil), `index.html` charge `js/app.js`
et affiche l'écran d'accueil (`#view-home`). S'il n'y a aucun document en
IndexedDB, un état vide s'affiche avec un bouton "Nouveau scan". Un
service worker s'enregistre en arrière-plan pour permettre le
fonctionnement hors-ligne aux visites suivantes.

En tapant "Nouveau scan" (bouton flottant ou état vide), l'utilisateur
passe à l'écran caméra (`#view-camera`) : le flux vidéo de la caméra
arrière démarre (`getUserMedia`), avec un cadre-guide à l'écran. Chaque
tap sur l'obturateur capture une image du flux vidéo courant, la
redimensionne/normalise, et l'ajoute à une liste de "pages" en mémoire
(pas encore sauvegardée). Une bande de vignettes en bas d'écran montre les
pages déjà capturées ; on peut enchaîner plusieurs captures pour un
document multi-pages.

En tapant "Terminer", l'utilisateur passe à l'écran de relecture
(`#view-review`) : chaque page est listée avec sa vignette, trois "chips"
de filtre (Couleur/Amélioré/Noir&blanc), et des boutons pour la recadrer
(ouvre l'écran de recadrage avec détection automatique des bords), la
faire pivoter, la monter/descendre dans l'ordre, ou la supprimer. Un champ
permet de nommer le document. En tapant "Créer le PDF", toutes les pages
(dans leur état final : recadrées, filtrées) sont assemblées en un seul
fichier PDF via jsPDF, une vignette est générée, et le document (PDF +
vignette + métadonnées + images sources de chaque page) est enregistré
dans IndexedDB. L'utilisateur est alors redirigé vers la fiche du document
nouvellement créé.

Depuis l'accueil, taper sur un document de la liste (ou y arriver après
création) ouvre sa fiche (`#view-doc`) : aperçu de la première page,
métadonnées (nombre de pages, date), et des actions — "Partager / Envoyer
par mail" (ouvre la feuille de partage native du système avec le fichier
PDF, l'utilisateur choisit ensuite Mail/Gmail/AirDrop/etc.), "Voir le PDF"
(ouvre un visualiseur PDF intégré dans l'app, pas un nouvel onglet),
"Rendre le texte cherchable (OCR)" (télécharge si besoin le moteur de
reconnaissance de texte, analyse chaque page, régénère le PDF avec une
couche de texte invisible cherchable/copiable superposée à l'image),
"Renommer" et "Supprimer".

Toute la donnée (PDF, images, métadonnées) reste dans IndexedDB, sur
l'appareil de l'utilisateur, tant qu'il n'a pas explicitement partagé ou
téléchargé un document. Rien n'est envoyé à un serveur à aucun moment.

---

# INSTRUCTIONS POUR L'AUDITEUR

Ce projet t'est transmis avec l'archive ZIP complète du code. Voici les
objectifs de l'audit, dans l'ordre de priorité suggéré :

1. **Vérifier que l'application fonctionne réellement.** Servir le dossier
   en HTTPS (ou `localhost`) et parcourir le flux complet : accueil → scan
   caméra → capture → recadrage (auto puis manuel) → filtres → réorganisation
   → génération du PDF → fiche document → OCR → partage/téléchargement →
   renommer → supprimer. Idéalement sur un vrai iPhone (Safari), pas
   seulement sur un navigateur de bureau — voir l'avertissement de la
   section 10 : **aucun test réel sur téléphone n'a été fait à ce jour**.

2. **Chercher les bugs, erreurs logiques et incohérences**, en particulier
   dans les zones signalées fragiles (section 11) : le couplage de version
   Tesseract.js/tesseract.js-core, l'algorithme de détection de
   bords/redressement de perspective, la gestion tactile du recadrage, la
   discipline de versionnage du cache du service worker, le placement du
   texte OCR invisible.

3. **Vérifier l'architecture** : cohérence de la séparation en modules
   (`db.js` / `pdf.js` / `imaging.js` / `perspective.js` / `ocr.js` /
   `app.js`), pertinence de tout faire transiter par `js/app.js` (fichier
   volumineux et central — évalue si une décomposition serait justifiée),
   cohérence du flux IndexedDB, cohérence de la stratégie de cache du
   service worker.

4. **Repérer le code inutile, dupliqué ou fragile** — un candidat déjà
   identifié : `cropDataUrl()` dans `js/imaging.js`, probablement devenu
   mort depuis l'introduction du recadrage en quadrilatère libre (à
   confirmer par une recherche d'usages, puis supprimer si confirmé).
   Cherche activement d'autres cas similaires.

5. **Vérifier les dépendances** : versions exactes de jsPDF et de
   Tesseract.js/tesseract.js-core (section 2), licences (MIT/Apache-2.0,
   toutes permissives, mais à re-vérifier), absence de vulnérabilités
   connues sur ces versions précises, et surtout la cohérence de version
   entre `tesseract.js` et `tesseract.js-core` (un point qui a déjà causé
   un bug silencieux difficile à diagnostiquer, voir section 11 point 1).

6. **Vérifier la sécurité** : bien que l'app n'ait aucun backend ni API key
   (section 9), vérifie : l'absence d'injection XSS via les noms de
   documents ou le texte OCR (est-ce que `textContent` est utilisé partout
   où il le faut plutôt que `innerHTML` avec de la donnée utilisateur non
   échappée ?), la gestion des permissions caméra, la robustesse du
   service worker (est-ce qu'il pourrait servir du contenu périmé ou
   incorrect dans un scénario particulier ?).

7. **Vérifier les performances** là où c'est pertinent : la boucle de
   redressement de perspective (`warpPerspective` dans
   `js/perspective.js`) qui traite l'image pixel par pixel en JS pur — sur
   une photo haute résolution, est-ce assez rapide sur un téléphone milieu
   de gamme ? Le temps de première utilisation de l'OCR (téléchargement +
   initialisation du moteur WASM) est-il acceptable ? La taille des PDF
   générés (plusieurs pages haute résolution) reste-t-elle raisonnable pour
   un envoi par email ?

8. **Vérifier que l'interface et les fonctionnalités correspondent au
   cahier des charges** tel que résumé aux sections 4, 5 et surtout 14 (les
   décisions à ne pas remettre en cause sans revalidation : zéro compte,
   zéro cloud, zéro pub/tracker, palette noir/gris + accent rouge unique,
   fonctionnement 100% local, partage via feuille de partage native).

9. **Proposer des corrections concrètes, ciblées, sans reconstruire
   inutilement ce qui fonctionne déjà.** Le projet n'utilise
   délibérément aucun framework ni build step (section 6) — ce n'est pas
   un oubli à corriger en proposant d'introduire React/Vite/etc., sauf si
   tu identifies un problème concret que cette absence cause réellement.
   Concentre les recommandations sur des corrections précises, avec
   fichier et ligne quand c'est possible, plutôt que sur des réécritures
   architecturales générales.

**Pour finir** : sois aussi direct que nécessaire sur les problèmes trouvés
— ce document a été écrit sans chercher à enjoliver le travail fait, et
l'audit attendu doit suivre le même principe.
