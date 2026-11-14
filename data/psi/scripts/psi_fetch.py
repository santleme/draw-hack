#!/usr/bin/env python3
"""Download NASA PSI (Physical Sciences Informatics) combustion datasets.

Hits the public geode-py API behind https://psi.nasa.gov/physci/repo:

  * POST /geode-py/ws/files/v2          -> file tree for one investigation version
  * GET  /geode-py/ws/studies/<acc>/download?file=<id>&version=<v>&redirect=false
                                        -> presigned S3 URL (returned as plain text)

The script is resumable: files already on disk with the expected byte size are
skipped, so re-running only fetches what is missing.

Usage:
    python3 data/psi/scripts/psi_fetch.py [--accessions PSI-69,PSI-98] [--dry-run]
"""

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

API = "https://psi.nasa.gov/geode-py/ws"
HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.abspath(os.path.join(HERE, "..", "raw"))
CATALOG_DIR = os.path.abspath(os.path.join(HERE, "..", "catalog"))

# Combustion-science investigations relevant to spacecraft fire safety.
ACCESSIONS = [
    "PSI-69",   # FLEX   - Flame Extinguishment Experiment
    "PSI-68",   # FLEX-2 - Flame Extinguishment Experiment 2
    "PSI-142",  # Cool flame transitions (FLEX-2 related)
    "PSI-98",   # SAFFIRE-I
    "PSI-99",   # SAFFIRE-II
    "PSI-100",  # SAFFIRE-III
    "PSI-10",   # ACME Flame Design
    "PSI-20",   # ACME BRE (Burning Rate Emulator)
    "PSI-21",   # ACME CLD Flame
    "PSI-22",   # ACME E-FIELD Flames
    "PSI-23",   # ACME s-Flame
    "PSI-159",  # ACME CFI-G (Cool Flames Investigation with Gases)
    "PSI-26",   # BASS - Burning and Suppression of Solids
]

# Category/extension policy -------------------------------------------------
KEY_CATS = {"Investigation Metadata Files", "Experimental table", "Analyzed Data"}
DOC_CATS = {"Science Documents", "Engineering Documents", "Reports",
            "Presentations", "Reference Data"}
DOC_EXT = {"pdf", "docx", "doc", "ppt", "pptx", "xlsx", "xls", "csv", "txt", "rtf"}
RAW_EXT = {"csv", "xlsx", "xls", "txt", "asc", "dat", "log", "pdf", "docx", "tsv"}

DOC_MAX = 25e6          # per-file cap for documents
RAW_MAX = 2e6           # per-file cap for raw telemetry
RAW_CAP_PER_ACC = 300e6  # per-investigation raw budget (adds larger csv/xlsx)
SAFFIRE = {"PSI-98", "PSI-99", "PSI-100"}
SAFFIRE_SENSOR_MAX = 45e6  # sensor workbooks are the core telemetry for SAFFIRE

WORKERS = 48


