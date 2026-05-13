import fitz
import os
import sys

pdf_path = sys.argv[1]
output_dir = sys.argv[2]
prefix = sys.argv[3]

os.makedirs(output_dir, exist_ok=True)

doc = fitz.open(pdf_path)

zoom_x = 2.0  # horizontal zoom
zoom_y = 2.0  # vertical zoom
mat = fitz.Matrix(zoom_x, zoom_y)

print(f"Rendering {len(doc)} pages from {pdf_path}...")

for page_num in range(len(doc)):
    page = doc.load_page(page_num)
    pix = page.get_pixmap(matrix=mat)
    
    out_file = os.path.join(output_dir, f"{prefix}_page_{page_num + 1}.jpg")
    pix.save(out_file)

print(f"Done! Rendered {len(doc)} images to {output_dir}")
