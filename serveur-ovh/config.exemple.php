<?php
// Copier ce fichier en "config.php" (à côté de reception.php) et le remplir.
// config.php ne doit JAMAIS être envoyé sur GitHub : il contient la clé.
return [
    // Clé partagée avec l'appli (Réglages > Envoi automatique > Clé secrète).
    // Mettre une longue suite de caractères au hasard, 32 minimum.
    'cle' => 'REMPLACER-PAR-UNE-LONGUE-CLE-SECRETE',

    // Boîte qui reçoit les réceptions.
    'destinataire' => 'commandes@votre-domaine.fr',

    // Expéditeur : chez OVH il doit appartenir au domaine de l'hébergement
    // (sinon les mails partent en spam ou sont refusés).
    'expediteur' => 'appli-stock@votre-domaine.fr',

    // Seule l'appli publiée sur GitHub Pages a le droit d'appeler le script.
    'origine_autorisee' => 'https://shotisup1968.github.io',

    // Journal de toutes les réceptions reçues (fichier CSV qui s'ouvre dans
    // Excel). Sert aussi à ne jamais envoyer deux fois la même réception.
    // Idéalement hors du dossier public "www".
    'journal' => __DIR__ . '/../receptions-journal.csv',
];
