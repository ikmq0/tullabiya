#!/usr/bin/env python3
"""Render a magazine PDF into page JPEGs for the archive viewer.

Usage: python -I scripts/render_pages.py <issue.pdf> <outdir> [--dpi 110] [--vector-only]

Writes cover.jpg (page 1, larger) and p01.jpg, p02.jpg, ... into <outdir>, plus the vector pages the
reader shows, v01.svg, v02.svg, ..., then prints the page count. The JPEGs are the thumbnails and the
fallback. --vector-only writes just the v files and leaves everything else in <outdir> untouched.
Needs PyMuPDF (pip install pymupdf).
"""
import argparse
import os
import sys
import warnings

warnings.filterwarnings("ignore")
try:
    import pymupdf
except ImportError:  # pragma: no cover
    sys.exit("PyMuPDF is required: pip install pymupdf")


def render(pdf: str, outdir: str, dpi: int) -> int:
    os.makedirs(outdir, exist_ok=True)
    doc = pymupdf.open(pdf)
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=dpi)
        pix.save(os.path.join(outdir, f"p{i + 1:02d}.jpg"), jpg_quality=80)
        if i == 0:
            cover = page.get_pixmap(dpi=max(dpi, 150))
            cover.save(os.path.join(outdir, "cover.jpg"), jpg_quality=84)
    return len(doc)


def render_vector(pdf: str, outdir: str, image_dpi: int = 150, quality: int = 62) -> int:
    """One SVG per page, v01.svg, v02.svg, ...: text as paths, so it stays sharp at every zoom, in the PDF's
    exact drawing order. Placed images are resampled to about image_dpi first to keep each page near the
    weight of its JPEG; the originals are for the photo viewer. Show these only through <img>, where an
    SVG runs nothing. PDFs are untrusted input: run with python -I."""
    os.makedirs(outdir, exist_ok=True)
    doc = pymupdf.open(pdf)
    done = set()
    for page in doc:
        for image in page.get_images(full=True):
            xref, smask = image[0], image[1]
            if xref in done or smask:  # Masked images keep their originals: replacing would drop the mask.
                continue
            done.add(xref)
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            pix = pymupdf.Pixmap(doc, xref)
            if pix.alpha:
                pix = pymupdf.Pixmap(pix, 0)
            if pix.colorspace is None or pix.colorspace.n != 3:
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            width = round(max(r.width for r in rects) / 72 * image_dpi)
            if 0 < width < pix.width:
                pix = pymupdf.Pixmap(pix, width, max(1, round(pix.height * width / pix.width)))
            data = pix.tobytes("jpeg", jpg_quality=quality)
            if len(data) < len(doc.extract_image(xref)["image"]):
                page.replace_image(xref, stream=data)
    for i, page in enumerate(doc):
        with open(os.path.join(outdir, f"v{i + 1:02d}.svg"), "w", encoding="utf-8") as f:
            f.write(page.get_svg_image(text_as_path=True))
    return len(doc)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("outdir")
    ap.add_argument("--dpi", type=int, default=110)
    ap.add_argument("--vector-only", action="store_true")
    a = ap.parse_args()
    pages = render_vector(a.pdf, a.outdir)
    if not a.vector_only:
        pages = render(a.pdf, a.outdir, a.dpi)
    print(pages)


if __name__ == "__main__":
    main()
