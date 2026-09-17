#!/usr/bin/env python3
"""
Studio Varaždin — Swiper Catalog Builder & WebP Optimizer
Full deduplication, asset optimization, category classification, and synchronization.
"""

import os
import re
import json
import hashlib
import shutil
from pathlib import Path
from collections import defaultdict
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent

SWIPER_DIR = BASE_DIR / "swiper"
TAJNO_DIR = BASE_DIR / "website" / "tajno-glasanje"

TARGET_DIRS = [SWIPER_DIR, TAJNO_DIR]

COLLECTIONS_CONFIG = [
    # 01 City Series
    ('T-Shirt Design/Collections/01 City Series', 'City'),
    ('Brand Book/06 T-Shirt Designs/01 City Series', 'City'),
    
    # 02 Studio Series
    ('T-Shirt Design/Collections/02 Studio Series', 'Studio'),
    ('Brand Book/06 T-Shirt Designs/02 Studio Series', 'Studio'),

    # 04 Garda Series
    ('T-Shirt Design/Collections/04 Garda Series', 'Garda'),
    ('Brand Book/06 T-Shirt Designs/04 Garda Series', 'Garda'),

    # 05 Towers Series (Grad Zvonika)
    ('T-Shirt Design/Collections/05 Towers Series (Grad Zvonika)', 'Towers'),
    ('Brand Book/06 T-Shirt Designs/05 Towers Series (Grad Zvonika)', 'Towers'),

    # 11 Utility Film Production Series (Back Prints)
    ('T-Shirt Design/Collections/11 Utility Film Production Series/Back Prints', 'Utility'),
    ('Brand Book/06 T-Shirt Designs/11 Utility Film Production Series/Back Prints', 'Utility'),
    ('T-Shirt Design/Collections/06 Utility Series', 'Utility'),

    # 04 Front Chest Accents & Minimal Series
    ('T-Shirt Design/Collections/04 Front Chest Accents/Minimal Series', 'Front Hits'),
    ('Brand Book/06 T-Shirt Designs/04 Front Chest Accents/Minimal Series', 'Front Hits'),
    ('T-Shirt Design/Collections/04 Front Chest Accents', 'Front Hits'),
    ('Brand Book/06 T-Shirt Designs/04 Front Chest Accents', 'Front Hits'),
    ('T-Shirt Design/Collections/08 cCc x Studio Varazdin Collaboration/Front Hits', 'Front Hits'),
    ('T-Shirt Design/Collections/09 Studio Varazdin 4-Ref Combinations/Front Hits', 'Front Hits'),
    ('T-Shirt Design/Collections/10 Heritage x Pinterest Combinations/Front Hits', 'Front Hits'),
    ('T-Shirt Design/Collections/10 Studio Varazdin Single Pinterest Focus/Front Hits', 'Front Hits'),
    ('T-Shirt Design/Collections/11 Utility Film Production Series/Front Hits', 'Front Hits'),
    ('Brand Book/06 T-Shirt Designs/11 Utility Film Production Series/Front Hits', 'Front Hits'),
    ('T-Shirt Design/Collections/12 The Lovers Betrayal Tarot Series/Front Hits', 'Front Hits'),
    ('Brand Book/06 T-Shirt Designs/12 The Lovers Betrayal Tarot Series/Front Hits', 'Front Hits'),

    # 07 Artwear Series
    ('T-Shirt Design/Collections/07 Artwear Series', 'Artwear'),
    ('Brand Book/06 T-Shirt Designs/07 Artwear Series', 'Artwear'),

    # Collaborative & Pinterest & Tarot Collections (Back Prints)
    ('T-Shirt Design/Collections/08 cCc x Studio Varazdin Collaboration/Back Prints', 'Creative'),
    ('Brand Book/06 T-Shirt Designs/08 cCc x Studio Varazdin Collaboration', 'Creative'),
    ('T-Shirt Design/Collections/09 Studio Varazdin 4-Ref Combinations/Back Prints', 'Creative'),
    ('Brand Book/06 T-Shirt Designs/09 Studio Varazdin 4-Ref Combinations', 'Creative'),
    ('T-Shirt Design/Collections/10 Heritage x Pinterest Combinations/Back Prints', 'Creative'),
    ('Brand Book/06 T-Shirt Designs/10 Heritage x Pinterest Combinations', 'Creative'),
    ('T-Shirt Design/Collections/10 Studio Varazdin Single Pinterest Focus/Back Prints', 'Creative'),
    ('Brand Book/06 T-Shirt Designs/10 Studio Varazdin Single Pinterest Focus', 'Creative'),
    ('T-Shirt Design/Collections/12 The Lovers Betrayal Tarot Series/Back Prints', 'Creative'),
    ('Brand Book/06 T-Shirt Designs/12 The Lovers Betrayal Tarot Series/Back Prints', 'Creative'),

    # 03 Creative Series
    ('T-Shirt Design/Collections/03 Creative Series', 'Creative'),
    ('Brand Book/06 T-Shirt Designs/03 Creative Series', 'Creative'),

    # GPT Image Experiments
    ('T-Shirt Design/Collections/GPT-Image-2.5-Test', 'Experimental'),

    # Brand Book Root (Heritage & Early Collections)
    ('Brand Book/06 T-Shirt Designs', 'Artwear')
]

