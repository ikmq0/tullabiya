#!/usr/bin/env python3
"""Extract where things sit on each printed page, for the digital reader.

Usage:
  python -I scripts/extract_layout.py <issue.pdf> <outdir>     # one issue
  python -I scripts/extract_layout.py --all                    # every issue in public/archive/

Writes l01.json, l02.json, ... into <outdir>, one per page, with coordinates normalized to 0..1 from the
page's top-left corner, each rect as [x, y, w, h]:
  images  placed images over 2% of the page, without full-page ones, merged where they overlap. Each is
          {"r": rect}; when one original stands behind it, also "file", its pixel size "w" and "h", and
          "rot" (quarter turns clockwise as placed).
  words   word rectangles only, in reading order (Arabic: columns right to left, words right to left)

Originals go to <outdir>/photos/p<page>-<i>.<ext> at full pixel size: the PDF's own bytes for RGB and gray JPEGs
and PNGs, an RGB conversion at quality 92 for CMYK (browsers show CMYK bytes with wrong colors). A file already
there that is larger is left alone: that is the slot for better originals from the editors, and the reader
uses whatever it finds. An image is left without a file, so the reader crops the page instead, when the
page shows something else there (clipped or covered).

The PDFs' text layer has reliable positions but damaged text (dropped letters, kashida, presentation
forms), so the words themselves are deliberately not kept. PDFs are untrusted input: run with -I.
Needs PyMuPDF (pip install pymupdf).
"""
import argparse
import json
import os
import sys
import warnings

warnings.filterwarnings("ignore")
try:
    import pymupdf
except ImportError:  # pragma: no cover
    sys.exit("PyMuPDF is required: pip install pymupdf")

MIN_IMAGE = 0.02  # of the page's area
MAX_IMAGE = 0.92  # above this it is a full-page background
COLUMN_GAP = 7.0  # points of clear space that separate columns
ROW_GAP = 1.5  # points of clear space that separate rows inside a column


def overlaps(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def merge_rects(rects):
    """Unions overlapping rectangles until none overlap."""
    out = [list(r) for r in rects]
    changed = True
    while changed:
        changed = False
        for i in range(len(out)):
            for j in range(i + 1, len(out)):
                if overlaps(out[i], out[j]):
                    a, b = out[i], out[j]
                    out[i] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
                    del out[j]
                    changed = True
                    break
            if changed:
                break
    return out


def gaps(spans, min_gap):
    """Positions of clear bands in a list of (lo, hi) intervals, widest band first."""
    found = []
    edge = None
    for lo, hi in sorted(spans):
        if edge is not None and lo - edge >= min_gap:
            found.append((lo - edge, (edge + lo) / 2))
        edge = hi if edge is None else max(edge, hi)
    return [pos for _, pos in sorted(found, reverse=True)]


def reading_order(lines):
    """Recursive XY-cut over line boxes: columns right to left, then rows top to bottom."""
    if len(lines) <= 1:
        return lines
    columns = gaps([(ln["box"][0], ln["box"][2]) for ln in lines], COLUMN_GAP)
    if columns:
        cut = columns[0]
        right = [ln for ln in lines if (ln["box"][0] + ln["box"][2]) / 2 >= cut]
        left = [ln for ln in lines if (ln["box"][0] + ln["box"][2]) / 2 < cut]
        return reading_order(right) + reading_order(left)
    rows = gaps([(ln["box"][1], ln["box"][3]) for ln in lines], ROW_GAP)
    if rows:
        cut = rows[0]
        top = [ln for ln in lines if (ln["box"][1] + ln["box"][3]) / 2 < cut]
        bottom = [ln for ln in lines if (ln["box"][1] + ln["box"][3]) / 2 >= cut]
        return reading_order(top) + reading_order(bottom)
    return sorted(lines, key=lambda ln: (ln["box"][1], -ln["box"][2]))


def is_rtl(text):
    return any("֐" <= ch <= "ࣿ" or "ﭐ" <= ch <= "ﻼ" for ch in text)


def quarter_turns(transform):
    """Clockwise quarter turns of a placement, ignoring the slight tilt designers sometimes give a photo."""
    a, b = transform[0], transform[1]
    if abs(a) >= abs(b):
        return 0 if a > 0 else 2
    return 1 if b > 0 else 3


def shows_this_image(doc, page, info, box, turns):
    """Whether the page shows this image over its whole box. Compares a small rendering of the page with the
    original, turned as placed. A clipped, masked or covered image differs."""
    size = 48
    try:
        original = pymupdf.Pixmap(doc, info["xref"])
        if original.colorspace is None or original.colorspace.n != 3 or original.alpha:
            original = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.Pixmap(original, 0) if original.alpha else original)
        small = pymupdf.Pixmap(original, size, size)
        rendered = page.get_pixmap(clip=pymupdf.Rect(box), matrix=pymupdf.Matrix(size / (box[2] - box[0]), size / (box[3] - box[1])), alpha=False)
    except Exception as e:
        print("  no match check:", e, file=sys.stderr)
        return False
    if rendered.width < size - 2 or rendered.height < size - 2:
        return False
    total = n = 0
    # The middle of the picture: a small tilt or a frame at the edges is not a different image.
    for y in range(int(size * 0.15), int(size * 0.85), 2):
        for x in range(int(size * 0.15), int(size * 0.85), 2):
            u, v = x, y
            if turns == 1:
                u, v = y, size - 1 - x
            elif turns == 2:
                u, v = size - 1 - x, size - 1 - y
            elif turns == 3:
                u, v = size - 1 - y, x
            a = rendered.pixel(min(x, rendered.width - 1), min(y, rendered.height - 1))
            b = small.pixel(max(0, min(int(u * small.width / size), small.width - 1)), max(0, min(int(v * small.height / size), small.height - 1)))
            total += abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])
            n += 3
    return n > 0 and total / n < 24


