from PIL import Image, ImageChops
import math
import itertools

picked = [
    "kuk2_page_4.jpg", "kuk2_page_6.jpg", "kuk2_page_7.jpg",
    "kuk2_page_9.jpg", "kuk2_page_11.jpg", "kuk2_page_13.jpg",
    "kukis_brand_page_13.jpg", "kukis_brand_page_11.jpg",
    "kukis_brand_page_12.jpg", "kukis_brand_page_10.jpg"
]
dir_path = "public/images/KUKIS/web-assets/preview"

def rmsdiff(im1, im2):
    diff = ImageChops.difference(im1, im2)
    h = diff.histogram()
    sq = (value*((idx%256)**2) for idx, value in enumerate(h))
    sum_of_squares = sum(sq)
    rms = math.sqrt(sum_of_squares/float(im1.size[0] * im1.size[1]))
    return rms

imgs = {}
for f in picked:
    path = dir_path + "/" + f
    try:
        img = Image.open(path).convert("L").resize((100, 100))
        imgs[f] = img
    except:
        pass

print("Comparing distances (lower is more similar, 0 is exact match):")
for (f1, f2) in itertools.combinations(picked, 2):
    try:
        dist = rmsdiff(imgs[f1], imgs[f2])
        if dist < 25.0:  # highly similar
            print(f"HIGH SIMILARITY ({dist:.2f}): {f1} and {f2}")
    except:
        pass
