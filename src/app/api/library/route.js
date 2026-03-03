import { NextResponse } from 'next/server';

// Single-book mode: hardcoded book list
export async function GET() {
  return NextResponse.json({ books: ['book.chm'] });
}
