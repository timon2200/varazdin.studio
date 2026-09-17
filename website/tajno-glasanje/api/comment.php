<?php
/**
 * Studio Varaždin — Comments & Notes API Endpoint
 * Production-ready for AlmaLinux / WHM / cPanel (Zero dependencies, Atomic JSON storage)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}
$commentsFile = $dataDir . '/comments.json';

// GET: Return all comments
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!file_exists($commentsFile)) {
        echo json_encode(['status' => 'success', 'comments' => []]);
        exit;
    }
    
    $raw = file_get_contents($commentsFile);
    $store = $raw ? json_decode($raw, true) : [];
    $list = is_array($store) ? array_values($store) : [];
    
    echo json_encode([
        'status' => 'success',
        'count' => count($list),
        'comments' => $list
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// POST: Save or Delete comment
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!$data || !isset($data['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing item ID']);
        exit;
    }

    $itemId = trim($data['id']);
    $action = isset($data['action']) ? trim($data['action']) : 'save';
    $text = isset($data['text']) ? trim($data['text']) : '';
    $title = isset($data['title']) ? trim($data['title']) : $itemId;
    $category = isset($data['category']) ? trim($data['category']) : 'ARTWEAR';
    $sessionId = isset($data['sessionId']) ? trim($data['sessionId']) : 'anon';
    $updatedAt = isset($data['updatedAt']) ? (int)$data['updatedAt'] : time() * 1000;

    $fp = fopen($commentsFile, 'c+');
    if (!$fp) {
        http_response_code(500);
        echo json_encode(['error' => 'Storage unavailable']);
        exit;
    }

    if (flock($fp, LOCK_EX)) {
        $content = stream_get_contents($fp);
        $store = $content ? json_decode($content, true) : [];
        if (!is_array($store)) $store = [];

        if ($action === 'delete' || empty($text)) {
            unset($store[$itemId]);
        } else {
            $store[$itemId] = [
                'id' => $itemId,
                'title' => $title,
                'category' => $category,
                'text' => $text,
                'user' => 'Gost #' . substr(md5($sessionId), 0, 4),
                'updatedAt' => $updatedAt
            ];
        }

        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);

        echo json_encode([
            'status' => 'success',
            'action' => $action,
            'id' => $itemId,
            'totalComments' => count($store)
        ]);
        exit;
    } else {
        fclose($fp);
        http_response_code(503);
        echo json_encode(['error' => 'Lock failed']);
        exit;
    }
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
