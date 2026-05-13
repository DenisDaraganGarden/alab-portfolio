import fitz  # PyMuPDF
import os
import io
from PIL import Image

pdf_path = "public/images/Принцип 32/Принцип 32.pdf"
output_dir = "public/images/Принцип 32/raw_images"
os.makedirs(output_dir, exist_ok=True)

doc = fitz.open(pdf_path)

img_index = 0
for page_num in range(len(doc)):
    page = doc.load_page(page_num)
    image_list = page.get_images(full=True)
    
    # filter out very small images (like tiny icons or lines)
    for img_info in image_list:
        xref = img_info[0]
        base_image = doc.extract_image(xref)
        image_bytes = base_image["image"]
        image_ext = base_image["ext"]
        
        try:
            image = Image.open(io.BytesIO(image_bytes))
            # skip small elements
            if image.width < 300 or image.height < 300:
                continue
                
            img_filename = f"img_p{page_num+1}_{img_index}.{image_ext}"
            img_path = os.path.join(output_dir, img_filename)
            
            with open(img_path, "wb") as f:
                f.write(image_bytes)
                
            print(f"Extracted: {img_filename} (Size: {image.width}x{image.height})")
            img_index += 1
        except Exception as e:
            print(f"Error extracting image {xref} on page {page_num+1}: {e}")

print("Done extracting raw images!")
