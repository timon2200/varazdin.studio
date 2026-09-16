<?php
/**
 * Studio Varaždin — T-Shirt Swiper Vote API Endpoint
 * Production-ready for AlmaLinux / WHM / cPanel (Zero dependencies, Atomic JSON storage)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

// Reset handler
if ($data && isset($data['action']) && $data['action'] === 'reset') {
    $dataDir = __DIR__ . '/data';
    if (!is_dir($dataDir)) mkdir($dataDir, 0755, true);
    $dataFile = $dataDir . '/votes.json';
    $emptyStore = [
        'totalVotes' => 0,
        'uniqueVoters' => [],
        'items' => [],
        'recentFeed' => []
    ];
    file_put_contents($dataFile, json_encode($emptyStore, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['status' => 'success', 'message' => 'Votes reset to 0']);
    exit;
}

if (!$data || !isset($data['id']) || !isset($data['action'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid vote payload']);
    exit;
}

$itemId = trim($data['id']);
$itemTitle = isset($data['title']) ? trim($data['title']) : $itemId;
$action = in_array($data['action'], ['like', 'pass', 'superlike']) ? $data['action'] : 'like';
$category = isset($data['category']) ? trim($data['category']) : 'General';
$sessionId = isset($data['sessionId']) ? trim($data['sessionId']) : 'anon';
$timestamp = time();

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

$dataFile = $dataDir . '/votes.json';
$fp = fopen($dataFile, 'c+');

if (!$fp) {
    http_response_code(500);
    echo json_encode(['error' => 'Storage unavailable']);
    exit;
}

// Atomic lock to prevent race conditions
if (flock($fp, LOCK_EX)) {
    $content = stream_get_contents($fp);
    $store = $content ? json_decode($content, true) : [
        'totalVotes' => 0,
        'uniqueVoters' => [],
        'items' => [],
        'recentFeed' => []
    ];

    if (!isset($store['items'])) $store['items'] = [];
    if (!isset($store['uniqueVoters'])) $store['uniqueVoters'] = [];
    if (!isset($store['recentFeed'])) $store['recentFeed'] = [];

    // Increment overall
    $store['totalVotes'] = ($store['totalVotes'] ?? 0) + 1;
    if (!in_array($sessionId, $store['uniqueVoters'])) {
        $store['uniqueVoters'][] = $sessionId;
    }

    // Initialize item if new
    if (!isset($store['items'][$itemId])) {
        $store['items'][$itemId] = [
            'id' => $itemId,
            'title' => $itemTitle,
            'category' => $category,
            'likes' => 0,
            'passes' => 0,
            'superlikes' => 0,
            'score' => 0
        ];
    }

    // Update action count
    if ($action === 'like') {
        $store['items'][$itemId]['likes']++;
    } elseif ($action === 'pass') {
        $store['items'][$itemId]['passes']++;
    } elseif ($action === 'superlike') {
        $store['items'][$itemId]['superlikes']++;
    }

    // Recalculate score (1 superlike = 3 points)
    $l = $store['items'][$itemId]['likes'];
    $s = $store['items'][$itemId]['superlikes'];
    $store['items'][$itemId]['score'] = $l + ($s * 3);

    // Append to recent feed (keep last 20)
    $actionLabel = $action === 'superlike' ? 'SUPERLAJKAO' : ($action === 'like' ? 'glasao za' : 'preskočio');
    array_unshift($store['recentFeed'], [
        'user' => 'Gost #' . substr(md5($sessionId), 0, 4),
        'action' => $actionLabel,
        'item' => $itemTitle,
        'time' => 'upravo sada',
        'timestamp' => $timestamp
    ]);
    $store['recentFeed'] = array_slice($store['recentFeed'], 0, 20);

    // Write back atomically
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    echo json_encode([
        'status' => 'success',
        'item' => $store['items'][$itemId],
        'totalVotes' => $store['totalVotes']
    ]);
} else {
    fclose($fp);
    http_response_code(503);
    echo json_encode(['error' => 'Lock failed']);
}