TITLE_MAP = {
    # Collaborations Back
    'Collab_01_Studio_Varazdin_Alchemist_Laborer_Back': 'Collab 01 — The Alchemist & The Laborer',
    'Collab_02_cCc_Middle_Ground_Horizon_Back': 'Collab 02 — Middle Ground Horizon',
    'Collab_03_Studio_Varazdin_Semiotic_Matrix_Back': 'Collab 03 — Semiotic Matrix',
    'Collab_03_cCc_Morska_Dekla_Siren_Back': 'Collab 03 — Morska Dekla Siren',
    'Collab_04_Studio_Varazdin_Fire_1776_Disaster_Back': 'Collab 04 — Great Fire of 1776 Disaster',
    'Collab_04_cCc_Kinetic_Madmen_Back': 'Collab 04 — Kinetic Madmen',
    'Collab_05_Studio_Varazdin_Midnight_Reticle_Back': 'Collab 05 — Midnight Set 03:00 AM Reticle',
    'Collab_05_cCc_Sleeping_Angels_Acid_Back': 'Collab 05 — Sleeping Angels Acid Pop',
    'Collab_06_Studio_Varazdin_Vischer_Panorama_Back': 'Collab 06 — Vischer 1689 Warasdin Panorama',
    'Collab_06_cCc_Constrained_Monolith_Back': 'Collab 06 — Constrained Monolith',
    'Collab_07_Studio_Varazdin_Mountain_Editor_Back': 'Collab 07 — Mountain Editor "Change Music"',
    'Collab_08_cCc_Iron_Turtle_Guild_Back': 'Collab 08 — Iron Turtle Guild Cimer',

    # Collaborations Front
    'Collab_01_Studio_Varazdin_Alchemist_Laborer_Front': 'Collab 01 — The Alchemist Front Hit',
    'Collab_02_cCc_Middle_Ground_Horizon_Front': 'Collab 02 — Middle Ground Front Hit',
    'Collab_03_Studio_Varazdin_Semiotic_Matrix_Front': 'Collab 03 — Semiotic Matrix Front Hit',
    'Collab_03_cCc_Morska_Dekla_Siren_Front': 'Collab 03 — Morska Dekla Front Hit',
    'Collab_04_Studio_Varazdin_Fire_1776_Disaster_Front': 'Collab 04 — Fire 1776 Front Hit',
    'Collab_04_cCc_Kinetic_Madmen_Front': 'Collab 04 — Kinetic Madmen Front Hit',
    'Collab_05_Studio_Varazdin_Midnight_Reticle_Front': 'Collab 05 — Midnight Reticle Front Hit',
    'Collab_05_cCc_Sleeping_Angels_Acid_Front': 'Collab 05 — Sleeping Angels Front Hit',
    'Collab_06_Studio_Varazdin_Vischer_Panorama_Front': 'Collab 06 — Vischer Panorama Front Hit',
    'Collab_06_cCc_Constrained_Monolith_Front': 'Collab 06 — Constrained Monolith Front Hit',
    'Collab_07_Studio_Varazdin_Mountain_Editor_Front': 'Collab 07 — Mountain Editor Front Hit',
    'Collab_08_cCc_Iron_Turtle_Guild_Front': 'Collab 08 — Iron Turtle Front Hit',

    # 4-Ref Back
    'SV_4Ref_01_SideQuest_Woodcut_Back': 'SV 4Ref 01 — Side Quest Woodcut',
    'SV_4Ref_02_Praying_Guardian_Riso_Back': 'SV 4Ref 02 — Praying Guardian Riso',
    'SV_4Ref_03_Dual_Knights_Vigil_Back': 'SV 4Ref 03 — Dual Knights Vigil',
    'SV_4Ref_04_Rearing_CyberGothic_Back': 'SV 4Ref 04 — Rearing CyberGothic',
    'SV_4Ref_05_Grand_Synthesis_Master_Back': 'SV 4Ref 05 — Grand Synthesis Master',

    # 4-Ref Front
    'SV_4Ref_01_SideQuest_Woodcut_Front': 'SV 4Ref 01 — Side Quest Front Hit',
    'SV_4Ref_02_Praying_Guardian_Riso_Front': 'SV 4Ref 02 — Praying Guardian Front Hit',
    'SV_4Ref_03_Dual_Knights_Vigil_Front': 'SV 4Ref 03 — Dual Knights Front Hit',
    'SV_4Ref_04_Rearing_CyberGothic_Front': 'SV 4Ref 04 — CyberGothic Front Hit',
    'SV_4Ref_05_Grand_Synthesis_Master_Front': 'SV 4Ref 05 — Grand Synthesis Front Hit',

    # Heritage x Pinterest Back
    'Heritage_Combo_01_Florijan_Brutalist_Back': 'Heritage Combo 01 — St. Florian 1776 Disaster',
    'Heritage_Combo_02_Angels_Comix_Back': 'Heritage Combo 02 — Angelic Soundwave Comix',
    'Heritage_Combo_03_Erdody_GothicLitho_Back': 'Heritage Combo 03 — Probitati 1842 Gothic Litho',
    'Heritage_Combo_04_BaroqueAngel_Botanical_Back': 'Heritage Combo 04 — Cherub Nocturne Botanical',

    # Heritage x Pinterest Front
    'Heritage_Combo_01_Florijan_Brutalist_Front': 'Heritage Combo 01 — St. Florian Spec Front Hit',
    'Heritage_Combo_02_Angels_Comix_Front': 'Heritage Combo 02 — Angelic Soundwave Front Hit',
    'Heritage_Combo_03_Erdody_GothicLitho_Front': 'Heritage Combo 03 — Probitati 1842 Front Hit',
    'Heritage_Combo_04_BaroqueAngel_Botanical_Front': 'Heritage Combo 04 — Cherub Nocturne Front Hit',

    # Single Pinterest Focus Back
    'SV_Single_01_Woodcut_Knight_Back': 'SV Single 01 — Woodcut Galloping Knight',
    'SV_Single_02_Praying_Knight_Back': 'SV Single 02 — Steel Armor Praying Knight',
    'SV_Single_03_Sigil_Brutalist_Back': 'SV Single 03 — Neo-Gothic Brutalist Sigil',
    'SV_Single_04_Riso_Rearing_Knight_Back': 'SV Single 04 — Heavy Riso Rearing Knight',
    'SV_Single_05_Spray_Stencil_Back': 'SV Single 05 — Red Spray Stencil Spine',
    'SV_Single_06_Botanical_Arch_Back': 'SV Single 06 — Renaissance Botanical Arch',
    'SV_Single_07_Gothic_Metal_Back': 'SV Single 07 — Gothic Metal Litho',
    'SV_Single_08_Acid_Pop_Back': 'SV Single 08 — Acid Pop Neon Poster',
    'SV_Single_09_Comix_Ink_Back': 'SV Single 09 — 70s Underground Comix Ink',

    # Single Pinterest Focus Front
    'SV_Single_01_Woodcut_Knight_Front': 'SV Single 01 — Woodcut Knight Front Hit',
    'SV_Single_02_Praying_Knight_Front': 'SV Single 02 — Praying Knight Front Hit',
    'SV_Single_03_Sigil_Brutalist_Front': 'SV Single 03 — Brutalist Sigil Front Hit',
    'SV_Single_04_Riso_Rearing_Knight_Front': 'SV Single 04 — Rearing Knight Front Hit',
    'SV_Single_05_Spray_Stencil_Front': 'SV Single 05 — Spray Stencil Front Hit',
    'SV_Single_06_Botanical_Arch_Front': 'SV Single 06 — Botanical Arch Front Hit',
    'SV_Single_07_Gothic_Metal_Front': 'SV Single 07 — Gothic Metal Front Hit',
    'SV_Single_08_Acid_Pop_Front': 'SV Single 08 — Acid Pop Front Hit',
    'SV_Single_09_Comix_Ink_Front': 'SV Single 09 — Comix Ink Front Hit',

    # Utility Film Production Series Back
    'SV_Utility_01_Viewfinder_Back': 'SV Utility 01 — Viewfinder & Framing Matrix',
    'SV_Utility_02_Lens_Specs_Back': 'SV Utility 02 — Anamorphic Lens Spec Sheet',
    'SV_Utility_03_Spine_Stencil_Back': 'SV Utility 03 — Spine Stencil & Crew Unit 01',
    'SV_Utility_04_Brutalist_Grid_Back': 'SV Utility 04 — Neo-Gothic Brutalist Grid',
    'SV_Utility_05_Slate_Box_Back': 'SV Utility 05 — Production Slate & Bounding Box',
    'SV_Utility_06_Timecode_Horizon_Back': 'SV Utility 06 — 35mm Leader & Timecode Horizon',
    'SV_Utility_07_Lab_Seal_Back': 'SV Utility 07 — Film Lab Certified Seal',
    'SV_Utility_08_Swiss_Manifest_Back': 'SV Utility 08 — Swiss Production Manifest',
    'SV_Utility_09_Audio_Waveform_Back': 'SV Utility 09 — Audio Frequency & Sound Stage',
    'SV_Utility_10_Magazine_Label_Back': 'SV Utility 10 — Monolith 35mm Magazine Label',

    # Utility Film Production Series Front
    'SV_Utility_01_Viewfinder_Front': 'SV Utility 01 — Viewfinder Front Hit',
    'SV_Utility_02_Lens_Specs_Front': 'SV Utility 02 — Lens Specs Front Hit',
    'SV_Utility_03_Spine_Stencil_Front': 'SV Utility 03 — Spine Stencil Front Hit',
    'SV_Utility_04_Brutalist_Grid_Front': 'SV Utility 04 — Brutalist Grid Front Hit',
    'SV_Utility_05_Slate_Box_Front': 'SV Utility 05 — Slate Box Front Hit',
    'SV_Utility_06_Timecode_Horizon_Front': 'SV Utility 06 — Timecode Horizon Front Hit',
    'SV_Utility_07_Lab_Seal_Front': 'SV Utility 07 — Film Lab Seal Front Hit',
    'SV_Utility_08_Swiss_Manifest_Front': 'SV Utility 08 — Swiss Manifest Front Hit',
    'SV_Utility_09_Audio_Waveform_Front': 'SV Utility 09 — Audio Waveform Front Hit',
    'SV_Utility_10_Magazine_Label_Front': 'SV Utility 10 — Magazine Label Front Hit',

    # Tarot Lovers Back
    'SV_Lovers_03_Kneeling_Martyr_Back': 'The Lovers Betrayal — Kneeling Martyr',

    # Tarot Lovers Front
    'SV_Lovers_03_Kneeling_Martyr_Front': 'The Lovers — Martyr Front Hit',

    # Minimal Series
    'Front Minimal - Creative Collective Center Chest Black': 'cCc — Center Chest Minimal Black',
    'Front Minimal - Creative Collective Minimal Box': 'cCc — Minimal Bounding Box',
    'Front Minimal - Knight Helmet Pure Minimal Icon': 'Knight Helmet — Pure Minimal Icon',
    'Front Minimal - Studio Varazdin Center Chest Large': 'Studio Varaždin — Center Chest Large',
    'Front Minimal - Studio Varazdin Lowercase Black': 'studio varaždin — Lowercase Minimal Black',
    'Front Minimal - Studio Varazdin Lowercase Bone': 'studio varaždin — Lowercase Minimal Bone',
    'Front Minimal - Studio Varazdin Minimal Box': 'Studio Varaždin — Minimal Bounding Box',
    'Front Minimal - Studio Varazdin Part of cCc.': 'Studio Varaždin — part of cCc.',
    'Front Minimal - Studio Varazdin Red Dot Accent': 'Studio Varaždin — Red Dot Accent',
    'Front Minimal - Studio Varazdin Stacked Two-Tone': 'Studio Varaždin — Stacked Two-Tone',
    'Front Minimal - Varazdin Pure Red Script': 'Varaždin — Pure Red Script',
    'Front Minimal - cCc. Monogram Creative Collective': 'cCc. — Monogram Creative Collective'
}

