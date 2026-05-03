"""
PDF text extractor using PyMuPDF (fitz).
PyMuPDF uses MuPDF which has excellent handling of Arabic and custom font encodings.

Usage: python extract_pdf.py <pdf_path>
Outputs: JSON array of { pageNumber, text } objects to stdout.
"""

import sys
import json
import re
import traceback


def main():
    # Force UTF-8 output on Windows (default codepage can't handle Turkish/Arabic chars)
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

    if len(sys.argv) < 2:
        print(json.dumps({"error": "No PDF path provided"}))
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        import fitz  # PyMuPDF

        doc = fitz.open(pdf_path)
        pages = []

        for page_num in range(len(doc)):
            page = doc[page_num]

            # Extract text with layout preservation
            # "text" mode gives plain text; "blocks" would give positioned blocks
            text = page.get_text("text")

            # Remove any remaining (cid:NNN) sequences that slip through
            # (shouldn't happen with PyMuPDF but just in case)
            text = re.sub(r'\(cid:\d+\)', '', text)

            pages.append({
                "pageNumber": page_num + 1,
                "text": text.strip()
            })

        doc.close()
        print(json.dumps({"pages": pages}, ensure_ascii=False))

    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
