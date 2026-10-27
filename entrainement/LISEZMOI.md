# Entraînement

Appli de sport à la maison, guidée pas à pas : gratuite, sans pub, sans compte,
qui fonctionne hors connexion. Toutes les données restent sur le téléphone.

Adresse (une fois le dépôt publié sur GitHub Pages) :
`https://<ton-compte>.github.io/<nom-repo>/entrainement/`

## Installer sur le téléphone
- **iPhone** : ouvre l'adresse dans Safari → Partager → « Sur l'écran d'accueil ».
- **Android** : ouvre l'adresse dans Chrome → menu ⋮ → « Installer l'application ».

## Utilisation
- **Aujourd'hui** : la séance du jour est proposée → « Démarrer ».
- **Séance guidée** : un petit dessin animé montre le mouvement (description complète sous « Détails ») ; exercices au temps = compte à rebours + bips ; exercices en
  répétitions = bouton « Série terminée » ; repos automatique (+10 s / passer) ;
  Précédent / Pause / Suivant. L'écran reste allumé.
- **Semaine** : les 7 jours, séances faites cochées. Touche un jour pour le modifier
  (ajouter, supprimer, réordonner, changer séries/reps/temps/repos, échanger deux jours).
- **Historique** : calendrier du mois (touche un jour pour voir le détail), temps total, semaines d'affilée (objectif réglable), séances par semaine.
- **Progression** : toutes les 1 ou 2 semaines (réglable), l'appli propose +2/+3 répétitions
  et +5/+10 s de gainage ; tu acceptes ou tu repousses.
- **Réglages** : export / import d'un fichier de sauvegarde, remise à zéro.

## Fichiers
- `logic.js` : programme par défaut, découpage des séances, progression, validation des imports (testé).
- `illustrations.js` : les 17 dessins d'exercices.
- `app.js`, `index.html`, `style.css` : écrans.
- `service-worker.js`, `manifest.json`, `icons/` : installation et hors-ligne.

## Tests
```bash
node --test tests/entrainement/logic.test.js   # logique (20 tests)
node tests/entrainement/e2e.js                 # appli complète dans un navigateur simulé (Playwright)
```
