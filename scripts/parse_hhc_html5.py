import os
import shutil
import re
import urllib.parse
from bs4 import BeautifulSoup

def sanitize_filename(name):
    name = re.sub(r'[\\/*?:"<>|\n\r\t]', "", name)
    return name.strip('. ')

def ensure_long_path(path):
    abs_path = os.path.abspath(path)
    if not abs_path.startswith('\\\\?\\'):
        return '\\\\?\\' + abs_path
    return abs_path

def clean_html_and_links(src_path, dest_path, title, mapping):
    try:
        with open(ensure_long_path(src_path), 'r', encoding='windows-1254', errors='ignore') as f:
            content = f.read()
            
        soup = BeautifulSoup(content, 'html5lib')
        
        # 1. Remove navigation headers
        for tag in soup.find_all(['table', 'div']):
            text = tag.get_text()
            if 'Previous page' in text or 'Next page' in text or 'Return to chapter overview' in text or 'Navigation:' in text:
                tag.decompose()
            
        # 2. Clean up scripts and styles
        for tag in soup.find_all(['script', 'noscript']):
            tag.decompose()
            
        # 3. Add a clean H1 title if not present
        body = soup.find('body')
        if body:
            if not body.find('h1', string=lambda t: t and title in t):
                h1 = soup.new_tag('h1')
                h1.string = title
                body.insert(0, h1)
                
        # 4. Fix Hyperlinks
        dest_dir = os.path.dirname(dest_path)
        for a in soup.find_all('a', href=True):
            href = a['href']
            # Decode URL-encoded characters in href (e.g. %20)
            href = urllib.parse.unquote(href)
            
            if href.startswith('http') or href.startswith('mailto:') or href.startswith('#'):
                continue
                
            parts = href.split('#', 1)
            filename = parts[0]
            anchor = f"#{parts[1]}" if len(parts) > 1 else ""
            
            # Find the target in our mapping
            if filename in mapping:
                target_path = mapping[filename]
                # Calculate relative path
                rel_path = os.path.relpath(target_path, dest_dir)
                # Ensure URL slashes and encode spaces for HTML
                rel_path = rel_path.replace('\\', '/')
                rel_path = urllib.parse.quote(rel_path)
                a['href'] = rel_path + anchor
                
        # Save the cleaned file
        with open(ensure_long_path(dest_path), 'w', encoding='utf-8') as f:
            f.write(str(soup))
            
    except Exception as e:
        print(f"Error cleaning {src_path}: {e}")
        shutil.copy2(ensure_long_path(src_path), ensure_long_path(dest_path))

def parse_hhc_to_tree(hhc_path):
    with open(hhc_path, 'r', encoding='windows-1254', errors='ignore') as f:
        content = f.read()

    soup = BeautifulSoup(content, 'html5lib')

    def process_ul(ul_node):
        items = []
        for li in ul_node.find_all('li', recursive=False):
            obj = li.find('object')
            if not obj: continue
            
            name = None
            local = None
            for param in obj.find_all('param'):
                if param.get('name') == 'Name':
                    name = param.get('value')
                elif param.get('name') == 'Local':
                    local = param.get('value')
            
            item = {'name': name, 'local': local, 'children': []}
            
            nested_ul = li.find('ul', recursive=False)
            if nested_ul:
                item['children'] = process_ul(nested_ul)
                
            items.append(item)
        return items

    tree = []
    for ul in soup.find_all('ul'):
        if ul.find_parent('ul') is None:
            tree.extend(process_ul(ul))
            
    return tree

def compute_paths(tree, output_dir, mapping, flat_list):
    counter = 1
    for item in tree:
        if not item['name']: continue
        
        safe_name = sanitize_filename(item['name']) or "Untitled"
        prefix = f"{counter:02d} "
        counter += 1
        
        if item['children']:
            folder_path = os.path.join(output_dir, f"{prefix}{safe_name}")
            if item['local']:
                ext = os.path.splitext(item['local'])[1] or ".htm"
                dest = os.path.join(folder_path, f"00 {safe_name}{ext}")
                mapping[item['local']] = dest
                flat_list.append((item['local'], dest, item['name']))
            compute_paths(item['children'], folder_path, mapping, flat_list)
        else:
            if item['local']:
                ext = os.path.splitext(item['local'])[1] or ".htm"
                dest = os.path.join(output_dir, f"{prefix}{safe_name}{ext}")
                mapping[item['local']] = dest
                flat_list.append((item['local'], dest, item['name']))

if __name__ == "__main__":
    import sys
    try:
        import html5lib
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "html5lib"])
        
    tree = parse_hhc_to_tree("chm_extract/rnk.hhc")
    print(f"Extracted {len(tree)} top-level items")
    
    # We output directly to db/RNK since that's where the app expects it
    out_dir = os.path.abspath("db/RNK")
    
    # 1. Compute all target paths and build the mapping dictionary
    mapping = {}
    flat_list = []
    compute_paths(tree, out_dir, mapping, flat_list)
    
    print(f"Computed paths for {len(flat_list)} files. Starting conversion...")
    
    # 2. Create directories and process files
    for local_src, dest, title in flat_list:
        src = os.path.join("chm_extract", local_src)
        if os.path.exists(ensure_long_path(src)):
            dest_dir = os.path.dirname(dest)
            os.makedirs(ensure_long_path(dest_dir), exist_ok=True)
            
            ext = os.path.splitext(local_src)[1]
            if ext.lower() in ['.htm', '.html']:
                clean_html_and_links(src, dest, title, mapping)
            else:
                shutil.copy2(ensure_long_path(src), ensure_long_path(dest))
    
    print("Done! Hyperlinks and paths fixed.")
