<?php
/**
 * Studio Varaždin — Nikola Vudrag Spatial Moodboard API
 * Real-time board data, drag-and-drop media upload, WebP & MP4 auto-compression,
 * and persistent spatial position sync.
 *
 * Compatible with cPanel / AlmaLinux / Apache / PHP 7.4+
 */

@ini_set('memory_limit', '512M');
@ini_set('max_execution_time', '300');
@ini_set('upload_max_filesize', '256M');
@ini_set('post_max_size', '256M');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Cache-Control: no-cache, no-store, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$baseDir = dirname(__DIR__); // /website/vudrag
$dataDir = $baseDir . '/data';
$stillsUploadDir = $baseDir . '/stills/uploads';
$videosUploadDir = $baseDir . '/videos/uploads';

// Ensure required directories exist
foreach ([$dataDir, $stillsUploadDir, $videosUploadDir] as $dir) {
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
}

$boardFile = $dataDir . '/board.json';
$defaultBoardFile = $dataDir . '/default_board.json';

// Response helper
function sendResponse($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Load default items
function getDefaultItems() {
    global $defaultBoardFile;
    if (file_exists($defaultBoardFile)) {
        $content = @file_get_contents($defaultBoardFile);
        if ($content) {
            $json = json_decode($content, true);
            if (is_array($json)) {
                return $json;
            }
        }
    }
    return [];
}

// Read board state with file locking
function loadBoardData() {
    global $boardFile;
    if (!file_exists($boardFile)) {
        $defaultItems = getDefaultItems();
        $initialData = [
            'version' => 2,
            'lastModified' => time(),
            'items' => $defaultItems,
            'positions' => []
        ];
        saveBoardData($initialData);
        return $initialData;
    }

    $fp = @fopen($boardFile, 'r');
    if (!$fp) {
        return [
            'version' => 2,
            'lastModified' => time(),
            'items' => getDefaultItems(),
            'positions' => []
        ];
    }

    flock($fp, LOCK_SH);
    $size = filesize($boardFile);
    $content = $size > 0 ? fread($fp, $size) : '';
    flock($fp, LOCK_UN);
    fclose($fp);

    $data = json_decode($content, true);
    if (!is_array($data) || !isset($data['items'])) {
        return [
            'version' => 2,
            'lastModified' => time(),
            'items' => getDefaultItems(),
            'positions' => []
        ];
    }

    return $data;
}

// Save board state with atomic file locking
function saveBoardData($data) {
    global $boardFile;
    $data['lastModified'] = time();
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    
    $fp = fopen($boardFile, 'c+');
    if (!$fp) return false;

    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, $json);
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        return true;
    }
    fclose($fp);
    return false;
}

// Locate FFmpeg binary on server
function findFfmpeg() {
    $possiblePaths = [
        'ffmpeg',
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/opt/homebrew/bin/ffmpeg',
        '/usr/local/cpanel/3rdparty/bin/ffmpeg'
    ];

    foreach ($possiblePaths as $path) {
        $test = @shell_exec("$path -version 2>&1");
        if ($test && stripos($test, 'ffmpeg version') !== false) {
            return $path;
        }
    }
    return null;
}

// Helper: Auto-rotate JPEG using EXIF orientation if available
function autoRotateImage($srcImage, $srcPath) {
    if (!function_exists('exif_read_data')) return $srcImage;
    $exif = @exif_read_data($srcPath);
    if (!empty($exif['Orientation'])) {
        switch ($exif['Orientation']) {
            case 3:
                return imagerotate($srcImage, 180, 0);
            case 6:
                return imagerotate($srcImage, -90, 0);
            case 8:
                return imagerotate($srcImage, 90, 0);
        }
    }
    return $srcImage;
}

