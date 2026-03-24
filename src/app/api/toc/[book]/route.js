import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parseHHC } from './hhcParser';

export async function GET(request, { params }) {
    const { book } = await params;
    const decodedBook = decodeURIComponent(book);
    const cacheDir = path.join(process.cwd(), 'public', 'cache', decodedBook.replace('.chm', ''));

    if (!fs.existsSync(cacheDir)) {
        return NextResponse.json({ error: 'Book not decompiled yet' }, { status: 404 });
    }

    // Find the .hhc file in the cache directory
    const files = fs.readdirSync(cacheDir);
    const hhcFile = files.find(file => file.toLowerCase().endsWith('.hhc'));

    if (!hhcFile) {
        return NextResponse.json({ error: 'TOC file (.hhc) not found' }, { status: 404 });
    }

    try {
        const hhcPath = path.join(cacheDir, hhcFile);
        const toc = parseHHC(hhcPath);
        return NextResponse.json({ toc }, {
            headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' }
        });
    } catch (error) {
        console.error("Error parsing TOC:", error);
        return NextResponse.json({ error: 'Failed to parse TOC' }, { status: 500 });
    }
}
