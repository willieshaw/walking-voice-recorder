#!/usr/bin/env python3
"""Build comparison contact sheets and final PDF books."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = json.loads((ROOT / "cad/output/forms-manifest.json").read_text())
FORMS = MANIFEST["forms"]
OUT_SHEETS = ROOT / "cad/output/contact-sheets"
OUT_PDF = ROOT / "output/pdf"
OUT_SHEETS.mkdir(parents=True, exist_ok=True)
OUT_PDF.mkdir(parents=True, exist_ok=True)

CMF = [
    ("01-natural-aluminum", "Natural aluminum"),
    ("02-graphite-aluminum", "Graphite aluminum"),
    ("03-champagne-aluminum", "Champagne aluminum"),
    ("04-cobalt-aluminum", "Cobalt aluminum"),
    ("05-matte-black-polymer", "Matte black polymer"),
    ("06-warm-white-polymer", "Warm white polymer"),
    ("07-vermilion-polymer", "Vermilion polymer"),
    ("08-smoke-translucent", "Smoke translucent"),
    ("09-charcoal-soft-touch", "Charcoal soft-touch"),
    ("10-aluminum-hybrid", "Aluminum hybrid"),
]

FONT = ImageFont.load_default()


def contain(image: Image.Image, size: tuple[int, int], background=(244, 245, 247)) -> Image.Image:
    source = image.convert("RGB")
    source.thumbnail(size, Image.Resampling.LANCZOS)
    result = Image.new("RGB", size, background)
    result.paste(source, ((size[0] - source.width) // 2, (size[1] - source.height) // 2))
    return result


def contact_sheet(items: list[tuple[Path, str]], output: Path, columns=5, cell=(300, 340)):
    rows = (len(items) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * cell[0], rows * cell[1]), (244, 245, 247))
    draw = ImageDraw.Draw(sheet)
    for index, (path, label) in enumerate(items):
        col, row = index % columns, index // columns
        image = contain(Image.open(path), (cell[0], cell[1] - 40))
        x, y = col * cell[0], row * cell[1]
        sheet.paste(image, (x, y))
        draw.text((x + 12, y + cell[1] - 28), label, fill=(35, 37, 41), font=FONT)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, optimize=True)


def build_sheets():
    for form in FORMS:
        items = [(ROOT / "cad/output/renders" / form["id"] / f"{cmf_id}.png", label) for cmf_id, label in CMF]
        contact_sheet(items, OUT_SHEETS / "by-form" / f"{form['id']}.png")
        ortho = [(ROOT / "cad/output/orthographic" / form["id"] / f"{view}.png", view.title()) for view in ("front", "rear", "side", "top", "bottom")]
        contact_sheet(ortho, OUT_SHEETS / "orthographic" / f"{form['id']}.png", columns=5)
    for cmf_id, cmf_label in CMF:
        items = [(ROOT / "cad/output/renders" / form["id"] / f"{cmf_id}.png", f"{form['id']}  {form['name']}") for form in FORMS]
        contact_sheet(items, OUT_SHEETS / "by-cmf" / f"{cmf_id}.png")
    neutral = [(ROOT / "cad/output/renders" / form["id"] / "01-natural-aluminum.png", f"{form['id']}  {form['name']}") for form in FORMS]
    contact_sheet(neutral, OUT_SHEETS / "neutral-overview.png")


def footer(pdf, page_number: int, title: str):
    width, _ = landscape(A4)
    pdf.setStrokeColor(colors.HexColor("#D7D9DD"))
    pdf.line(36, 26, width - 36, 26)
    pdf.setFillColor(colors.HexColor("#777B82"))
    pdf.setFont("Helvetica", 7)
    pdf.drawString(36, 14, title)
    pdf.drawRightString(width - 36, 14, f"{page_number:02d}")


def page_title(pdf, eyebrow: str, title: str, subtitle: str = ""):
    width, height = landscape(A4)
    pdf.setFillColor(colors.HexColor("#747982"))
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(36, height - 42, eyebrow.upper())
    pdf.setFillColor(colors.HexColor("#181A1E"))
    pdf.setFont("Helvetica-Bold", 24)
    pdf.drawString(36, height - 72, title)
    if subtitle:
        pdf.setFillColor(colors.HexColor("#666B73"))
        pdf.setFont("Helvetica", 9)
        pdf.drawString(36, height - 91, subtitle)


def draw_image_contain(pdf, path: Path, x: float, y: float, width: float, height: float):
    image = Image.open(path)
    ratio = min(width / image.width, height / image.height)
    draw_w, draw_h = image.width * ratio, image.height * ratio
    pdf.drawImage(ImageReader(image), x + (width - draw_w) / 2, y + (height - draw_h) / 2, draw_w, draw_h, preserveAspectRatio=True)


def build_form_pdf():
    output = OUT_PDF / "recorder-form-study.pdf"
    width, height = landscape(A4)
    pdf = canvas.Canvas(str(output), pagesize=(width, height))
    pdf.setTitle("Recorder Form Study")
    page = 1
    pdf.setFillColor(colors.HexColor("#181A1E"))
    pdf.rect(0, 0, width, height, fill=1, stroke=0)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(44, height - 52, "VOICE RECORDER / FORM STUDY")
    pdf.setFont("Helvetica-Bold", 36)
    pdf.drawString(44, height - 112, "Ten handheld forms")
    pdf.setFont("Helvetica", 14)
    pdf.setFillColor(colors.HexColor("#C8CBD0"))
    pdf.drawString(44, height - 143, "Neutral 1:1 geometry for walking-capture evaluation")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(44, 60, "STEP + STL / shared 62 x 25 x 14 mm internal reservation / dimensions in mm")
    pdf.showPage()

    page += 1
    page_title(pdf, "Comparison", "All ten forms", "Natural aluminum render; identical camera and lighting")
    draw_image_contain(pdf, OUT_SHEETS / "neutral-overview.png", 36, 40, width - 72, height - 145)
    footer(pdf, page, "Recorder Form Study")
    pdf.showPage()

    for form in FORMS:
        page += 1
        actual = form["actual_bbox_mm"]
        nominal = f"{form['height']:.0f} H x {form['width']:.0f} W x {form['depth']:.0f} D"
        page_title(pdf, f"{form['id']} / {form['family']}", form["name"], f"Nominal envelope: {nominal}")
        draw_image_contain(pdf, OUT_SHEETS / "orthographic" / f"{form['id']}.png", 36, 160, width - 72, height - 270)
        pdf.setFillColor(colors.HexColor("#F0F1F3"))
        pdf.roundRect(36, 48, width - 72, 92, 8, fill=1, stroke=0)
        columns = [
            ("ACTUAL BOUNDING BOX", f"{actual[2]:.2f} H x {actual[0]:.2f} W x {actual[1]:.2f} D mm"),
            ("INTERNAL RESERVATION", "62 H x 25 W x 14 D mm"),
            ("CORE CHECK", "PASS" if form["core_check"]["passes"] else "FAIL"),
            ("CONSTRUCTION", form["construction"].replace("_", " ").title()),
        ]
        col_w = (width - 92) / len(columns)
        for index, (label, value) in enumerate(columns):
            x = 48 + index * col_w
            pdf.setFillColor(colors.HexColor("#868B92"))
            pdf.setFont("Helvetica-Bold", 7)
            pdf.drawString(x, 116, label)
            pdf.setFillColor(colors.HexColor("#24262A"))
            pdf.setFont("Helvetica-Bold", 9)
            pdf.drawString(x, 96, value)
        pdf.setFillColor(colors.HexColor("#666B73"))
        pdf.setFont("Helvetica", 8)
        pdf.drawString(48, 66, form["notes"])
        footer(pdf, page, "Recorder Form Study")
        pdf.showPage()
    pdf.save()


def build_cmf_pdf():
    output = OUT_PDF / "recorder-cmf-matrix.pdf"
    width, height = landscape(A4)
    pdf = canvas.Canvas(str(output), pagesize=(width, height))
    pdf.setTitle("Recorder CMF Matrix")
    page = 1
    pdf.setFillColor(colors.HexColor("#ECEDEF"))
    pdf.rect(0, 0, width, height, fill=1, stroke=0)
    pdf.setFillColor(colors.HexColor("#181A1E"))
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(44, height - 52, "VOICE RECORDER / CMF MATRIX")
    pdf.setFont("Helvetica-Bold", 36)
    pdf.drawString(44, height - 112, "100 material studies")
    pdf.setFont("Helvetica", 13)
    pdf.setFillColor(colors.HexColor("#63676E"))
    pdf.drawString(44, height - 142, "Ten forms x ten comparative CMF directions")
    for index, (_, label) in enumerate(CMF):
        x = 44 + (index // 5) * 300
        y = height - 200 - (index % 5) * 34
        pdf.setFillColor(colors.HexColor("#8A8E95"))
        pdf.setFont("Helvetica-Bold", 8)
        pdf.drawString(x, y, f"{index + 1:02d}")
        pdf.setFillColor(colors.HexColor("#26282C"))
        pdf.setFont("Helvetica", 10)
        pdf.drawString(x + 28, y, label)
    pdf.showPage()

    for form in FORMS:
        page += 1
        page_title(pdf, f"{form['id']} / {form['family']}", form["name"], "Identical geometry, camera, lighting, and LED-off state")
        draw_image_contain(pdf, OUT_SHEETS / "by-form" / f"{form['id']}.png", 36, 40, width - 72, height - 145)
        footer(pdf, page, "Recorder CMF Matrix")
        pdf.showPage()
    pdf.save()


def main():
    build_sheets()
    build_form_pdf()
    build_cmf_pdf()
    print(OUT_PDF / "recorder-form-study.pdf")
    print(OUT_PDF / "recorder-cmf-matrix.pdf")


if __name__ == "__main__":
    main()
