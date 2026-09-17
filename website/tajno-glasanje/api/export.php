<?php
/**
 * Studio Varaždin — Tajno Glasanje Export API
 * Generates CSV (Excel-ready with UTF-8 BOM) and JSON exports for any voting round.
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Cache-Control: no-store, no-cache, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$roundParam = isset($_GET['round']) ? trim($_GET['round']) : 'active';
$format = isset($_GET['format']) ? strtolower(trim($_GET['format'])) : 'csv';

$dataDir = __DIR__ . '/data';
$roundsFile = $dataDir . '/rounds.json';

$activeRound = 1;
$roundsMeta = [];
if (file_exists($roundsFile)) {
    $rData = json_decode(file_get_contents($roundsFile), true);
    if ($rData) {
        $activeRound = $rData['activeRound'] ?? 1;
        $roundsMeta = $rData['rounds'] ?? [];
    }
}

// Determine target data file
$targetFile = $dataDir . '/votes.json';
$roundNumber = $activeRound;

if ($roundParam !== 'active' && is_numeric($roundParam)) {
    $roundNumber = (int)$roundParam;
    $possibleSnapshot = $dataDir . '/votes_round_' . $roundNumber . '.json';
    $possibleSnapshotAlt = $dataDir . '/votes-round' . $roundNumber . '-snapshot.json';
    if (file_exists($possibleSnapshot)) {
        $targetFile = $possibleSnapshot;
    } elseif (file_exists($possibleSnapshotAlt)) {
        $targetFile = $possibleSnapshotAlt;
    }
}

if (!file_exists($targetFile)) {
    http_response_code(404);
    echo json_encode(['error' => 'Podaci za traženo kolo nisu pronađeni.']);
    exit;
}

$rawContent = file_get_contents($targetFile);
$store = json_decode($rawContent, true);
$items = isset($store['items']) ? array_values($store['items']) : [];

// Process metrics
foreach ($items as &$item) {
    $likes = $item['likes'] ?? 0;
    $superlikes = $item['superlikes'] ?? 0;
    $passes = $item['passes'] ?? 0;
    $total = $likes + $superlikes + $passes;
    $item['totalVotes'] = $total;
    $item['approvalRate'] = $total > 0 ? round((($likes + $superlikes) / $total) * 100) : 0;
    $alpha = $likes + ($superlikes * 2.8) + 2.0;
    $beta = ($passes * 1.2) + 2.0;
    $item['bayesianMean'] = round($alpha / ($alpha + beta), 3);
    $item['score'] = $likes + ($superlikes * 3);
}
unset($item);

usort($items, function($a, $b) {
    if (($b['score'] ?? 0) !== ($a['score'] ?? 0)) {
        return ($b['score'] ?? 0) <=> ($a['score'] ?? 0);
    }
    if (($b['bayesianMean'] ?? 0) !== ($a['bayesianMean'] ?? 0)) {
        return ($b['bayesianMean'] ?? 0) <=> ($a['bayesianMean'] ?? 0);
    }
    return ($b['superlikes'] ?? 0) <=> ($a['superlikes'] ?? 0);
});

// JSON Export
if ($format === 'json') {
    $filename = 'tajno-glasanje-kolo-' . $roundNumber . '-rezultati.json';
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    echo json_encode([
        'round' => $roundNumber,
        'totalVotes' => $store['totalVotes'] ?? count($items),
        'uniqueVoters' => isset($store['uniqueVoters']) ? count($store['uniqueVoters']) : 0,
        'totalItems' => count($items),
        'rankedItems' => $items
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// CSV Export (Excel Compatible with UTF-8 BOM)
$filename = 'tajno-glasanje-kolo-' . $roundNumber . '-rezultati.csv';
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');

$output = fopen('php://output', 'w');

// Output UTF-8 BOM for Excel
fputs($output, "\xEF\xBB\xBF");

// Header row
fputcsv($output, [
    'Rang',
    'ID Motiva',
    'Naziv Motiva',
    'Kategorija',
    'Ukupno Bodova',
    'Superlike (★)',
    'Like (❤️)',
    'Pass (✕)',
    'Ukupno Glasova',
    'Odobrenje (%)',
    'Bayesian Mean',
    'Putanja Slike'
], ';');

$rank = 1;
foreach ($items as $item) {
    fputcsv($output, [
        $rank++,
        $item['id'] ?? '',
        $item['title'] ?? '',
        $item['category'] ?? '',
        $item['score'] ?? 0,
        $item['superlikes'] ?? 0,
        $item['likes'] ?? 0,
        $item['passes'] ?? 0,
        $item['totalVotes'] ?? 0,
        ($item['approvalRate'] ?? 0) . '%',
        $item['bayesianMean'] ?? 0,
        $item['image'] ?? ''
    ], ';');
}

fclose($output);
exit;
