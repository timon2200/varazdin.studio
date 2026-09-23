<?php
/**
 * Studio Varaždin — Catalog Curation API
 * Robust JSON parser and atomic writer for catalog-data.js, active-catalog.json, and active-ids.json.
 * Guarantees that live user curation is permanently preserved across deployments and master updates.
 */

$isCli = (php_sapi_name() === 'cli') || (isset($argv) && count($argv) > 0);

if (!$isCli) {
    header("Content-Type: application/json; charset=utf-8");
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
    header("Pragma: no-cache");

    if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
        http_response_code(200);
        exit;
    }
}

$baseDir = dirname(__DIR__);
$jsDir = $baseDir . "/js";
$dataDir = $baseDir . "/api/data";
$catalogFile = $jsDir . "/catalog-data.js";
$masterFile = $jsDir . "/catalog-data.master.js";
$activeJsonFile = $dataDir . "/active-catalog.json";
$activeIdsFile = $dataDir . "/active-ids.json";

if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0755, true);
}

function parseCatalogFile($filePath) {
    if (!file_exists($filePath)) return [];
    $content = file_get_contents($filePath);
    $start = strpos($content, "[");
    $end = strrpos($content, "]");
    if ($start !== false && $end !== false && $end > $start) {
        $jsonStr = substr($content, $start, ($end - $start) + 1);
        return json_decode($jsonStr, true) ?: [];
    }
    return [];
}

function writeAtomicFile($filePath, $content) {
    $tmpFile = $filePath . "." . uniqid('tmp_', true);
    if (@file_put_contents($tmpFile, $content) !== false) {
        if (@rename($tmpFile, $filePath)) {
            return true;
        }
        @unlink($tmpFile);
    }
    return @file_put_contents($filePath, $content) !== false;
}

/**
 * Reconciles master catalog with active selection IDs.
 * Always pulls the latest metadata (titles, images, categories) from master.
 */
function resolveCuratedCatalogs($masterFile, $catalogFile, $activeJsonFile, $activeIdsFile) {
    $masterData = [];
    $dataDir = dirname($activeJsonFile);
    $masterJsonFile = $dataDir . '/master-catalog.json';

    // 1. Direct read master-catalog.json (fast, exact pure JSON)
    if (file_exists($masterJsonFile)) {
        $raw = @file_get_contents($masterJsonFile);
        $decoded = @json_decode($raw, true);
        if (is_array($decoded) && count($decoded) > 0) {
            $masterData = $decoded;
        }
    }

    // 2. Direct read active-catalog.json fallback
    if (empty($masterData) && file_exists($activeJsonFile)) {
        $raw = @file_get_contents($activeJsonFile);
        $decoded = @json_decode($raw, true);
        if (is_array($decoded) && count($decoded) > 0) {
            $masterData = $decoded;
        }
    }

    // 3. Fallback to parsing catalog-data.master.js
    if (empty($masterData)) {
        $masterData = parseCatalogFile($masterFile);
    }

    // 4. Fallback to catalog-data.js
    if (empty($masterData)) {
        $masterData = parseCatalogFile($catalogFile);
    }

    if (empty($masterData)) {
        return [
            'master' => [],
            'active' => [],
            'activeIds' => []
        ];
    }

    // Index master by ID
    $masterMap = [];
    foreach ($masterData as $item) {
        if (isset($item['id'])) {
            $masterMap[$item['id']] = $item;
        }
    }

    $activeIds = [];

    // 1. Try reading active-ids.json (primary source of truth)
    if (file_exists($activeIdsFile)) {
        $rawIds = file_get_contents($activeIdsFile);
        $decodedIds = json_decode($rawIds, true);
        if (is_array($decodedIds) && !empty($decodedIds)) {
            $activeIds = $decodedIds;
        }
    }

    // 2. Fallback to active-catalog.json
    if (empty($activeIds) && file_exists($activeJsonFile)) {
        $rawJson = file_get_contents($activeJsonFile);
        $decodedItems = json_decode($rawJson, true);
        if (is_array($decodedItems) && !empty($decodedItems)) {
            $activeIds = array_filter(array_column($decodedItems, 'id'));
        }
    }

    // 3. Fallback to catalog-data.js if it contains a curated subset
    if (empty($activeIds) && file_exists($catalogFile)) {
        $existingCatalog = parseCatalogFile($catalogFile);
        if (!empty($existingCatalog) && count($existingCatalog) !== count($masterData)) {
            $activeIds = array_filter(array_column($existingCatalog, 'id'));
        }
    }

    // Build active data from master using active IDs
    $activeData = [];
    if (!empty($activeIds)) {
        $validIds = [];
        foreach ($activeIds as $id) {
            if (isset($masterMap[$id])) {
                $activeData[] = $masterMap[$id];
                $validIds[] = $id;
            }
        }
        $activeIds = $validIds;
    }

    // If still empty (initial state), all master items are active
    if (empty($activeData)) {
        $activeData = $masterData;
        $activeIds = array_column($masterData, 'id');
    }

    return [
        'master' => $masterData,
        'active' => $activeData,
        'activeIds' => $activeIds
    ];
}

