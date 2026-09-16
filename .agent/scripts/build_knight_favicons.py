#!/usr/bin/env python3
"""
Build production-grade Knight Favicon Suite for Studio Varaždin
Supports automatic Dark Mode and Light/White Mode switching.
Outputs:
  - website/favicon.svg (Dynamic dual-mode SVG with @media prefers-color-scheme)
  - website/favicon-dark.svg (Dedicated Dark mode SVG)
  - website/favicon-light.svg (Dedicated Light/White mode SVG)
  - website/favicon.ico (Multi-resolution 16x16, 32x32, 48x48)
  - website/favicon-dark-32x32.png, favicon-dark-16x16.png, favicon-dark-96x96.png
  - website/favicon-light-32x32.png, favicon-light-16x16.png, favicon-light-96x96.png
  - website/favicon-32x32.png, favicon-16x16.png, favicon-96x96.png
  - website/apple-touch-icon.png (180x180)
  - website/web-app-manifest-192x192.png (192x192)
  - website/web-app-manifest-512x512.png (512x512)
  - website/site.webmanifest
"""

import os
import io
import base64
import subprocess
from PIL import Image, ImageDraw

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
WEBSITE_DIR = os.path.join(PROJECT_ROOT, 'website')
BRAIN_DIR = '/Users/timonterzic/.gemini/antigravity/brain/c91746e7-494c-463c-8505-a0f3ba85f605'

DARK_IMG_PATH = os.path.join(BRAIN_DIR, 'knight_dark_logo_1788696721061.jpg')
WHITE_IMG_PATH = os.path.join(BRAIN_DIR, 'knight_white_logo_1788696738337.jpg')

def create_master_badges():
    im_d = Image.open(DARK_IMG_PATH)
    im_w = Image.open(WHITE_IMG_PATH)

    # Heroic framing box
    box = (130, 35, 890, 795)
    crop_d = im_d.crop(box).resize((1024, 1024), Image.Resampling.LANCZOS)
    crop_w = im_w.crop(box).resize((1024, 1024), Image.Resampling.LANCZOS)

    W, H = 1024, 1024
    mask = Image.new('L', (W, H), 0)
    m_draw = ImageDraw.Draw(mask)
    m_draw.rounded_rectangle([0, 0, W-1, H-1], radius=224, fill=255)

    # 1. Dark Master (Deep emerald background, gold knight, gold border)
    master_d = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    master_d.paste(crop_d.convert('RGBA'), (0, 0), mask)
    d_draw = ImageDraw.Draw(master_d)
    d_draw.rounded_rectangle([20, 20, W-21, H-21], radius=204, outline=(223, 177, 53, 220), width=10)

    # 2. White Master (Pure white background, obsidian/emerald armor, gold trim, gold border)
    master_w = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    master_w.paste(crop_w.convert('RGBA'), (0, 0), mask)
    w_draw = ImageDraw.Draw(master_w)
    w_draw.rounded_rectangle([20, 20, W-21, H-21], radius=204, outline=(210, 165, 45, 220), width=10)

    return master_d, master_w

