#!/usr/bin/env python3
"""Download the archived issues, render their pages and update src/data/archive.json.

Usage:
  python scripts/ingest_archive.py              # all issues in scripts/archive-sources.json
  python scripts/ingest_archive.py --only 20 22 # some issues
  python scripts/ingest_archive.py --dry-run    # print what would be fetched
  python scripts/ingest_archive.py --derived    # only (re)build vector pages, layout and photos for issues here

Each issue lands in public/archive/<n>/ as issue.pdf, cover.jpg, p01.jpg, p02.jpg, ... (thumbnails and
fallback), v01.svg, v02.svg, ... (the reader's vector pages), l01.json, ... and photos/ (see extract_layout.py).
Issues already present locally (issue.pdf exists) are not downloaded again unless --force.
Needs PyMuPDF (pip install pymupdf). Network access is required for the download step.
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from extract_layout import extract  # noqa: E402
from render_pages import render, render_vector  # noqa: E402

SOURCES = os.path.join(HERE, "archive-sources.json")
ARCHIVE_JSON = os.path.join(ROOT, "src", "data", "archive.json")
PUBLIC = os.path.join(ROOT, "public", "archive")


def fetch(url: str, dest: str) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "tullabiya-archive-ingest/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dpi", type=int, default=110)
    ap.add_argument("--derived", action="store_true")
    a = ap.parse_args()

    with open(SOURCES, encoding="utf-8") as f:
        src = json.load(f)
    with open(ARCHIVE_JSON, encoding="utf-8") as f:
        archive = {int(e["number"]): e for e in json.load(f)}

    numbers = sorted(int(n) for n in src["issues"])
    if a.only:
        numbers = [n for n in numbers if n in a.only]

    for n in numbers:
        url = src["base"] + urllib.parse.quote(src["issues"][str(n)])
        outdir = os.path.join(PUBLIC, str(n))
        pdf = os.path.join(outdir, "issue.pdf")
        if a.dry_run:
            print(f"{n}: {url}")
            continue
        if a.derived:
            if os.path.exists(pdf):
                render_vector(pdf, outdir)
                print(f"{n}: {extract(pdf, outdir)} pages")
            else:
                print(f"{n}: no PDF here, skipped")
            continue
        os.makedirs(outdir, exist_ok=True)
        if a.force or not os.path.exists(pdf):
            print(f"{n}: downloading")
            fetch(url, pdf)
        pages = render(pdf, outdir, a.dpi)
        render_vector(pdf, outdir)
        extract(pdf, outdir)
        entry = archive.setdefault(n, {"number": n, "pages": 0})
        entry["pages"] = pages
        entry["local"] = True
        print(f"{n}: {pages} pages")

    if not a.dry_run and not a.derived:
        with open(ARCHIVE_JSON, "w", encoding="utf-8") as f:
            json.dump([archive[k] for k in sorted(archive)], f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("archive.json updated")


if __name__ == "__main__":
    main()
