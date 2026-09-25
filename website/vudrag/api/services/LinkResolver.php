<?php
class LinkResolver {
    private $uploadsDir;

    public function __construct($uploadsDir = null) {
        $this->uploadsDir = $uploadsDir ?: __DIR__ . '/../../data/uploads';
        if (!is_dir($this->uploadsDir)) {
            @mkdir($this->uploadsDir, 0777, true);
        }
    }

    public function resolve($url) {
        // basic SSRF check
        $scheme = strtolower(parse_url($url, PHP_URL_SCHEME) ?: '');
        if ($scheme !== 'http' && $scheme !== 'https') return false;
        $host = parse_url($url, PHP_URL_HOST);
        if (!$host) return false;
        
        $addresses = gethostbynamel($host);
        if (!$addresses) return false;
        foreach ($addresses as $ip) {
            if ($this->isPrivateIp($ip)) return false;
        }

        $normalizedHost = preg_replace('/^www\./', '', strtolower($host));
        $path = parse_url($url, PHP_URL_PATH) ?: '';
        $query = parse_url($url, PHP_URL_QUERY) ?: '';

        // 1. YouTube
        if (in_array($normalizedHost, ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'youtu.be'], true)) {
            $yt = $this->resolveYouTube($url, $normalizedHost, $path, $query);
            if ($yt) return $yt;
        }

        // 2. Pinterest
        if (strpos($normalizedHost, 'pinterest') !== false || strpos($normalizedHost, 'pin.it') !== false) {
            $pin = $this->resolvePinterest($url, $normalizedHost);
            if ($pin) return $pin;
        }

        // 3. Instagram
        if (strpos($normalizedHost, 'instagram.com') !== false || strpos($normalizedHost, 'instagr.am') !== false) {
            $ig = $this->resolveInstagram($url, $path);
            if ($ig) return $ig;
        }

        // 4. TikTok
        if (strpos($normalizedHost, 'tiktok.com') !== false) {
            $tt = $this->resolveTikTok($url);
            if ($tt) return $tt;
        }

        // 5. Vimeo
        if (in_array($normalizedHost, ['vimeo.com', 'player.vimeo.com'], true)) {
            $vm = $this->resolveVimeo($url, $path);
            if ($vm) return $vm;
        }

        // 6. Direct Image Media
        $isImg = preg_match('/\.(jpe?g|png|webp|gif|svg|avif|bmp|tiff?|ico)$/i', $path) ||
                 preg_match('/(?:format|fm|ext)=(?:jpe?g|png|webp|gif|avif)/i', $query);
        if ($isImg) {
            $cached = $this->downloadAndCacheImage($url);
            if ($cached) return $cached;
            return [
                'type' => 'image',
                'url' => $url,
                'title' => basename($path) ?: 'Image',
                'img_src' => $url,
                'original_url' => $url,
                'w' => 380,
                'h' => 280,
                'rotation' => 0
            ];
        }

        // 7. Direct Video Media
        if (preg_match('/\.(mp4|webm|mov|m4v|mkv|avi)$/i', $path)) {
            return [
                'type' => 'video',
                'url' => $url,
                'title' => basename($path) ?: 'Video',
                'video_src' => $url,
                'original_url' => $url,
                'w' => 440,
                'h' => 260,
                'rotation' => 0
            ];
        }

