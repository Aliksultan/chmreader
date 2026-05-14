import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function cleanName(filename) {
    let name = filename;
    // Remove extension
    name = name.replace(/\.html?$/i, '');
    // Remove ONLY the first grouping of leading digits and spaces/dashes (e.g., "01 " or "12-")
    // This prevents stripping valid numbers like "1.Ders" if it was prefixed as "03 1.Ders"
    name = name.replace(/^\d+[\s\-_]+/, '');
    return name;
}

function buildTocTree(dirPath, basePath, relativePath = '') {
    const items = [];
    if (!fs.existsSync(dirPath)) return items;

    const files = fs.readdirSync(dirPath);
    
    // Sort files to maintain original order (assuming they are prefixed with numbers)
    files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        const nextRelativePath = relativePath ? `${relativePath}/${file}` : file;
        
        if (stat.isDirectory()) {
            items.push({
                name: cleanName(file),
                raw: file,  // original filesystem slug for URL building
                local: '',
                children: buildTocTree(fullPath, basePath, nextRelativePath)
            });
        } else if (file.toLowerCase().endsWith('.htm') || file.toLowerCase().endsWith('.html')) {
            if (!file.match(/\.(ru|kk)\.html?$/i)) {
                items.push({
                    name: cleanName(file),
                    raw: file,
                    local: nextRelativePath,
                    children: []
                });
            }
        }
    }
    return items;
}

export async function GET(request, { params }) {
    const unwrappedParams = await params;
    const book = unwrappedParams.book;
    const decodedBook = decodeURIComponent(book);
    const bookName = decodedBook.replace('.chm', '').replace('.CHM', '');
    let bookDir = path.join(process.cwd(), 'db', bookName);

    if (bookName === 'kutuphane') {
        bookDir = path.join(process.cwd(), 'db');
    }

    if (!fs.existsSync(bookDir)) {
        return NextResponse.json({ error: 'Book directory not found' }, { status: 404 });
    }

    try {
        const toc = buildTocTree(bookDir, bookDir);
        return NextResponse.json({ toc }, {
            headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' }
        });
    } catch (error) {
        console.error("Error building TOC:", error);
        return NextResponse.json({ error: 'Failed to build TOC' }, { status: 500 });
    }
}
