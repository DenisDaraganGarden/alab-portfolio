import os
import glob
from PIL import Image

def crop_all():
    base_dir = "public/images"
    # Find all jpegs in web-assets/preview
    search_pattern = os.path.join(base_dir, "*", "web-assets", "preview", "*.jpg")
    files = glob.glob(search_pattern)
    
    count = 0
    for path in files:
        try:
            with Image.open(path) as img:
                width, height = img.size
                # Watermark is on the right edge. Let's crop 5.5% to be safe.
                # Assuming all are 16:9, e.g. 4000x2250. 5.5% of 4000 = 220px.
                crop_amount = int(width * 0.055)
                
                # Check if we already cropped it by looking at aspect ratio or width
                # If width is already something like 3800 instead of 4000, skip?
                # Actually, no, let's just always crop 5.5% since we have the original PDFs if we mess up.
                # But to prevent double cropping, let's check for standard widths vs cropped widths.
                if width < 3800:
                    continue # Probably already cropped

                cropped = img.crop((0, 0, width - crop_amount, height))
                # Ensure we save as high quality
                cropped.save(path, quality=95)
                count += 1
                if count % 10 == 0:
                    print(f"Cropped {count} images so far...")
        except Exception as e:
            print(f"Error on {path}: {e}")
            
    print(f"Total cropped: {count}")

crop_all()
