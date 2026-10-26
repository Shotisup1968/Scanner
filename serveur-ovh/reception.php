<?php
// Reçoit les réceptions de stock envoyées par l'appli Saucisson, les envoie
// par mail (avec le CSV en pièce jointe) et les ajoute au journal.
// Plus tard : enregistrer_en_base() insérera aussi dans la base de données.
declare(strict_types=1);

$config = require __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: ' . $config['origine_autorisee']);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Vary: Origin');
header('Content-Type: application/json; charset=utf-8');

// Journal : format technique (future base de données). Pièce jointe du
// mail : format lisible dans Excel/Numbers en français.
const COLONNES = ['reception_id', 'date_reception', 'fournisseur', 'bon_livraison', 'produit', 'pieces', 'grammage_g', 'poids_total_kg'];
const COLONNES_FR = ['Réf. réception', 'Date', 'Fournisseur', 'N° bon de livraison', 'Produit', 'Pièces', 'Grammage (g)', 'Poids total (kg)'];

function repondre(int $code, array $donnees): void
{
    http_response_code($code);
    echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
    exit;
}

function texte($valeur, int $max): string
{
    $s = trim(preg_replace('/\s+/u', ' ', (string) $valeur) ?? '');
    return mb_substr($s, 0, $max);
}

// Contrôle et nettoyage d'une réception : on ne fait confiance à rien de ce
// qui arrive du réseau.
function valider_reception($r): ?array
{
    if (!is_array($r)) return null;
    $id = (string) ($r['id'] ?? '');
    $date = (string) ($r['date'] ?? '');
    if (!preg_match('/^R\d{8}-\d{2}-[A-Z0-9]{4}$/', $id)) return null;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return null;
    $lignes = $r['lines'] ?? null;
    if (!is_array($lignes) || count($lignes) < 1 || count($lignes) > 500) return null;

    $propres = [];
    foreach ($lignes as $l) {
        if (!is_array($l)) return null;
        $produit = texte($l['product'] ?? '', 120);
        $pieces = filter_var($l['pieces'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 1000000]]);
        $grammage = filter_var($l['weight'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 1000000]]);
        if ($produit === '' || $pieces === false || $grammage === false) return null;
        $propres[] = ['produit' => $produit, 'pieces' => $pieces, 'grammage' => $grammage];
    }
    return [
        'id' => $id,
        'date' => $date,
        'fournisseur' => texte($r['supplier'] ?? '', 120),
        'bl' => texte($r['bl'] ?? '', 60),
        'lignes' => $propres,
    ];
}

function lignes_csv(array $r): array
{
    $rows = [];
    foreach ($r['lignes'] as $l) {
        $rows[] = [$r['id'], $r['date'], $r['fournisseur'], $r['bl'], $l['produit'], $l['pieces'], $l['grammage'],
            number_format($l['pieces'] * $l['grammage'] / 1000, 3, '.', '')];
    }
    return $rows;
}

function date_fr(string $iso): string
{
    [$a, $m, $j] = explode('-', $iso);
    return "$j/$m/$a";
}

// 5.780 -> 5,78 ; 0.765 -> 0,765
function kg_fr(string $kg): string
{
    return str_replace('.', ',', rtrim(rtrim($kg, '0'), '.'));
}

function lignes_fr(array $rows): array
{
    return array_map(function ($row) {
        $row[1] = date_fr($row[1]);
        $row[7] = kg_fr($row[7]);
        return $row;
    }, $rows);
}

function csv_texte(array $rows): string
{
    $f = fopen('php://temp', 'r+');
    foreach ($rows as $row) fputcsv($f, $row, ';', '"', '');
    rewind($f);
    $out = stream_get_contents($f);
    fclose($f);
    return $out;
}

function ids_deja_recus(string $journal): array
{
    $ids = [];
    if (!is_file($journal)) return $ids;
    $f = fopen($journal, 'r');
    while (($row = fgetcsv($f, 0, ';', '"', '')) !== false) {
        if (isset($row[0])) $ids[ltrim($row[0], "\xEF\xBB\xBF")] = true;
    }
    fclose($f);
    return $ids;
}

function ajouter_au_journal(string $journal, array $rows): void
{
    $nouveau = !is_file($journal);
    $f = fopen($journal, 'a');
    if (!$f) throw new RuntimeException('journal inaccessible');
    flock($f, LOCK_EX);
    if ($nouveau) fwrite($f, "\xEF\xBB\xBF" . csv_texte([COLONNES]));
    fwrite($f, csv_texte($rows));
    flock($f, LOCK_UN);
    fclose($f);
}

function entete_utf8(string $s): string
{
    return '=?UTF-8?B?' . base64_encode($s) . '?=';
}

