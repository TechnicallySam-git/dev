import os
import sqlite3
import json
from typing import List, Dict

DB_PATH = "/var/lib/fruta/telemetry.db"

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      received_at TEXT DEFAULT (datetime('now')),
      deviceId TEXT,
      imageFileName TEXT,
      payload TEXT
    )
    """)
    conn.commit()
    conn.close()

def insert_message(payload: Dict):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    device = payload.get("deviceId")
    img = payload.get("imageFileName") or payload.get("blobUrl")
    cur.execute("INSERT INTO messages (deviceId, imageFileName, payload) VALUES (?, ?, ?)",
                (device, img, json.dumps(payload)))
    conn.commit()
    conn.close()

def get_messages(limit: int = 100) -> List[Dict]:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, received_at, deviceId, imageFileName, payload FROM messages ORDER BY id DESC LIMIT ?", (limit,))
    rows = cur.fetchall()
    conn.close()
    results = []
    for r in rows:
        try:
            payload = json.loads(r[4])
        except Exception:
            payload = {}
        results.append({
            "id": r[0],
            "received_at": r[1],
            "deviceId": r[2],
            "imageFileName": r[3],
            "payload": payload
        })
    return results