// CLI Sync Mode
if ($isCli || (isset($_GET['sync']) && $_GET['sync'] === '1')) {
    $curated = resolveCuratedCatalogs($masterFile, $catalogFile, $activeJsonFile, $activeIdsFile);
    
    // Save active-ids.json
    writeAtomicFile($activeIdsFile, json_encode($curated['activeIds'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    
    // Save active-catalog.json
    writeAtomicFile($activeJsonFile, json_encode($curated['active'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    
    // Save catalog-data.js
    $jsContent = "export const CATALOG_DATA = " . json_encode($curated['active'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . ";\n";
    writeAtomicFile($catalogFile, $jsContent);

    if ($isCli) {
        echo "[OK] Tajno Glasanje Curation Synced: Active " . count($curated['active']) . " / Master " . count($curated['master']) . " items.\n";
        exit(0);
    }
}

// GET: Return current master and active catalogs
if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $curated = resolveCuratedCatalogs($masterFile, $catalogFile, $activeJsonFile, $activeIdsFile);

    echo json_encode([
        "status" => "success",
        "master" => $curated['master'],
        "active" => $curated['active'],
        "activeIds" => $curated['activeIds'],
        "masterCount" => count($curated['master']),
        "activeCount" => count($curated['active'])
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// POST: Save curated catalog
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $rawInput = file_get_contents("php://input");
    $data = json_decode($rawInput, true);

    if (!$data || (!isset($data["activeItems"]) && !isset($data["activeIds"]))) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid curation payload"]);
        exit;
    }

    // Load authoritative master catalog
    $masterJsonFile = $dataDir . '/master-catalog.json';
    $allMaster = [];
    if (file_exists($masterJsonFile)) {
        $raw = @file_get_contents($masterJsonFile);
        $decoded = @json_decode($raw, true);
        if (is_array($decoded) && count($decoded) > 0) {
            $allMaster = $decoded;
        }
    }
    if (empty($allMaster)) {
        $allMaster = parseCatalogFile($masterFile) ?: parseCatalogFile($catalogFile);
    }
    $masterMap = [];
    foreach ($allMaster as $item) {
        if (isset($item['id'])) {
            $masterMap[$item['id']] = $item;
        }
    }

    $activeIds = [];
    if (isset($data["activeIds"]) && is_array($data["activeIds"])) {
        $activeIds = $data["activeIds"];
    } elseif (isset($data["activeItems"]) && is_array($data["activeItems"])) {
        $activeIds = array_filter(array_column($data["activeItems"], 'id'));
    }

    // Build active items from latest master definitions
    $activeItems = [];
    $validIds = [];
    foreach ($activeIds as $id) {
        if (isset($masterMap[$id])) {
            $activeItems[] = $masterMap[$id];
            $validIds[] = $id;
        }
    }

    // 1. Write active-ids.json
    $idsOk = writeAtomicFile($activeIdsFile, json_encode($validIds, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    // 2. Write active-catalog.json
    $jsonOk = writeAtomicFile($activeJsonFile, json_encode($activeItems, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    // 3. Write updated catalog-data.js atomically
    $jsContent = "export const CATALOG_DATA = " . json_encode($activeItems, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . ";\n";
    $writeOk = writeAtomicFile($catalogFile, $jsContent);

    if ($writeOk && $idsOk && $jsonOk) {
        echo json_encode([
            "status" => "success",
            "message" => "Katalog je uspješno ažuriran",
            "activeCount" => count($activeItems),
            "activeIds" => $validIds
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "Pisanje u datoteku nije uspjelo"]);
    }
    exit;
}

