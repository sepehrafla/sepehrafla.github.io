#!/usr/bin/env python3
"""Turn raw Tatoeba Spanish/English pairs into a curated cloze-sentence
bank: filtered to beginner-friendly length, scored by how many words
overlap with common Spanish + this site's own class vocabulary (i+1
comprehensible-input filtering), with one content word chosen per
sentence as the fill-in-the-blank target."""
import json, re, html

FREQ_FILE = "es_50k_full.txt"
RAW_FILE = "tatoeba_raw.json"
VOCAB_HTML = "../index.html"
OUT_FILE = "cloze_sentences.json"
TARGET_COUNT = 700

STOPWORDS = set("""
de que no a la el y es en lo un por qué me una los se te con para mí tu su
al lo las del su sus como mas pero sí porque muy sin sobre también hay
ya o este esta ese esa fue ser estar tener hacer decir ir dar ver saber
querer llegar pasar deber poner parecer quedar creer hablar llevar dejar
seguir encontrar llamar venir pensar salir volver tomar conocer vivir
sentir tratar mirar contar empezar esperar buscar existir entrar trabajar
escribir perder producir ocurrir entender pedir recibir recordar terminar
permitir aparecer conseguir comenzar servir sacar necesitar mantener
resultar leer caer cambiar presentar crear abrir considerar oír
acabar convertir ganar formar traer partir morir aceptar realizar suponer
comprender lograr explicar preguntar tocar reconocer estudiar alcanzar
nacer dirigir correr utilizar pagar ayudar gustar jugar escuchar cumplir
ofrecer descubrir levantar intentar usar imaginar
un uno una unos unas el los la las yo tú él ella usted nosotros vosotros
ellos ellas ustedes mi tu su nuestro vuestro este esta estos estas ese esa
esos esas aquel aquella aquellos aquellas
""".split())

def load_freq():
    ranks = {}
    with open(FREQ_FILE, encoding="utf-8") as f:
        for i, line in enumerate(f):
            parts = line.strip().split()
            if not parts:
                continue
            ranks[parts[0]] = i + 1
    return ranks

def load_class_vocab():
    text = open(VOCAB_HTML, encoding="utf-8").read()
    words = set()
    for m in re.finditer(r"b:'([^']*)'", text):
        w = m.group(1).lower()
        for tok in re.findall(r"[a-záéíóúüñ]+", w):
            words.add(tok)
    return words

def tokenize(s):
    return re.findall(r"[a-záéíóúüñ]+", s.lower())

def main():
    ranks = load_freq()
    class_vocab = load_class_vocab()
    raw = json.load(open(RAW_FILE, encoding="utf-8"))
    print("class vocab words:", len(class_vocab))

    scored = []
    for item in raw:
        es = html.unescape(item["es"])
        en = html.unescape(item["en"])
        toks = tokenize(es)
        n = len(toks)
        if n < 4 or n > 12:
            continue
        if not es.strip().endswith((".", "?", "!", "¿", "¡")) and not es.strip()[-1].isalpha():
            pass
        known_ranks = [ranks.get(t) for t in toks]
        unknown = sum(1 for r in known_ranks if r is None or r > 15000)
        if unknown > 1:
            continue  # keep sentences with at most one rare/unknown-frequency word
        class_hits = sum(1 for t in toks if t in class_vocab)
        avg_rank = sum(r for r in known_ranks if r) / max(1, sum(1 for r in known_ranks if r))
        score = class_hits * 50 - avg_rank * 0.02 - abs(n - 7)
        scored.append((score, class_hits, item, toks))

    scored.sort(key=lambda x: -x[0])
    picked = []
    seen_es = set()
    for score, class_hits, item, toks in scored:
        if item["es"] in seen_es:
            continue
        # pick blank target: prefer a class-vocab content word, else the least-common content word
        candidates = [t for t in set(toks) if t not in STOPWORDS and len(t) > 2]
        if not candidates:
            continue
        class_candidates = [c for c in candidates if c in class_vocab]
        if class_candidates:
            target = max(class_candidates, key=len)
        else:
            target = max(candidates, key=lambda t: ranks.get(t, 99999))
        # find the target's position among the raw (punctuation-stripped) tokens, first case-insensitive match in text
        pattern = re.compile(r"\b" + re.escape(target) + r"\b", re.IGNORECASE)
        match = pattern.search(item["es"])
        if not match:
            continue
        picked.append({
            "id": item["id"],
            "es": item["es"],
            "en": item["en"],
            "blank": item["es"][match.start():match.end()],
            "blankLower": target,
        })
        seen_es.add(item["es"])
        if len(picked) >= TARGET_COUNT:
            break

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(picked, f, ensure_ascii=False)
    print("wrote", len(picked), "cloze sentences to", OUT_FILE)
    print("sample:", json.dumps(picked[:5], ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