def image_to_base64_png(im, size=(512, 512)):
    resized = im.resize(size, Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    resized.save(buf, format='PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode('ascii')

def main():
    print("Generating knight favicon suite...")
    os.makedirs(WEBSITE_DIR, exist_ok=True)
    temp_dir = os.path.join(PROJECT_ROOT, '.tmp_knight_favicons')
    os.makedirs(temp_dir, exist_ok=True)

    master_d, master_w = create_master_badges()

    # 1. Generate base64 data URIs for SVG embedding (512x512)
    b64_d = image_to_base64_png(master_d, (512, 512))
    b64_w = image_to_base64_png(master_w, (512, 512))

    # 2. Build Unified Dynamic Dual-Mode favicon.svg
    svg_dual = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <style>
    :root {{ color-scheme: light dark; }}
    .knight-light {{ display: block; }}
    .knight-dark {{ display: none; }}
    @media (prefers-color-scheme: dark) {{
      .knight-light {{ display: none; }}
      .knight-dark {{ display: block; }}
    }}
  </style>
  <g class="knight-light">
    <image href="data:image/png;base64,{b64_w}" width="512" height="512"/>
  </g>
  <g class="knight-dark">
    <image href="data:image/png;base64,{b64_d}" width="512" height="512"/>
  </g>
</svg>
'''
    with open(os.path.join(WEBSITE_DIR, 'favicon.svg'), 'w') as f:
        f.write(svg_dual)
    print("Saved website/favicon.svg (Dual Mode)")

    # 3. Build Dedicated favicon-dark.svg
    svg_dark = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <image href="data:image/png;base64,{b64_d}" width="512" height="512"/>
</svg>
'''
    with open(os.path.join(WEBSITE_DIR, 'favicon-dark.svg'), 'w') as f:
        f.write(svg_dark)
    print("Saved website/favicon-dark.svg")

    # 4. Build Dedicated favicon-light.svg
    svg_light = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <image href="data:image/png;base64,{b64_w}" width="512" height="512"/>
</svg>
'''
    with open(os.path.join(WEBSITE_DIR, 'favicon-light.svg'), 'w') as f:
        f.write(svg_light)
    print("Saved website/favicon-light.svg")

    # 5. Generate PNG sizes for both Dark and Light versions
    # Dark PNGs
    for sz in [512, 192, 180, 96, 32, 16]:
        resized_d = master_d.resize((sz, sz), Image.Resampling.LANCZOS)
        if sz == 180:
            resized_d.save(os.path.join(WEBSITE_DIR, 'apple-touch-icon.png'), 'PNG', optimize=True)
        if sz == 192:
            resized_d.save(os.path.join(WEBSITE_DIR, 'web-app-manifest-192x192.png'), 'PNG', optimize=True)
        if sz == 512:
            resized_d.save(os.path.join(WEBSITE_DIR, 'web-app-manifest-512x512.png'), 'PNG', optimize=True)
        
        # Standard root & dark-prefixed icons
        resized_d.save(os.path.join(WEBSITE_DIR, f'favicon-dark-{sz}x{sz}.png'), 'PNG', optimize=True)
        resized_d.save(os.path.join(WEBSITE_DIR, f'favicon-{sz}x{sz}.png'), 'PNG', optimize=True)

    # Light PNGs
    for sz in [96, 32, 16]:
        resized_w = master_w.resize((sz, sz), Image.Resampling.LANCZOS)
        resized_w.save(os.path.join(WEBSITE_DIR, f'favicon-light-{sz}x{sz}.png'), 'PNG', optimize=True)

    print("Saved all PNG sizes for dark and light versions.")

    # 6. Multi-resolution favicon.ico (16, 32, 48)
    ico_16 = os.path.join(temp_dir, 'ico_16.png')
    ico_32 = os.path.join(temp_dir, 'ico_32.png')
    ico_48 = os.path.join(temp_dir, 'ico_48.png')

    master_d.resize((16, 16), Image.Resampling.LANCZOS).save(ico_16, 'PNG')
    master_d.resize((32, 32), Image.Resampling.LANCZOS).save(ico_32, 'PNG')
    master_d.resize((48, 48), Image.Resampling.LANCZOS).save(ico_48, 'PNG')

    ico_out = os.path.join(WEBSITE_DIR, 'favicon.ico')
    subprocess.run(['magick', ico_16, ico_32, ico_48, ico_out], check=True)
    print(f"Saved multi-resolution {ico_out}")

    # 7. Update site.webmanifest
    manifest = '''{
  "name": "Studio Varaždin",
  "short_name": "Studio Varaždin",
  "description": "Studio Varaždin — Cinematic production studio from northern Croatia. Documentary films, immersive experiences, and destination storytelling.",
  "icons": [
    {
      "src": "web-app-manifest-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "web-app-manifest-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "theme_color": "#07150c",
  "background_color": "#07150c",
  "display": "standalone",
  "start_url": "/"
}
'''
    with open(os.path.join(WEBSITE_DIR, 'site.webmanifest'), 'w') as f:
        f.write(manifest)
    print("Updated website/site.webmanifest")

    # Clean up temp
    for p in [ico_16, ico_32, ico_48]:
        if os.path.exists(p):
            os.remove(p)
    if os.path.exists(temp_dir):
        os.rmdir(temp_dir)

    print("All knight favicons created successfully!")

if __name__ == '__main__':
    main()
