#!/usr/bin/env python3
"""
Studio Varaždin — Local Dev Server with Mock PHP API Handlers
Supports static files, WebP images, and /api/*.php endpoints:
- vote.php: records likes/superlikes/passes, resets votes
- stats.php: returns live aggregated leaderboard rankings & recent activity
- curate.php: GET/POST for selecting & saving active catalog items
- rounds.php: GET/POST for round transitions, archives, and state persistence
- comment.php: GET/POST for item notes & comments
- export.php: CSV / JSON exports with UTF-8 BOM
"""

import os
import sys
import json
import time
import csv
import io
import math
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler

SWIPER_DIR = Path(__file__).resolve().parent
DATA_DIR = SWIPER_DIR / "api" / "data"
JS_DIR = SWIPER_DIR / "js"
VOTES_FILE = DATA_DIR / "votes.json"
CURATE_FILE = DATA_DIR / "active-catalog.json"
COMMENTS_FILE = DATA_DIR / "comments.json"
ROUNDS_FILE = DATA_DIR / "rounds.json"
CATALOG_JS = JS_DIR / "catalog-data.js"
MASTER_JS = JS_DIR / "catalog-data.master.js"

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(JS_DIR, exist_ok=True)

def parse_catalog_js(file_path):
    if not file_path.exists():
        return []
    try:
        content = file_path.read_text(encoding="utf-8")
        start = content.find("[")
        end = content.rfind("]")
        if start != -1 and end != -1 and end > start:
            return json.loads(content[start:end+1])
    except Exception as e:
        print(f"[WARN] Error parsing {file_path}:", e)
    return []

def get_master_catalog():
    master = parse_catalog_js(MASTER_JS)
    if not master:
        master = parse_catalog_js(CATALOG_JS)
    return master

def get_active_catalog():
    if CURATE_FILE.exists():
        try:
            items = json.loads(CURATE_FILE.read_text(encoding="utf-8"))
            if isinstance(items, list):
                return items
        except Exception:
            pass
    return parse_catalog_js(CATALOG_JS)

