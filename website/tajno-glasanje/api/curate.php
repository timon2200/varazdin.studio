<?php
/**
 * Studio Varaždin — Catalog Curation API
 * Manages active/inactive t-shirt designs in catalog-data.js with master backup.
 */

header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

$jsDir = dirname(__DIR__) . "/js";
$catalogFile = $jsDir . "/catalog-data.js";
$masterFile = $jsDir . "/catalog-data.master.js";

// GET: Return current master and active catalogs
if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $masterData = [];
    $activeData = [];

    if (file_exists($masterFile)) {
        $content = file_get_contents($masterFile);
        $jsonStr = preg_replace("/^export\s+const\s+CATALOG_DATA\s*=\s*/", "", trim($content));
        $jsonStr = rtrim($jsonStr, ";\n ");
        $masterData = json_decode($jsonStr, true) ?: [];
    } elseif (file_exists($catalogFile)) {
        $content = file_get_contents($catalogFile);
        $jsonStr = preg_replace("/^export\s+const\s+CATALOG_DATA\s*=\s*/", "", trim($content));
        $jsonStr = rtrim($jsonStr, ";\n ");
        $masterData = json_decode($jsonStr, true) ?: [];
    }

    if (file_exists($catalogFile)) {
        $content = file_get_contents($catalogFile);
        $jsonStr = preg_replace("/^export\s+const\s+CATALOG_DATA\s*=\s*/", "", trim($content));
        $jsonStr = rtrim($jsonStr, ";\n ");
        $activeData = json_decode($jsonStr, true) ?: [];
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

    $activeItems = [];

    if (isset($data["activeItems"]) && is_array($data["activeItems"])) {
        $activeItems = $data["activeItems"];
    } elseif (isset($data["activeIds"]) && is_array($data["activeIds"])) {
        $masterContent = file_exists($masterFile) ? file_get_contents($masterFile) : file_get_contents($catalogFile);
        $jsonStr = preg_replace("/^export\s+const\s+CATALOG_DATA\s*=\s*/", "", trim($masterContent));
        $jsonStr = rtrim($jsonStr, ";\n ");
        $allMaster = json_decode($jsonStr, true) ?: [];

        $allowedIds = array_flip($data["activeIds"]);
        foreach ($allMaster as $item) {
            if (isset($allowedIds[$item["id"]])) {
                $activeItems[] = $item;
            }
        }
    }

    // Write updated catalog-data.js atomically
    $jsContent = "export const CATALOG_DATA = " . json_encode($activeItems, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . ";\n";
    
    $tmpFile = $catalogFile . ".tmp";
    if (file_put_contents($tmpFile, $jsContent) !== false) {
        rename($tmpFile, $catalogFile);
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
