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
- Recadrage manuel (glisser les coins)
- Filtres "scanner" (couleur / amélioré / noir & blanc)
- Rotation des pages
- Génération d'un PDF (une page = une page du PDF, format A4)
- Bibliothèque de documents (renommer, supprimer, aperçu)
- Partage instantané via la feuille de partage iOS
- Fonctionne hors-ligne une fois installée (service worker)
- Zéro dépendance réseau au runtime (jsPDF est embarqué dans `js/vendor/`)

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

1. Crée un dépôt sur https://github.com/new (public ou privé)
2. Depuis ce dossier :
   ```bash
   git remote add origin https://github.com/<ton-compte>/<nom-repo>.git
   git push -u origin main
   ```
3. Dans les paramètres du dépôt GitHub → **Pages** → Source : `main` / `/ (root)`
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

## Confidentialité

Aucun compte, aucun tracker, aucun appel réseau après le premier
chargement (tout est mis en cache par le service worker). Les documents
scannés ne quittent jamais le téléphone tant que tu ne les partages pas
explicitement.
