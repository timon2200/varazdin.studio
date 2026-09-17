#!/bin/bash
set -e

# Studio Varaždin — Tajno Glasanje Live Sync Script
# Syncs live votes, rounds and catalog state from varazdin.studio down to local workspace

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$ROOT_DIR/website/tajno-glasanje/api/data"
JS_DIR="$ROOT_DIR/website/tajno-glasanje/js"
BASE_URL="https://varazdin.studio/tajno-glasanje"

mkdir -p "$DATA_DIR"
mkdir -p "$JS_DIR"

echo "🔄 [1/5] Preuzimam podatke o glasanju (votes.json)..."
curl -s -f "$BASE_URL/api/data/votes.json" -o "$DATA_DIR/votes.json" || true

echo "🔄 [2/5] Preuzimam evidenciju kola (rounds.json)..."
curl -s -f "$BASE_URL/api/data/rounds.json" -o "$DATA_DIR/rounds.json" || true

echo "🔄 [3/5] Preuzimam arhive prethodnih kola..."
curl -s -f "$BASE_URL/api/data/votes_round_1.json" -o "$DATA_DIR/votes_round_1.json" || true
curl -s -f "$BASE_URL/api/data/votes_round_2.json" -o "$DATA_DIR/votes_round_2.json" || true

echo "🔄 [4/6] Preuzimam aktivni katalog i selekciju..."
curl -s -f "$BASE_URL/api/data/active-ids.json" -o "$DATA_DIR/active-ids.json" || true
curl -s -f "$BASE_URL/api/data/active-catalog.json" -o "$DATA_DIR/active-catalog.json" || true
curl -s -f "$BASE_URL/api/data/comments.json" -o "$DATA_DIR/comments.json" || true
curl -s -f "$BASE_URL/js/catalog-data.js" -o "$JS_DIR/catalog-data.js" || true
curl -s -f "$BASE_URL/js/catalog-data.master.js" -o "$JS_DIR/catalog-data.master.js" || true

echo "📊 [5/6] Generiram rang liste i izvještaje (JSON, MD, CSV)..."
python3 "$SCRIPT_DIR/export_round1_report.py"

# Generate CSV directly
python3 -c "
import json, csv, os

data_dir = '$DATA_DIR'
target_file = os.path.join(data_dir, 'votes_round_1.json')
if not os.path.exists(target_file):
    target_file = os.path.join(data_dir, 'votes.json')

if os.path.exists(target_file):
    with open(target_file, 'r', encoding='utf-8') as f:
        store = json.load(f)
    items = list(store.get('items', {}).values())
    for it in items:
        likes = it.get('likes', 0)
        superlikes = it.get('superlikes', 0)
        passes = it.get('passes', 0)
        tot = likes + superlikes + passes
        it['totalVotes'] = tot
        it['approvalRate'] = round(((likes + superlikes) / tot * 100)) if tot > 0 else 0
        alpha = likes + (superlikes * 2.8) + 2.0
        beta = (passes * 1.2) + 2.0
        it['bayesianMean'] = round(alpha / (alpha + beta), 3)
        it['score'] = likes + (superlikes * 3)

    items.sort(key=lambda x: (x.get('score', 0), x.get('bayesianMean', 0), x.get('superlikes', 0)), reverse=True)

    csv_path = os.path.join(data_dir, 'round1-results.csv')
    with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerow(['Rang', 'ID Motiva', 'Naziv Motiva', 'Kategorija', 'Ukupno Bodova', 'Superlike (★)', 'Like (❤️)', 'Pass (✕)', 'Ukupno Glasova', 'Odobrenje (%)', 'Bayesian Mean', 'Slika'])
        for rank, it in enumerate(items, 1):
            writer.writerow([rank, it.get('id',''), it.get('title',''), it.get('category',''), it.get('score',0), it.get('superlikes',0), it.get('likes',0), it.get('passes',0), it.get('totalVotes',0), str(it.get('approvalRate',0))+'%', it.get('bayesianMean',0), it.get('image','')])
    print('✓ Generiran CSV: ' + csv_path)
"

echo "✅ Sinkronizacija uspješno dovršena!"