def save_original(doc, xref, outdir, name):
    """Writes the image at its full pixel size. RGB and gray JPEGs and PNGs keep the PDF's bytes unchanged. CMYK ones
    are converted to RGB at quality 92: browsers show CMYK JPEG bytes with visibly wrong colors. Returns the
    file's relative path and pixel size, or None."""
    data = doc.extract_image(xref)
    ext = {"jpeg": "jpg", "png": "png"}.get(data["ext"])
    if data.get("colorspace") in (1, 3) and ext:
        payload = data["image"]
    else:
        ext = "jpg"
        pix = pymupdf.Pixmap(doc, xref)
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)
        payload = pymupdf.Pixmap(pymupdf.csRGB, pix).tobytes("jpeg", jpg_quality=92)
    folder = os.path.join(outdir, "photos")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{name}.{ext}")
    if not (os.path.exists(path) and os.path.getsize(path) > len(payload)):
        with open(path, "wb") as f:
            f.write(payload)
    return {"file": f"photos/{name}.{ext}", "w": data["width"], "h": data["height"]}


def page_layout(doc, page, number=1, outdir=None):
    rect = page.rect
    w, h = rect.width, rect.height

    placed = []
    sources = []
    for info in page.get_image_info(xrefs=True):
        x0, y0, x1, y1 = info["bbox"]
        box = [max(x0, rect.x0), max(y0, rect.y0), min(x1, rect.x1), min(y1, rect.y1)]
        if box[2] <= box[0] or box[3] <= box[1]:
            continue
        area = (box[2] - box[0]) * (box[3] - box[1]) / (w * h)
        if MIN_IMAGE <= area <= MAX_IMAGE:
            placed.append(box)
            sources.append((box, info))
    merged = sorted(merge_rects(placed), key=lambda b: (round(b[1] / 40), -b[2]))
    images = []
    for i, box in enumerate(merged):
        entry = {"r": None, "box": box}
        behind = [(b, inf) for b, inf in sources if overlaps(b, box)]
        if outdir and len(behind) == 1 and behind[0][1]["xref"]:
            info = behind[0][1]
            turns = quarter_turns(info["transform"])
            if shows_this_image(doc, page, info, box, turns):
                saved = save_original(doc, info["xref"], outdir, f"p{number}-{i + 1}")
                if saved:
                    entry.update(saved)
                    if turns:
                        entry["rot"] = turns
                    a, b = info["transform"][0], info["transform"][1]
                    if min(abs(a), abs(b)) > 0.002 * max(abs(a), abs(b)):
                        entry["tilt"] = 1
        images.append(entry)

    groups = {}
    for x0, y0, x1, y1, word, block, line, _ in page.get_text("words", sort=False):
        if x1 > x0 and y1 > y0 and word.strip():
            groups.setdefault((block, line), []).append((x0, y0, x1, y1, word))
    lines = []
    for items in groups.values():
        rtl = any(is_rtl(i[4]) for i in items)
        items.sort(key=lambda i: -i[2] if rtl else i[0])
        lines.append({
            "box": (min(i[0] for i in items), min(i[1] for i in items), max(i[2] for i in items), max(i[3] for i in items)),
            "items": items,
        })
    words = [i for ln in reading_order(lines) for i in ln["items"]]

    def norm(b):
        return [round(b[0] / w, 4), round(b[1] / h, 4), round((b[2] - b[0]) / w, 4), round((b[3] - b[1]) / h, 4)]

    for entry in images:
        entry["r"] = norm(entry.pop("box"))
    return {"v": 2, "images": images, "words": [norm(i) for i in words]}


def extract(pdf, outdir):
    os.makedirs(outdir, exist_ok=True)
    doc = pymupdf.open(pdf)
    for i, page in enumerate(doc):
        with open(os.path.join(outdir, f"l{i + 1:02d}.json"), "w", encoding="utf-8") as f:
            json.dump(page_layout(doc, page, i + 1, outdir), f, separators=(",", ":"))
    return len(doc)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", nargs="?")
    ap.add_argument("outdir", nargs="?")
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    if a.all:
        root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "archive")
        for name in sorted(os.listdir(root), key=lambda s: (len(s), s)):
            pdf = os.path.join(root, name, "issue.pdf")
            if os.path.exists(pdf):
                print(f"{name}: {extract(pdf, os.path.join(root, name))} pages")
    elif a.pdf and a.outdir:
        print(extract(a.pdf, a.outdir))
    else:
        ap.error("give <issue.pdf> <outdir>, or --all")


if __name__ == "__main__":
    main()
