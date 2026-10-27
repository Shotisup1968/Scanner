# Envoi automatique des réceptions (hébergement OVH)

Ce dossier contient le petit programme à installer sur votre hébergement OVH
pour que l'appli Notorious Pig Check Delivery envoie chaque réception **par mail, toute seule**,
avec le fichier CSV en pièce jointe. Il garde aussi un **journal de toutes les
réceptions** (`receptions-journal.csv`, s'ouvre dans Excel) et c'est lui qui,
le jour où la base de données existera, y enregistrera les réceptions
(fonction `enregistrer_en_base` dans `reception.php`).

## Installation (10 minutes, à faire une fois)

1. Copier `config.exemple.php` en `config.php` et le remplir :
   - `cle` : une longue suite de caractères au hasard (32 minimum)
   - `destinataire` : la boîte mail qui reçoit les réceptions
   - `expediteur` : une adresse **du domaine hébergé chez OVH** (obligatoire
     chez OVH pour que les mails partent)
2. Envoyer `reception.php` et `config.php` sur l'hébergement OVH (FTP ou
   explorateur de fichiers OVH), par exemple dans `www/stock/`.
3. Dans l'appli, Réglages → **Envoi automatique (serveur OVH)** :
   - Adresse du script : `https://votre-domaine.fr/stock/reception.php`
   - Clé secrète : la même que dans `config.php`
   - Appuyer sur **Tester la connexion** → « Connexion au serveur OK »
4. Enregistrer. Le bouton devient « Valider et envoyer ».

## Bon à savoir

- `config.php` contient la clé : ne jamais l'envoyer sur GitHub.
- Sans réseau, l'appli garde la réception « Envoi en attente » et la renvoie
  automatiquement dès que le réseau revient.
- **Sauvegarde mensuelle automatique** : chaque mois, l'appli envoie toute seule
  un fichier de sauvegarde (réceptions, produits, utilisateurs) par mail à la
  boîte de l'entreprise. Pour restaurer : Réglages → Restaurer une sauvegarde.
- Une réception renvoyée deux fois ne déclenche pas de second mail (le
  journal sert de mémoire).
- Le mail affiche le prénom de l'utilisateur comme expéditeur et « Répondre »
  va à son adresse ; l'adresse d'envoi reste celle du domaine (exigence OVH).
- Nécessite PHP 7.4 ou plus récent (version par défaut des hébergements OVH
  actuels) et la fonction `mail()`, active par défaut chez OVH.
