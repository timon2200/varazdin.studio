/**
 * Studio Varaždin — Local Dev & Testing Server
 * Zero external dependencies (uses native Node.js http, https, fs, path, url).
 * Full support for video range streaming (.mp4), WebP stills, and board API emulation.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const runFile = promisify(execFile);

const PORT = process.env.PORT || 8080;
const BASE_DIR = __dirname;
const ROOT_DIR = path.resolve(BASE_DIR, '../..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.zip': 'application/zip'
};

const DATA_DIR = path.join(BASE_DIR, 'data');
const BOARDS_DIR = path.join(DATA_DIR, 'boards');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BOARDS_DIR)) fs.mkdirSync(BOARDS_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

function sendJson(res, data, code = 200) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data, null, 2));
}

async function readUploadForm(req) {
  const maxBytes = 256 * 1024 * 1024;
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error('File exceeds the 256 MB upload limit');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const request = new Request('http://localhost/upload', {
    method: 'POST',
    headers: { 'content-type': req.headers['content-type'] || '' },
    body: Buffer.concat(chunks, total)
  });
  return request.formData();
}

function isPrivateIp(host) {
  return /^(127\.|192\.168\.|10\.|169\.254\.|0\.0\.0\.0|::1)/.test(host) || host === 'localhost';
}

function youtubeVideoId(url) {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  let id = '';
  if (host === 'youtu.be') id = parts[0] || '';
  else if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    id = url.searchParams.get('v') || (['shorts', 'live', 'embed', 'v'].includes(parts[0]) ? parts[1] : '') || '';
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
}

function getImageDimensions(buf) {
  if (!buf || buf.length < 24) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'png' };
  }
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), type: 'gif' };
  }
  // WebP
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
    const chunkType = buf.slice(12, 16).toString();
    if (chunkType === 'VP8 ' && buf.length >= 30) {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, type: 'webp' };
    }
    if (chunkType === 'VP8L' && buf.length >= 25) {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)), type: 'webp' };
    }
    if (chunkType === 'VP8X' && buf.length >= 30) {
      return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), type: 'webp' };
    }
  }
  // JPEG
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let offset = 2;
    while (offset < buf.length - 8) {
      if (buf[offset] !== 0xFF) { offset++; continue; }
      const marker = buf[offset + 1];
      if (marker === 0xD9 || marker === 0xDA) break;
      const len = buf.readUInt16BE(offset + 2);
      if ([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF].includes(marker)) {
        return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7), type: 'jpeg' };
      }
      offset += 2 + len;
    }
  }
  return null;
}

async function downloadAndCacheImage(mediaUrl, redirects = 0) {
  return new Promise((resolve) => {
    if (redirects > 3) return resolve(null);
    let parsed;
    try {
      parsed = new URL(mediaUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateIp(parsed.hostname)) return resolve(null);
    } catch (e) {
      return resolve(null);
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site'
      },
      timeout: 8000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        try {
          return resolve(downloadAndCacheImage(new URL(res.headers.location, parsed).href, redirects + 1));
        } catch (e) {
          return resolve(null);
        }
      }
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }

      const chunks = [];
      let totalBytes = 0;
      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes < 50 * 1024 * 1024) chunks.push(chunk);
      });
      res.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          if (buffer.length === 0) return resolve(null);

          const dims = getImageDimensions(buffer);
          let ext = '.png';
          if (dims && dims.type) {
            ext = dims.type === 'jpeg' ? '.jpg' : `.${dims.type}`;
          } else {
            const ct = (res.headers['content-type'] || '').toLowerCase();
            if (ct.includes('jpeg') || ct.includes('jpg')) ext = '.jpg';
            else if (ct.includes('webp')) ext = '.webp';
            else if (ct.includes('gif')) ext = '.gif';
            else if (ct.includes('svg')) ext = '.svg';
          }

          const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 16) + '_' + Date.now();
          const filename = `link_${hash}${ext}`;
          const filePath = path.join(UPLOADS_DIR, filename);
          fs.writeFileSync(filePath, buffer);

          const baseW = 380;
          let w = baseW;
          let h = 280;
          if (dims && dims.width && dims.height) {
            h = Math.max(140, Math.min(640, Math.round(baseW * (dims.height / dims.width))));
          }

          resolve({
            url: `data/uploads/${filename}`,
            w,
            h,
            title: path.basename(parsed.pathname) || 'Image'
          });
        } catch (err) {
          resolve(null);
        }
      });
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

function fetchBuffer(url, options = {}, redirects = 0) {
  return new Promise((resolve) => {
    if (redirects > 4) return resolve(null);
    let parsed;
    try {
      parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateIp(parsed.hostname)) return resolve(null);
    } catch (e) {
      return resolve(null);
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(options.headers || {})
      },
      timeout: 8000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        try {
          const nextUrl = new URL(res.headers.location, parsed).href;
          return resolve(fetchBuffer(nextUrl, options, redirects + 1));
        } catch (e) {
          return resolve(null);
        }
      }
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      const chunks = [];
      let total = 0;
      res.on('data', c => {
        total += c.length;
        if (total < 50 * 1024 * 1024) chunks.push(c);
      });
      res.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: (res.headers['content-type'] || '').toLowerCase(),
          headers: res.headers,
          finalUrl: parsed.href
        });
      });
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

async function resolvePinterest(linkUrl, parsed) {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!host.includes('pinterest') && !host.includes('pin.it')) return null;

  // Direct pinimg CDN URL
  if (host.includes('pinimg.com')) {
    const originalUrl = linkUrl.replace(/\/(?:236x|474x|564x|736x)\//i, '/originals/');
    const downloaded = (await downloadAndCacheImage(originalUrl)) || (await downloadAndCacheImage(linkUrl));
    if (downloaded) {
      return {
        type: 'image',
        title: downloaded.title || 'Pinterest Pin',
        url: downloaded.url,
        img_src: downloaded.url,
        original_url: linkUrl,
        w: downloaded.w,
        h: downloaded.h,
        rotation: 0
      };
    }
  }

  // Pin webpage URL
  const page = await fetchBuffer(linkUrl);
  if (!page) return null;
  const html = page.buffer.toString('utf8');
  const pinImages = [...html.matchAll(/https:\/\/i\.pinimg\.com\/(?:originals|736x|564x|474x|1200x)\/[a-zA-Z0-9_\/.\-]+\.(?:jpe?g|png|webp)/gi)].map(m => m[0]);
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/) || html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].replace(/\s*\|\s*Pinterest.*$/i, '').trim() : 'Pinterest Pin';

  if (pinImages.length > 0) {
    const original = pinImages.find(img => img.includes('/originals/')) || pinImages[0];
    const downloaded = (await downloadAndCacheImage(original)) || (await downloadAndCacheImage(pinImages[0]));
    if (downloaded) {
      return {
        type: 'image',
        title: title || downloaded.title,
        url: downloaded.url,
        img_src: downloaded.url,
        original_url: linkUrl,
        w: downloaded.w,
        h: downloaded.h,
        rotation: 0
      };
    }
  }
  return null;
}

async function resolveInstagram(linkUrl, parsed) {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!host.includes('instagram.com') && !host.includes('instagr.am')) return null;

  const match = parsed.pathname.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  if (!match) return null;
  const shortcode = match[1];

  // 1. Try public oEmbed
  const oembed = await fetchBuffer(`https://api.instagram.com/oembed?url=${encodeURIComponent(`https://www.instagram.com/p/${shortcode}/`)}`);
  if (oembed) {
    try {
      const data = JSON.parse(oembed.buffer.toString('utf8'));
      if (data.thumbnail_url) {
        const downloaded = await downloadAndCacheImage(data.thumbnail_url);
        if (downloaded) {
          return {
            type: 'image',
            title: data.title || `Instagram @${data.author_name || shortcode}`,
            url: downloaded.url,
            img_src: downloaded.url,
            original_url: linkUrl,
            w: downloaded.w,
            h: downloaded.h,
            rotation: 0
          };
        }
      }
    } catch(e) {}
  }

  // 2. Embed page scraping
  const embedPage = await fetchBuffer(`https://www.instagram.com/p/${shortcode}/embed/captioned/`);
  if (embedPage) {
    const html = embedPage.buffer.toString('utf8').replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
    const imgMatch = html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/) ||
                     html.match(/https:\/\/[^"'\s<>]+\.(?:cdninstagram\.com|fbcdn\.net)[^"'\s<>]+\.(?:jpe?g|png|webp)/i);
    const authorMatch = html.match(/<span class="CaptionUsername"[^>]*>([^<]+)<\/span>/);
    if (imgMatch) {
      const downloaded = await downloadAndCacheImage(imgMatch[1] || imgMatch[0]);
      if (downloaded) {
        return {
          type: 'image',
          title: `Instagram @${authorMatch ? authorMatch[1] : shortcode}`,
          url: downloaded.url,
          img_src: downloaded.url,
          original_url: linkUrl,
          w: downloaded.w,
          h: downloaded.h,
          rotation: 0
        };
      }
    }
  }
  return null;
}

async function resolveYouTube(linkUrl, parsed) {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  let ytId = '';
  if (host === 'youtu.be') ytId = parsed.pathname.slice(1).split(/[?#]/)[0];
  else if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    ytId = parsed.searchParams.get('v') || (parsed.pathname.match(/\/(?:shorts|embed|v|live)\/([^/?#]+)/) || [])[1] || '';
  }
  if (!/^[a-zA-Z0-9_-]{11}$/.test(ytId)) return null;

  const isShorts = parsed.pathname.includes('/shorts/');
  let title = `YouTube: ${ytId}`;
  try {
    const oembedRes = await fetchBuffer(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
    if (oembedRes) {
      const data = JSON.parse(oembedRes.buffer.toString('utf8'));
      if (data.title) title = data.title;
    }
  } catch (e) {}

  // Cache thumbnail locally
  const downloaded = (await downloadAndCacheImage(`https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`)) ||
                     (await downloadAndCacheImage(`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`));
  const posterUrl = downloaded ? downloaded.url : `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

  return {
    type: 'youtube',
    embed_type: 'youtube',
    videoId: ytId,
    title,
    url: linkUrl,
    img_src: posterUrl,
    poster: posterUrl,
    original_url: linkUrl,
    w: isShorts ? 300 : 440,
    h: isShorts ? 533 : 260,
    rotation: 0
  };
}

async function resolveTikTok(linkUrl, parsed) {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!host.includes('tiktok.com')) return null;

  try {
    const oembed = await fetchBuffer(`https://www.tiktok.com/oembed?url=${encodeURIComponent(linkUrl)}`);
    if (oembed) {
      const data = JSON.parse(oembed.buffer.toString('utf8'));
      if (data.thumbnail_url) {
        const downloaded = await downloadAndCacheImage(data.thumbnail_url);
        if (downloaded) {
          return {
            type: 'image',
            title: data.title || `TikTok @${data.author_name || 'video'}`,
            url: downloaded.url,
            img_src: downloaded.url,
            original_url: linkUrl,
            w: 300,
            h: 533,
            rotation: 0
          };
        }
      }
    }
  } catch (e) {}
  return null;
}

async function resolveVimeo(linkUrl, parsed) {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!host.includes('vimeo.com')) return null;

  const match = parsed.pathname.match(/\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/|album\/[^/]+\/video\/)?(\d+)/);
  if (!match) return null;
  const videoId = match[1];

  let title = `Vimeo: ${videoId}`;
  let poster = `https://vumbnail.com/${videoId}.jpg`;
  try {
    const oembed = await fetchBuffer(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`);
    if (oembed) {
      const data = JSON.parse(oembed.buffer.toString('utf8'));
      if (data.title) title = data.title;
      if (data.thumbnail_url) poster = data.thumbnail_url;
    }
  } catch (e) {}

  const downloaded = await downloadAndCacheImage(poster);
  const posterUrl = downloaded ? downloaded.url : poster;

  return {
    type: 'vimeo',
    videoId,
    title,
    url: linkUrl,
    img_src: posterUrl,
    poster: posterUrl,
    original_url: linkUrl,
    w: 440,
    h: 260,
    rotation: 0
  };
}

async function resolveTwitter(linkUrl, parsed) {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!host.includes('twitter.com') && !host.includes('x.com')) return null;

  try {
    const oembed = await fetchBuffer(`https://publish.twitter.com/oembed?url=${encodeURIComponent(linkUrl)}&omit_script=true`);
    if (oembed) {
      const data = JSON.parse(oembed.buffer.toString('utf8'));
      const author = data.author_name ? `X / @${data.author_name}` : 'Post on X';
      const cleanHtml = (data.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return {
        type: 'link',
        title: cleanHtml.slice(0, 100) || author,
        url: linkUrl,
        original_url: linkUrl,
        w: 360,
        h: 240,
        rotation: 0
      };
    }
  } catch (e) {}
  return null;
}

async function fetchOpengraph(linkUrl, redirects = 0) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(linkUrl);
      const host = parsed.hostname;
      if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateIp(host) || redirects > 3) {
        return resolve({ error: 'Invalid or protected URL' });
      }
    } catch(e) {
      return resolve({ error: 'Invalid URL' });
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 6000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        try {
          return resolve(fetchOpengraph(new URL(res.headers.location, parsed).href, redirects + 1));
        } catch (error) {
          return resolve({ error: 'Invalid redirect URL' });
        }
      }
      const contentType = String(res.headers['content-type'] || '').toLowerCase();
      if (contentType.startsWith('image/') || contentType.startsWith('video/')) {
        res.resume();
        return resolve({ mediaType: contentType.startsWith('image/') ? 'image' : 'video', mediaUrl: parsed.href });
      }
      let data = '';
      res.on('data', chunk => { if (data.length < 1024 * 1024) data += chunk.toString(); });
      res.on('end', () => {
        let ogImage = '';
        let ogTitle = '';
        for (const tag of data.match(/<meta\b[^>]*>/gi) || []) {
          const attrs = {};
          for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) attrs[match[1].toLowerCase()] = match[3];
          const name = (attrs.property || attrs.name || '').toLowerCase();
          if (['og:image', 'twitter:image', 'twitter:image:src'].includes(name) && !ogImage) ogImage = attrs.content || '';
          if (['og:title', 'twitter:title'].includes(name) && !ogTitle) ogTitle = attrs.content || '';
        }
        if (!ogTitle) {
          const titleTag = data.match(/<title>([^<]+)<\/title>/i);
          if (titleTag) ogTitle = titleTag[1].trim();
        }
        if (ogImage) {
          try { ogImage = new URL(ogImage.replace(/&amp;/g, '&'), parsed).href; } catch (error) { ogImage = ''; }
        }
        resolve({ ogImage, ogTitle });
      });
      res.on('error', () => resolve({ ogImage: '', ogTitle: '' }));
    }).on('error', () => resolve({ ogImage: '', ogTitle: '' }));
    req.on('timeout', () => req.destroy());
  });
}

async function resolveUniversalLink(linkUrl) {
  let parsed;
  try {
    parsed = new URL(linkUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol');
    if (isPrivateIp(parsed.hostname)) throw new Error('Private IP blocked');
  } catch (e) {
    return { error: 'Invalid URL' };
  }

  // 1. Specialized Platform Resolvers
  const yt = await resolveYouTube(linkUrl, parsed);
  if (yt) return yt;

  const pin = await resolvePinterest(linkUrl, parsed);
  if (pin) return pin;

  const ig = await resolveInstagram(linkUrl, parsed);
  if (ig) return ig;

  const tt = await resolveTikTok(linkUrl, parsed);
  if (tt) return tt;

  const vm = await resolveVimeo(linkUrl, parsed);
  if (vm) return vm;

  const tw = await resolveTwitter(linkUrl, parsed);
  if (tw) return tw;

  // 2. Direct Image / Graphics Media
  const isImg = /\.(jpg|jpeg|png|webp|gif|svg|avif|bmp|tiff?|ico)$/i.test(parsed.pathname) ||
                /(?:format|fm|ext)=(?:jpe?g|png|webp|gif|avif)/i.test(parsed.search);
  if (isImg) {
    const downloaded = await downloadAndCacheImage(linkUrl);
    if (downloaded) {
      return {
        type: 'image',
        title: downloaded.title || path.basename(parsed.pathname) || 'Image',
        url: downloaded.url,
        img_src: downloaded.url,
        original_url: linkUrl,
        w: downloaded.w,
        h: downloaded.h,
        rotation: 0
      };
    }
    return {
      type: 'image',
      title: path.basename(parsed.pathname) || linkUrl,
      url: linkUrl,
      img_src: linkUrl,
      original_url: linkUrl,
      w: 380,
      h: 280,
      rotation: 0
    };
  }

  // 3. Direct Video Media
  const isVid = /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(parsed.pathname);
  if (isVid) {
    return {
      type: 'video',
      title: path.basename(parsed.pathname) || linkUrl,
      url: linkUrl,
      video_src: linkUrl,
      original_url: linkUrl,
      w: 440,
      h: 260,
      rotation: 0
    };
  }

  // 4. Universal OpenGraph Fallback (Websites, Behance, Artstation, Unsplash, Reddit, Blogs)
  const ogRes = await fetchOpengraph(linkUrl);
  if (ogRes && !ogRes.error) {
    if (ogRes.mediaType === 'image') {
      const downloaded = await downloadAndCacheImage(ogRes.mediaUrl || linkUrl);
      return {
        type: 'image',
        title: downloaded ? (downloaded.title || ogRes.ogTitle || 'Image') : (ogRes.ogTitle || linkUrl),
        url: downloaded ? downloaded.url : (ogRes.mediaUrl || linkUrl),
        img_src: downloaded ? downloaded.url : (ogRes.mediaUrl || linkUrl),
        original_url: linkUrl,
        w: downloaded ? downloaded.w : 380,
        h: downloaded ? downloaded.h : 280,
        rotation: 0
      };
    }
    if (ogRes.mediaType === 'video') {
      return {
        type: 'video',
        title: ogRes.ogTitle || linkUrl,
        url: linkUrl,
        video_src: ogRes.mediaUrl || linkUrl,
        original_url: linkUrl,
        w: 440,
        h: 260,
        rotation: 0
      };
    }
    if (ogRes.ogImage) {
      const downloaded = await downloadAndCacheImage(ogRes.ogImage);
      return {
        type: 'link',
        title: ogRes.ogTitle || linkUrl,
        url: linkUrl,
        img_src: downloaded ? downloaded.url : ogRes.ogImage,
        poster: downloaded ? downloaded.url : ogRes.ogImage,
        original_url: linkUrl,
        w: downloaded ? downloaded.w : 360,
        h: downloaded ? downloaded.h : 240,
        rotation: 0
      };
    }
    return {
      type: 'link',
      title: ogRes.ogTitle || linkUrl,
      url: linkUrl,
      original_url: linkUrl,
      w: 360,
      h: 240,
      rotation: 0
    };
  }

  return {
    type: 'link',
    title: parsed.hostname || linkUrl,
    url: linkUrl,
    original_url: linkUrl,
    w: 360,
    h: 240,
    rotation: 0
  };
}

// Built-in presets
const BUILTIN_BOARDS = {
  'vudrag': { id: 'vudrag', title: 'Nikola Vudrag Master Film', description: 'Cinematic spatial moodboard sa svim kadrovima taljenja, Tesle i ateljea', isBuiltin: true },
  'trakoscan': { id: 'trakoscan', title: 'Trakošćan Heritage & Pejzaž', description: 'Dvorac Trakošćan, jezero, jesenske refleksije i neogotička arhitektura', isBuiltin: true },
  'garda': { id: 'garda', title: 'Varaždinska Građanska Garda', description: 'Povijesne uniforme Purgara, cehovski cimeri i barokna straža', isBuiltin: true },
  'streetwear': { id: 'streetwear', title: 'Studio Varaždin Streetwear', description: 'Grafički dizajni majica, kameni vitezovi, glagoljica i brutalizam', isBuiltin: true }
};

function getBoardData(boardId) {
  boardId = (boardId || 'vudrag').toLowerCase().replace(/[^a-z0-9_\-]/g, '_');
  const lookupId = boardId === 'default' ? 'vudrag' : boardId;

  const customFile = path.join(BOARDS_DIR, `${lookupId}.json`);
  const defaultBoardFile = path.join(DATA_DIR, 'default_board.json');

  if (lookupId === 'vudrag') {
    if (fs.existsSync(customFile)) {
      try { return JSON.parse(fs.readFileSync(customFile, 'utf8')); } catch(e) {}
    }
    if (fs.existsSync(defaultBoardFile)) {
      try {
        const items = JSON.parse(fs.readFileSync(defaultBoardFile, 'utf8'));
        return { id: boardId, title: 'Nikola Vudrag Master Film', items, positions: {} };
      } catch(e) {}
    }
  }

  if (fs.existsSync(customFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(customFile, 'utf8'));
      parsed.id = boardId;
      return parsed;
    } catch(e) {}
  }

  // Builtin fallback items
  let presetItems = [];
  if (lookupId === 'trakoscan') {
    presetItems = [
      { id: 'trakoscan_jesen', type: 'image', title: 'Trakošćan Jesenski Odraz', img_src: 'assets/boards/trakoscan_dvorac_jesen_odraz_jezero.jpg', x: -350, y: -20, w: 460, h: 310, rotation: -1.2 },
      { id: 'trakoscan_krosnje', type: 'image', title: 'Trakošćan Kroz Krošnje', img_src: 'assets/boards/trakoscan_dvorac_kroz_krosnje.jpg', x: 150, y: -180, w: 380, h: 480, rotation: 1.8 },
      { id: 'trakoscan_ljeto', type: 'image', title: 'Trakošćan Ljetni Pejzaž', img_src: 'assets/boards/trakoscan_dvorac_ljetni_pejzaz.jpg', x: 580, y: 120, w: 440, h: 290, rotation: -0.8 }
    ];
  } else if (lookupId === 'garda') {
    presetItems = [
      { id: 'garda_uniforma', type: 'image', title: 'Varaždinska Građanska Garda', img_src: 'assets/boards/gradanska garda.jpeg', x: -220, y: -40, w: 380, h: 480, rotation: -1.5 },
      { id: 'garda_stari_grad', type: 'image', title: 'Stari Grad Bedemi', img_src: 'assets/boards/stari grad castle.jpeg', x: 240, y: -10, w: 450, h: 300, rotation: 1.2 }
    ];
  } else if (lookupId === 'streetwear') {
    presetItems = [
      { id: 'streetwear_knight', type: 'image', title: 'The Lovers Betrayal — Kneeling Martyr', img_src: 'assets/boards/SV_Lovers_03_Kneeling_Martyr_Back.png', x: -320, y: -30, w: 360, h: 460, rotation: -1.0 },
      { id: 'streetwear_florijan', type: 'image', title: 'St. Florian 1776 Disaster Spec', img_src: 'assets/boards/Heritage_Combo_01_Florijan_Brutalist_Back.png', x: 120, y: -30, w: 360, h: 460, rotation: 1.5 },
      { id: 'streetwear_woodcut', type: 'image', title: 'Pure Woodcut Galloping Knight', img_src: 'assets/boards/SV_Single_01_Woodcut_Knight_Back.png', x: 560, y: -30, w: 360, h: 460, rotation: -0.5 }
    ];
  }

  const title = BUILTIN_BOARDS[lookupId] ? BUILTIN_BOARDS[lookupId].title : (lookupId.charAt(0).toUpperCase() + lookupId.slice(1));
  return { id: boardId, title, items: presetItems, positions: {} };
}

function saveBoardData(boardId, data) {
  boardId = (boardId || 'vudrag').toLowerCase().replace(/[^a-z0-9_\-]/g, '_');
  const targetFile = path.join(BOARDS_DIR, `${boardId}.json`);
  fs.writeFileSync(targetFile, JSON.stringify(data, null, 2), 'utf8');
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;
  const query = Object.fromEntries(parsedUrl.searchParams);

  let body = {};
  if (req.method === 'POST' && !req.headers['content-type']?.includes('multipart/form-data')) {
    body = await parseBody(req);
  }

  const action = query.action || body.action;

  // 1. API ROUTING (/api/board.php)
  if (pathname.includes('/api/board.php') || pathname === '/api/board') {
    const boardId = (query.board || body.board || 'vudrag').toLowerCase();

    if (!/^[a-z0-9_-]{1,80}$/.test(boardId)) {
      return sendJson(res, { status: 'error', message: 'Invalid board ID' }, 400);
    }

    if (action === 'upload' && req.method === 'POST') {
      let inputPath;
      let destination;
      let posterPath;
      try {
        const form = await readUploadForm(req);
        const file = form.get('file');
        if (!file || typeof file.arrayBuffer !== 'function' || !file.name) {
          return sendJson(res, { status: 'error', message: 'No file' }, 400);
        }

        const ext = path.extname(file.name).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
        const isVideo = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'].includes(ext);
        if (!isImage && !isVideo) {
          return sendJson(res, { status: 'error', message: 'Unsupported media type' }, 400);
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        const hash = crypto.createHash('md5').update(bytes).digest('hex') + '_' + Date.now();
        inputPath = path.join(UPLOADS_DIR, `${hash}${ext}`);
        fs.writeFileSync(inputPath, bytes);
        destination = inputPath;

        let item;
        if (isImage) {
          let savedUrl = `data/uploads/${hash}${ext || '.jpg'}`;
          let finalPath = inputPath;
          try {
            destination = path.join(UPLOADS_DIR, `${hash}.webp`);
            await runFile('ffmpeg', ['-v', 'error', '-i', inputPath, '-frames:v', '1', '-quality', '85', '-y', destination]);
            if (fs.existsSync(destination) && fs.statSync(destination).size > 0) {
              if (inputPath !== destination && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
              finalPath = destination;
              savedUrl = `data/uploads/${hash}.webp`;
            }
          } catch (e) {
            finalPath = inputPath;
            savedUrl = `data/uploads/${hash}${ext || '.jpg'}`;
          }
          const dims = getImageDimensions(fs.readFileSync(finalPath));
          const baseW = 380;
          let w = baseW;
          let h = 280;
          if (dims && dims.width && dims.height) {
            h = Math.max(140, Math.min(640, Math.round(baseW * (dims.height / dims.width))));
          }
          item = { type: 'image', url: savedUrl, img_src: savedUrl, title: file.name, w, h, rotation: 0 };
        } else {
          destination = path.join(UPLOADS_DIR, `${hash}.mp4`);
          if (inputPath !== destination) {
            await runFile('ffmpeg', ['-v', 'error', '-i', inputPath, '-c:v', 'libx264', '-crf', '26', '-preset', 'fast', '-movflags', '+faststart', '-y', destination]);
            fs.unlinkSync(inputPath);
          }
          item = { type: 'video', url: `data/uploads/${hash}.mp4`, title: file.name, w: 440, h: 260, rotation: 0 };
          posterPath = path.join(UPLOADS_DIR, `${hash}_poster.jpg`);
          try {
            await runFile('ffmpeg', ['-v', 'error', '-i', destination, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '3', '-y', posterPath]);
            item.poster = `data/uploads/${hash}_poster.jpg`;
          } catch (error) {
            if (fs.existsSync(posterPath)) fs.unlinkSync(posterPath);
          }
        }

        item.id = `media_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        item.x = Number(form.get('x')) || 0;
        item.y = Number(form.get('y')) || 0;
        const data = getBoardData(boardId);
        data.items = data.items || [];
        data.items.push(item);
        saveBoardData(boardId, data);
        return sendJson(res, { status: 'ok', item });
      } catch (error) {
        if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (destination && fs.existsSync(destination)) fs.unlinkSync(destination);
        if (posterPath && fs.existsSync(posterPath)) fs.unlinkSync(posterPath);
        return sendJson(res, { status: 'error', message: error.message || 'Processing failed' }, error.status || 500);
      }
    }

    if (action === 'list_boards') {
      const all = [];
      for (const [id, b] of Object.entries(BUILTIN_BOARDS)) {
        const d = getBoardData(id);
        all.push({
          id,
          title: b.title,
          description: b.description,
          isBuiltin: true,
          itemCount: (d.items || []).length
        });
      }

      const registryFile = path.join(DATA_DIR, 'boards_registry.json');
      let custom = {};
      if (fs.existsSync(registryFile)) {
        try { custom = JSON.parse(fs.readFileSync(registryFile, 'utf8')); } catch(e) {}
      }

      for (const [id, c] of Object.entries(custom)) {
        if (!BUILTIN_BOARDS[id]) {
          const d = getBoardData(id);
          all.push({
            id,
            title: c.name || c.title || id,
            description: c.description || 'Korisnička ploča',
            isBuiltin: false,
            itemCount: (d.items || []).length
          });
        }
      }

      return sendJson(res, { status: 'ok', boards: all, activeBoard: boardId });
    }

    if (action === 'get' || (!action && req.method === 'GET')) {
      const data = getBoardData(boardId);
      return sendJson(res, {
        status: 'ok',
        boardId,
        board: data
      });
    }

    if (action === 'save_positions' && req.method === 'POST') {
      const data = getBoardData(boardId);
      data.positions = Object.assign({}, data.positions || {}, body.positions || {});
      saveBoardData(boardId, data);
      return sendJson(res, { status: 'ok', saved: Object.keys(body.positions || {}).length });
    }

    if (action === 'reset_positions' && req.method === 'POST') {
      const data = getBoardData(boardId);
      data.positions = {};
      saveBoardData(boardId, data);
      return sendJson(res, { status: 'ok' });
    }

    if (action === 'import_board' && req.method === 'POST') {
      if (!Array.isArray(body.items) || body.items.length > 500 ||
          body.items.some(item => !item || !item.id || !item.type) ||
          (body.positions !== undefined && (body.positions === null || Array.isArray(body.positions) || typeof body.positions !== 'object' || Object.keys(body.positions).length > 500))) {
        return sendJson(res, { status: 'error', message: 'Invalid item list' }, 400);
      }
      const data = getBoardData(boardId);
      data.items = body.items;
      data.positions = body.positions || {};
      saveBoardData(boardId, data);
      return sendJson(res, { status: 'ok', imported: data.items.length });
    }

    if (action === 'delete_item' && req.method === 'POST') {
      if (!body.id) return sendJson(res, { status: 'error', message: 'Item ID missing' }, 400);
      const data = getBoardData(boardId);
      data.items = (data.items || []).filter(item => item.id !== body.id);
      if (data.positions) delete data.positions[body.id];
      saveBoardData(boardId, data);
      return sendJson(res, { status: 'ok', deleted: body.id });
    }

    if (action === 'create_board' && req.method === 'POST') {
      const newId = (body.id || 'board_' + Date.now()).toLowerCase().replace(/[^a-z0-9_\-]/g, '_');
      const newBoard = {
        id: newId,
        title: body.title || 'New Board',
        items: body.items || [],
        positions: {}
      };
      saveBoardData(newId, newBoard);
      
      const registryFile = path.join(DATA_DIR, 'boards_registry.json');
      let custom = {};
      if (fs.existsSync(registryFile)) {
        try { custom = JSON.parse(fs.readFileSync(registryFile, 'utf8')); } catch(e) {}
      }
      custom[newId] = { id: newId, name: newBoard.title, title: newBoard.title, created_at: Date.now() / 1000 | 0 };
      fs.writeFileSync(registryFile, JSON.stringify(custom, null, 2), 'utf8');

      return sendJson(res, { status: 'ok', board: custom[newId] });
    }

    if (action === 'update_board' && req.method === 'POST') {
      const registryFile = path.join(DATA_DIR, 'boards_registry.json');
      let custom = {};
      if (fs.existsSync(registryFile)) {
        try { custom = JSON.parse(fs.readFileSync(registryFile, 'utf8')); } catch(e) {}
      }
      if (custom[boardId]) {
        custom[boardId].name = body.title;
        custom[boardId].title = body.title;
        fs.writeFileSync(registryFile, JSON.stringify(custom, null, 2), 'utf8');
        return sendJson(res, { status: 'ok' });
      }
      // Check if file exists in BOARDS_DIR
      const targetFile = path.join(BOARDS_DIR, `${boardId}.json`);
      if (fs.existsSync(targetFile)) {
        const d = getBoardData(boardId);
        d.title = body.title;
        saveBoardData(boardId, d);
        return sendJson(res, { status: 'ok' });
      }
      return sendJson(res, { status: 'error', message: 'Board not found' }, 404);
    }

    if (action === 'delete_board' && req.method === 'POST') {
      if (BUILTIN_BOARDS[boardId] || boardId === 'vudrag' || boardId === 'default') {
        return sendJson(res, { status: 'error', message: 'Cannot delete built-in board' }, 400);
      }
      const targetFile = path.join(BOARDS_DIR, `${boardId}.json`);
      if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
      const registryFile = path.join(DATA_DIR, 'boards_registry.json');
      let custom = {};
      if (fs.existsSync(registryFile)) {
        try { custom = JSON.parse(fs.readFileSync(registryFile, 'utf8')); } catch(e) {}
      }
      if (custom[boardId]) {
        delete custom[boardId];
        fs.writeFileSync(registryFile, JSON.stringify(custom, null, 2), 'utf8');
      }
      return sendJson(res, { status: 'ok', deleted: boardId });
    }

    if (action === 'add_link' && req.method === 'POST') {
      const linkUrl = body.url || '';
      const resolved = await resolveUniversalLink(linkUrl);
      if (!resolved || resolved.error) {
        return sendJson(res, { status: 'error', message: resolved?.error || 'Could not resolve media link' }, 400);
      }

      const uniqueId = 'link_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
      const item = {
        ...resolved,
        id: uniqueId,
        x: Number(body.x) || 0,
        y: Number(body.y) || 0,
        w: resolved.w || 380,
        h: resolved.h || 280,
        rotation: 0
      };

      const data = getBoardData(boardId);
      data.items = data.items || [];
      data.items.push(item);
      saveBoardData(boardId, data);
      return sendJson(res, { status: 'ok', item });
    }

    if (action === 'export_archive') {
      const zipBuffer = Buffer.from('504b0506000000000000000000000000000000000000', 'hex');
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="board_${boardId}.zip"`,
        'Content-Length': zipBuffer.length
      });
      return res.end(zipBuffer);
    }

    return sendJson(res, { status: 'error', message: `Unknown action: ${action}` }, 400);
  }

  // 2. STATIC FILE SERVING
  let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '') safePath = '/index.html';

  let filePath = path.join(BASE_DIR, safePath);

  if (!fs.existsSync(filePath)) {
    const candidateRootPath = path.join(ROOT_DIR, safePath);
    if (fs.existsSync(candidateRootPath)) {
      filePath = candidateRootPath;
    }
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  if (ext === '.mp4' || ext === '.webm' || ext === '.mov') {
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      return file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      });
      return fs.createReadStream(filePath).pipe(res);
    }
  }

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': fileSize,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Studio Varaždin Spatial Moodboard Dev Server Running`);
  console.log(`📡 Local URL:    http://localhost:${PORT}`);
  console.log(`📡 Network URL:  http://127.0.0.1:${PORT}`);
  console.log(`🎯 Press Spacebar inside the mood board to open Command Bar`);
  console.log(`======================================================\n`);
});
