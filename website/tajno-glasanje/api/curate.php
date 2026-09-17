<?php
/**
 * Studio Varaždin — Catalog Curation API
 * Robust JSON parser and atomic writer for catalog-data.js and catalog-data.master.js
 */

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

$baseDir = dirname(__DIR__);
$jsDir = $baseDir . "/js";
$dataDir = $baseDir . "/api/data";
$catalogFile = $jsDir . "/catalog-data.js";
$masterFile = $jsDir . "/catalog-data.master.js";
$activeJsonFile = $dataDir . "/active-catalog.json";

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

// GET: Return current master and active catalogs
if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $masterData = parseCatalogFile($masterFile);
    $activeData = [];

    if (file_exists($activeJsonFile)) {
        $jsonRaw = file_get_contents($activeJsonFile);
        $activeData = json_decode($jsonRaw, true) ?: [];
    }

    if (empty($activeData)) {
        $activeData = parseCatalogFile($catalogFile);
    }

    if (empty($masterData) && !empty($activeData)) {
        $masterData = $activeData;
    }

    echo json_encode([
        "status" => "success",
        "master" => $masterData,
        "active" => $activeData,
        "masterCount" => count($masterData),
        "activeCount" => count($activeData)
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

    // Ensure master backup exists
    if (!file_exists($masterFile) && file_exists($catalogFile)) {
        copy($catalogFile, $masterFile);
    }

    $allMaster = parseCatalogFile($masterFile) ?: parseCatalogFile($catalogFile);
    $activeItems = [];

    if (isset($data["activeItems"]) && is_array($data["activeItems"])) {
        $activeItems = $data["activeItems"];
    } elseif (isset($data["activeIds"]) && is_array($data["activeIds"])) {
        $allowedIds = array_flip($data["activeIds"]);
        foreach ($allMaster as $item) {
            if (isset($allowedIds[$item["id"]])) {
                $activeItems[] = $item;
            }
        }
    }

    // 1. Write JSON file
    @file_put_contents($activeJsonFile, json_encode($activeItems, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    // 2. Write updated catalog-data.js atomically
    $jsContent = "export const CATALOG_DATA = " . json_encode($activeItems, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . ";\n";
    $tmpFile = $catalogFile . ".tmp";

    $writeOk = false;
    if (@file_put_contents($tmpFile, $jsContent) !== false) {
        if (@rename($tmpFile, $catalogFile)) {
            $writeOk = true;
        }
    }

    if (!$writeOk) {
        // Direct write fallback
        if (@file_put_contents($catalogFile, $jsContent) !== false) {
            $writeOk = true;
        }
    }

    if ($writeOk) {
        echo json_encode([
            "status" => "success",
            "message" => "Katalog je uspješno ažuriran",
            "activeCount" => count($activeItems)
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(500);
        echo json_encode(["error" => "Pisanje u datoteku nije uspjelo"]);
    }
    exit;
}