// Helper: Compress and save image as WebP (Max dimension 2048px, Quality ~84)
function processAndSaveImageToWebp($tmpPath, $destWebpPath, $maxDim = 2048, $quality = 84) {
    $imgInfo = @getimagesize($tmpPath);
    if (!$imgInfo) {
        return false;
    }

    $mime = $imgInfo['mime'];
    $srcImg = null;

    switch ($mime) {
        case 'image/jpeg':
            $srcImg = @imagecreatefromjpeg($tmpPath);
            if ($srcImg) {
                $srcImg = autoRotateImage($srcImg, $tmpPath);
            }
            break;
        case 'image/png':
            $srcImg = @imagecreatefrompng($tmpPath);
            break;
        case 'image/webp':
            $srcImg = @imagecreatefromwebp($tmpPath);
            break;
        case 'image/gif':
            $srcImg = @imagecreatefromgif($tmpPath);
            break;
        case 'image/bmp':
        case 'image/x-ms-bmp':
            if (function_exists('imagecreatefrombmp')) {
                $srcImg = @imagecreatefrombmp($tmpPath);
            }
            break;
        default:
            if (function_exists('imagecreatefromstring')) {
                $content = @file_get_contents($tmpPath);
                if ($content) {
                    $srcImg = @imagecreatefromstring($content);
                }
            }
            break;
    }

    if (!$srcImg) {
        // Fallback: Check if Imagick is available
        if (class_exists('Imagick')) {
            try {
                $imagick = new Imagick($tmpPath);
                $imagick->setImageFormat('webp');
                $imagick->setImageCompressionQuality($quality);
                $w = $imagick->getImageWidth();
                $h = $imagick->getImageHeight();
                if ($w > $maxDim || $h > $maxDim) {
                    if ($w >= $h) {
                        $imagick->resizeImage($maxDim, 0, Imagick::FILTER_LANCZOS, 1);
                    } else {
                        $imagick->resizeImage(0, $maxDim, Imagick::FILTER_LANCZOS, 1);
                    }
                }
                $imagick->writeImage($destWebpPath);
                $imagick->clear();
                $imagick->destroy();
                $finalInfo = @getimagesize($destWebpPath);
                return [
                    'width' => $finalInfo ? $finalInfo[0] : $w,
                    'height' => $finalInfo ? $finalInfo[1] : $h
                ];
            } catch (Exception $e) {
                return false;
            }
        }
        return false;
    }

    $origW = imagesx($srcImg);
    $origH = imagesy($srcImg);

    // Calculate new dimensions preserving aspect ratio
    $newW = $origW;
    $newH = $origH;

    if ($origW > $maxDim || $origH > $maxDim) {
        if ($origW >= $origH) {
            $newW = $maxDim;
            $newH = (int)round(($origH / $origW) * $maxDim);
        } else {
            $newH = $maxDim;
            $newW = (int)round(($origW / $origH) * $maxDim);
        }
    }

    $destImg = imagecreatetruecolor($newW, $newH);

    // Preserve alpha transparency for PNG/WebP
    imagealphablending($destImg, false);
    imagesavealpha($destImg, true);

    imagecopyresampled($destImg, $srcImg, 0, 0, 0, 0, $newW, $newH, $origW, $origH);
    imagedestroy($srcImg);

    // Save as WebP
    $saved = @imagewebp($destImg, $destWebpPath, $quality);
    imagedestroy($destImg);

    if ($saved && file_exists($destWebpPath)) {
        return [
            'width' => $newW,
            'height' => $newH
        ];
    }

    return false;
}

// Helper: Save a base64 encoded client poster image as WebP
function saveBase64PosterToWebp($base64Data, $destWebpPath) {
    if (empty($base64Data)) return false;
    if (preg_match('/^data:image\/(\w+);base64,/', $base64Data, $type)) {
        $base64Data = substr($base64Data, strpos($base64Data, ',') + 1);
    }
    $decoded = base64_decode($base64Data);
    if (!$decoded) return false;

    $tmpFile = tempnam(sys_get_temp_dir(), 'vudrag_poster_');
    file_put_contents($tmpFile, $decoded);
    $res = processAndSaveImageToWebp($tmpFile, $destWebpPath, 1280, 82);
    @unlink($tmpFile);
    return $res;
}