DESCRIPTION_MAP = {
    'SV_Lovers_03_Kneeling_Martyr_Back': 'Poljubac i oštrica u istoj sekundi. Oklopnik kleči na koplju dok mu dlanovi klize niz dršku, a ona drži krvavi vrh što izbija iz prsiju.',
    'SV_Lovers_03_Kneeling_Martyr_Front': 'Minimalistički prsni motiv — The Lovers & Ideas Can\'t Die.'
}

def get_hash(path: Path) -> str:
    h = hashlib.md5()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def clean_title(stem: str) -> str:
    if stem in TITLE_MAP:
        return TITLE_MAP[stem]

    raw = stem
    prefixes = [
        'CV Tee - ', 'SV Tee - ', 'Garda Tee - ', 'T-Shirt - ',
        'Front Minimal - ', 'Front Hit - ', 'SV Artwear - ', 'SV Print - '
    ]
    for p in prefixes:
        if raw.startswith(p):
            raw = raw[len(p):]
            break
            
    raw = re.sub(r'\s*1664x2048', '', raw, flags=re.IGNORECASE)
    raw = re.sub(r'\s*1024-1024', '', raw, flags=re.IGNORECASE)
    raw = re.sub(r'\s*copy', '', raw, flags=re.IGNORECASE)
    raw = raw.replace('_', ' ').replace('-', ' ').strip()
    raw = re.sub(r'\s+', ' ', raw)
    
    words = []
    for w in raw.split():
        if w.upper() in {'CCC', 'SV', 'CV', 'VZ', 'DTF', 'GPT', 'GPT2', 'QA', '1181', '1209', '1776', '1689', '1842', '1474', '1404', '1368', '35MM'}:
            words.append(w.upper())
        elif w.lower() in {'u', 'na', 'sa', 'i', 'of', 'the', 'in', 'and', 'for', 'to'}:
            words.append(w.lower())
        else:
            words.append(w.capitalize())
    return ' '.join(words)

