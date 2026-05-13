import os
from PIL import Image

def crop_watermarks(base_dir):
    for root, dirs, files in os.walk(base_dir):
        if 'web-assets' in root and 'preview' in root:
            for file in files:
                if file.endswith('.jpg') or file.endswith('.webp'):
                    path = os.path.join(root, file)
                    try:
                        img = Image.open(path)
                        width, height = img.size
                        # Watermark is on the right edge, approximately 4-5% of the width
                        # Let's crop 5% from the right. (e.g. 4000 * 0.05 = 200px)
                        # Let's crop 160px from the right (4% of 4000)
                        crop_amount = int(width * 0.04) 
                        cropped = img.crop((0, 0, width - crop_amount, height))
                        
                        # Save it back
                        cropped.save(path, quality=95)
                        print(f"Cropped {path} by {crop_amount}px")
                    except Exception as e:
                        print(f"Error processing {path}: {e}")

crop_watermarks('public/images/Принцип 32')
