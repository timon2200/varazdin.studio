<?php
/**
 * Studio Varaždin — BoardStorage Service
 * Handles multi-board persistence, atomic file locking with flock,
 * built-in presets, and registry management.
 */

class BoardStorage {
    private $dataDir;
    private $boardsDir;
    private $registryFile;
    private $defaultBoardFile;
    
    private $builtinBoards = [
        'vudrag' => [
            'id' => 'vudrag',
            'name' => 'Nikola Vudrag Master Film',
            'title' => 'Nikola Vudrag Master Film',
            'description' => 'Cinematic spatial moodboard sa svim kadrovima taljenja, Tesle i ateljea',
            'isBuiltin' => true
        ],
        'trakoscan' => [
            'id' => 'trakoscan',
            'name' => 'Trakošćan Heritage & Pejzaž',
            'title' => 'Trakošćan Heritage & Pejzaž',
            'description' => 'Dvorac Trakošćan, jezero, jesenske refleksije i neogotička arhitektura',
            'isBuiltin' => true
        ],
        'garda' => [
            'id' => 'garda',
            'name' => 'Varaždinska Građanska Garda',
            'title' => 'Varaždinska Građanska Garda',
            'description' => 'Povijesne uniforme Purgara, cehovski cimeri i barokna straža',
            'isBuiltin' => true
        ],
        'streetwear' => [
            'id' => 'streetwear',
            'name' => 'Studio Varaždin Streetwear',
            'title' => 'Studio Varaždin Streetwear',
            'description' => 'Grafički dizajni majica, kameni vitezovi, glagoljica i brutalizam',
            'isBuiltin' => true
        ]
    ];

    public function __construct($dataDir = null) {
        $this->dataDir = $dataDir ?: __DIR__ . '/../../data';
        $this->boardsDir = $this->dataDir . '/boards';
        $this->registryFile = $this->dataDir . '/boards_registry.json';
        $this->defaultBoardFile = $this->dataDir . '/default_board.json';
        
        if (!is_dir($this->dataDir)) @mkdir($this->dataDir, 0755, true);
        if (!is_dir($this->boardsDir)) @mkdir($this->boardsDir, 0755, true);
        
        $this->ensureBuiltinRegistry();
    }

    private function ensureBuiltinRegistry() {
        $registry = $this->getRegistry();
        $updated = false;
        foreach ($this->builtinBoards as $id => $info) {
            if (!isset($registry[$id])) {
                $registry[$id] = [
                    'id' => $id,
                    'name' => $info['name'],
                    'title' => $info['title'],
                    'description' => $info['description'],
                    'isBuiltin' => true,
                    'created_at' => time()
                ];
                $updated = true;
            }
        }
        if ($updated) {
            $this->saveRegistry($registry);
        }
    }

    private function getRegistry() {
        if (!file_exists($this->registryFile)) return [];
        $raw = @file_get_contents($this->registryFile);
        return $raw ? json_decode($raw, true) ?: [] : [];
    }

    private function saveRegistry($data) {
        $fp = @fopen($this->registryFile, 'c+');
        if ($fp && flock($fp, LOCK_EX)) {
            ftruncate($fp, 0);
            fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            fflush($fp);
            flock($fp, LOCK_UN);
            fclose($fp);
            return true;
        }
        if ($fp) fclose($fp);
        return false;
    }

    public function listBoards() {
        $reg = $this->getRegistry();
        $list = [];
        foreach ($reg as $id => $b) {
            $boardData = $this->getBoard($id);
            $list[] = [
                'id' => $id,
                'title' => isset($b['title']) ? $b['title'] : (isset($b['name']) ? $b['name'] : ucfirst($id)),
                'name' => isset($b['name']) ? $b['name'] : ucfirst($id),
                'description' => isset($b['description']) ? $b['description'] : '',
                'isBuiltin' => !empty($b['isBuiltin']),
                'itemCount' => count(isset($boardData['items']) ? $boardData['items'] : []),
                'created_at' => isset($b['created_at']) ? $b['created_at'] : time()
            ];
        }
        return $list;
    }

    public function createBoard($name) {
        $cleanId = 'board_' . time() . '_' . substr(md5($name . rand()), 0, 4);
        $registry = $this->getRegistry();
        $registry[$cleanId] = [
            'id' => $cleanId,
            'name' => $name,
            'title' => $name,
            'description' => 'Korisnički stvorena ploča',
            'isBuiltin' => false,
            'created_at' => time()
        ];
        $this->saveRegistry($registry);
        $this->saveBoard($cleanId, ['items' => [], 'positions' => []]);
        return $registry[$cleanId];
    }
    
    public function updateBoard($id, $name) {
        $registry = $this->getRegistry();
        if (isset($registry[$id])) {
            $registry[$id]['name'] = $name;
            $registry[$id]['title'] = $name;
            $this->saveRegistry($registry);
            return $registry[$id];
        }
        return false;
    }

    public function deleteBoard($id) {
        if (isset($this->builtinBoards[$id]) || $id === 'vudrag' || $id === 'default') {
            return false;
        }
        $registry = $this->getRegistry();
        if (isset($registry[$id])) {
            unset($registry[$id]);
            $this->saveRegistry($registry);
            $file = $this->boardsDir . "/{$id}.json";
            if (file_exists($file)) @unlink($file);
            return true;
        }
        return false;
    }

