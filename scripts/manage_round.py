#!/usr/bin/env python3
"""
Studio Varaždin — Tajno Glasanje Master CLI & Round Manager
Allows inspecting rounds, rankings, advancing to round 2/finals, and exporting data.
"""

import os
import sys
import json
import argparse
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "website", "tajno-glasanje", "api", "data")
JS_DIR = os.path.join(BASE_DIR, "website", "tajno-glasanje", "js")
ROUNDS_FILE = os.path.join(DATA_DIR, "rounds.json")
VOTES_FILE = os.path.join(DATA_DIR, "votes.json")
ACTIVE_CATALOG_FILE = os.path.join(DATA_DIR, "active-catalog.json")
CATALOG_JS_FILE = os.path.join(JS_DIR, "catalog-data.js")
MASTER_JS_FILE = os.path.join(JS_DIR, "catalog-data.master.js")

def load_json(filepath, default=None):
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default

def save_json(filepath, data):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def parse_catalog_js(filepath):
    if not os.path.exists(filepath):
        return []
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    start = content.find("[")
    end = content.rfind("]")
    if start != -1 and end != -1 and end > start:
        return json.loads(content[start:end+1])
    return []

def get_ranked_items_from_votes(votes_data):
    items = list(votes_data.get("items", {}).values())
    for it in items:
        likes = it.get("likes", 0)
        superlikes = it.get("superlikes", 0)
        passes = it.get("passes", 0)
        total = likes + superlikes + passes
        it["totalVotes"] = total
        it["approvalRate"] = round(((likes + superlikes) / total * 100)) if total > 0 else 0
        alpha = likes + (superlikes * 2.8) + 2.0
        beta = (passes * 1.2) + 2.0
        it["bayesianMean"] = round(alpha / (alpha + beta), 3)
        it["score"] = likes + (superlikes * 3)

    items.sort(key=lambda x: (x.get("score", 0), x.get("bayesianMean", 0), x.get("superlikes", 0)), reverse=True)
    return items

def cmd_list(args):
    rounds_data = load_json(ROUNDS_FILE, {"activeRound": 1, "rounds": []})
    print("\n👑 STUDIO VARAŽDIN · EVIDENCIJA KOLA TAJNOG GLASANJA")
    print("=" * 65)
    print(f"Aktivno kolo: {rounds_data.get('activeRound')}\n")
    
    for r in rounds_data.get("rounds", []):
        status_sym = "🟢 AKTIVNO" if r.get("status") == "active" else "✅ ZAVRŠENO"
        print(f"[{r.get('id')}] {r.get('name')} ({status_sym})")
        print(f"    Glasova: {r.get('totalVotes', 0)} | Glasača: {r.get('uniqueVoters', 0)} | Motiva: {r.get('totalItems', 0)}")
        if r.get('dateCompleted'):
            print(f"    Dovršeno: {r.get('dateCompleted')}")
        print()

def cmd_rankings(args):
    round_num = args.round
    target_file = VOTES_FILE
    if round_num and round_num > 0:
        snapshot1 = os.path.join(DATA_DIR, f"votes_round_{round_num}.json")
        snapshot2 = os.path.join(DATA_DIR, f"votes-round{round_num}-snapshot.json")
        if os.path.exists(snapshot1):
            target_file = snapshot1
        elif os.path.exists(snapshot2):
            target_file = snapshot2

    votes_data = load_json(target_file, {})
    if not votes_data or "items" not in votes_data:
        print(f"❌ Nema podataka za kolo {round_num or 'aktivno'} u {target_file}")
        return

    items = get_ranked_items_from_votes(votes_data)
    top_limit = args.top or 30

    print(f"\n🏆 RANG LISTA — KOLO {round_num or 'Aktivno'} (Top {top_limit} od {len(items)} motiva)")
    print("=" * 80)
    print(f"{'Rang':<5} {'ID':<9} {'Bod':<5} {'★':<4} {'❤️':<4} {'✕':<4} {'Odobr%':<8} {'Naziv Motiva'}")
    print("-" * 80)

    for i, it in enumerate(items[:top_limit], 1):
        print(f"{i:<5} {it.get('id',''):<9} {it.get('score',0):<5} {it.get('superlikes',0):<4} {it.get('likes',0):<4} {it.get('passes',0):<4} {str(it.get('approvalRate',0))+'%':<8} {it.get('title','')}")
    print("=" * 80 + "\n")

