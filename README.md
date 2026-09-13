# Scanner

Une application de scan de documents pour iPhone : appareil photo → PDF →
partage par mail, sans pub, sans compte, sans abonnement.

C'est une **Progressive Web App (PWA)** : elle s'installe depuis Safari
("Sur l'écran d'accueil"), pas besoin de passer par l'App Store, pas besoin
de Mac ni de compte développeur Apple. Toute la numérisation (photo →
recadrage → filtre → PDF) se fait **localement sur le téléphone** — aucune
donnée n'est envoyée à un serveur. Les documents sont stockés dans le
navigateur (IndexedDB) et le partage par mail passe par la feuille de
partage native d'iOS (Mail, Gmail, Outlook, AirDrop…).

## Fonctionnalités

- Capture multi-pages avec l'appareil photo
- **Détection automatique des bords + redressement de perspective** (comme un vrai scanner : le document peut être pris de travers, il est redressé) — coins ajustables manuellement si besoin
- Filtres "scanner" (couleur / amélioré / noir & blanc)
- Rotation et réorganisation des pages (avant de créer le PDF)
- Génération d'un PDF (une page = une page du PDF, format A4)
- **OCR à la demande** : rend le texte du PDF cherchable/copiable (reconnaissance de texte en français, moteur téléchargé une seule fois, ~5 Mo, puis mis en cache pour un usage hors-ligne)
- Bibliothèque de documents avec recherche, renommer, supprimer, aperçu
- Partage instantané via la feuille de partage iOS
- Fonctionne hors-ligne une fois installée (service worker)
- Zéro dépendance à un service tiers au runtime (jsPDF et le moteur OCR sont embarqués dans `js/vendor/`)
- Palette noir/gris sobre avec un seul accent (rouge), sans pub, sans compte, sans tracker

## Développement local

Aucun outil à installer : un petit serveur statique en PowerShell sert le
dossier tel quel.

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/server.ps1
```

Puis ouvrir http://localhost:8000 dans un navigateur. Note : l'accès à la
caméra (`getUserMedia`) exige un contexte sécurisé — ça fonctionne sur
`localhost`, mais pour tester depuis un vrai iPhone il faut un déploiement
HTTPS (voir plus bas).

Pour régénérer les icônes (`icons/*.png`) :

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-icons.ps1
```

## Déployer pour de vrai (gratuit, sans Mac, sans abonnement)

L'iPhone doit atteindre l'appli via une URL **HTTPS**. Deux options simples
et gratuites :

### Option A — GitHub Pages (recommandé, tu restes propriétaire du code)

1. Crée un dépôt sur https://github.com/new — **doit être public** : sur un
   compte GitHub gratuit, Pages n'est pas disponible sur un dépôt privé
   (nécessite un abonnement Pro/Team/Enterprise)
2. Depuis ce dossier :
   ```bash
   git remote add origin https://github.com/<ton-compte>/<nom-repo>.git
   git push -u origin master
   ```
3. Dans les paramètres du dépôt GitHub → **Pages** → Source : `master` /
   `/ (root)`
4. L'appli est servie sur `https://<ton-compte>.github.io/<nom-repo>/`

### Option B — Netlify Drop (zéro configuration)

1. Va sur https://app.netlify.com/drop
2. Glisse-dépose le dossier du projet
3. Une URL HTTPS est générée immédiatement

## Installer sur l'iPhone

1. Ouvre l'URL HTTPS de déploiement dans **Safari**
2. Appuie sur le bouton Partager (icône carrée avec flèche)
3. « Sur l'écran d'accueil »
4. L'icône Scanner apparaît comme une app normale, plein écran

## Structure du projet

```
index.html              structure de l'appli (une section par écran)
css/style.css            tous les styles
js/app.js                logique principale, navigation entre écrans
js/db.js                 stockage local des documents (IndexedDB)
js/pdf.js                assemblage des pages en PDF (jsPDF)
js/imaging.js             recadrage, filtres, vignettes (canvas)
js/perspective.js         détection des bords + redressement de perspective
js/ocr.js                 reconnaissance de texte (Tesseract.js, à la demande)
js/vendor/                bibliothèques embarquées (aucune ne vient d'un CDN au runtime)
manifest.json, service-worker.js   installabilité PWA + cache hors-ligne
scripts/server.ps1        petit serveur local pour tester (voir plus haut)
scripts/make-icons.ps1    génère les icônes dans icons/
```

## Confidentialité

Aucun compte, aucun tracker et aucune donnée de document envoyée à un
serveur. Quand l'appareil est en ligne, le service worker peut vérifier
auprès de l'hébergeur statique si les fichiers de l'application ont été
mis à jour ; hors-ligne, il utilise son cache. Les documents scannés ne
quittent jamais le téléphone tant que tu ne les partages pas explicitement.

## Licence

Le dépôt est public pour permettre l'hébergement gratuit (GitHub Pages
n'accepte pas les dépôts privés sur un compte gratuit), mais le code reste
la propriété de son auteur — **tous droits réservés**. Aucune licence
d'utilisation, de copie, de modification ou de redistribution n'est
accordée. Voir `js/vendor/THIRD_PARTY_NOTICES.md` pour les licences des
bibliothèques tierces embarquées (jsPDF, Tesseract.js), qui restent
soumises à leurs licences respectives (MIT / Apache-2.0).
