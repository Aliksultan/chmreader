import { NextResponse } from 'next/server';

// Single-book mode: the book is pre-decompiled in public/cache/book/
// No need for hh.exe or dynamic decompilation
export async function GET(request, { params }) {
    const { book } = await params;
    const decodedBook = decodeURIComponent(book);
    const bookName = decodedBook.replace('.chm', '').replace('.CHM', '');

    return NextResponse.json({
        success: true,
        cacheUrl: `/cache/${bookName}`
    }, {
        headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' }
    });
}
