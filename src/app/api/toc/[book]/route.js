import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function cleanName(filename) {
    let name = filename;
    // Remove extension
    name = name.replace(/\.html?$/i, '');
    // Remove leading numbers and spaces/dashes (e.g., "01 ", "02-", etc.)
    name = name.replace(/^[\d\s\-_]+/, '');
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
                local: '', // Folders don't have a direct page in this setup unless we define one
                children: buildTocTree(fullPath, basePath, nextRelativePath)
            });
        } else if (file.toLowerCase().endsWith('.htm') || file.toLowerCase().endsWith('.html')) {
            // Ignore localization side-car files from populating as main TOC entries
            if (!file.match(/\.(ru|kk)\.html?$/i)) {
                items.push({
                    name: cleanName(file),
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
