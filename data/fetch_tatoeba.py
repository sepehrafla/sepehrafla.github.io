#!/usr/bin/env python3
"""Fetch Spanish->English sentence pairs from the Tatoeba public API.
Downloads once; output is committed to the repo so the site has zero
runtime dependency on Tatoeba (matches the offline-reliability approach
from the language-learning-APIs research)."""
import json, time, urllib.request, urllib.error

BASE = "https://api.tatoeba.org/unstable/sentences?lang=spa&trans:lang=eng&sort=random&limit=100"
OUT = "tatoeba_raw.json"
TARGET = 2200

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "SpanishPracticeSite/1.0 (personal hobby project)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))

def main():
    seen = {}
    url = BASE
    tries = 0
    while len(seen) < TARGET and url and tries < 80:
        tries += 1
        try:
            payload = fetch(url)
        except urllib.error.URLError as e:
            print("fetch error, retrying:", e)
            time.sleep(2)
            continue
        for item in payload.get("data", []):
            es = item.get("text", "").strip()
            translations = item.get("translations") or []
            en = None
            for t in translations:
                if t.get("lang") == "eng" and t.get("text"):
                    en = t["text"].strip()
                    break
            if es and en and item.get("id") not in seen:
                seen[item["id"]] = {"id": item["id"], "es": es, "en": en}
        nxt = (payload.get("paging") or {}).get("next")
        print(f"round {tries}: total so far {len(seen)}")
        url = nxt
        time.sleep(0.35)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(list(seen.values()), f, ensure_ascii=False)
    print("wrote", len(seen), "pairs to", OUT)

if __name__ == "__main__":
    main()
