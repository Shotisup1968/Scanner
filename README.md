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
- **Détection + capture entièrement automatiques** : le contour réel du document (A4, A6, ticket de caisse…) se dessine en direct pendant la prise de vue ; dès qu'il reste stable ~1 seconde, la photo, la mise à plat (perspective) et le passage en noir & blanc se déclenchent tout seuls — le déclencheur manuel reste disponible en secours
- **Détection automatique des bords + redressement de perspective** (comme un vrai scanner : le document peut être pris de travers, il est redressé) — coins ajustables manuellement si besoin
- Filtres "scanner" (couleur / amélioré / noir & blanc **adaptatif** — aplatit les ombres locales, ex. pli ou éclairage inégal, avant de binariser)
- Rotation et réorganisation des pages (avant de créer le PDF)
- Génération d'un PDF (une page = une page du PDF, format A4)
- **OCR à la demande** : rend le texte du PDF cherchable/copiable (reconnaissance de texte en français, moteur téléchargé une seule fois, ~5 Mo, puis mis en cache pour un usage hors-ligne) — fiable sur texte imprimé/tapé, peu fiable sur écriture manuscrite (limite du moteur, pas de l'appli)
- **Export Word (.doc)** du texte reconnu, une fois l'OCR fait — fichier HTML avec extension .doc (technique standard, sans dépendance), s'ouvre nativement dans Word/LibreOffice/Pages/Google Docs avec du vrai texte éditable
- **Aperçu en grand** : tape une vignette (relecture, détail document) pour l'afficher en plein écran
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
js/docx.js                export du texte reconnu en document Word (.doc)
js/vendor/                bibliothèques embarquées (aucune ne vient d'un CDN au runtime)
manifest.json, service-worker.js   installabilité PWA + cache hors-ligne
scripts/server.ps1        petit serveur local pour tester (voir plus haut)
scripts/make-icons.ps1    génère les icônes dans icons/
```

## Notorious Pig Check Delivery (`saucisson/`)

Une seconde PWA, indépendante du Scanner, pour saisir les arrivages de
saucissons et les envoyer dans la base de données. Servie sur
`https://<ton-compte>.github.io/<nom-repo>/saucisson/` et installable de la
même façon (Safari → « Sur l'écran d'accueil »).

- **Réception** : date, fournisseur, n° de bon de livraison, puis une ligne par
  produit : type (Saucisson, Fuet, Noix d'épaule, Terrine, Rillettes), nom,
  nombre de pièces, grammage par pièce (le poids total est calculé). Un produit déjà connu pré-remplit son grammage habituel ;
  le même produit au même grammage est cumulé sur une seule ligne.
- **Valider et exporter** : la réception est archivée et la feuille de partage
  iOS s'ouvre directement avec le fichier CSV (Mail, Drive, Fichiers…).
- **Historique** : chaque réception est marquée « à exporter » / « exporté » ;
  un bouton exporte en un seul fichier toutes celles en attente.
- **Produits** : catalogue des produits, par type, avec leur grammage habituel.
- **Utilisateurs** : chaque personne s'enregistre avec son prénom et son
  adresse mail (sans mot de passe) ; sur un appareil partagé, on choisit qui
  saisit via le bouton en haut à droite.
- **Référence** : appli + prénom + numéro qui se suit, ex. `NPCD-ARNAUD-001`
  (NPCD = Notorious Pig Check Delivery). L'objet des mails commence par
  `[Check Delivery - Arnaud]`, et le fichier contient une colonne « Saisi par ».
- **Envoi par mail** : avec une adresse dans les réglages, la validation ouvre
  Mail avec le destinataire, l'objet et le détail déjà remplis (un appui sur
  « Envoyer »).
- **Envoi automatique** : avec le script `serveur-ovh/reception.php` installé
  sur l'hébergement OVH, chaque réception part toute seule par mail (CSV en
  pièce jointe) et s'ajoute à un journal ; hors-ligne, l'envoi est retenté
  automatiquement. Installation : voir `serveur-ovh/LISEZMOI.md`.
- **Sauvegarde / restauration** : un fichier avec tout le contenu de l'appli,
  pour tout récupérer sur un autre téléphone ou après suppression de l'icône.
  L'appli demande aussi à l'iPhone de ne pas effacer ses données.

Format CSV (une ligne par produit, UTF-8 avec BOM), deux variantes au choix
dans les réglages :

- **Excel / Numbers en français** (par défaut) : point-virgule, dates
  JJ/MM/AAAA, virgule décimale, unités dans les en-têtes

  ```
  Réf. réception;Date;Saisi par;Fournisseur;N° bon de livraison;Type;Produit;Pièces;Grammage (g);Poids total (kg)
  NPCD-ARNAUD-001;24/10/2026;Arnaud;Val d'Allier;1;Saucisson;Pur porc;34;170;5,78
  ```

- **Import base de données / Notion** : virgule, format technique

  ```
  reception_id,date_reception,utilisateur,fournisseur,bon_livraison,categorie,produit,pieces,grammage_g,poids_total_kg
  NPCD-ARNAUD-001,2026-10-24,Arnaud,Val d'Allier,1,Saucisson,Pur porc,34,170,5.780
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
