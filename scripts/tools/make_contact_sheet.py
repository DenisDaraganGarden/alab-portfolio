import os
import math
from PIL import Image

def make_contact_sheet(image_dir, output_path, cols=4):
    images = []
    # Collect all jpgs
    for f in sorted(os.listdir(image_dir)):
        if (f.startswith("kuk2_") or f.startswith("kukis_brand_")) and f.endswith(".jpg"):
            try:
                img = Image.open(os.path.join(image_dir, f))
                img.thumbnail((400, 400)) # resize for contact sheet
                images.append((f, img))
            except Exception as e:
                pass

    if not images:
        print("No images found")
        return

    # compute grid size
    rows = math.ceil(len(images) / cols)
    cell_w = max(img.size[0] for _, img in images)
    cell_h = max(img.size[1] for _, img in images) + 30 # space for text
    
    sheet = Image.new('RGB', (cols * cell_w, rows * cell_h), (255, 255, 255))
    
    from PIL import ImageDraw, ImageFont
    draw = ImageDraw.Draw(sheet)
    
    for i, (name, img) in enumerate(images):
        row = i // cols
        col = i % cols
        x = col * cell_w
        y = row * cell_h
        sheet.paste(img, (x, y))
        draw.text((x + 10, y + cell_h - 25), name, fill=(0, 0, 0))

    sheet.save(output_path, "WEBP")
    print(f"Saved {output_path}")

make_contact_sheet("public/images/KUKIS/web-assets/preview", "/Users/denisdaragan/.gemini/antigravity/brain/f66060f5-8761-4632-84f2-6f72abbfd547/kukis_contact_sheet.webp")