def generate_description(stem: str, category: str, title: str) -> str:
    if stem in DESCRIPTION_MAP:
        return DESCRIPTION_MAP[stem]
    if category == "City":
        return f"Arhitektonska veduta i urbani motiv Varaždina — {title}."
    elif category == "Studio":
        return f"Službeni filmski i cehovski motiv — {title}."
    elif category == "Garda":
        return f"Povijesni motiv Varaždinske građanske garde (Purgari) — {title}."
    elif category == "Towers":
        return f"Varaždin grad zvonika — arhitektonski profil tornja {title}."
    elif category == "Utility":
        return f"Filmska Produkcija Utility serija — tehnička matrica {title}."
    elif category == "Artwear":
        return f"Povijesni sakralni i heraldički motiv — {title}."
    elif category == "Front Hits":
        return f"Minimalistički prsni motiv — {title}."
    elif category == "Experimental":
        return f"Eksperimentalni vizualni motiv — {title}."
    else: # Creative
        return f"Autorski konceptualni streetwear dizajn — {title}."

def optimize_image(src_path: Path, out_path: Path, max_height=1200):
    try:
        with Image.open(src_path) as img:
            img = img.convert("RGBA")
            w, h = img.size
            if h > max_height:
                ratio = max_height / h
                new_w = int(w * ratio)
                img = img.resize((new_w, max_height), Image.Resampling.LANCZOS)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(out_path, "WEBP", quality=88, method=6)
            return True
    except Exception as e:
        print(f"[ERROR] Failed to optimize {src_path.name}: {e}")
        return False

