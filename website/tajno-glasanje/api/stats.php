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

$dataFile = __DIR__ . '/data/votes.json';

if (!file_exists($dataFile)) {
    echo json_encode([
        'totalVotes' => 0,
        'uniqueVoters' => 0,
        'topRanked' => [],
        'recentActivity' => []
    ]);
    exit;
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

    echo json_encode([
        'totalVotes' => $store['totalVotes'] ?? count($items),
        'uniqueVoters' => isset($store['uniqueVoters']) ? count($store['uniqueVoters']) : 0,
        'topRanked' => $items,
        'recentActivity' => $store['recentFeed'] ?? []
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} else {
    fclose($fp);
    http_response_code(503);
    echo json_encode(['error' => 'Lock error']);
}
