"""Quotation PDF. Built on request with ReportLab; nothing is stored."""

import io
from xml.sax.saxutils import escape as e

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import Quote
from .utils import quote_label, quote_totals, valid_until

INK = colors.HexColor("#2a1e17")
MUTED = colors.HexColor("#7a6a5c")
ACCENT = colors.HexColor("#b4532f")
LINE = colors.HexColor("#e6d9c6")


def _fmt(v, cur):
    return f"{cur} {v:,.2f}"


def quote_pdf(q: Quote) -> bytes:
    b = q.business
    cur = b.currency
    t = quote_totals(q.items, q.discount, q.vat_rate)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Quotation {quote_label(q.number)}", author=b.name,
    )
    ss = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=ss["Title"], fontName="Times-Bold", alignment=0, fontSize=22, textColor=INK, spaceAfter=2)
    small = ParagraphStyle("s", parent=ss["Normal"], fontSize=9, textColor=MUTED, leading=12)
    body = ParagraphStyle("b", parent=ss["Normal"], fontSize=10, textColor=INK, leading=14)
    right = ParagraphStyle("r", parent=body, alignment=2)

    biz_lines = [x for x in [b.tagline, b.address, b.phone, b.email, f"TRN {b.trn}" if b.trn else None] if x]
    head = Table(
        [[
            [Paragraph(e(b.name), h), *[Paragraph(e(x), small) for x in biz_lines]],
            [Paragraph("<b>QUOTATION</b>", ParagraphStyle("q", parent=right, textColor=ACCENT, fontSize=12)),
             Paragraph(quote_label(q.number), ParagraphStyle("n", parent=right, fontName="Times-Roman", fontSize=18, leading=22)),
             Paragraph(f"Date: {q.created_at:%d %b %Y}", ParagraphStyle("d", parent=small, alignment=2)),
             Paragraph(f"Valid until: {valid_until(q.created_at, q.valid_days):%d %b %Y}", ParagraphStyle("v", parent=small, alignment=2))],
        ]],
        colWidths=[105 * mm, 69 * mm],
    )
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))

    c = q.customer
    bill = [Paragraph("<b>Prepared for</b>", small), Paragraph(e(c.name), body)]
    if c.phone:
        bill.append(Paragraph(e(c.phone), small))
    if c.area:
        bill.append(Paragraph(e(c.area), small))

    rows = [["Description", "Qty", "Unit price", "Amount"]]
    for i in q.items:
        rows.append([Paragraph(e(i.description), body), f"{i.quantity:g}", _fmt(i.unit_price, cur), _fmt(i.quantity * i.unit_price, cur)])
    items = Table(rows, colWidths=[90 * mm, 16 * mm, 34 * mm, 34 * mm], repeatRows=1)
    items.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 10),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    trows = [["Subtotal", _fmt(t.subtotal, cur)]]
    if t.discount:
        trows.append(["Discount", "-" + _fmt(t.discount, cur)])
    trows += [[f"VAT {q.vat_rate:g}%", _fmt(t.vat, cur)], ["Total", _fmt(t.total, cur)]]
    totals = Table(trows, colWidths=[40 * mm, 40 * mm], hAlign="RIGHT")
    totals.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 12),
        ("LINEABOVE", (0, -1), (-1, -1), 1, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))

    story = [head, Spacer(1, 10 * mm), *bill]
    if q.reference:
        story += [Spacer(1, 3 * mm), Paragraph(f"<b>Booking details:</b> {e(q.reference)}", body)]
    story += [Spacer(1, 6 * mm), items, Spacer(1, 4 * mm), totals]
    if q.notes:
        story += [Spacer(1, 8 * mm), Paragraph("<b>Notes</b>", small), Paragraph(e(q.notes).replace("\n", "<br/>"), body)]
    story += [Spacer(1, 10 * mm), Paragraph("Accept this quotation online using the link you received.", small)]
    doc.build(story)
    return buf.getvalue()
