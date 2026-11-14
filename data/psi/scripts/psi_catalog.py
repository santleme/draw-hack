#!/usr/bin/env python3
"""Build data/psi/catalog/investigations.csv.

Pulls investigation-level metadata from the PSI search API and joins it with
the per-investigation file statistics of the local download (files_manifest.csv).

Usage: python3 data/psi/scripts/psi_catalog.py
"""

import csv
import json
import os
import urllib.parse
import urllib.request

API = "https://psi.nasa.gov/geode-py/ws/repo/search"
HERE = os.path.dirname(os.path.abspath(__file__))
CATALOG = os.path.abspath(os.path.join(HERE, "..", "catalog"))
RAW_DIR = os.path.abspath(os.path.join(HERE, "..", "raw"))

ACCESSIONS = ["PSI-69", "PSI-68", "PSI-142", "PSI-98", "PSI-99", "PSI-100",
              "PSI-10", "PSI-20", "PSI-21", "PSI-22", "PSI-23", "PSI-159", "PSI-26"]

# DOIs shown on the PSI investigation pages (not exposed by the search index).
DOI = {
    "PSI-69": "10.60555/mbq8-0451",
    "PSI-98": "10.60555/0t15-1z43",
    "PSI-100": "10.60555/040q-4h36",
}

FIELDS = ["accession", "title", "acronym", "doi", "url", "research_area",
          "subresearch_area", "project_type", "flight_platform", "center",
          "start_date", "end_date", "keywords", "related_investigations",
          "objectives", "approach", "n_files_downloaded", "bytes_downloaded"]


def search_acc(acc):
    q = urllib.parse.urlencode({"term": acc, "size": 10})
    with urllib.request.urlopen(f"{API}?{q}", timeout=60) as r:
        d = json.loads(r.read())
    for h in d["hits"]["hits"]:
        s = h["_source"]
        if s.get("Accession") == acc:
            return s
    return {}


def local_stats(acc):
    n = 0
    size = 0
    root = os.path.join(RAW_DIR, acc)
    for dirpath, _d, files in os.walk(root):
        for f in files:
            p = os.path.join(dirpath, f)
            if os.path.isfile(p):
                n += 1
                size += os.path.getsize(p)
    return n, size


def main():
    os.makedirs(CATALOG, exist_ok=True)
    rows = []
    for acc in ACCESSIONS:
        s = search_acc(acc)
        n, size = local_stats(acc)
        rows.append({
            "accession": acc,
            "title": s.get("Title", ""),
            "acronym": s.get("Acronym", ""),
            "doi": DOI.get(acc, ""),
            "url": f"https://psi.nasa.gov/physci/repo/data/investigations/{acc}",
            "research_area": s.get("Research Area", ""),
            "subresearch_area": s.get("SubResearch Area", ""),
            "project_type": s.get("Project Type", ""),
            "flight_platform": s.get("Flight Platform", ""),
            "center": s.get("Monitoring Center", ""),
            "start_date": s.get("Investigation Start Date", ""),
            "end_date": s.get("Investigation End Date", ""),
            "keywords": s.get("Keywords", ""),
            "related_investigations": s.get("Related Investigations", ""),
            "objectives": s.get("Objectives", ""),
            "approach": s.get("Approach", ""),
            "n_files_downloaded": n,
            "bytes_downloaded": size,
        })
        print(acc, s.get("Acronym", ""), n, f"{size/1e6:.0f} MB")
    out = os.path.join(CATALOG, "investigations.csv")
    with open(out, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print("wrote", out)


if __name__ == "__main__":
    main()