def cmd_advance(args):
    rounds_data = load_json(ROUNDS_FILE, {"activeRound": 1, "rounds": []})
    curr_round = rounds_data.get("activeRound", 1)
    next_round = curr_round + 1
    top_n = args.top or 30

    print(f"\n🚀 Pokretanje {next_round}. kola (Top {top_n} Finalista)...")

    # 1. Archive current round
    votes_data = load_json(VOTES_FILE, {"items": {}})
    curr_items = get_ranked_items_from_votes(votes_data)

    archive_file = os.path.join(DATA_DIR, f"votes_round_{curr_round}.json")
    snapshot_file = os.path.join(DATA_DIR, f"votes-round{curr_round}-snapshot.json")
    save_json(archive_file, votes_data)
    save_json(snapshot_file, votes_data)

    # 2. Pick top N finalists
    finalist_items = curr_items[:top_n]
    finalist_ids = set(it["id"] for it in finalist_items)
    print(f"✓ Odabrano {len(finalist_items)} finalista iz {curr_round}. kola.")

    # 3. Match with master catalog
    master_catalog = parse_catalog_js(MASTER_JS_FILE) or parse_catalog_js(CATALOG_JS_FILE)
    next_catalog = [m for m in master_catalog if m["id"] in finalist_ids]
    if not next_catalog:
        next_catalog = finalist_items

    # 4. Save new active catalog
    save_json(ACTIVE_CATALOG_FILE, next_catalog)
    js_content = f"export const CATALOG_DATA = {json.dumps(next_catalog, indent=2, ensure_ascii=False)};\n"
    with open(CATALOG_JS_FILE, "w", encoding="utf-8") as f:
        f.write(js_content)
    print(f"✓ Ažuriran aktivni swiper špil ({len(next_catalog)} motiva u js/catalog-data.js)")

    # 5. Reset votes.json for next round
    new_votes_store = {
        "round": next_round,
        "totalVotes": 0,
        "uniqueVoters": [],
        "items": {},
        "recentFeed": []
    }
    save_json(VOTES_FILE, new_votes_store)
    print(f"✓ Resetiran brojač glasova za {next_round}. kolo")

    # 6. Update rounds.json
    for r in rounds_data.get("rounds", []):
        if r.get("id") == curr_round:
            r["status"] = "completed"
            r["totalVotes"] = votes_data.get("totalVotes", 0)
            r["uniqueVoters"] = len(votes_data.get("uniqueVoters", []))
            r["totalItems"] = len(curr_items)
            r["dateCompleted"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    round_name = args.name or f"{next_round}. Kolo — Finale ({top_n} Finalista)"
    rounds_data["activeRound"] = next_round
    rounds_data["rounds"].append({
        "id": next_round,
        "name": round_name,
        "description": f"Glasanje za vodećih {top_n} finalista iz {curr_round}. kola",
        "status": "active",
        "totalVotes": 0,
        "uniqueVoters": 0,
        "totalItems": len(next_catalog),
        "dateStarted": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "dataFile": "votes.json"
    })
    save_json(ROUNDS_FILE, rounds_data)

    print(f"✅ {next_round}. Kolo je uspješno pripremljeno i aktivirano!\n")

def main():
    parser = argparse.ArgumentParser(description="Studio Varaždin — Tajno Glasanje CLI")
    subparsers = parser.add_subparsers(dest="subcommand", help="Naredba")

    # list
    sub_list = subparsers.add_parser("list", help="Prikaži sva kola")
    sub_list.set_defaults(func=cmd_list)

    # rankings
    sub_rank = subparsers.add_parser("rankings", help="Prikaži rang listu")
    sub_rank.add_argument("--round", type=int, default=1, help="Broj kola (default: 1)")
    sub_rank.add_argument("--top", type=int, default=30, help="Broj motiva za prikaz (default: 30)")
    sub_rank.set_defaults(func=cmd_rankings)

    # advance
    sub_adv = subparsers.add_parser("advance", help="Pokreni novo kolo s vodećim finalistima")
    sub_adv.add_argument("--top", type=int, default=30, help="Broj finalista za ulazak u novo kolo (default: 30)")
    sub_adv.add_argument("--name", type=str, default="", help="Naziv novog kola")
    sub_adv.set_defaults(func=cmd_advance)

    args = parser.parse_args()
    if hasattr(args, "func"):
        args.func(args)
    else:
        cmd_list(args)

if __name__ == "__main__":
    main()
