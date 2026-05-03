import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
    const unwrappedParams = await params;
    const book = unwrappedParams.book;
    const decodedBook = decodeURIComponent(book);
    const bookName = decodedBook.replace('.chm', '').replace('.CHM', '');

    const cacheUrl = bookName === 'kutuphane' ? '/api/content' : `/api/content/${bookName}`;

    return NextResponse.json({
        success: true,
        cacheUrl: cacheUrl
    });
}