        // 8. OpenGraph fallback
        return $this->resolveOpenGraph($url, $normalizedHost, $path);
    }

    private function resolveYouTube($url, $host, $path, $query) {
        $youtubeId = '';
        if ($host === 'youtu.be') {
            $parts = array_values(array_filter(explode('/', $path), 'strlen'));
            $youtubeId = $parts[0] ?? '';
        } else {
            parse_str($query, $queryArr);
            $youtubeId = $queryArr['v'] ?? '';
            if (!$youtubeId && preg_match('/\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{11})/', $path, $m)) {
                $youtubeId = $m[1];
            }
        }
        if (!preg_match('/^[A-Za-z0-9_-]{11}$/', $youtubeId)) return false;

        $isShorts = strpos($path, '/shorts/') !== false;
        $title = "YouTube: {$youtubeId}";

        // oEmbed for title
        $oembedData = $this->fetchJson("https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={$youtubeId}&format=json");
        if ($oembedData && !empty($oembedData['title'])) {
            $title = $oembedData['title'];
        }

        $cached = $this->downloadAndCacheImage("https://img.youtube.com/vi/{$youtubeId}/maxresdefault.jpg") ?:
                  $this->downloadAndCacheImage("https://img.youtube.com/vi/{$youtubeId}/hqdefault.jpg");

        $posterUrl = $cached ? $cached['img_src'] : "https://img.youtube.com/vi/{$youtubeId}/hqdefault.jpg";

        return [
            'type' => 'youtube',
            'embed_type' => 'youtube',
            'url' => $url,
            'original_url' => $url,
            'videoId' => $youtubeId,
            'title' => $title,
            'img_src' => $posterUrl,
            'poster' => $posterUrl,
            'w' => $isShorts ? 300 : 440,
            'h' => $isShorts ? 533 : 260,
            'rotation' => 0
        ];
    }

    private function resolvePinterest($url, $host) {
        if (strpos($host, 'pinimg.com') !== false) {
            $orig = preg_replace('/\/(?:236x|474x|564x|736x)\//i', '/originals/', $url);
            $cached = $this->downloadAndCacheImage($orig) ?: $this->downloadAndCacheImage($url);
            if ($cached) return $cached;
        }

        $html = $this->fetchHtml($url);
        if (!$html) return false;

        if (preg_match_all('/https:\/\/i\.pinimg\.com\/(?:originals|736x|564x|474x|1200x)\/[a-zA-Z0-9_\/.\-]+\.(?:jpe?g|png|webp)/i', $html, $matches)) {
            $images = array_unique($matches[0]);
            $original = null;
            foreach ($images as $img) {
                if (strpos($img, '/originals/') !== false) { $original = $img; break; }
            }
            $targetImg = $original ?: ($images[0] ?? '');
            if ($targetImg) {
                $cached = $this->downloadAndCacheImage($targetImg);
                if ($cached) {
                    $title = 'Pinterest Pin';
                    if (preg_match('/<meta\s+property=["\']og:title["\']\s+content=["\']([^"\']+)["\']/i', $html, $tm)) {
                        $title = trim(preg_replace('/\s*\|\s*Pinterest.*$/i', '', html_entity_decode($tm[1])));
                    }
                    $cached['title'] = $title;
                    $cached['original_url'] = $url;
                    return $cached;
                }
            }
        }
        return false;
    }

    private function resolveInstagram($url, $path) {
        if (!preg_match('/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/', $path, $m)) return false;
        $shortcode = $m[1];

        // oEmbed
        $oembed = $this->fetchJson("https://api.instagram.com/oembed?url=" . urlencode("https://www.instagram.com/p/{$shortcode}/"));
        if ($oembed && !empty($oembed['thumbnail_url'])) {
            $cached = $this->downloadAndCacheImage($oembed['thumbnail_url']);
            if ($cached) {
                $cached['title'] = $oembed['title'] ?? "Instagram @{$shortcode}";
                $cached['original_url'] = $url;
                return $cached;
            }
        }

        // Embed page scraping
        $html = $this->fetchHtml("https://www.instagram.com/p/{$shortcode}/embed/captioned/");
        if ($html) {
            $decoded = str_replace(['\u0026', '&amp;'], '&', $html);
            if (preg_match('/class=["\']EmbeddedMediaImage["\'][^>]*src=["\']([^"\']+)["\']/', $decoded, $im) ||
                preg_match('/https:\/\/[^"\'\s<>]+\.(?:cdninstagram\.com|fbcdn\.net)[^"\'\s<>]+\.(?:jpe?g|png|webp)/i', $decoded, $im)) {
                $imgUrl = $im[1] ?? $im[0];
                $cached = $this->downloadAndCacheImage($imgUrl);
                if ($cached) {
                    $cached['title'] = "Instagram @{$shortcode}";
                    $cached['original_url'] = $url;
                    return $cached;
                }
            }
        }
        return false;
    }

    private function resolveTikTok($url) {
        $oembed = $this->fetchJson("https://www.tiktok.com/oembed?url=" . urlencode($url));
        if ($oembed && !empty($oembed['thumbnail_url'])) {
            $cached = $this->downloadAndCacheImage($oembed['thumbnail_url']);
            if ($cached) {
                $cached['title'] = $oembed['title'] ?? ("TikTok @" . ($oembed['author_name'] ?? 'video'));
                $cached['original_url'] = $url;
                $cached['w'] = 300;
                $cached['h'] = 533;
                return $cached;
            }
        }
        return false;
    }

    private function resolveVimeo($url, $path) {
        $parts = array_values(array_filter(explode('/', $path), 'strlen'));
        $videoId = end($parts);
        if (!preg_match('/^\d+$/', (string)$videoId)) return false;

        $title = "Vimeo: {$videoId}";
        $poster = "https://vumbnail.com/{$videoId}.jpg";
        $oembed = $this->fetchJson("https://vimeo.com/api/oembed.json?url=https://vimeo.com/{$videoId}");
        if ($oembed) {
            if (!empty($oembed['title'])) $title = $oembed['title'];
            if (!empty($oembed['thumbnail_url'])) $poster = $oembed['thumbnail_url'];
        }

        $cached = $this->downloadAndCacheImage($poster);
        $posterUrl = $cached ? $cached['img_src'] : $poster;

        return [
            'type' => 'vimeo',
            'url' => $url,
            'original_url' => $url,
            'videoId' => $videoId,
            'title' => $title,
            'img_src' => $posterUrl,
            'poster' => $posterUrl,
            'w' => 440,
            'h' => 260,
            'rotation' => 0
        ];
    }

    private function resolveOpenGraph($url, $host, $path) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 3);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9'
        ]);

        $html = @curl_exec($ch);
        $contentType = strtolower((string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
        $effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL) ?: $url;
        curl_close($ch);

        if (strpos($contentType, 'image/') === 0) {
            $cached = $this->downloadAndCacheImage($effectiveUrl);
            if ($cached) return $cached;
            return ['type' => 'image', 'url' => $effectiveUrl, 'title' => basename($path) ?: 'Image',
                'img_src' => $effectiveUrl, 'original_url' => $url, 'w' => 380, 'h' => 280, 'rotation' => 0];
        }
        if (strpos($contentType, 'video/') === 0) {
            return ['type' => 'video', 'url' => $effectiveUrl, 'title' => basename($path) ?: 'Video',
                'video_src' => $effectiveUrl, 'original_url' => $url, 'w' => 440, 'h' => 260, 'rotation' => 0];
        }

        if ($html) {
            $ogImage = '';
            $ogTitle = '';
            if (preg_match_all('/<meta\b[^>]*>/i', $html, $tags)) {
                foreach ($tags[0] as $tag) {
                    $attrs = [];
                    if (preg_match_all('/([\w:-]+)\s*=\s*(["\'])(.*?)\2/i', $tag, $pairs, PREG_SET_ORDER)) {
                        foreach ($pairs as $pair) $attrs[strtolower($pair[1])] = $pair[3];
                    }
                    $name = strtolower($attrs['property'] ?? $attrs['name'] ?? '');
                    if (!$ogImage && in_array($name, ['og:image', 'twitter:image', 'twitter:image:src'], true)) $ogImage = $attrs['content'] ?? '';
                    if (!$ogTitle && in_array($name, ['og:title', 'twitter:title'], true)) $ogTitle = $attrs['content'] ?? '';
                }
            }
            if (!$ogTitle && preg_match('/<title>([^<]+)<\/title>/i', $html, $tm)) {
                $ogTitle = trim($tm[1]);
            }
            
            if ($ogImage) {
                $ogImage = html_entity_decode($ogImage, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                $scheme = strtolower(parse_url($url, PHP_URL_SCHEME) ?: 'https');
                if (strpos($ogImage, '//') === 0) $ogImage = $scheme . ':' . $ogImage;
                elseif (strpos($ogImage, '/') === 0) $ogImage = $scheme . '://' . $host . $ogImage;
                elseif (!preg_match('/^https?:\/\//i', $ogImage)) {
                    $basePath = rtrim(dirname($path), '/.');
                    $ogImage = $scheme . '://' . $host . $basePath . '/' . $ogImage;
                }
                $cached = $this->downloadAndCacheImage($ogImage);
                $finalPoster = $cached ? $cached['img_src'] : $ogImage;
                return [
                    'type' => 'link',
                    'url' => $url,
                    'original_url' => $url,
                    'title' => $ogTitle ?: $url,
                    'poster' => $finalPoster,
                    'img_src' => $finalPoster,
                    'w' => $cached ? $cached['w'] : 360,
                    'h' => $cached ? $cached['h'] : 240,
                    'rotation' => 0
                ];
            }
        }
        
        return [
            'type' => 'link',
            'url' => $url,
            'original_url' => $url,
            'title' => $host,
            'w' => 360,
            'h' => 240,
            'rotation' => 0
        ];
    }

    private function fetchHtml($url) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 4);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9'
        ]);
        $out = @curl_exec($ch);
        curl_close($ch);
        return $out;
    }

    private function fetchJson($url) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0');
        $data = @curl_exec($ch);
        curl_close($ch);
        if (!$data) return null;
        return json_decode($data, true);
    }

    private function downloadAndCacheImage($url) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 3);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
            'Sec-Fetch-Dest: image',
            'Sec-Fetch-Mode: no-cors',
            'Sec-Fetch-Site: cross-site'
        ]);

        $imageData = @curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = strtolower((string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
        curl_close($ch);

        if ($httpCode !== 200 || empty($imageData)) {
            return false;
        }

        $hash = substr(md5($imageData), 0, 16) . '_' . time();
        $ext = '.jpg';
        if (strpos($contentType, 'image/png') !== false) $ext = '.png';
        elseif (strpos($contentType, 'image/webp') !== false) $ext = '.webp';
        elseif (strpos($contentType, 'image/gif') !== false) $ext = '.gif';
        elseif (strpos($contentType, 'image/svg') !== false) $ext = '.svg';
        else {
            $path = parse_url($url, PHP_URL_PATH) ?: '';
            $pathExt = strtolower(pathinfo($path, PATHINFO_EXTENSION));
            if (in_array($pathExt, ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'], true)) {
                $ext = ($pathExt === 'jpeg') ? '.jpg' : '.' . $pathExt;
            }
        }

        $filename = "link_{$hash}{$ext}";
        $destPath = $this->uploadsDir . '/' . $filename;
        @file_put_contents($destPath, $imageData);

        $baseW = 380;
        $w = $baseW;
        $h = 280;
        $size = @getimagesize($destPath);
        if ($size && !empty($size[0]) && !empty($size[1])) {
            $h = max(140, min(640, (int) round($baseW * ($size[1] / $size[0]))));
        }

        return [
            'type' => 'image',
            'title' => basename(parse_url($url, PHP_URL_PATH) ?: 'Image'),
            'url' => 'data/uploads/' . $filename,
            'img_src' => 'data/uploads/' . $filename,
            'original_url' => $url,
            'w' => $w,
            'h' => $h,
            'rotation' => 0
        ];
    }

    private function isPrivateIp($ip) {
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
    }
}
