#!/usr/bin/env python3
"""
Studio Varaždin — Local Dev Server with Mock PHP API Handlers
Supports static files, WebP images, and /api/*.php endpoints (vote.php, stats.php, curate.php).
"""

import os
import sys
import json
import time
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler

SWIPER_DIR = Path(__file__).resolve().parent
DATA_DIR = SWIPER_DIR / "api" / "data"
VOTES_FILE = DATA_DIR / "votes.json"
CURATE_FILE = DATA_DIR / "active-catalog.json"

os.makedirs(DATA_DIR, exist_ok=True)

def load_votes_store():
    if VOTES_FILE.exists():
        try:
            return json.loads(VOTES_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "totalVotes": 0,
        "uniqueVoters": [],
        "items": {},
        "recentFeed": []
    }

def save_votes_store(store):
    try:
        VOTES_FILE.write_text(json.dumps(store, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print("[ERROR] Failed to save votes:", e)

class SwiperDevHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SWIPER_DIR), **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        url_path = self.path.split("?")[0]

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
            store = load_votes_store()
            items_list = list(store.get("items", {}).values())

            for item in items_list:
                total = item.get("likes", 0) + item.get("passes", 0) + item.get("superlikes", 0)
                item["totalVotes"] = total
                item["approvalRate"] = round(((item.get("likes", 0) + item.get("superlikes", 0)) / total) * 100) if total > 0 else 0

            items_list.sort(key=lambda x: x.get("score", 0), reverse=True)

            res_data = {
                "totalVotes": store.get("totalVotes", len(items_list)),
                "uniqueVoters": len(store.get("uniqueVoters", [])),
                "topRanked": items_list,
                "recentActivity": store.get("recentFeed", [])
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(json.dumps(res_data, ensure_ascii=False).encode("utf-8"))
            return

        # Handle /api/curate.php
        if url_path.endswith("/api/curate.php") or url_path == "/api/curate.php":
            active_list = []
            if CURATE_FILE.exists():
                try:
                    active_list = json.loads(CURATE_FILE.read_text(encoding="utf-8"))
                except Exception:
                    pass
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "active": active_list}).encode("utf-8"))
            return

        # Serve normal static file
        return super().do_GET()

    def do_POST(self):
        url_path = self.path.split("?")[0]

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
                store["uniqueVoters"].append(session_id)

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
            store["recentFeed"].insert(0, {
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
