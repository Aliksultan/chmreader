import os
import shutil
import re

def sanitize_filename(name):
    # Remove invalid characters for Windows filenames
    return re.sub(r'[\\/*?:"<>|]', "", name).strip()

def parse_hhc(hhc_path, extract_dir, output_dir):
    with open(hhc_path, 'r', encoding='windows-1254', errors='ignore') as f:
        lines = f.readlines()

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    stack = []
    current_name = None
    current_local = None

    # Track how many items we've seen at each level to prefix filenames with numbers like 01_, 02_ etc
    # to preserve ordering.
    counters = [0] * 20 
    current_level = 0

    for line in lines:
        line = line.strip()
        if "<UL>" in line.upper():
            current_level += 1
            counters[current_level] = 0
        elif "</UL>" in line.upper():
            current_level -= 1
        elif "<LI>" in line.upper():
            current_name = None
            current_local = None
        elif '<param name="Name"' in line or "<param name='Name'" in line:
            match = re.search(r'value="([^"]+)"', line)
            if match:
                current_name = match.group(1)
        elif '<param name="Local"' in line or "<param name='Local'" in line:
            match = re.search(r'value="([^"]+)"', line)
            if match:
                current_local = match.group(1)

        # When we reach the end of an OBJECT tag or right before next LI
        if "</OBJECT>" in line.upper():
            if current_name:
                counters[current_level] += 1
                prefix = f"{counters[current_level]:02d} "
                safe_name = sanitize_filename(current_name)
                
                # If it's a folder (no Local)
                if not current_local:
                    folder_path = os.path.join(output_dir, *[p for _, p in stack], f"{prefix}{safe_name}")
                    if not os.path.exists(folder_path):
                        os.makedirs(folder_path)
                    stack.append((current_level, f"{prefix}{safe_name}"))
                else:
                    # It's a file
                    # First, pop any items from stack that are deeper than current level
                    while stack and stack[-1][0] >= current_level:
                        stack.pop()

                    src_file = os.path.join(extract_dir, current_local)
                    if os.path.exists(src_file):
                        # Construct output filename: "01 Title.htm"
                        ext = os.path.splitext(current_local)[1]
                        if not ext:
                            ext = ".htm"
                        dest_filename = f"{prefix}{safe_name}{ext}"
                        
                        # Build dest path
                        dest_dir = os.path.join(output_dir, *[p for _, p in stack])
                        if not os.path.exists(dest_dir):
                            os.makedirs(dest_dir)
                            
                        dest_file = os.path.join(dest_dir, dest_filename)
                        shutil.copy2(src_file, dest_file)
                        print(f"Copied: {current_local} -> {dest_file}")
                    else:
                        print(f"Warning: File not found {src_file}")
                
                current_name = None
                current_local = None

if __name__ == "__main__":
    hhc_path = "chm_extract/rnk.hhc"
    extract_dir = "chm_extract"
    output_dir = "RNK"
    parse_hhc(hhc_path, extract_dir, output_dir)
