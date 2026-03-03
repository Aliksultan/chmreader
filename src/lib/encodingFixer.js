import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';

/**
 * Recursively scans a directory and converts .htm, .html, and .hhc files
 * to real UTF-8, and updates any charset meta tags to point to utf-8.
 */
export function fixDirectoryEncoding(dirPath) {
    if (!fs.existsSync(dirPath)) return;

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            fixDirectoryEncoding(fullPath);
        } else if (file.match(/\.(htm|html|hhc)$/i)) {
            fixFileEncoding(fullPath);
        }
    }
}

function fixFileEncoding(filePath) {
    try {
        const buffer = fs.readFileSync(filePath);

        // Check if the buffer is valid UTF-8 (ASCII is a valid subset of UTF-8)
        let isUtf8 = true;
        try {
            new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        } catch (e) {
            isUtf8 = false;
        }

        // If it's not valid UTF-8, it's almost certainly a legacy Turkish encoding (Windows-1254).
        // jschardet often misidentifies short Turkish texts as Hebrew (Windows-1255) 
        // due to similar byte ranges for translated characters (e.g. â -> Gimel, ö -> Tsadi).
        let encoding = isUtf8 ? 'utf8' : 'windows-1254';

        let content = iconv.decode(buffer, encoding);

        // Replace `<meta ... charset=XXX >` with `charset=utf-8` to ensure browsers render it properly
        content = content.replace(/charset\s*=\s*[a-zA-Z0-9-][a-zA-Z0-9-]+/gi, 'charset=utf-8');

        // Write back as true UTF-8
        fs.writeFileSync(filePath, content, 'utf8');
    } catch (err) {
        console.error(`Error fixing encoding for ${filePath}:`, err);
    }
}
