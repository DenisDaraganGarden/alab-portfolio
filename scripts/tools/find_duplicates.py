import os
import hashlib
from PIL import Image

def get_hash(path):
    with Image.open(path) as img:
        img_resized = img.resize((16, 16)).convert("L")
        return hashlib.md5(img_resized.tobytes()).hexdigest()

dir_path = "public/images/KUKIS/web-assets/preview"
hashes = {}
duplicates = []

for f in sorted(os.listdir(dir_path)):
    if f.endswith(".jpg") and (f.startswith("kuk2_") or f.startswith("kukis_brand_")):
        full_path = os.path.join(dir_path, f)
        try:
            h = get_hash(full_path)
            if h in hashes:
                duplicates.append((f, hashes[h]))
            else:
                hashes[h] = f
        except Exception as e:
            pass

print("Duplicates found:")
for new_file, orig_file in duplicates:
    print(f"{new_file} is a duplicate of {orig_file}")

# Let's also output a descriptive log mapping the ones I picked in HTML
picked = [
    "kuk2_page_4.jpg", "kuk2_page_6.jpg", "kuk2_page_7.jpg",
    "kuk2_page_9.jpg", "kuk2_page_11.jpg", "kuk2_page_13.jpg",
    "kukis_brand_page_13.jpg", "kukis_brand_page_11.jpg",
    "kukis_brand_page_12.jpg", "kukis_brand_page_10.jpg"
]

print("\nStatus of picked files:")
for f in picked:
    is_dup = False
    for new_f, orig_f in duplicates:
        if f == new_f or f == orig_f:
            is_dup = True
            print(f"PICKED {f} is involved in a duplicate with {orig_f if f==new_f else new_f}")
    if not is_dup:
        print(f"PICKED {f} is unique among the two datasets.")