def _get(url, timeout=120):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _post_json(url, payload, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def file_tree(acc, version, folder=""):
    return _post_json(f"{API}/files/v2", {
        "studyId": acc, "folder": folder, "fileType": "study", "version": version})


def latest_version(acc):
    for v in range(8, 0, -1):
        try:
            r = file_tree(acc, v)
        except urllib.error.HTTPError:
            continue
        if r.get("files"):
            return v, r
    raise RuntimeError(f"{acc}: no accessible version found")


def walk(nodes, out):
    for n in nodes:
        if n.get("directory") or n.get("files"):
            walk(n.get("files", []), out)
        else:
            out.append(n)
    return out


def select(acc, nodes):
    """Apply the download policy to a flat file list."""
    key, docs, small, big = [], [], [], []
    for n in nodes:
        name = n.get("key", "").split("/")[-1]
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        size = n.get("bytes_size") or 0
        cat = n.get("sortingCategory") or ""
        if cat in KEY_CATS:
            key.append(n)
        elif cat in DOC_CATS and ext in DOC_EXT and size <= DOC_MAX:
            docs.append(n)
        elif cat == "Raw Data" and ext in RAW_EXT:
            limit = SAFFIRE_SENSOR_MAX if (acc in SAFFIRE and ext in ("xlsx", "xls", "csv")) else RAW_MAX
            (small if size <= limit else big).append(n)
    raw_total = sum(n.get("bytes_size") or 0 for n in small)
    extra = []
    for n in sorted(big, key=lambda f: f.get("bytes_size") or 0):
        ext = n.get("key", "").rsplit(".", 1)[-1].lower()
        size = n.get("bytes_size") or 0
        if ext not in ("csv", "xlsx", "xls") or size > 15e6:
            continue
        if raw_total + size > RAW_CAP_PER_ACC:
            continue
        extra.append(n)
        raw_total += size
    return key + docs + small + extra


def dest_path(acc, key):
    rel = key[len(f"psi-data/{acc}/"):] if key.startswith(f"psi-data/{acc}/") else key.split("/")[-1]
    return os.path.join(RAW_DIR, acc, rel)


def fetch_one(acc, version, node):
    size = node.get("bytes_size") or 0
    dest = dest_path(acc, node["key"])
    if os.path.exists(dest) and os.path.getsize(dest) == size:
        return dest, "skip"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    api = (f"{API}/studies/{acc}/download?file={node['id']}"
           f"&version={version}&studyVersion={version}&redirect=false")
    url = _get(api, 60).decode().strip()
    data = _get(url, 600)
    tmp = dest + ".part"
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, dest)
    return dest, "ok"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--accessions", default=",".join(ACCESSIONS))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    manifest_rows = []
    tasks = []
    seen = set()  # the listing can return duplicate keys
    for acc in args.accessions.split(","):
        version, tree = latest_version(acc)
        nodes = walk(tree.get("files", []), [])
        chosen = select(acc, nodes)
        total = sum(n.get("bytes_size") or 0 for n in chosen)
        print(f"{acc}: version={version} files={len(chosen)} {total/1e6:.0f} MB")
        for n in chosen:
            if (acc, n.get("key")) in seen:
                continue
            seen.add((acc, n.get("key")))
            tasks.append((acc, version, n))
            manifest_rows.append({
                "accession": acc,
                "version": version,
                "file_id": n.get("id"),
                "category": n.get("sortingCategory"),
                "key": n.get("key"),
                "name": n.get("key", "").split("/")[-1],
                "size_bytes": n.get("bytes_size"),
                "updated": n.get("updated"),
                "local_path": os.path.relpath(dest_path(acc, n["key"]), os.path.abspath(os.path.join(HERE, ".."))),
                "status": "pending",
            })

    if args.dry_run:
        return
    tasks.sort(key=lambda t: t[2].get("bytes_size") or 0)
    errors = []
    done = 0
    status_by_key = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(fetch_one, a, v, n): (a, n) for a, v, n in tasks}
        for fu in as_completed(futs):
            acc_n, node = futs[fu]
            done += 1
            try:
                _dest, _how = fu.result()
                size = node.get("bytes_size") or 0
                status = ("downloaded" if os.path.getsize(dest_path(acc_n, node["key"])) == size
                          else "downloaded_size_differs")
            except Exception as e:  # noqa: BLE001 - record and continue
                status = f"error: {e}"
                errors.append(str(e))
            status_by_key[node["key"]] = status
            if done % 500 == 0:
                print(f"{done}/{len(tasks)} done, errors={len(errors)}", flush=True)
    for e in errors:
        print("ERROR:", e, file=sys.stderr)

    for r in manifest_rows:
        r["status"] = status_by_key.get(r["key"], "pending")

    os.makedirs(CATALOG_DIR, exist_ok=True)
    out = os.path.join(CATALOG_DIR, "files_manifest.csv")
    # merge: keep catalogue rows for accessions not refreshed in this run
    new_keys = {(r["accession"], r["key"]) for r in manifest_rows}
    merged = manifest_rows
    if os.path.exists(out):
        with open(out, newline="") as fh:
            for row in csv.DictReader(fh):
                if (row["accession"], row["key"]) not in new_keys:
                    merged.append(row)
    fieldnames = ["accession", "version", "file_id", "category", "key",
                  "name", "size_bytes", "updated", "local_path", "status"]
    with open(out, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(merged)
    print(f"wrote {out} ({len(merged)} rows)")


if __name__ == "__main__":
    main()
