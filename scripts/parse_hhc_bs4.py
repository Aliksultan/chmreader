import os
import shutil
import re
from bs4 import BeautifulSoup

def sanitize_filename(name):
    return re.sub(r'[\\/*?:"<>|\n\r\t]', "", name).strip()

def parse_ul(ul_tag, output_dir, level):
    counter = 1
    # Iterate over LI tags
    for li in ul_tag.find_all('li', recursive=False):
        # find the object
        obj = li.find('object', type="text/sitemap")
        if not obj:
            continue
            
        name = None
        local = None
        
        for param in obj.find_all('param'):
            if param.get('name') == 'Name':
                name = param.get('value')
            elif param.get('name') == 'Local':
                local = param.get('value')
                
        if name:
            safe_name = sanitize_filename(name)
            prefix = f"{counter:02d} "
            counter += 1
            
            # Check if there's a nested UL inside this LI
            nested_ul = li.find('ul', recursive=False)
            
            if nested_ul:
                # This is a folder
                new_dir = os.path.join(output_dir, f"{prefix}{safe_name}")
                if not os.path.exists(new_dir):
                    os.makedirs(new_dir)
                    
                # If it also has a local file, copy it as "00 {name}.htm" inside the folder
                if local:
                    src_file = os.path.join("chm_extract", local)
                    if os.path.exists(src_file):
                        ext = os.path.splitext(local)[1] or ".htm"
                        dest_file = os.path.join(new_dir, f"00 {safe_name}{ext}")
                        shutil.copy2(src_file, dest_file)
                        
                parse_ul(nested_ul, new_dir, level + 1)
            else:
                # This is just a file
                if local:
                    src_file = os.path.join("chm_extract", local)
                    if os.path.exists(src_file):
                        ext = os.path.splitext(local)[1] or ".htm"
                        dest_file = os.path.join(output_dir, f"{prefix}{safe_name}{ext}")
                        shutil.copy2(src_file, dest_file)

def main():
    hhc_path = "chm_extract/rnk.hhc"
    output_dir = "RNK"
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    with open(hhc_path, 'r', encoding='windows-1254', errors='ignore') as f:
        content = f.read()
        
    soup = BeautifulSoup(content, 'html.parser')
    
    # Sometimes HHC files have multiple top-level UL elements or they are wrapped weirdly.
    # We will find all top-level ULs. A top-level UL is one that has no UL parent.
    top_uls = [ul for ul in soup.find_all('ul') if ul.find_parent('ul') is None]
    
    for top_ul in top_uls:
        parse_ul(top_ul, output_dir, 1)
        
if __name__ == "__main__":
    main()
