import { getKv } from '@/lib/kv';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const book = searchParams.get('book');

  if (!username || !book) {
    return NextResponse.json({ error: 'Username and book required' }, { status: 400 });
  }

  try {
    const kv = await getKv();
    const highlights = await kv.get(`highlights:${username.toLowerCase()}:${book}`);
    return NextResponse.json({ highlights: highlights || [] });
  } catch (error) {
    console.error('KV Error (GET highlights):', error);
    return NextResponse.json({ error: 'Failed to retrieve highlights' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { username, book, highlights } = body;

    if (!username || !book || highlights === undefined) {
      return NextResponse.json({ error: 'Username, book, and highlights required' }, { status: 400 });
    }

    const kv = await getKv();
    await kv.set(`highlights:${username.toLowerCase()}:${book}`, highlights);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('KV Error (POST highlights):', error);
    return NextResponse.json({ error: 'Failed to save highlights' }, { status: 500 });
  }
}
