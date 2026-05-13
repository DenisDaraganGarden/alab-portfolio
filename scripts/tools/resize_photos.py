import os
from PIL import Image

photos = [
    "public/images/L.BURO/DSC08532.jpg",
    "public/images/L.BURO/LBURO_4854.jpg",
    "public/images/L.BURO/LBURO_5524.jpg",
    "public/images/L.BURO/домHTLFRNB.jpg"
]
out_dir = "public/images/L.BURO/web-assets/preview"

for p in photos:
    img = Image.open(p)
    # resize if width > 2560
    if img.width > 2560:
        ratio = 2560 / img.width
        new_h = int(img.height * ratio)
        img = img.resize((2560, new_h), Image.Resampling.LANCZOS)
    
    base = os.path.basename(p)
    out_path = os.path.join(out_dir, "opt_" + base)
    img.save(out_path, "JPEG", quality=85, optimize=True)
    print(f"Saved {out_path}")