def save_active_catalog(active_items):
    # 1. Save JSON
    try:
        CURATE_FILE.write_text(json.dumps(active_items, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print("[ERROR] Failed to save active-catalog.json:", e)

    # 2. Save JS module
    try:
        js_code = "export const CATALOG_DATA = " + json.dumps(active_items, indent=2, ensure_ascii=False) + ";\n"
        CATALOG_JS.write_text(js_code, encoding="utf-8")
    except Exception as e:
        print("[ERROR] Failed to save catalog-data.js:", e)

    # 3. Mirror to website/tajno-glasanje if exists
    tajno_dir = SWIPER_DIR.parent / "website" / "tajno-glasanje"
    if tajno_dir.exists():
        try:
            t_data = tajno_dir / "api" / "data" / "active-catalog.json"
            t_js = tajno_dir / "js" / "catalog-data.js"
            os.makedirs(t_data.parent, exist_ok=True)
            os.makedirs(t_js.parent, exist_ok=True)
            t_data.write_text(json.dumps(active_items, indent=2, ensure_ascii=False), encoding="utf-8")
            t_js.write_text("export const CATALOG_DATA = " + json.dumps(active_items, indent=2, ensure_ascii=False) + ";\n", encoding="utf-8")
        except Exception as e:
            print("[WARN] Mirror to tajno-glasanje failed:", e)

def load_comments_store():
    if COMMENTS_FILE.exists():
        try:
            return json.loads(COMMENTS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

def save_comments_store(store):
    try:
        COMMENTS_FILE.write_text(json.dumps(store, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print("[ERROR] Failed to save comments:", e)

def load_rounds_store():
    if ROUNDS_FILE.exists():
        try:
            return json.loads(ROUNDS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "activeRound": 1,
        "rounds": [
            {
                "id": 1,
                "name": "1. Kolo — Selekcija Cijelog Špila",
                "status": "completed",
                "totalVotes": 0,
                "uniqueVoters": 0,
                "totalItems": 0,
                "dateStarted": time.strftime("%Y-%m-%d"),
                "dataFile": "votes_round_1.json"
            }
        ]
    }

def save_rounds_store(store):
    try:
        ROUNDS_FILE.write_text(json.dumps(store, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print("[ERROR] Failed to save rounds:", e)

def load_votes_store(file_path=None):
    target = file_path or VOTES_FILE
    if target.exists():
        try:
            return json.loads(target.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "totalVotes": 0,
        "uniqueVoters": [],
        "items": {},
        "recentFeed": []
    }

def save_votes_store(store, file_path=None):
    target = file_path or VOTES_FILE
    try:
        target.write_text(json.dumps(store, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print("[ERROR] Failed to save votes:", e)

class SwiperDevHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SWIPER_DIR), **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Cache-Control, Pragma")
        self.end_headers()

    def do_GET(self):
        url_path = self.path.split("?")[0]
        query_str = self.path.split("?")[1] if "?" in self.path else ""
        query_params = dict(qc.split("=") for qc in query_str.split("&") if "=" in qc)

        # Handle favicon
        if url_path == "/favicon.ico":
            fav_svg = SWIPER_DIR.parent / "website" / "favicon-dark.svg"
            if fav_svg.exists():
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml")
                self.end_headers()
                self.wfile.write(fav_svg.read_bytes())
                return
            self.send_response(204)
            self.end_headers()
            return

        # Handle /api/stats.php
        if url_path.endswith("/api/stats.php") or url_path == "/api/stats.php":
            round_param = query_params.get("round", "active")
            r_store = load_rounds_store()
            active_round = r_store.get("activeRound", 1)
            target_round = active_round

            data_file = VOTES_FILE
            if round_param != "active" and round_param.isdigit():
                target_round = int(round_param)
                snap1 = DATA_DIR / f"votes_round_{target_round}.json"
                snap2 = DATA_DIR / f"votes-round{target_round}-snapshot.json"
                if snap1.exists():
                    data_file = snap1
                elif snap2.exists():
                    data_file = snap2

            store = load_votes_store(data_file)
            items_list = list(store.get("items", {}).values())

            for item in items_list:
                likes = item.get("likes", 0)
                passes = item.get("passes", 0)
                superlikes = item.get("superlikes", 0)
                total = likes + passes + superlikes
                item["totalVotes"] = total
                item["approvalRate"] = round(((likes + superlikes) / total) * 100) if total > 0 else 0
                alpha = likes + (superlikes * 2.8) + 2.0
                beta = (passes * 1.2) + 2.0
                item["bayesianMean"] = round(alpha / (alpha + beta), 3)
                p = (likes + superlikes) / total if total > 0 else 0.5
                item["entropy"] = round(-(p * math.log2(p) + (1 - p) * math.log2(1 - p)), 3) if 0.001 < p < 0.999 else 0.0
                item["score"] = likes + (superlikes * 3)

            items_list.sort(key=lambda x: (x.get("score", 0), x.get("bayesianMean", 0)), reverse=True)

            calc_total = store.get("totalVotes", 0)
            if calc_total == 0:
                calc_total = sum(it.get("totalVotes", 0) for it in items_list) or 2254

            res_data = {
                "round": target_round,
                "activeRound": active_round,
                "totalVotes": calc_total,
                "uniqueVoters": len(store.get("uniqueVoters", [])) or 6,
                "topRanked": items_list,
                "recentActivity": store.get("recentFeed", [])
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(json.dumps(res_data, ensure_ascii=False).encode("utf-8"))
            return

        # Handle /api/curate.php
        if url_path.endswith("/api/curate.php") or url_path == "/api/curate.php":
            master_list = get_master_catalog()
            active_list = get_active_catalog()
            if not master_list and active_list:
                master_list = active_list

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "success",
                "master": master_list,
                "active": active_list,
                "masterCount": len(master_list),
                "activeCount": len(active_list)
            }, ensure_ascii=False).encode("utf-8"))
            return

        # Handle /api/rounds.php
        if url_path.endswith("/api/rounds.php") or url_path == "/api/rounds.php":
            r_store = load_rounds_store()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "success",
                "activeRound": r_store.get("activeRound", 1),
                "rounds": r_store.get("rounds", [])
            }, ensure_ascii=False).encode("utf-8"))
            return

        # Handle /api/export.php
        if url_path.endswith("/api/export.php") or url_path == "/api/export.php":
            round_param = query_params.get("round", "active")
            export_format = query_params.get("format", "csv").lower()
            r_store = load_rounds_store()
            active_round = r_store.get("activeRound", 1)
            target_round = active_round

            data_file = VOTES_FILE
            if round_param != "active" and round_param.isdigit():
                target_round = int(round_param)
                snap1 = DATA_DIR / f"votes_round_{target_round}.json"
                snap2 = DATA_DIR / f"votes-round{target_round}-snapshot.json"
                if snap1.exists():
                    data_file = snap1
                elif snap2.exists():
                    data_file = snap2

            store = load_votes_store(data_file)
            items_list = list(store.get("items", {}).values())

            for item in items_list:
                likes = item.get("likes", 0)
                passes = item.get("passes", 0)
                superlikes = item.get("superlikes", 0)
                total = likes + passes + superlikes
                item["totalVotes"] = total
                item["approvalRate"] = round(((likes + superlikes) / total) * 100) if total > 0 else 0
                alpha = likes + (superlikes * 2.8) + 2.0
                beta = (passes * 1.2) + 2.0
                item["bayesianMean"] = round(alpha / (alpha + beta), 3)
                item["score"] = likes + (superlikes * 3)

            items_list.sort(key=lambda x: (x.get("score", 0), x.get("bayesianMean", 0), x.get("superlikes", 0)), reverse=True)

            if export_format == "json":
                filename = f"tajno-glasanje-kolo-{target_round}-rezultati.json"
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "round": target_round,
                    "totalVotes": store.get("totalVotes", len(items_list)),
                    "uniqueVoters": len(store.get("uniqueVoters", [])),
                    "totalItems": len(items_list),
                    "rankedItems": items_list
                }, indent=2, ensure_ascii=False).encode("utf-8"))
                return
            else:
                filename = f"tajno-glasanje-kolo-{target_round}-rezultati.csv"
                output = io.StringIO()
                output.write("\ufeff") # UTF-8 BOM
                writer = csv.writer(output, delimiter=";")
                writer.writerow([
                    "Rang", "ID Motiva", "Naziv Motiva", "Kategorija", "Ukupno Bodova",
                    "Superlike (★)", "Like (❤️)", "Pass (✕)", "Ukupno Glasova",
                    "Odobrenje (%)", "Bayesian Mean", "Putanja Slike"
                ])
                for rank, item in enumerate(items_list, 1):
                    writer.writerow([
                        rank,
                        item.get("id", ""),
                        item.get("title", ""),
                        item.get("category", ""),
                        item.get("score", 0),
                        item.get("superlikes", 0),
                        item.get("likes", 0),
                        item.get("passes", 0),
                        item.get("totalVotes", 0),
                        f"{item.get('approvalRate', 0)}%",
                        item.get("bayesianMean", 0),
                        item.get("image", "")
                    ])
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(output.getvalue().encode("utf-8"))
                return

        # Handle /api/comment.php
        if url_path.endswith("/api/comment.php") or url_path == "/api/comment.php":
            c_store = load_comments_store()
            c_list = list(c_store.values()) if isinstance(c_store, dict) else []
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "count": len(c_list), "comments": c_list}, ensure_ascii=False).encode("utf-8"))
            return

        # Serve normal static file
        return super().do_GET()

    def do_POST(self):
        url_path = self.path.split("?")[0]

        # Handle /api/curate.php (POST: Save curated active catalog)
        if url_path.endswith("/api/curate.php") or url_path == "/api/curate.php":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode("utf-8"))
            except Exception:
                data = {}

            if not data or ("activeItems" not in data and "activeIds" not in data):
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"error":"Neva\xc5\xbee\xc4\x87i podaci za katalog"}')
                return

            master_list = get_master_catalog()
            active_items = []

            if "activeItems" in data and isinstance(data["activeItems"], list) and len(data["activeItems"]) > 0:
                active_items = data["activeItems"]
            elif "activeIds" in data and isinstance(data["activeIds"], list):
                allowed_ids = set(data["activeIds"])
                for item in master_list:
                    if item.get("id") in allowed_ids:
                        active_items.append(item)

            save_active_catalog(active_items)

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "success",
                "message": "Katalog je uspješno ažuriran",
                "activeCount": len(active_items)
            }, ensure_ascii=False).encode("utf-8"))
            return

        # Handle /api/rounds.php (POST: start_next_round)
        if url_path.endswith("/api/rounds.php") or url_path == "/api/rounds.php":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode("utf-8"))
            except Exception:
                data = {}

            action = data.get("action")
            if action != "start_next_round":
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"error":"Nepoznata akcija"}')
                return

            r_store = load_rounds_store()
            curr_round = int(r_store.get("activeRound", 1))
            finalist_ids = data.get("finalistIds", [])
            round_name = data.get("name") or f"{curr_round + 1}. Kolo — Finale & Finalisti"
            round_desc = data.get("description") or "Glasanje za odabrane finaliste"

            # 1. Archive current votes
            curr_votes = load_votes_store()
            snap1 = DATA_DIR / f"votes_round_{curr_round}.json"
            snap2 = DATA_DIR / f"votes-round{curr_round}-snapshot.json"
            save_votes_store(curr_votes, snap1)
            save_votes_store(curr_votes, snap2)

            for r in r_store.get("rounds", []):
                if r.get("id") == curr_round:
                    r["status"] = "completed"
                    r["totalVotes"] = curr_votes.get("totalVotes", 0)
                    r["uniqueVoters"] = len(curr_votes.get("uniqueVoters", []))
                    r["totalItems"] = len(curr_votes.get("items", {}))
                    r["dateCompleted"] = time.strftime("%Y-%m-%d %H:%M:%S")
                    r["dataFile"] = f"votes_round_{curr_round}.json"

            # 2. Update active catalog
            master_list = get_master_catalog()
            next_round_items = []
            if finalist_ids:
                allowed_ids = set(finalist_ids)
                for m in master_list:
                    if m.get("id") in allowed_ids:
                        next_round_items.append(m)
            else:
                next_round_items = master_list

            save_active_catalog(next_round_items)

            # 3. Reset votes for next round
            new_votes = {
                "round": curr_round + 1,
                "totalVotes": 0,
                "uniqueVoters": [],
                "items": {},
                "recentFeed": []
            }
            save_votes_store(new_votes)

            # 4. Append next round to rounds.json
            next_num = curr_round + 1
            r_store["activeRound"] = next_num
            r_store["rounds"].append({
                "id": next_num,
                "name": round_name,
                "description": round_desc,
                "status": "active",
                "totalVotes": 0,
                "uniqueVoters": 0,
                "totalItems": len(next_round_items),
                "dateStarted": time.strftime("%Y-%m-%d %H:%M:%S"),
                "dataFile": "votes.json"
            })
            save_rounds_store(r_store)

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "success",
                "message": f"Uspješno je pokrenuto {next_num}. kolo!",
                "activeRound": next_num,
                "finalistCount": len(next_round_items)
            }, ensure_ascii=False).encode("utf-8"))
            return

        if url_path.endswith("/api/vote.php") or url_path == "/api/vote.php":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode("utf-8"))
            except Exception:
                data = {}

            # Handle reset action
            if data.get("action") == "reset":
                empty_store = {
                    "totalVotes": 0,
                    "uniqueVoters": [],
                    "items": {},
                    "recentFeed": []
                }
                save_votes_store(empty_store)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "Votes reset"}).encode("utf-8"))
                return

            item_id = data.get("id")
            action = data.get("action", "like")
            session_id = data.get("sessionId", "anon")
            item_title = data.get("title", item_id)
            item_image = data.get("image", "")
            category = data.get("category", "General")

            if not item_id:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"error":"Missing item id"}')
                return

            store = load_votes_store()
            store["totalVotes"] = store.get("totalVotes", 0) + 1
            if session_id not in store.get("uniqueVoters", []):
                store.setdefault("uniqueVoters", []).append(session_id)

            if "items" not in store:
                store["items"] = {}

            if item_id not in store["items"]:
                store["items"][item_id] = {
                    "id": item_id,
                    "title": item_title,
                    "category": category,
                    "image": item_image,
                    "likes": 0,
                    "passes": 0,
                    "superlikes": 0,
                    "score": 0
                }
            elif item_image and not store["items"][item_id].get("image"):
                store["items"][item_id]["image"] = item_image

            curr = store["items"][item_id]
            if action == "like":
                curr["likes"] = curr.get("likes", 0) + 1
            elif action == "pass":
                curr["passes"] = curr.get("passes", 0) + 1
            elif action == "superlike":
                curr["superlikes"] = curr.get("superlikes", 0) + 1

            curr["score"] = curr.get("likes", 0) + (curr.get("superlikes", 0) * 3)

            action_label = "SUPERLAJKAO" if action == "superlike" else ("glasao za" if action == "like" else "preskočio")
            store.setdefault("recentFeed", []).insert(0, {
                "user": "Ti",
                "action": action_label,
                "item": item_title,
                "time": "upravo sada",
                "timestamp": int(time.time())
            })
            store["recentFeed"] = store["recentFeed"][:20]

            save_votes_store(store)

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "success",
                "item": curr,
                "totalVotes": store["totalVotes"]
            }).encode("utf-8"))
            return

        if url_path.endswith("/api/comment.php") or url_path == "/api/comment.php":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode("utf-8"))
            except Exception:
                data = {}

            item_id = data.get("id")
            if not item_id:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"error":"Missing item id"}')
                return

            action = data.get("action", "save")
            text = (data.get("text") or "").strip()
            title = data.get("title", item_id)
            category = data.get("category", "ARTWEAR")
            session_id = data.get("sessionId", "anon")
            updated_at = data.get("updatedAt", int(time.time() * 1000))

            c_store = load_comments_store()
            if action == "delete" or not text:
                if item_id in c_store:
                    del c_store[item_id]
            else:
                c_store[item_id] = {
                    "id": item_id,
                    "title": title,
                    "category": category,
                    "text": text,
                    "user": f"Gost #{session_id[:4]}",
                    "updatedAt": updated_at
                }

            save_comments_store(c_store)

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
        if url_path.endswith("/api/curate.php") or url_path == "/api/curate.php":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode("utf-8"))
            except Exception:
                data = {}

            active_items = data.get("activeItems", [])
            active_ids = data.get("activeIds", [])

            curate_payload = {
                "activeIds": active_ids,
                "activeCount": len(active_items),
                "updatedAt": int(time.time()),
                "active": active_items
            }

            try:
                CURATE_FILE.write_text(json.dumps(curate_payload, indent=2, ensure_ascii=False), encoding="utf-8")
            except Exception as e:
                print("[ERROR] Failed to save curate file:", e)

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "success",
                "message": "Aktivna selekcija uspješno spremljena",
                "activeCount": len(active_items)
            }).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

def run(port=8080):
    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, SwiperDevHandler)
    print(f"[DEV SERVER] Running at http://localhost:{port}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[DEV SERVER] Stopped.")

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    run(port)
