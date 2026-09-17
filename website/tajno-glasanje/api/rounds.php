<?php
/**
 * Studio Varaždin — Tajno Glasanje Rounds Management API
 * Handles round transitions, archives, finalist catalog setup, and state persistence.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$baseDir = dirname(__DIR__);
$dataDir = $baseDir . '/api/data';
$jsDir = $baseDir . '/js';
$roundsFile = $dataDir . '/rounds.json';
$votesFile = $dataDir . '/votes.json';
$activeCatalogJson = $dataDir . '/active-catalog.json';
$catalogJsFile = $jsDir . '/catalog-data.js';
$masterJsFile = $jsDir . '/catalog-data.master.js';

if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0755, true);
}

function getRoundsData($file) {
    if (file_exists($file)) {
        $content = file_get_contents($file);
        $data = json_decode($content, true);
        if ($data) return $data;
    }
    return [
        'activeRound' => 1,
        'rounds' => [
            [
                'id' => 1,
                'name' => '1. Kolo — Selekcija Cijelog Špila',
                'status' => 'completed',
                'totalVotes' => 0,
                'uniqueVoters' => 0,
                'totalItems' => 0,
                'dateStarted' => date('Y-m-d'),
                'dataFile' => 'votes_round_1.json'
            ]
        ]
    ];
}

function parseCatalogJs($filePath) {
    if (!file_exists($filePath)) return [];
    $content = file_get_contents($filePath);
    $start = strpos($content, '[');
    $end = strrpos($content, ']');
    if ($start !== false && $end !== false && $end > $start) {
        $jsonStr = substr($content, $start, ($end - $start) + 1);
        return json_decode($jsonStr, true) ?: [];
    }
    return [];
}

// GET: Return current rounds list and active round
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $roundsData = getRoundsData($roundsFile);
    echo json_encode([
        'status' => 'success',
        'activeRound' => $roundsData['activeRound'],
        'rounds' => $roundsData['rounds']
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// POST: Actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!$data || !isset($data['action'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Nevažeći zahtjev']);
        exit;
    }

    $action = $data['action'];
    $roundsData = getRoundsData($roundsFile);
    $currRound = (int)$roundsData['activeRound'];

    // 1. Start Next Round (Advance to Round 2 / Finals)
    if ($action === 'start_next_round') {
        $finalistIds = isset($data['finalistIds']) && is_array($data['finalistIds']) ? $data['finalistIds'] : [];
        $roundName = isset($data['name']) && !empty($data['name']) ? trim($data['name']) : ($currRound + 1) . '. Kolo — Finale & Finalisti';
        $roundDesc = isset($data['description']) ? trim($data['description']) : 'Glasanje za odabrane finaliste';

        // 1. Archive current votes.json
        if (file_exists($votesFile)) {
            $currVotesContent = file_get_contents($votesFile);
            $currVotes = json_decode($currVotesContent, true) ?: [];
            
            $archiveFile = $dataDir . '/votes_round_' . $currRound . '.json';
            $snapshotFile = $dataDir . '/votes-round' . $currRound . '-snapshot.json';
            file_put_contents($archiveFile, $currVotesContent);
            file_put_contents($snapshotFile, $currVotesContent);

            // Update current round metadata in rounds.json
            foreach ($roundsData['rounds'] as &$r) {
                if ($r['id'] === $currRound) {
                    $r['status'] = 'completed';
                    $r['totalVotes'] = $currVotes['totalVotes'] ?? 0;
                    $r['uniqueVoters'] = isset($currVotes['uniqueVoters']) ? count($currVotes['uniqueVoters']) : 0;
                    $r['totalItems'] = isset($currVotes['items']) ? count($currVotes['items']) : 0;
                    $r['dateCompleted'] = date('Y-m-d H:i:s');
                    $r['dataFile'] = 'votes_round_' . $currRound . '.json';
                }
            }
            unset($r);
        }

        // 2. Determine new active catalog
        $masterList = parseCatalogJs($masterJsFile) ?: parseCatalogJs($catalogJsFile);
        $nextRoundItems = [];

        if (!empty($finalistIds)) {
            $allowedMap = array_flip($finalistIds);
            foreach ($masterList as $mItem) {
                if (isset($allowedMap[$mItem['id']])) {
                    $nextRoundItems[] = $mItem;
                }
            }
        } else {
            // Default: use current active catalog
            $nextRoundItems = $masterList;
        }

        // 3. Write new active catalog
        file_put_contents($activeCatalogJson, json_encode($nextRoundItems, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $jsCode = "export const CATALOG_DATA = " . json_encode($nextRoundItems, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . ";\n";
        file_put_contents($catalogJsFile, $jsCode);

        // 4. Reset votes.json for the new round
        $newStore = [
            'round' => $currRound + 1,
            'totalVotes' => 0,
            'uniqueVoters' => [],
            'items' => [],
            'recentFeed' => []
        ];
        file_put_contents($votesFile, json_encode($newStore, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        // 5. Append new round to rounds.json
        $nextRoundNum = $currRound + 1;
        $roundsData['activeRound'] = $nextRoundNum;
        $roundsData['rounds'][] = [
            'id' => $nextRoundNum,
            'name' => $roundName,
            'description' => $roundDesc,
            'status' => 'active',
            'totalVotes' => 0,
            'uniqueVoters' => 0,
            'totalItems' => count($nextRoundItems),
            'dateStarted' => date('Y-m-d H:i:s'),
            'dataFile' => 'votes.json'
        ];

        file_put_contents($roundsFile, json_encode($roundsData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        echo json_encode([
            'status' => 'success',
            'message' => 'Uspješno je pokrenuto ' . $nextRoundNum . '. kolo!',
            'activeRound' => $nextRoundNum,
            'finalistCount' => count($nextRoundItems)
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(400);
    echo json_encode(['error' => 'Nepoznata akcija']);
    exit;
}
