<?php
class MediaProcessor {
    private $uploadsDir;

    public function __construct($uploadsDir = null) {
        $this->uploadsDir = $uploadsDir ?: __DIR__ . '/../../data/uploads';
        if (!is_dir($this->uploadsDir)) mkdir($this->uploadsDir, 0777, true);
    }

    public function processFile($tmpName, $originalName, $type) {
        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $hash = md5_file($tmpName) . '_' . time();
        
        if (strpos($type, 'image/') === 0) {
            $dest = $this->uploadsDir . "/{$hash}.webp";
            $this->processImage($tmpName, $dest);
            return [
                'type' => 'image',
                'url' => 'data/uploads/' . basename($dest)
            ];
        } else if (strpos($type, 'video/') === 0) {
            $destVideo = $this->uploadsDir . "/{$hash}.mp4";
            $destPoster = $this->uploadsDir . "/{$hash}_poster.jpg";
            $this->processVideo($tmpName, $destVideo, $destPoster);
            return [
                'type' => 'video',
                'url' => 'data/uploads/' . basename($destVideo),
                'poster' => 'data/uploads/' . basename($destPoster)
            ];
        }
        return false;
    }

    private function processImage($src, $dest) {
        $info = getimagesize($src);
        if (!$info) return false;
        
        $img = null;
        switch ($info[2]) {
            case IMAGETYPE_JPEG: $img = imagecreatefromjpeg($src); break;
            case IMAGETYPE_PNG: $img = imagecreatefrompng($src); break;
            case IMAGETYPE_GIF: $img = imagecreatefromgif($src); break;
            case IMAGETYPE_WEBP: $img = imagecreatefromwebp($src); break;
        }
        
        if (!$img) return false;

        // handle EXIF orientation
        if ($info[2] == IMAGETYPE_JPEG && function_exists('exif_read_data')) {
            $exif = @exif_read_data($src);
            if (!empty($exif['Orientation'])) {
                switch ($exif['Orientation']) {
                    case 3: $img = imagerotate($img, 180, 0); break;
                    case 6: $img = imagerotate($img, -90, 0); break;
                    case 8: $img = imagerotate($img, 90, 0); break;
                }
            }
        }
        
        // Preserve alpha
        imagepalettetotruecolor($img);
        imagealphablending($img, true);
        imagesavealpha($img, true);
        
        imagewebp($img, $dest, 85);
        imagedestroy($img);
    }

    private function processVideo($src, $dest, $posterDest) {
        // use ffmpeg if available, otherwise just copy
        exec("ffmpeg -version", $output, $return_var);
        if ($return_var === 0) {
            // compress video
            exec("ffmpeg -i " . escapeshellarg($src) . " -vcodec libx264 -crf 26 -preset fast -movflags +faststart -y " . escapeshellarg($dest));
            // extract poster
            exec("ffmpeg -i " . escapeshellarg($dest) . " -vframes 1 -q:v 2 " . escapeshellarg($posterDest));
        } else {
            copy($src, $dest);
        }
    }
}
