#!/usr/bin/env python3
"""
Studio Varaždin — Tajno Glasanje Round 1 Exporter & Leaderboard Generator
Reads votes.json and exports snapshot, ranked JSON and Markdown reports.
"""

import os
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "website", "tajno-glasanje", "api", "data")
VOTES_FILE = os.path.join(DATA_DIR, "votes.json")

def main():
    if not os.path.exists(VOTES_FILE):
        print(f"Error: {VOTES_FILE} not found.")
        return

    with open(VOTES_FILE, "r", encoding="utf-8") as f:
        votes_data = json.load(f)

    # 1. Save Exact Snapshot
    snapshot_path = os.path.join(DATA_DIR, "votes-round1-snapshot.json")
    with open(snapshot_path, "w", encoding="utf-8") as f:
        json.dump(votes_data, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved snapshot: {snapshot_path}")

    items = list(votes_data.get("items", {}).values())
    for item in items:
        likes = item.get("likes", 0)
        superlikes = item.get("superlikes", 0)
        passes = item.get("passes", 0)
        total = likes + superlikes + passes
        item["totalVotes"] = total
        item["approvalRate"] = round(((likes + superlikes) / total * 100)) if total > 0 else 0
        
        # Bayesian mean
        alpha = likes + (superlikes * 2.8) + 2.0
        beta = (passes * 1.2) + 2.0
        item["bayesianMean"] = round(alpha / (alpha + beta), 3)

    # Sort descending by score, then bayesian mean, then superlikes
    items.sort(key=lambda x: (x.get("score", 0), x.get("bayesianMean", 0), x.get("superlikes", 0)), reverse=True)

    leaderboard = {
        "round": 1,
        "totalVotes": votes_data.get("totalVotes", 0),
        "uniqueVoters": len(votes_data.get("uniqueVoters", [])),
        "totalItemsVoted": len(items),
        "rankedItems": items
    }

    # 2. Save Leaderboard JSON
    leaderboard_json_path = os.path.join(DATA_DIR, "round1-results-leaderboard.json")
    with open(leaderboard_json_path, "w", encoding="utf-8") as f:
        json.dump(leaderboard, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved leaderboard JSON: {leaderboard_json_path}")

    # 3. Save Markdown Report
    md = []
    md.append("# Studio Varaždin — Rezultati Tajnog Glasanja (1. Kolo)\n")
    md.append(f"**Ukupno zabilježenih glasova:** `{votes_data.get('totalVotes')}`  ")
    md.append(f"**Broj jedinstvenih glasača:** `{len(votes_data.get('uniqueVoters', []))}`  ")
    md.append(f"**Ukupno motiva u špilu:** `{len(items)}`\n")
    md.append("## Top 50 Finalista (Rangirano po bodovima i odobrenju)\n")
    md.append("| Rang | ID | Naziv Motiva | Kategorija | Bodovi | Superlike ★ | Like ❤️ | Pass ✕ | Odobrenje (%) |")
    md.append("| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |")

    for i, it in enumerate(items[:50], 1):
        item_id = it.get("id", "")
        title = it.get("title", "")
        category = it.get("category", "")
        score = it.get("score", 0)
        superlikes = it.get("superlikes", 0)
        likes = it.get("likes", 0)
        passes = it.get("passes", 0)
        approval = it.get("approvalRate", 0)
        md.append(f"| {i} | `{item_id}` | **{title}** | {category} | **{score}** | {superlikes} | {likes} | {passes} | {approval}% |")

    # Category analysis
    categories = {}
    for it in items:
        cat = it.get("category", "Ostalo")
        if cat not in categories:
            categories[cat] = {"count": 0, "totalScore": 0, "superlikes": 0, "likes": 0, "passes": 0}
        categories[cat]["count"] += 1
        categories[cat]["totalScore"] += it.get("score", 0)
        categories[cat]["superlikes"] += it.get("superlikes", 0)
        categories[cat]["likes"] += it.get("likes", 0)
        categories[cat]["passes"] += it.get("passes", 0)

    md.append("\n## Analiza po kategorijama\n")
    md.append("| Kategorija | Broj Motiva | Ukupni Bodovi | Superlike ★ | Like ❤️ | Pass ✕ | Prosj. Bodova po Motivu |")
    md.append("| :--- | :---: | :---: | :---: | :---: | :---: | :---: |")
    
    sorted_cats = sorted(categories.items(), key=lambda x: x[1]["totalScore"], reverse=True)
    for cat_name, stats in sorted_cats:
        avg_score = round(stats["totalScore"] / stats["count"], 2) if stats["count"] > 0 else 0
        md.append(f"| **{cat_name}** | {stats['count']} | **{stats['totalScore']}** | {stats['superlikes']} | {stats['likes']} | {stats['passes']} | {avg_score} |")

    md_path = os.path.join(DATA_DIR, "round1-results-leaderboard.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")
    print(f"✓ Saved markdown report: {md_path}")

if __name__ == "__main__":
    main()
