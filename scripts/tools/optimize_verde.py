import os
from PIL import Image

src_dir = 'public/images/VERDE/web-assets/preview'
dest_dir = 'public/images/VERDE/web-assets/optimized'

if not os.path.exists(dest_dir):
    os.makedirs(dest_dir)

mapping = {
    'page_1.jpg': 'hero.webp',
    'page_13.jpg': 'app_ui_1.webp',
    'page_14.jpg': 'app_ui_2.webp',
    'page_16.jpg': 'glass_ui.webp',
    'page_18.jpg': 'lanyard.webp',
    'page_23.jpg': 'cosmetic_tube.webp',
    'page_24.jpg': 'cosmetic_jar.webp',
    'page_27.jpg': 'lifestyle_jars.webp',
    'page_31.jpg': 'product_line.webp',
    'page_36.jpg': 'serum_bottle.webp',
    'page_38.jpg': 'abstract_liquid.webp',
    'page_43.jpg': 'shopping_bags.webp',
    'page_45.jpg': 'glass_cube.webp',
    'page_49.jpg': 'truck.webp',
    'page_50.jpg': 'street_billboard.webp',
    'page_53.jpg': 'merch_tshirt.webp'
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
