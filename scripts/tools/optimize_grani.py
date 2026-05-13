import os
from PIL import Image

src_dir = 'public/images/Грани/web-assets/preview'
dest_dir = 'public/images/Грани/web-assets/optimized'

if not os.path.exists(dest_dir):
    os.makedirs(dest_dir)

mapping = {
    'page_1.jpg': 'hero.webp',
    'page_8.jpg': 'gradient.webp',
    'page_9.jpg': 'photo_typo_1.webp',
    'page_10.jpg': 'photo_typo_2.webp',
    'page_11.jpg': 'posters.webp',
    'page_12.jpg': 'billboard_1.webp',
    'page_13.jpg': 'billboard_2.webp',
    'page_14.jpg': 'billboard_3.webp',
    'page_17.jpg': 'merch_bags.webp',
    'page_18.jpg': 'merch_bag_close.webp',
    'page_19.jpg': 'merch_cup.webp'
}

for src, dest in mapping.items():
    src_path = os.path.join(src_dir, src)
    dest_path = os.path.join(dest_dir, dest)
    
    if os.path.exists(src_path):
        img = Image.open(src_path)
        img = img.convert('RGB')
        # max width 2560 for quality, but these are likely 1920x1080 from a PDF slice.
        img.save(dest_path, 'WEBP', quality=85)
        print(f"Saved {dest}")
    else:
        print(f"Skipped {src} - not found")
