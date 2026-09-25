<?php
class ArchiveService {
    private $dataDir;

    public function __construct($dataDir = null) {
        $this->dataDir = $dataDir ?: __DIR__ . '/../../data';
    }

    public function exportArchive($boardId, $boardData) {
        $zip = new ZipArchive();
        $zipFile = sys_get_temp_dir() . "/board_{$boardId}_" . time() . ".zip";
        
        if ($zip->open($zipFile, ZipArchive::CREATE) !== TRUE) {
            return false;
        }
        
        // Add JSON
        $zip->addFromString('board.json', json_encode($boardData, JSON_PRETTY_PRINT));
        
        // Add assets
        if (isset($boardData['items'])) {
            foreach ($boardData['items'] as $item) {
                if (isset($item['content'])) {
                    if (strpos($item['content'], 'data/uploads/') === 0) {
                        $path = __DIR__ . '/../../' . $item['content'];
                        if (file_exists($path)) {
                            $zip->addFile($path, $item['content']);
                        }
                    }
                }
            }
        }
        
        $zip->close();
        return $zipFile;
    }

    public function importArchive($zipFile) {
        // basic import logic
        return false;
    }
}