// Helper: Clean filename / title
function cleanTitle($rawName) {
    $pathParts = pathinfo($rawName);
    $stem = $pathParts['filename'];
    $clean = str_replace(['_', '-'], ' ', $stem);
    $clean = preg_replace('/\s+/', ' ', $clean);
    return trim($clean);
}

// ==========================================
// ROUTING
// ==========================================

$action = isset($_GET['action']) ? $_GET['action'] : '';

// 1. GET: Fetch full board data
if ($_SERVER['REQUEST_METHOD'] === 'GET' || $action === 'get') {
    $boardData = loadBoardData();
    sendResponse([
        'status' => 'ok',
        'items' => $boardData['items'],
        'positions' => isset($boardData['positions']) ? $boardData['positions'] : new stdClass(),
        'lastModified' => $boardData['lastModified'],
        'totalItems' => count($boardData['items'])
    ]);
}

// 2. POST: Save card positions
if ($action === 'save_positions') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!isset($input['positions']) || !is_array($input['positions'])) {
        sendResponse(['status' => 'error', 'message' => 'Missing positions object'], 400);
    }

    $boardData = loadBoardData();
    if (!isset($boardData['positions'])) {
        $boardData['positions'] = [];
    }

    // Merge positions
    foreach ($input['positions'] as $id => $pos) {
        $boardData['positions'][$id] = [
            'x' => (float)$pos['x'],
            'y' => (float)$pos['y'],
            'rot' => isset($pos['rot']) ? (float)$pos['rot'] : 0,
            'z' => isset($pos['z']) ? (int)$pos['z'] : 10
        ];
    }

    saveBoardData($boardData);
    sendResponse(['status' => 'ok', 'saved' => count($input['positions'])]);
}

// 3. POST: Delete item
if ($action === 'delete_item') {
    $input = json_decode(file_get_contents('php://input'), true);
    $itemId = isset($input['id']) ? $input['id'] : '';
    if (!$itemId) {
        sendResponse(['status' => 'error', 'message' => 'Missing item ID'], 400);
    }

    $boardData = loadBoardData();
    $found = false;
    $newItems = [];
    foreach ($boardData['items'] as $item) {
        if ($item['id'] === $itemId) {
            $found = true;
            // Unlink media if in uploads
            if (!empty($item['img_src']) && strpos($item['img_src'], 'uploads/') !== false) {
                @unlink($baseDir . '/' . $item['img_src']);
            }
            if (!empty($item['video_src']) && strpos($item['video_src'], 'uploads/') !== false) {
                @unlink($baseDir . '/' . $item['video_src']);
            }
            if (!empty($item['poster_src']) && strpos($item['poster_src'], 'uploads/') !== false) {
                @unlink($baseDir . '/' . $item['poster_src']);
            }
        } else {
            $newItems[] = $item;
        }
    }

    if ($found) {
        $boardData['items'] = $newItems;
        if (isset($boardData['positions'][$itemId])) {
            unset($boardData['positions'][$itemId]);
        }
        saveBoardData($boardData);
        sendResponse(['status' => 'ok', 'deleted' => $itemId]);
    } else {
        sendResponse(['status' => 'error', 'message' => 'Item not found'], 404);
    }
}

// 4. POST: Reset positions or board
if ($action === 'reset_board') {
    $defaultItems = getDefaultItems();
    $boardData = [
        'version' => 2,
        'lastModified' => time(),
        'items' => $defaultItems,
        'positions' => []
    ];
    saveBoardData($boardData);
    sendResponse(['status' => 'ok', 'message' => 'Board reset to default']);
}