    public function getBoard($id) {
        if (!$id || $id === 'default') $id = 'vudrag';
        $file = $this->boardsDir . "/{$id}.json";

        if (!file_exists($file)) {
            // Load preset
            if ($id === 'vudrag') {
                $defaultItems = [];
                if (file_exists($this->defaultBoardFile)) {
                    $raw = @file_get_contents($this->defaultBoardFile);
                    if ($raw) $defaultItems = json_decode($raw, true) ?: [];
                }
                $initial = [
                    'id' => 'vudrag',
                    'title' => 'Nikola Vudrag Master Film',
                    'items' => $defaultItems,
                    'positions' => []
                ];
                $this->saveBoard($id, $initial);
                return $initial;
            } elseif ($id === 'trakoscan') {
                $initial = [
                    'id' => 'trakoscan',
                    'title' => 'Trakošćan Heritage & Pejzaž',
                    'items' => [
                        ['id' => 'trakoscan_jesen', 'type' => 'image', 'title' => 'Trakošćan Jesenski Odraz', 'img_src' => 'assets/boards/trakoscan_dvorac_jesen_odraz_jezero.jpg', 'x' => -350, 'y' => -20, 'w' => 460, 'h' => 310, 'rotation' => -1.2],
                        ['id' => 'trakoscan_krosnje', 'type' => 'image', 'title' => 'Trakošćan Kroz Krošnje', 'img_src' => 'assets/boards/trakoscan_dvorac_kroz_krosnje.jpg', 'x' => 150, 'y' => -180, 'w' => 380, 'h' => 480, 'rotation' => 1.8],
                        ['id' => 'trakoscan_ljeto', 'type' => 'image', 'title' => 'Trakošćan Ljetni Pejzaž', 'img_src' => 'assets/boards/trakoscan_dvorac_ljetni_pejzaz.jpg', 'x' => 580, 'y' => 120, 'w' => 440, 'h' => 290, 'rotation' => -0.8]
                    ],
                    'positions' => []
                ];
                $this->saveBoard($id, $initial);
                return $initial;
            } elseif ($id === 'garda') {
                $initial = [
                    'id' => 'garda',
                    'title' => 'Varaždinska Građanska Garda',
                    'items' => [
                        ['id' => 'garda_uniforma', 'type' => 'image', 'title' => 'Varaždinska Građanska Garda', 'img_src' => 'assets/boards/gradanska garda.jpeg', 'x' => -220, 'y' => -40, 'w' => 380, 'h' => 480, 'rotation' => -1.5],
                        ['id' => 'garda_stari_grad', 'type' => 'image', 'title' => 'Stari Grad Bedemi', 'img_src' => 'assets/boards/stari grad castle.jpeg', 'x' => 240, 'y' => -10, 'w' => 450, 'h' => 300, 'rotation' => 1.2]
                    ],
                    'positions' => []
                ];
                $this->saveBoard($id, $initial);
                return $initial;
            } elseif ($id === 'streetwear') {
                $initial = [
                    'id' => 'streetwear',
                    'title' => 'Studio Varaždin Streetwear',
                    'items' => [
                        ['id' => 'streetwear_knight', 'type' => 'image', 'title' => 'The Lovers Betrayal — Kneeling Martyr', 'img_src' => 'assets/boards/SV_Lovers_03_Kneeling_Martyr_Back.png', 'x' => -320, 'y' => -30, 'w' => 360, 'h' => 460, 'rotation' => -1.0],
                        ['id' => 'streetwear_florijan', 'type' => 'image', 'title' => 'St. Florian 1776 Disaster Spec', 'img_src' => 'assets/boards/Heritage_Combo_01_Florijan_Brutalist_Back.png', 'x' => 120, 'y' => -30, 'w' => 360, 'h' => 460, 'rotation' => 1.5],
                        ['id' => 'streetwear_woodcut', 'type' => 'image', 'title' => 'Pure Woodcut Galloping Knight', 'img_src' => 'assets/boards/SV_Single_01_Woodcut_Knight_Back.png', 'x' => 560, 'y' => -30, 'w' => 360, 'h' => 460, 'rotation' => -0.5]
                    ],
                    'positions' => []
                ];
                $this->saveBoard($id, $initial);
                return $initial;
            } else {
                $initial = ['id' => $id, 'title' => ucfirst($id), 'items' => [], 'positions' => []];
                $this->saveBoard($id, $initial);
                return $initial;
            }
        }

        $fp = @fopen($file, 'r');
        if (!$fp) return null;
        flock($fp, LOCK_SH);
        $size = filesize($file);
        $content = $size > 0 ? fread($fp, $size) : '';
        flock($fp, LOCK_UN);
        fclose($fp);

        return $content ? json_decode($content, true) : null;
    }

    public function saveBoard($id, $data) {
        if (!$id || $id === 'default') $id = 'vudrag';
        $file = $this->boardsDir . "/{$id}.json";
        $data['id'] = $id;
        $data['lastModified'] = time();
        
        $fp = fopen($file, 'c+');
        if ($fp && flock($fp, LOCK_EX)) {
            ftruncate($fp, 0);
            fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            fflush($fp);
            flock($fp, LOCK_UN);
            fclose($fp);
            return true;
        }
        if ($fp) fclose($fp);
        return false;
    }
}
