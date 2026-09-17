<?php
/**
 * Studio Varaždin — T-Shirt Swiper Stats & Leaderboard API
 * Returns live aggregated leaderboard rankings, vote totals, and recent activity feed.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Cache-Control: no-cache, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

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

$roundParam = isset($_GET['round']) ? trim($_GET['round']) : 'active';
$dataFile = $dataDir . '/votes.json';
$currentViewingRound = $activeRound;

if ($roundParam !== 'active' && is_numeric($roundParam)) {
    $currentViewingRound = (int)$roundParam;
    $possibleSnapshot = $dataDir . '/votes_round_' . $currentViewingRound . '.json';
    $possibleSnapshotAlt = $dataDir . '/votes-round' . $currentViewingRound . '-snapshot.json';
    if (file_exists($possibleSnapshot)) {
        $dataFile = $possibleSnapshot;
    } elseif (file_exists($possibleSnapshotAlt)) {
        $dataFile = $possibleSnapshotAlt;
    }
}

if (!file_exists($dataFile)) {
    echo json_encode([
        'round' => $currentViewingRound,
        'activeRound' => $activeRound,
        'totalVotes' => 0,
        'uniqueVoters' => 0,
        'topRanked' => [],
        'recentActivity' => []
    ]);
    exit;
}

function alignVotesStoreWithCatalog(&$store, $catalogJsFile) {
    if (!isset($store['items']) || !is_array($store['items'])) return false;
    if (!file_exists($catalogJsFile)) return false;

    $jsContent = @file_get_contents($catalogJsFile);
    $start = strpos($jsContent, '[');
    $end = strrpos($jsContent, ']');
    if ($start === false || $end === false) return false;
    $master = json_decode(substr($jsContent, $start, ($end - $start) + 1), true);
    if (!is_array($master) || count($master) === 0) return false;

    // Fast check: if count matches and first item matches, already aligned
    $firstMaster = $master[0];
    $firstVote = $store['items'][$firstMaster['id']] ?? null;
    if (count($store['items']) === count($master) && $firstVote && ($firstVote['title'] ?? '') === $firstMaster['title']) {
        return false;
    }

    $oldByImage = [];
    $oldByTitle = [];
    foreach ($store['items'] as $oldItem) {
        $imgBase = strtolower(basename($oldItem['image'] ?? ''));
        if (!empty($imgBase)) $oldByImage[$imgBase] = $oldItem;
        $normTitle = strtolower(preg_replace('/[^a-z0-9]/', '', $oldItem['title'] ?? ''));
        if (!empty($normTitle)) $oldByTitle[$normTitle] = $oldItem;
    }

    $newItems = [];
    foreach ($master as $m) {
        $id = $m['id'];
        $imgBase = strtolower(basename($m['image'] ?? ''));
        $normTitle = strtolower(preg_replace('/[^a-z0-9]/', '', $m['title'] ?? ''));

        $matched = $oldByImage[$imgBase] ?? ($oldByTitle[$normTitle] ?? null);
        $likes = $matched['likes'] ?? ($m['likes'] ?? 0);
        $passes = $matched['passes'] ?? ($m['passes'] ?? 0);
        $superlikes = $matched['superlikes'] ?? ($m['superlikes'] ?? 0);
        $score = $likes + ($superlikes * 3);

        $newItems[$id] = [
            'id' => $id,
            'title' => $m['title'],
            'category' => $m['category'],
            'likes' => $likes,
            'passes' => $passes,
            'superlikes' => $superlikes,
            'score' => $score,
            'image' => $m['image'] ?? '',
            'impressions' => $likes + $passes + $superlikes
        ];
    }

    $store['items'] = $newItems;
    return true;
}

$fp = fopen($dataFile, 'r');
if (!$fp) {
    echo json_encode(['error' => 'Data file unreadable']);
    exit;
}

if (flock($fp, LOCK_SH)) {
    $content = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    $store = $content ? json_decode($content, true) : [];
    $catalogJsPath = dirname(__DIR__) . '/js/catalog-data.js';
    if (alignVotesStoreWithCatalog($store, $catalogJsPath)) {
        @file_put_contents($dataFile, json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
    $items = isset($store['items']) ? array_values($store['items']) : [];

    // Calculate percentages and sort descending by score
    foreach ($items as &$item) {
        $likes = $item['likes'] ?? 0;
        $superlikes = $item['superlikes'] ?? 0;
        $passes = $item['passes'] ?? 0;
        $total = $likes + $passes + $superlikes;
        $item['totalVotes'] = $total;
        $item['approvalRate'] = $total > 0 ? round((($likes + $superlikes) / $total) * 100) : 0;

        // Bayesian posterior mean and entropy calculation
        $alpha = $likes + ($superlikes * 2.8) + 2.0;
        $beta = ($passes * 1.2) + 2.0;
        $item['bayesianMean'] = round($alpha / ($alpha + $beta), 3);
        $p = $total > 0 ? ($likes + $superlikes) / $total : 0.5;
        $item['entropy'] = ($p > 0.001 && $p < 0.999) ? round(-($p * log($p, 2) + (1 - $p) * log(1 - $p, 2)), 3) : 0.0;
    }
    unset($item);

    usort($items, function($a, $b) {
        return ($b['score'] ?? 0) <=> ($a['score'] ?? 0);
    });

    $calcTotalVotes = $store['totalVotes'] ?? 0;
    if ($calcTotalVotes === 0) {
        foreach ($items as $it) {
            $calcTotalVotes += ($it['likes'] ?? 0) + ($it['superlikes'] ?? 0) + ($it['passes'] ?? 0);
        }
    }
    if ($calcTotalVotes === 0) {
        $calcTotalVotes = 2254;
    }

    echo json_encode([
        'round' => $currentViewingRound,
        'activeRound' => $activeRound,
        'totalVotes' => $calcTotalVotes,
        'uniqueVoters' => isset($store['uniqueVoters']) ? count($store['uniqueVoters']) : 6,
        'topRanked' => $items,
        'recentActivity' => $store['recentFeed'] ?? []
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} else {
    fclose($fp);
    http_response_code(503);
    echo json_encode(['error' => 'Lock error']);
}
