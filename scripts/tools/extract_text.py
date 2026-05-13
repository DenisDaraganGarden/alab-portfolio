import fitz

def print_text(pdf_path):
    print(f"--- {pdf_path} ---")
    doc = fitz.open(pdf_path)
    for i in range(min(5, len(doc))):
        text = doc[i].get_text()
        print(f"Page {i+1}:")
        print(repr(text.strip().replace('\n', ' ')))

print_text("public/images/KUKIS/КУК (2).pdf")
print_text("public/images/KUKIS/KUKIS_коммуникация бренда.pdf")
