#!/usr/bin/env python3
"""
Studio Varaždin — Swiper Drop Folder Processor & WebP Optimizer
Monitors / processes images dropped into `swiper-drop-folder/`, converts them to high-speed WebP,
and automatically updates `catalog-data.js` for the Swiper app.
"""

import os
import sys
import time
import json
import shutil
from pathlib import Path
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
DROP_DIR = BASE_DIR / "swiper-drop-folder"

TARGET_DIRS = [
    BASE_DIR / "swiper",
    BASE_DIR / "website" / "tajno-glasanje"
]

CATEGORY_PREFIX_MAP = {
    'SV Artwear': 'Artwear',
    'SV Print': 'Artwear',
    'CV Tee': 'Creative',
    'T-Shirt': 'City',
    'Garda Tee': 'Garda',
    'SV Tee': 'Studio'
}

def ensure_directories():
    os.makedirs(DROP_DIR, exist_ok=True)
    for target in TARGET_DIRS:
        os.makedirs(target / "assets" / "optimized", exist_ok=True)
        os.makedirs(target / "js", exist_ok=True)

def detect_category_and_title(file_path: Path):
    # Check parent folder name first
    parent_name = file_path.parent.name
    category = "Artwear"
    valid_cats = {"Artwear", "Creative", "City", "Garda", "Studio", "Towers", "New Drop"}
    
    for vc in valid_cats:
        if vc.lower() == parent_name.lower():
            category = vc
            break

    raw_title = file_path.stem
    
    # Check prefixes
    for prefix, cat in CATEGORY_PREFIX_MAP.items():
        if raw_title.startswith(prefix):
            if category == "Artwear" and parent_name == "swiper-drop-folder":
                category = cat
            raw_title = raw_title[len(prefix):].lstrip(" -_")
            break

    # Clean title
    title = raw_title.replace("_", " ").replace("-", " ").strip()
    # Title case words but preserve acronyms
    words = [w.capitalize() if not w.isupper() else w for w in title.split()]
    clean_title = " ".join(words)

    return category, clean_title

def optimize_image(src_path: Path, out_path: Path, max_height=1200):
    try:
        with Image.open(src_path) as img:
            img = img.convert("RGBA")
            w, h = img.size
            if h > max_height:
                ratio = max_height / h
                new_w = int(w * ratio)
                img = img.resize((new_w, max_height), Image.Resampling.LANCZOS)
            img.save(out_path, "WEBP", quality=88, method=6)
            return True
    except Exception as e:
        print(f"[ERROR] Failed to optimize {src_path.name}: {e}")
        return False

def sync_catalog():
    ensure_directories()
    
    # Read existing catalog from swiper/js/catalog-data.js if exists
    primary_catalog_js = BASE_DIR / "swiper" / "js" / "catalog-data.js"
    existing_items = []
    
    if primary_catalog_js.exists():
        content = primary_catalog_js.read_text(encoding="utf-8")
        if "export const CATALOG_DATA = " in content:
            json_str = content.replace("export const CATALOG_DATA = ", "").rstrip(";\n ")
            try:
                existing_items = json.loads(json_str)
            except Exception:
                existing_items = []

    seen_slugs = {item["slug"]: item for item in existing_items}
    
    # Scan drop folder for new images
    valid_exts = {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"}
    dropped_files = [p for p in DROP_DIR.rglob("*") if p.is_file() and p.suffix.lower() in valid_exts]
    
    if not dropped_files:
        print(f"[INFO] Drop folder is empty ({DROP_DIR}). Drop .png/.jpg/.webp files here to process.")
        return

    print(f"[INFO] Found {len(dropped_files)} image(s) in drop folder. Processing...")

    processed_count = 0
    for file_path in dropped_files:
        category, title = detect_category_and_title(file_path)
        slug = file_path.stem.lower().replace(" ", "_").replace("-", "_")
        slug = "".join(c for c in slug if c.isalnum() or c == "_")
        
        # Target filename
        webp_filename = f"{file_path.stem}.webp"

        # Copy optimized WebP to all target directories
        for target in TARGET_DIRS:
            dest_opt = target / "assets" / "optimized" / webp_filename
            if not dest_opt.exists():
                optimize_image(file_path, dest_opt)

        # Update or insert catalog entry
        if slug not in seen_slugs:
            new_id = f"sv-{len(existing_items) + 1:03d}"
            new_entry = {
                "id": new_id,
                "slug": slug,
                "title": title,
                "category": category,
                "image": f"assets/optimized/{webp_filename}",
                "description": f"Autorski {category} dizajn Studio Varaždin & cCc.",
                "likes": 0,
                "passes": 0,
                "superlikes": 0,
                "tags": [category.lower(), "streetwear", "varazdin"]
            }
            existing_items.append(new_entry)
            seen_slugs[slug] = new_entry
            processed_count += 1
            print(f"  [+] Added new design: '{title}' ({category}) -> {webp_filename}")

    # Write updated catalog to all targets
    js_content = "export const CATALOG_DATA = " + json.dumps(existing_items, indent=2, ensure_ascii=False) + ";\n"
    for target in TARGET_DIRS:
        cat_file = target / "js" / "catalog-data.js"
        cat_file.write_text(js_content, encoding="utf-8")

    print(f"[SUCCESS] Processed {processed_count} new design(s). Total catalog items: {len(existing_items)}")

def watch_mode():
    print(f"[WATCH] Watching {DROP_DIR} for new files... (Press Ctrl+C to stop)")
    ensure_directories()
    last_files = set()
    while True:
        try:
            current_files = {str(p) for p in DROP_DIR.rglob("*") if p.is_file()}
            if current_files != last_files:
                sync_catalog()
                last_files = current_files
            time.sleep(2)
        except KeyboardInterrupt:
            print("\n[WATCH] Stopped watcher.")
            break

if __name__ == "__main__":
    ensure_directories()
    if len(sys.argv) > 1 and sys.argv[1] in ("--watch", "-w"):
        watch_mode()
    else:
        sync_catalog()
