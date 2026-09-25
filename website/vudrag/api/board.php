<?php
/**
 * Studio Varaždin — Spatial Moodboard API Controller
 * Modular architecture using services.
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

require_once __DIR__ . '/services/BoardStorage.php';
require_once __DIR__ . '/services/MediaProcessor.php';
require_once __DIR__ . '/services/LinkResolver.php';
require_once __DIR__ . '/services/ArchiveService.php';

$storage = new BoardStorage();
$media = new MediaProcessor();
$links = new LinkResolver();
$archive = new ArchiveService();

$input = json_decode(file_get_contents('php://input'), true);

$action = isset($_GET['action']) ? $_GET['action'] : '';
if (!$action && isset($_POST['action'])) {
    $action = $_POST['action'];
}
if (!$action && isset($input['action'])) {
    $action = $input['action'];
}

$boardId = isset($_GET['board']) ? $_GET['board'] : (isset($_POST['board']) ? $_POST['board'] : (isset($input['board']) ? $input['board'] : 'default'));

function sendResponse($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (!is_string($boardId) || !preg_match('/^[a-zA-Z0-9_-]{1,80}$/', $boardId)) {
    sendResponse(['status' => 'error', 'message' => 'Invalid board ID'], 400);
}

switch ($action) {
    case 'list_boards':
        sendResponse(['status' => 'ok', 'boards' => $storage->listBoards(), 'activeBoard' => $boardId]);
        break;

    case 'create_board':
        $title = isset($input['title']) ? trim($input['title']) : 'New Board';
        $board = $storage->createBoard($title);
        sendResponse(['status' => 'ok', 'board' => $board]);
        break;

    case 'update_board':
        $title = isset($input['title']) ? trim($input['title']) : '';
        if ($title && $storage->updateBoard($boardId, $title)) {
            sendResponse(['status' => 'ok', 'message' => 'Board updated']);
        } else {
            sendResponse(['status' => 'error', 'message' => 'Update failed'], 400);
        }
        break;

    case 'delete_board':
        if ($storage->deleteBoard($boardId)) {
            sendResponse(['status' => 'ok', 'deleted' => $boardId]);
        } else {
            sendResponse(['status' => 'error', 'message' => 'Could not delete board'], 400);
        }
        break;

    case 'get':
        $data = $storage->getBoard($boardId);
        if ($data !== null) {
            sendResponse(['status' => 'ok', 'boardId' => $boardId, 'board' => $data]);
        } else {
            sendResponse(['status' => 'error', 'message' => 'Board not found'], 404);
        }
        break;

    case 'save_positions':
        if (!isset($input['positions'])) sendResponse(['status' => 'error'], 400);
        $data = $storage->getBoard($boardId);
        if ($data) {
            if (!isset($data['positions'])) $data['positions'] = [];
            foreach ($input['positions'] as $id => $pos) {
                $data['positions'][$id] = $pos;
            }
            $storage->saveBoard($boardId, $data);
            sendResponse(['status' => 'ok', 'saved' => count($input['positions'])]);
        }
        sendResponse(['status' => 'error', 'message' => 'Board not found'], 404);
        break;

    case 'reset_positions':
        $data = $storage->getBoard($boardId);
        if ($data) {
            $data['positions'] = [];
            $storage->saveBoard($boardId, $data);
            sendResponse(['status' => 'ok']);
        }
        sendResponse(['status' => 'error', 'message' => 'Board not found'], 404);
        break;

    case 'add_link':
        $url = isset($input['url']) ? trim($input['url']) : '';
        if (!$url) sendResponse(['status' => 'error', 'message' => 'URL missing'], 400);
        
        $resolved = $links->resolve($url);
        if (!$resolved) sendResponse(['status' => 'error', 'message' => 'Invalid or protected URL'], 400);
        
        $resolved['id'] = 'link_' . time() . '_' . bin2hex(random_bytes(4));
        $resolved['x'] = isset($input['x']) ? $input['x'] : 0;
        $resolved['y'] = isset($input['y']) ? $input['y'] : 0;
        
        $data = $storage->getBoard($boardId);
        if ($data) {
            if (!isset($data['items'])) $data['items'] = [];
            $data['items'][] = $resolved;
            $storage->saveBoard($boardId, $data);
            sendResponse(['status' => 'ok', 'item' => $resolved]);
        }
        sendResponse(['status' => 'error'], 404);
        break;

    case 'delete_item':
        $itemId = isset($input['id']) ? $input['id'] : '';
        if (!$itemId) sendResponse(['status' => 'error', 'message' => 'Item ID missing'], 400);
        
        $data = $storage->getBoard($boardId);
        if ($data) {
            $data['items'] = array_values(array_filter($data['items'], function($item) use ($itemId) {
                return isset($item['id']) && $item['id'] !== $itemId;
            }));
            if (isset($data['positions'][$itemId])) {
                unset($data['positions'][$itemId]);
            }
            $storage->saveBoard($boardId, $data);
            sendResponse(['status' => 'ok', 'deleted' => $itemId]);
        }
        sendResponse(['status' => 'error'], 404);
        break;

    case 'reset_board':
        $data = $storage->getBoard($boardId);
        if ($data) {
            $data['items'] = [];
            $data['positions'] = [];
            $storage->saveBoard($boardId, $data);
            sendResponse(['status' => 'ok', 'message' => 'Board reset']);
        }
        sendResponse(['status' => 'error'], 404);
        break;

    case 'upload':
        if (!empty($_FILES['file'])) {
            $file = $_FILES['file'];
            $result = $media->processFile($file['tmp_name'], $file['name'], $file['type']);
            if ($result) {
                $result['id'] = 'media_' . time() . '_' . bin2hex(random_bytes(4));
                $result['x'] = isset($_POST['x']) ? (float)$_POST['x'] : 0;
                $result['y'] = isset($_POST['y']) ? (float)$_POST['y'] : 0;
                
                $data = $storage->getBoard($boardId);
                if ($data) {
                    if (!isset($data['items'])) $data['items'] = [];
                    $data['items'][] = $result;
                    $storage->saveBoard($boardId, $data);
                }
                
                sendResponse(['status' => 'ok', 'item' => $result]);
            }
            sendResponse(['status' => 'error', 'message' => 'Processing failed'], 500);
        }
        sendResponse(['status' => 'error', 'message' => 'No file'], 400);
        break;

    case 'export_archive':
        $data = $storage->getBoard($boardId);
        if ($data) {
            $zipPath = $archive->exportArchive($boardId, $data);
            if ($zipPath && file_exists($zipPath)) {
                header('Content-Type: application/zip');
                header('Content-Disposition: attachment; filename="board_' . $boardId . '.zip"');
                header('Content-Length: ' . filesize($zipPath));
                readfile($zipPath);
                unlink($zipPath);
                exit;
            }
        }
        sendResponse(['status' => 'error', 'message' => 'Export failed'], 500);
        break;

    case 'import_board':
        $items = isset($input['items']) ? $input['items'] : null;
        $positions = isset($input['positions']) ? $input['positions'] : [];
        if (!is_array($items) || count($items) > 500) {
            sendResponse(['status' => 'error', 'message' => 'Invalid item list'], 400);
        }
        if (!is_array($positions) || count($positions) > 500) {
            sendResponse(['status' => 'error', 'message' => 'Invalid positions'], 400);
        }
        foreach ($items as $item) {
            if (!is_array($item) || empty($item['id']) || empty($item['type'])) {
                sendResponse(['status' => 'error', 'message' => 'Invalid media item'], 400);
            }
        }
        $data = $storage->getBoard($boardId);
        if (!$data) sendResponse(['status' => 'error', 'message' => 'Board not found'], 404);
        $data['items'] = array_values($items);
        $data['positions'] = $positions;
        $storage->saveBoard($boardId, $data);
        sendResponse(['status' => 'ok', 'imported' => count($items)]);
        break;

    default:
        // default fallback if action not set but board is requested
        if ($_SERVER['REQUEST_METHOD'] === 'GET' && empty($action)) {
             $data = $storage->getBoard($boardId);
             if ($data !== null) {
                 sendResponse(['status' => 'ok', 'boardId' => $boardId, 'board' => $data]);
             }
        }
        sendResponse(['status' => 'error', 'message' => 'Unknown action'], 400);
}
