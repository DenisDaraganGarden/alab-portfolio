import os
from PIL import Image

src_dir = 'public/images/AquaDolce/web-assets/preview'
dest_dir = 'public/images/AquaDolce/web-assets/optimized'

if not os.path.exists(dest_dir):
    os.makedirs(dest_dir)

mapping = {
    'page_1.jpg': 'hero.webp',
    'page_4.jpg': 'can_mint.webp',
    'page_5.jpg': 'bottles_fruit.webp',
    'page_11.jpg': 'three_cans.webp',
    'page_18.jpg': 'water_splash.webp',
    'page_19.jpg': 'cooler_ice.webp',
    'page_21.jpg': 'vending_machine.webp',
    'page_26.jpg': 'bottles_display.webp',
    'page_27.jpg': 'branded_truck.webp',
    'page_28.jpg': 'product_boxes.webp',
    'page_29.jpg': 'billboard.webp'
}

for src, dest in mapping.items():
    src_path = os.path.join(src_dir, src)
    dest_path = os.path.join(dest_dir, dest)
    
    if os.path.exists(src_path):
        img = Image.open(src_path)
        img = img.convert('RGB')
        img.save(dest_path, 'WEBP', quality=85)
        print(f"Saved {dest}")
    else:
        print(f"Skipped {src} - not found")
