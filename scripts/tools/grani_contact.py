import os
import math
from PIL import Image

image_dir = '/Users/denisdaragan/Documents/Not0-Not1/2026/Product/A.LAB/A.LAB SYTE/public/images/Грани/web-assets/preview'
output_path = '/Users/denisdaragan/.gemini/antigravity/brain/f66060f5-8761-4632-84f2-6f72abbfd547/grani_contact.jpg'

images = []
for i in range(1, 23):
    path = os.path.join(image_dir, f'page_{i}.jpg')
    if os.path.exists(path):
        try:
            img = Image.open(path)
            img.thumbnail((400, 400))
            images.append((f'page_{i}.jpg', img))
        except Exception as e:
            print(f"Error loading {path}: {e}")

if images:
    cols = 5
    rows = math.ceil(len(images) / cols)
    w_max = max(img.width for _, img in images)
    h_max = max(img.height for _, img in images)
    
    pad = 20
    contact_sheet = Image.new('RGB', (cols * (w_max + pad) + pad, rows * (h_max + pad) + pad), (255, 255, 255))
    
    for idx, (name, img) in enumerate(images):
        col = idx % cols
        row = idx // cols
        x = pad + col * (w_max + pad)
        y = pad + row * (h_max + pad)
        contact_sheet.paste(img, (x, y))
        
    contact_sheet.save(output_path, quality=80)
    print(f'Done! Saved to {output_path}')
else:
    print("No images found or loaded.")
