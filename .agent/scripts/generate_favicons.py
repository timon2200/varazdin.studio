#!/usr/bin/env python3
"""
Generate complete production favicon and app icon suite for Studio Varaždin.
Outputs:
  - website/favicon.svg
  - website/favicon.ico (multi-size: 16x16, 32x32, 48x48)
  - website/favicon-96x96.png
  - website/favicon-32x32.png
  - website/favicon-16x16.png
  - website/apple-touch-icon.png (180x180)
  - website/web-app-manifest-192x192.png
  - website/web-app-manifest-512x512.png
  - website/site.webmanifest
"""

import os
import struct
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
WEBSITE_DIR = os.path.join(PROJECT_ROOT, 'website')
FONT_PATH = '/Library/Fonts/Cinzel-Black.ttf'

def extract_ttf_glyph(font_path, char):
    with open(font_path, 'rb') as f:
        data = f.read()
    num_tables = struct.unpack('>H', data[4:6])[0]
    tables = {}
    for i in range(num_tables):
        off = 12 + i * 16
        tag = data[off:off+4].decode('latin1')
        t_off, t_len = struct.unpack('>II', data[off+8:off+16])
        tables[tag] = (t_off, t_len)
    head_off = tables['head'][0]
    index_to_loc_format = struct.unpack('>h', data[head_off+50:head_off+52])[0]
    cmap_off = tables['cmap'][0]
    num_subtables = struct.unpack('>H', data[cmap_off+2:cmap_off+4])[0]
    subtable_off = None
    for i in range(num_subtables):
        p_id, e_id, offset = struct.unpack('>HHI', data[cmap_off+4+i*8:cmap_off+12+i*8])
        if (p_id == 3 and e_id == 1) or (p_id == 0):
            subtable_off = cmap_off + offset
            break
    glyph_id = 0
    code = ord(char)
    seg_count = struct.unpack('>H', data[subtable_off+6:subtable_off+8])[0] // 2
    end_codes = struct.unpack(f'>{seg_count}H', data[subtable_off+14:subtable_off+14+seg_count*2])
    start_codes = struct.unpack(f'>{seg_count}H', data[subtable_off+16+seg_count*2:subtable_off+16+seg_count*4])
    id_deltas = struct.unpack(f'>{seg_count}h', data[subtable_off+16+seg_count*4:subtable_off+16+seg_count*6])
    id_range_off_base = subtable_off+16+seg_count*6
    for i in range(seg_count):
        if end_codes[i] >= code >= start_codes[i]:
            range_off = struct.unpack('>H', data[id_range_off_base+i*2:id_range_off_base+i*2+2])[0]
            if range_off == 0:
                glyph_id = (code + id_deltas[i]) & 0xFFFF
            else:
                g_off = id_range_off_base + i*2 + range_off + (code - start_codes[i])*2
                glyph_id = struct.unpack('>H', data[g_off:g_off+2])[0]
                if glyph_id != 0:
                    glyph_id = (glyph_id + id_deltas[i]) & 0xFFFF
            break
    loca_off = tables['loca'][0]
    glyf_off = tables['glyf'][0]
    if index_to_loc_format == 0:
        g_start = struct.unpack('>H', data[loca_off + glyph_id*2 : loca_off + glyph_id*2 + 2])[0] * 2
        g_end = struct.unpack('>H', data[loca_off + (glyph_id+1)*2 : loca_off + (glyph_id+1)*2 + 2])[0] * 2
    else:
        g_start = struct.unpack('>I', data[loca_off + glyph_id*4 : loca_off + glyph_id*4 + 4])[0]
        g_end = struct.unpack('>I', data[loca_off + (glyph_id+1)*4 : loca_off + (glyph_id+1)*4 + 4])[0]
    g_data = data[glyf_off + g_start : glyf_off + g_end]
    num_contours = struct.unpack('>h', g_data[:2])[0]
    x_min, y_min, x_max, y_max = struct.unpack('>hhhh', g_data[2:10])
    end_pts = struct.unpack(f'>{num_contours}H', g_data[10 : 10 + num_contours*2])
    num_points = end_pts[-1] + 1
    inst_len = struct.unpack('>H', g_data[10 + num_contours*2 : 12 + num_contours*2])[0]
    flags_start = 12 + num_contours*2 + inst_len
    flags = []
    idx = flags_start
    while len(flags) < num_points:
        flag = g_data[idx]
        idx += 1
        flags.append(flag)
        if flag & 0x08:
            repeat_count = g_data[idx]
            idx += 1
            for _ in range(repeat_count):
                flags.append(flag)
    x_coords = []
    curr_x = 0
    for flag in flags:
        if flag & 0x02:
            val = g_data[idx]
            idx += 1
            curr_x += val if (flag & 0x10) else -val
        else:
            if not (flag & 0x10):
                val = struct.unpack('>h', g_data[idx:idx+2])[0]
                idx += 2
                curr_x += val
        x_coords.append(curr_x)
    y_coords = []
    curr_y = 0
    for flag in flags:
        if flag & 0x04:
            val = g_data[idx]
            idx += 1
            curr_y += val if (flag & 0x20) else -val
        else:
            if not (flag & 0x20):
                val = struct.unpack('>h', g_data[idx:idx+2])[0]
                idx += 2
                curr_y += val
        y_coords.append(curr_y)
    points = []
    for i in range(num_points):
        points.append((x_coords[i], y_coords[i], bool(flags[i] & 0x01)))
    path_d = []
    start_pt = 0
    for end_pt in end_pts:
        c_points = points[start_pt : end_pt + 1]
        start_pt = end_pt + 1
        if not c_points[0][2]:
            if c_points[-1][2]:
                c_points = [c_points[-1]] + c_points[:-1]
            else:
                mid_x = (c_points[0][0] + c_points[-1][0]) / 2
                mid_y = (c_points[0][1] + c_points[-1][1]) / 2
                c_points = [(mid_x, mid_y, True)] + c_points
        p0 = c_points[0]
        path_d.append(f'M {p0[0]} {-p0[1]}')
        i = 1
        n = len(c_points)
        while i < n:
            curr = c_points[i]
            if curr[2]:
                path_d.append(f'L {curr[0]} {-curr[1]}')
                i += 1
            else:
                next_pt = c_points[(i + 1) % n]
                if next_pt[2]:
                    path_d.append(f'Q {curr[0]} {-curr[1]} {next_pt[0]} {-next_pt[1]}')
                    i += 2
                else:
                    mid_x = (curr[0] + next_pt[0]) / 2
                    mid_y = (curr[1] + next_pt[1]) / 2
                    path_d.append(f'Q {curr[0]} {-curr[1]} {mid_x} {-mid_y}')
                    c_points[i] = (mid_x, mid_y, True)
                    i += 1
        path_d.append('Z')
    return ' '.join(path_d), (x_min, y_min, x_max, y_max)