function envoyer_mail(array $config, array $receptions, array $rows): bool
{
    $premiere = $receptions[0];
    $sujet = count($receptions) === 1
        ? 'Réception stock ' . $premiere['date'] . ($premiere['fournisseur'] !== '' ? ' - ' . $premiere['fournisseur'] : '')
        : 'Réceptions stock (' . count($receptions) . ') - ' . date('Y-m-d');

    $corps = [];
    foreach ($receptions as $r) {
        $pieces = 0; $kg = 0.0;
        $corps[] = 'Réception du ' . date_fr($r['date']);
        $corps[] = 'Fournisseur : ' . ($r['fournisseur'] !== '' ? $r['fournisseur'] : 'non précisé');
        $corps[] = 'N° bon de livraison : ' . ($r['bl'] !== '' ? $r['bl'] : '-');
        $corps[] = 'Référence : ' . $r['id'];
        $corps[] = '';
        foreach ($r['lignes'] as $l) {
            $poids = $l['pieces'] * $l['grammage'] / 1000;
            $pieces += $l['pieces']; $kg += $poids;
            $corps[] = '- ' . $l['produit'] . ' : ' . $l['pieces'] . ' pcs x ' . $l['grammage'] . ' g = ' . str_replace('.', ',', (string) round($poids, 3)) . ' kg';
        }
        $corps[] = '';
        $corps[] = 'Total : ' . $pieces . ' pièces, ' . str_replace('.', ',', (string) round($kg, 3)) . ' kg';
        $corps[] = '----------';
    }
    $corps[] = 'Le fichier CSV est en pièce jointe (s\'ouvre dans Excel).';

    $nomFichier = count($receptions) === 1
        ? 'reception_' . str_replace('/', '-', date_fr($premiere['date'])) . '_' . $premiere['id'] . '.csv'
        : 'receptions_' . date('d-m-Y') . '.csv';
    $csv = "\xEF\xBB\xBF" . csv_texte(array_merge([COLONNES_FR], lignes_fr($rows)));

    $frontiere = 'saucisson-' . bin2hex(random_bytes(12));
    $entetes = implode("\r\n", [
        'From: ' . entete_utf8('Appli stock') . ' <' . $config['expediteur'] . '>',
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="' . $frontiere . '"',
    ]);
    $message = "--$frontiere\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode(implode("\r\n", $corps)))
        . "--$frontiere\r\n"
        . "Content-Type: text/csv; charset=UTF-8; name=\"$nomFichier\"\r\n"
        . "Content-Transfer-Encoding: base64\r\n"
        . "Content-Disposition: attachment; filename=\"$nomFichier\"\r\n\r\n"
        . chunk_split(base64_encode($csv))
        . "--$frontiere--\r\n";

    return mail($config['destinataire'], entete_utf8($sujet), $message, $entetes, '-f' . $config['expediteur']);
}

// Emplacement prévu pour la future base de données (MySQL OVH, Notion…).
function enregistrer_en_base(array $receptions): void
{
    // À compléter le jour où la base existe.
}

// ------------------------------------------------------------------ requête

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    repondre(405, ['ok' => false, 'erreur' => 'méthode non autorisée']);
}

$brut = file_get_contents('php://input', false, null, 0, 500000);
$donnees = json_decode((string) $brut, true);
if (!is_array($donnees) || !is_string($donnees['cle'] ?? null) || !hash_equals($config['cle'], $donnees['cle'])) {
    repondre(403, ['ok' => false, 'erreur' => 'clé secrète incorrecte']);
}
if (!empty($donnees['test'])) {
    repondre(200, ['ok' => true, 'test' => true]);
}

$entrees = $donnees['receptions'] ?? null;
if (!is_array($entrees) || count($entrees) < 1 || count($entrees) > 50) {
    repondre(400, ['ok' => false, 'erreur' => 'aucune réception valide']);
}

$deja = ids_deja_recus($config['journal']);
$recues = [];
$nouvelles = [];
foreach ($entrees as $e) {
    $r = valider_reception($e);
    if ($r === null) repondre(400, ['ok' => false, 'erreur' => 'réception invalide']);
    $recues[] = $r['id'];
    // Déjà reçue (ex. renvoi après une coupure réseau) : pas de second mail.
    if (!isset($deja[$r['id']])) {
        $nouvelles[] = $r;
        $deja[$r['id']] = true;
    }
}

if ($nouvelles) {
    $rows = [];
    foreach ($nouvelles as $r) $rows = array_merge($rows, lignes_csv($r));
    if (!envoyer_mail($config, $nouvelles, $rows)) {
        repondre(500, ['ok' => false, 'erreur' => 'le mail n\'a pas pu partir']);
    }
    try {
        ajouter_au_journal($config['journal'], $rows);
        enregistrer_en_base($nouvelles);
    } catch (Throwable $t) {
        repondre(500, ['ok' => false, 'erreur' => 'mail envoyé mais journal inaccessible']);
    }
}

repondre(200, ['ok' => true, 'recues' => $recues]);
