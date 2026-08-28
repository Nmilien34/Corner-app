#!/usr/bin/env python3
"""Generates a large, text-selectable PDF for the renderer spike.

No dependencies. Emits real text objects (not images) because the whole point
of the spike is whether text selection yields usable overlay coordinates.
"""
import sys, zlib

PAGES = int(sys.argv[1]) if len(sys.argv) > 1 else 350
OUT = sys.argv[2] if len(sys.argv) > 2 else "assets/large-350p.pdf"

W, H = 612, 792

def page_stream(n: int) -> bytes:
    lines = []
    lines.append("BT /F1 18 Tf 72 720 Td (Chapter %d) Tj ET" % (1 + (n - 1) // 10))
    lines.append("BT /F1 11 Tf 72 690 Td (Page %d of %d) Tj ET" % (n, PAGES))
    y = 660
    for i in range(34):
        text = ("Section %d.%d paragraph %d - the quick brown fox jumps over "
                "the lazy dog and keeps going for selection testing." % (
                    1 + (n - 1) // 10, 1 + (n - 1) % 10, i + 1))
        text = text.replace("(", "").replace(")", "")
        lines.append("BT /F1 10 Tf 72 %d Td (%s) Tj ET" % (y, text))
        y -= 18
    return "\n".join(lines).encode("latin-1")

objects = []            # 1-indexed list of byte strings
def add(obj: bytes) -> int:
    objects.append(obj)
    return len(objects)

font_id = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

kids, page_ids = [], []
# font(1) + PAGES content objs + PAGES page objs, then the Pages node.
pages_parent_id = len(objects) + (PAGES * 2) + 1

content_ids = []
for n in range(1, PAGES + 1):
    raw = page_stream(n)
    comp = zlib.compress(raw)
    cid = add(b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(comp)
              + comp + b"\nendstream")
    content_ids.append(cid)

for n in range(1, PAGES + 1):
    pid = add(b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %d %d] "
              b"/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>"
              % (pages_parent_id, W, H, font_id, content_ids[n - 1]))
    page_ids.append(pid)

kids_str = " ".join("%d 0 R" % p for p in page_ids).encode()
actual_pages_id = add(b"<< /Type /Pages /Count %d /Kids [%s] >>" % (PAGES, kids_str))
assert actual_pages_id == pages_parent_id, (actual_pages_id, pages_parent_id)
catalog_id = add(b"<< /Type /Catalog /Pages %d 0 R >>" % actual_pages_id)

out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
offsets = [0]
for i, obj in enumerate(objects, start=1):
    offsets.append(len(out))
    out += b"%d 0 obj\n" % i + obj + b"\nendobj\n"

xref_at = len(out)
out += b"xref\n0 %d\n" % (len(objects) + 1)
out += b"0000000000 65535 f \n"
for off in offsets[1:]:
    out += b"%010d 00000 n \n" % off
out += (b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n"
        % (len(objects) + 1, catalog_id, xref_at))

with open(OUT, "wb") as fh:
    fh.write(out)
print("wrote %s: %d pages, %.1f MB" % (OUT, PAGES, len(out) / 1024 / 1024))