def render_bitmap_icon(size=1024, v_scale=560, v_offset=36, show_decor=True, border_w=12):
    W, H = size, size
    y = np.linspace(0, 1, H).reshape((H, 1, 1))
    x = np.linspace(0, 1, W).reshape((1, W, 1))
    top_c = np.array([14, 38, 24], dtype=float).reshape((1, 1, 3))
    mid_c = np.array([7, 21, 12], dtype=float).reshape((1, 1, 3))
    bot_c = np.array([3, 8, 5], dtype=float).reshape((1, 1, 3))
    t = np.broadcast_to(y, (H, W, 1))
    bg = np.where(t < 0.5, top_c * (1 - t*2) + mid_c * (t*2), mid_c * (1 - (t-0.5)*2) + bot_c * ((t-0.5)*2)).copy()
    cx_dist = (x - 0.5)
    cy_dist = (y - 0.5)
    dist = np.sqrt(cx_dist**2 + cy_dist**2) / 0.707
    glow = np.clip(1.0 - dist * 1.3, 0, 1) ** 2
    bg += glow * np.array([30, 22, 6], dtype=float).reshape((1, 1, 3))
    bg = np.clip(bg, 0, 255).astype(np.uint8)
    base_img = Image.fromarray(bg, mode='RGB').convert('RGBA')

    # Mask
    mask = Image.new('L', (W, H), 0)
    m_draw = ImageDraw.Draw(mask)
    m_draw.rounded_rectangle([0, 0, W-1, H-1], radius=int(W*0.22), fill=255)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    canvas.paste(base_img, (0, 0), mask)

    # Decor
    decor = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d_draw = ImageDraw.Draw(decor)
    gold_border = (235, 192, 75, 240)
    b_inset = int(W*0.05)
    d_draw.rounded_rectangle([b_inset, b_inset, W-b_inset-1, H-b_inset-1], radius=int(W*0.17), outline=gold_border, width=border_w)

    if show_decor:
        b_in2 = int(W*0.078)
        d_draw.rounded_rectangle([b_in2, b_in2, W-b_in2-1, H-b_in2-1], radius=int(W*0.14), outline=(225, 182, 65, 75), width=3)
        gold_corner = (242, 204, 98, 255)
        cw = 9
        d_draw.line([(114, 180), (114, 122)], fill=gold_corner, width=cw)
        d_draw.line([(114, 122), (172, 122)], fill=gold_corner, width=cw)
        d_draw.line([(W-115, 180), (W-115, 122)], fill=gold_corner, width=cw)
        d_draw.line([(W-115, 122), (W-173, 122)], fill=gold_corner, width=cw)
        d_draw.line([(114, H-181), (114, H-123)], fill=gold_corner, width=cw)
        d_draw.line([(114, H-123), (172, H-123)], fill=gold_corner, width=cw)
        d_draw.line([(W-115, H-181), (W-115, H-123)], fill=gold_corner, width=cw)
        d_draw.line([(W-115, H-123), (W-173, H-123)], fill=gold_corner, width=cw)
        # Star
        star_cx, star_cy = W // 2, 140
        star_poly = [
            (star_cx, star_cy - 28), (star_cx + 7, star_cy - 7),
            (star_cx + 28, star_cy), (star_cx + 7, star_cy + 7),
            (star_cx, star_cy + 28), (star_cx - 7, star_cy + 7),
            (star_cx - 28, star_cy), (star_cx - 7, star_cy - 7),
        ]
        d_draw.polygon(star_poly, fill=gold_corner)
        d_draw.ellipse([star_cx-4, star_cy-4, star_cx+4, star_cy+4], fill=(255, 250, 210, 255))

    # Font & V
    v_mask = Image.new('L', (W, H), 0)
    v_draw = ImageDraw.Draw(v_mask)
    font = ImageFont.truetype(FONT_PATH, v_scale)
    bbox = font.getbbox('V')
    v_w = bbox[2] - bbox[0]
    v_h = bbox[3] - bbox[1]
    v_x = (W - v_w) // 2 - bbox[0]
    v_y = (H - v_h) // 2 - bbox[1] + v_offset
    v_draw.text((v_x, v_y), 'V', font=font, fill=255)

    v_top = v_y + bbox[1]
    v_bot = v_y + bbox[3]
    vt = np.clip((np.arange(H).reshape((H, 1, 1)) - v_top) / max(1, (v_bot - v_top)), 0, 1)
    vt = np.broadcast_to(vt, (H, W, 1))

    c0 = np.array([255, 248, 205, 255], dtype=float).reshape((1, 1, 4))
    c1 = np.array([242, 212, 118, 255], dtype=float).reshape((1, 1, 4))
    c2 = np.array([195, 142, 32, 255], dtype=float).reshape((1, 1, 4))
    c3 = np.array([232, 188, 68, 255], dtype=float).reshape((1, 1, 4))

    foil = np.where(
        vt < 0.28,
        c0 * (1 - vt/0.28) + c1 * (vt/0.28),
        np.where(
            vt < 0.65,
            c1 * (1 - (vt-0.28)/0.37) + c2 * ((vt-0.28)/0.37),
            c2 * (1 - (vt-0.65)/0.35) + c3 * ((vt-0.65)/0.35)
        )
    )
    foil_img = Image.fromarray(np.clip(foil, 0, 255).astype(np.uint8), mode='RGBA')

    s_mask = v_mask.filter(ImageFilter.GaussianBlur(14))
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    shadow.paste(Image.new('RGBA', (W, H), (0, 0, 0, 180)), (0, 14), s_mask)

    canvas.alpha_composite(decor)
    canvas.alpha_composite(shadow)
    canvas.paste(foil_img, (0, 0), v_mask)
    return canvas