// 5. POST: Upload new photos or videos
if ($action === 'upload' || $_SERVER['REQUEST_METHOD'] === 'POST') {
    $files = [];

    // Normalize $_FILES structure (handles single 'file' or multiple 'files[]')
    if (isset($_FILES['files'])) {
        if (is_array($_FILES['files']['name'])) {
            $count = count($_FILES['files']['name']);
            for ($i = 0; $i < $count; $i++) {
                if ($_FILES['files']['error'][$i] === UPLOAD_ERR_OK) {
                    $files[] = [
                        'name' => $_FILES['files']['name'][$i],
                        'tmp_name' => $_FILES['files']['tmp_name'][$i],
                        'type' => $_FILES['files']['type'][$i],
                        'size' => $_FILES['files']['size'][$i],
                    ];
                }
            }
        } else if ($_FILES['files']['error'] === UPLOAD_ERR_OK) {
            $files[] = $_FILES['files'];
        }
    } elseif (isset($_FILES['file'])) {
        if (is_array($_FILES['file']['name'])) {
            $count = count($_FILES['file']['name']);
            for ($i = 0; $i < $count; $i++) {
                if ($_FILES['file']['error'][$i] === UPLOAD_ERR_OK) {
                    $files[] = [
                        'name' => $_FILES['file']['name'][$i],
                        'tmp_name' => $_FILES['file']['tmp_name'][$i],
                        'type' => $_FILES['file']['type'][$i],
                        'size' => $_FILES['file']['size'][$i],
                    ];
                }
            }
        } else if ($_FILES['file']['error'] === UPLOAD_ERR_OK) {
            $files[] = $_FILES['file'];
        }
    }

    if (empty($files)) {
        sendResponse(['status' => 'error', 'message' => 'No files uploaded or upload exceeded file size limit.'], 400);
    }

    $dropX = isset($_POST['x']) ? (float)$_POST['x'] : 0.0;
    $dropY = isset($_POST['y']) ? (float)$_POST['y'] : 0.0;
    $clientPosterBase64 = isset($_POST['poster']) ? $_POST['poster'] : null;

    $ffmpegBin = findFfmpeg();
    $newItems = [];
    $offsetIdx = 0;

    foreach ($files as $file) {
        $rawName = $file['name'];
        $tmpPath = $file['tmp_name'];
        $ext = strtolower(pathinfo($rawName, PATHINFO_EXTENSION));
        $title = cleanTitle($rawName);

        $isImage = in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'heic']);
        $isVideo = in_array($ext, ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v']);

        // Generate unique ID & filename base
        $uniqueId = 'drop_' . time() . '_' . substr(md5(uniqid(rand(), true)), 0, 6);
        
        // Compute staggered coordinate if multiple files dropped together
        $targetX = $dropX + ($offsetIdx % 4) * 80 + rand(-20, 20);
        $targetY = $dropY + floor($offsetIdx / 4) * 80 + rand(-20, 20);
        $rotation = round((rand(-25, 25) / 10.0), 1); // Subtle -2.5deg to +2.5deg tilt

        if ($isImage) {
            $destWebpName = $uniqueId . '.webp';
            $destWebpPath = $stillsUploadDir . '/' . $destWebpName;

            $dimensions = processAndSaveImageToWebp($tmpPath, $destWebpPath, 2048, 84);

            if ($dimensions) {
                $imgW = $dimensions['width'];
                $imgH = $dimensions['height'];
                $isVertical = $imgH > $imgW;

                // Scale card width and height to look balanced in moodboard
                if ($isVertical) {
                    $cardH = 380;
                    $cardW = (int)round($cardH * ($imgW / $imgH));
                } else {
                    $cardW = 340;
                    $cardH = (int)round($cardW * ($imgH / $imgW));
                }

                $item = [
                    'id' => $uniqueId,
                    'type' => 'image',
                    'title' => $title,
                    'img_src' => 'stills/uploads/' . $destWebpName,
                    'x' => $targetX,
                    'y' => $targetY,
                    'w' => $cardW,
                    'h' => $cardH,
                    'rotation' => $rotation,
                    'is_vertical' => $isVertical,
                    'created_at' => time()
                ];
                $newItems[] = $item;
                $offsetIdx++;
            }
        } elseif ($isVideo) {
            $destMp4Name = $uniqueId . '.mp4';
            $destMp4Path = $videosUploadDir . '/' . $destMp4Name;
            $destPosterName = $uniqueId . '_poster.webp';
            $destPosterPath = $stillsUploadDir . '/' . $destPosterName;

            $posterCreated = false;
            $vidW = 1920;
            $vidH = 1080;

            // 1. Process Video Compression
            if ($ffmpegBin) {
                // Compress video to web-ready H.264 MP4 with faststart
                $cmd = "$ffmpegBin -y -i " . escapeshellarg($tmpPath) . " -c:v libx264 -crf 26 -preset fast -vf \"scale='min(1920,iw)':-2\" -c:a aac -b:a 128k -movflags +faststart " . escapeshellarg($destMp4Path) . " 2>&1";
                @shell_exec($cmd);

                // Extract poster frame at 1s or 0s
                $posterTempJpg = tempnam(sys_get_temp_dir(), 'poster_') . '.jpg';
                $posterCmd = "$ffmpegBin -y -ss 00:00:01 -i " . escapeshellarg($tmpPath) . " -vframes 1 -q:v 2 " . escapeshellarg($posterTempJpg) . " 2>&1";
                @shell_exec($posterCmd);

                if (file_exists($posterTempJpg) && filesize($posterTempJpg) > 0) {
                    $dim = processAndSaveImageToWebp($posterTempJpg, $destPosterPath, 1280, 82);
                    if ($dim) {
                        $vidW = $dim['width'];
                        $vidH = $dim['height'];
                        $posterCreated = true;
                    }
                    @unlink($posterTempJpg);
                }
            }

            // Fallback for video saving if FFmpeg wasn't available or failed
            if (!file_exists($destMp4Path) || filesize($destMp4Path) === 0) {
                @move_uploaded_file($tmpPath, $destMp4Path);
            }

            // Fallback for poster from client base64 snapshot
            if (!$posterCreated && $clientPosterBase64) {
                $dim = saveBase64PosterToWebp($clientPosterBase64, $destPosterPath);
                if ($dim) {
                    $vidW = $dim['width'];
                    $vidH = $dim['height'];
                    $posterCreated = true;
                }
            }

            // Final fallback placeholder poster if none created
            if (!$posterCreated || !file_exists($destPosterPath)) {
                $destPosterName = '';
            }

            $isVertical = $vidH > $vidW;
            if ($isVertical) {
                $cardW = 280;
                $cardH = (int)round($cardW * ($vidH / $vidW));
            } else {
                $cardW = 460;
                $cardH = (int)round($cardW * ($vidH / $vidW));
            }

            $item = [
                'id' => $uniqueId,
                'type' => 'video',
                'title' => $title,
                'video_src' => 'videos/uploads/' . $destMp4Name,
                'poster_src' => $destPosterName ? 'stills/uploads/' . $destPosterName : '',
                'x' => $targetX,
                'y' => $targetY,
                'w' => $cardW,
                'h' => $cardH,
                'rotation' => $rotation,
                'is_vertical' => $isVertical,
                'created_at' => time()
            ];
            $newItems[] = $item;
            $offsetIdx++;
        }
    }

    if (empty($newItems)) {
        sendResponse(['status' => 'error', 'message' => 'Could not process uploaded files as valid WebP or MP4.'], 500);
    }

    // Append newly created items to the master board data
    $boardData = loadBoardData();
    foreach ($newItems as $it) {
        $boardData['items'][] = $it;
        $boardData['positions'][$it['id']] = [
            'x' => $it['x'],
            'y' => $it['y'],
            'rot' => $it['rotation'],
            'z' => 50
        ];
    }
    saveBoardData($boardData);

    sendResponse([
        'status' => 'ok',
        'uploadedCount' => count($newItems),
        'items' => $newItems,
        'message' => 'Mediji su uspješno kompresirani i spremljeni na poslužitelj.'
    ]);
}

sendResponse(['status' => 'error', 'message' => 'Invalid action'], 400);