def build_catalog():
    print("[1/5] Scanning and deduplicating all master design sources...")
    
    seen_hashes = {}
    seen_norm_stems = {}
    collected_items = []

    # Process all configured directories in order of priority
    for rel_dir, cat in COLLECTIONS_CONFIG:
        p_dir = ROOT_DIR / rel_dir
        if not p_dir.exists():
            continue
            
        for f in sorted(os.listdir(p_dir)):
            if f.startswith('.') or not f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                continue
            full_p = p_dir / f
            if full_p.is_dir():
                continue
            
            # Skip duplicate copies or temp artifacts
            if 'copy' in f.lower() or f.startswith('Selected - ') or 'archived' in f.lower():
                continue

            h = get_hash(full_p)
            if h in seen_hashes:
                continue

            # Check normalized stem (prefer PNG, prefer 1664x2048 master)
            stem = full_p.stem
            norm_stem = re.sub(r'[\s\-_]+', ' ', stem.lower()).strip()
            norm_stem = re.sub(r'\s*1664x2048', '', norm_stem)
            
            if norm_stem in seen_norm_stems:
                existing = seen_norm_stems[norm_stem]
                # If current file is PNG and existing was not, replace
                if full_p.suffix.lower() == '.png' and existing['path'].suffix.lower() != '.png':
                    seen_hashes.pop(existing['hash'], None)
                    collected_items.remove(existing)
                else:
                    continue

            item_info = {
                'path': full_p,
                'filename': f,
                'stem': stem,
                'norm_stem': norm_stem,
                'category': cat,
                'dir': rel_dir,
                'hash': h
            }
            seen_hashes[h] = item_info
            seen_norm_stems[norm_stem] = item_info
            collected_items.append(item_info)

    print(f"  -> Found {len(collected_items)} unique canonical designs across all series.")

    # Sort items logically by category and title
    cat_order = {
        'City': 1,
        'Studio': 2,
        'Garda': 3,
        'Towers': 4,
        'Utility': 5,
        'Creative': 6,
        'Artwear': 7,
        'Front Hits': 8,
        'Experimental': 9
    }
    
    collected_items.sort(key=lambda x: (cat_order.get(x['category'], 99), clean_title(x['stem'])))

    # Ensure optimized directories exist
    for target in TARGET_DIRS:
        (target / "assets" / "optimized").mkdir(parents=True, exist_ok=True)
        (target / "js").mkdir(parents=True, exist_ok=True)

    # Load existing votes if available to preserve baseline scores
    votes_file = SWIPER_DIR / "api" / "data" / "votes.json"
    existing_votes = {}
    total_votes_count = 2254
    unique_voters = []
    if votes_file.exists():
        try:
            v_json = json.loads(votes_file.read_text(encoding='utf-8'))
            total_votes_count = v_json.get('totalVotes', 2254)
            unique_voters = v_json.get('uniqueVoters', [])
            for k, v in v_json.get('items', {}).items():
                img_key = v.get('image', '').replace('\\/', '/')
                if img_key:
                    existing_votes[img_key] = v
                existing_votes[k] = v
        except Exception as e:
            print(f"  [!] Note: Could not parse votes.json: {e}")

    print("\n[2/5] Optimizing missing WebP assets to all targets...")
    opt_count = 0
    valid_webp_filenames = set()

    catalog_data = []
    updated_votes_items = {}

    for idx, item in enumerate(collected_items, start=1):
        clean_name = item['stem']
        clean_name = re.sub(r'\s*1664x2048', '', clean_name).strip()
        webp_name = f"{clean_name}.webp"
        valid_webp_filenames.add(webp_name)

        # Optimize for each target if not already present or out of date
        for target in TARGET_DIRS:
            dest = target / "assets" / "optimized" / webp_name
            if not dest.exists() or dest.stat().st_mtime < item['path'].stat().st_mtime:
                optimize_image(item['path'], dest)
                opt_count += 1

        title = clean_title(item['stem'])
        slug = re.sub(r'[^a-z0-9]+', '_', clean_name.lower()).strip('_')
        desc = generate_description(item['stem'], item['category'], title)
        
        tags = [item['category'].lower(), "streetwear", "varazdin"]
        if "lovers" in clean_name.lower():
            tags.extend(["lovers", "tarot", "ideas-cant-die"])
        
        rel_img = f"assets/optimized/{webp_name}"
        item_id = f"sv-{idx:03d}"

        # Match with existing votes
        v = existing_votes.get(rel_img) or existing_votes.get(item_id)
        likes = v.get('likes', 0) if v else 0
        passes = v.get('passes', 0) if v else 0
        superlikes = v.get('superlikes', 0) if v else 0
        score = v.get('score', likes + (superlikes * 3)) if v else (likes + (superlikes * 3))
        impressions = v.get('impressions', likes + passes + superlikes) if v else (likes + passes + superlikes)

        entry = {
            "id": item_id,
            "slug": slug,
            "title": title,
            "category": item['category'],
            "image": rel_img,
            "description": desc,
            "likes": likes,
            "passes": passes,
            "superlikes": superlikes,
            "score": score,
            "totalVotes": likes + passes + superlikes,
            "tags": tags
        }
        catalog_data.append(entry)

        updated_votes_items[item_id] = {
            "id": item_id,
            "title": title,
            "category": item['category'],
            "likes": likes,
            "passes": passes,
            "superlikes": superlikes,
            "score": score,
            "image": rel_img,
            "impressions": impressions
        }

    print(f"  -> Optimized {opt_count} new WebP images.")

    print("\n[3/5] Cleaning up duplicate and orphan WebP files...")
    cleaned_count = 0
    for target in TARGET_DIRS:
        opt_folder = target / "assets" / "optimized"
        for webp_file in opt_folder.glob("*.webp"):
            if webp_file.name not in valid_webp_filenames:
                try:
                    webp_file.unlink()
                    cleaned_count += 1
                except Exception as e:
                    print(f"  [!] Failed to delete orphan {webp_file.name}: {e}")
    print(f"  -> Removed {cleaned_count} duplicate/orphan WebP files.")

    print("\n[4/5] Writing updated catalog JS and JSON data...")
    master_js_content = "export const CATALOG_DATA = " + json.dumps(catalog_data, indent=2, ensure_ascii=False) + ";\n"

    for target in TARGET_DIRS:
        # 1. Always write the full master catalog
        master_js = target / "js" / "catalog-data.master.js"
        master_js.parent.mkdir(parents=True, exist_ok=True)
        master_js.write_text(master_js_content, encoding="utf-8")

        # 2. Check for existing active curation (active-ids.json or active-catalog.json)
        data_dir = target / "api" / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        active_ids_file = data_dir / "active-ids.json"
        active_json_file = data_dir / "active-catalog.json"
        primary_js = target / "js" / "catalog-data.js"

        active_subset = []
        active_ids_list = []

        if active_ids_file.exists():
            try:
                active_ids_list = json.loads(active_ids_file.read_text(encoding="utf-8"))
            except Exception:
                active_ids_list = []

        if not active_ids_list and active_json_file.exists():
            try:
                raw_active = json.loads(active_json_file.read_text(encoding="utf-8"))
                if isinstance(raw_active, list):
                    active_ids_list = [it.get("id") for it in raw_active if it.get("id")]
            except Exception:
                active_ids_list = []

        # If an active curation exists, filter master by those IDs
        if active_ids_list:
            master_by_id = {it["id"]: it for it in catalog_data}
            active_subset = [master_by_id[aid] for aid in active_ids_list if aid in master_by_id]

        # If no active curation exists yet, default to all master items
        if not active_subset:
            active_subset = catalog_data
            active_ids_list = [it["id"] for it in catalog_data]

        # Write active-ids.json
        active_ids_file.write_text(json.dumps(active_ids_list, indent=2, ensure_ascii=False), encoding="utf-8")

        # Write active-catalog.json
        active_json_file.write_text(json.dumps(active_subset, indent=2, ensure_ascii=False), encoding="utf-8")

        # Write active catalog-data.js
        active_js_content = "export const CATALOG_DATA = " + json.dumps(active_subset, indent=2, ensure_ascii=False) + ";\n"
        primary_js.write_text(active_js_content, encoding="utf-8")

        # Write synchronized votes.json
        votes_out = {
            "totalVotes": total_votes_count,
            "uniqueVoters": unique_voters,
            "items": updated_votes_items
        }
        target_votes_file = data_dir / "votes.json"
        target_votes_file.write_text(json.dumps(votes_out, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n[5/5] Final Catalog Statistics:")
    by_cat = defaultdict(int)
    for it in catalog_data:
        by_cat[it['category']] += 1
    
    for c, count in sorted(by_cat.items(), key=lambda x: cat_order.get(x[0], 99)):
        print(f"  ✓ {c.ljust(15)} : {count} designs")
    print(f"  -----------------------------------")
    print(f"  ★ TOTAL MASTER CATALOG : {len(catalog_data)} designs")
    print("\n[SUCCESS] Swiper and Tajno-Glasanje catalogs are fully synchronized and duplicate-free!")

if __name__ == "__main__":
    build_catalog()