def generate_svg(v_path, bbox):
    cx = (bbox[0] + bbox[2]) / 2
    cy = -(bbox[1] + bbox[3]) / 2
    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <!-- Background Gradients -->
    <linearGradient id="svBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0c2517"/>
      <stop offset="50%" stop-color="#07150c"/>
      <stop offset="100%" stop-color="#030805"/>
    </linearGradient>
    <radialGradient id="svGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#dfb135" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#07150c" stop-opacity="0"/>
    </radialGradient>

    <!-- Gold Foil Gradients -->
    <linearGradient id="svGold" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fff4be"/>
      <stop offset="28%" stop-color="#edd071"/>
      <stop offset="65%" stop-color="#b8861b"/>
      <stop offset="100%" stop-color="#dfb135"/>
    </linearGradient>
    <linearGradient id="svGoldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f5d67e"/>
      <stop offset="50%" stop-color="#dfb135"/>
      <stop offset="100%" stop-color="#9a711b"/>
    </linearGradient>

    <!-- Drop Shadow for V -->
    <filter id="svShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.75"/>
    </filter>
  </defs>

  <!-- Deep Emerald Base Tile -->
  <rect width="512" height="512" rx="112" fill="url(#svBg)"/>
  <rect width="512" height="512" rx="112" fill="url(#svGlow)"/>

  <!-- Ornate Signboard Framing -->
  <rect x="26" y="26" width="460" height="460" rx="88" fill="none" stroke="url(#svGoldBorder)" stroke-width="6" stroke-opacity="0.9"/>
  <rect x="40" y="40" width="432" height="432" rx="74" fill="none" stroke="#dfb135" stroke-width="1.5" stroke-opacity="0.35"/>

  <!-- Ornate Signboard Corner Brackets -->
  <path d="M 58 90 L 58 66 Q 58 58 66 58 L 90 58" fill="none" stroke="url(#svGold)" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M 454 90 L 454 66 Q 454 58 446 58 L 422 58" fill="none" stroke="url(#svGold)" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M 58 422 L 58 446 Q 58 454 66 454 L 90 454" fill="none" stroke="url(#svGold)" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M 454 422 L 454 446 Q 454 454 446 454 L 422 454" fill="none" stroke="url(#svGold)" stroke-width="4.5" stroke-linecap="round"/>

  <!-- North Star / Cinematic Sparkle -->
  <path d="M 256 66 Q 256 78 268 78 Q 256 78 256 90 Q 256 78 244 78 Q 256 78 256 66 Z" fill="url(#svGold)"/>
  <circle cx="256" cy="78" r="2.5" fill="#fffbe6"/>

  <!-- Grand Central 'V' Glyph -->
  <g transform="translate(256, 274) scale(0.44) translate({-cx}, {-cy})" filter="url(#svShadow)">
    <path d="{v_path}" fill="url(#svGold)"/>
  </g>
</svg>'''
    return svg_content

def main():
    print(f"Building favicons in {WEBSITE_DIR}...")
    os.makedirs(WEBSITE_DIR, exist_ok=True)
    temp_dir = os.path.join(PROJECT_ROOT, '.tmp_favicons')
    os.makedirs(temp_dir, exist_ok=True)

    # 1. Vector SVG
    v_path, bbox = extract_ttf_glyph(FONT_PATH, 'V')
    svg_str = generate_svg(v_path, bbox)
    svg_out_path = os.path.join(WEBSITE_DIR, 'favicon.svg')
    with open(svg_out_path, 'w') as f:
        f.write(svg_str)
    print(f"Saved {svg_out_path}")

    # 2. Render master ornate (for high-res)
    print("Rendering master ornate 1024...")
    ornate_1024 = render_bitmap_icon(size=1024, v_scale=560, v_offset=36, show_decor=True, border_w=12)

    # 3. Render master bold (for small-scale clarity at 16 & 32px)
    print("Rendering master bold 1024...")
    bold_1024 = render_bitmap_icon(size=1024, v_scale=700, v_offset=0, show_decor=False, border_w=24)

    # 4. Generate PNG sizes
    sizes = {
        'web-app-manifest-512x512.png': (ornate_1024, 512),
        'web-app-manifest-192x192.png': (ornate_1024, 192),
        'apple-touch-icon.png': (ornate_1024, 180),
        'favicon-96x96.png': (ornate_1024, 96),
        'favicon-32x32.png': (bold_1024, 32),
        'favicon-16x16.png': (bold_1024, 16),
    }

    for fname, (source_img, sz) in sizes.items():
        out_p = os.path.join(WEBSITE_DIR, fname)
        resized = source_img.resize((sz, sz), Image.Resampling.LANCZOS)
        resized.save(out_p, 'PNG', optimize=True)
        print(f"Saved {out_p} ({sz}x{sz})")

    # 5. Build multi-resolution favicon.ico (16, 32, 48)
    ico_16_path = os.path.join(temp_dir, 'ico_16.png')
    ico_32_path = os.path.join(temp_dir, 'ico_32.png')
    ico_48_path = os.path.join(temp_dir, 'ico_48.png')

    bold_1024.resize((16, 16), Image.Resampling.LANCZOS).save(ico_16_path, 'PNG')
    bold_1024.resize((32, 32), Image.Resampling.LANCZOS).save(ico_32_path, 'PNG')
    ornate_1024.resize((48, 48), Image.Resampling.LANCZOS).save(ico_48_path, 'PNG')

    ico_out_path = os.path.join(WEBSITE_DIR, 'favicon.ico')
    cmd = ['magick', ico_16_path, ico_32_path, ico_48_path, ico_out_path]
    subprocess.run(cmd, check=True)
    print(f"Saved multi-resolution {ico_out_path}")

    # 6. Generate site.webmanifest
    manifest_content = '''{
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
    manifest_out_path = os.path.join(WEBSITE_DIR, 'site.webmanifest')
    with open(manifest_out_path, 'w') as f:
        f.write(manifest_content)
    print(f"Saved {manifest_out_path}")

    # Clean up temp
    for p in [ico_16_path, ico_32_path, ico_48_path]:
        if os.path.exists(p):
            os.remove(p)
    if os.path.exists(temp_dir):
        os.rmdir(temp_dir)
    print("Done!")

if __name__ == '__main__':
    main()
