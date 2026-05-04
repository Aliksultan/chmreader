import { getKv } from '@/lib/kv';
import { NextResponse } from 'next/server';

// Stores a global index: highlights-index:{username}
// Each entry: { id, book, bookTitle, pageId, text, color, note, timestamp }

// GET /api/sync/highlights-global?username=
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  if (!username) return NextResponse.json({ error: 'Username required' }, { status: 400 });

  try {
    const kv = await getKv();
    const index = await kv.get(`highlights-index:${username.toLowerCase()}`);
    return NextResponse.json({ highlights: index || [] });
  } catch (error) {
    console.error('KV Error (GET highlights-global):', error);
    return NextResponse.json({ error: 'Failed to retrieve highlights' }, { status: 500 });
  }
}

// POST /api/sync/highlights-global  { username, highlights: [...] }
export async function POST(request) {
  try {
    const { username, highlights } = await request.json();
    if (!username || !Array.isArray(highlights)) {
      return NextResponse.json({ error: 'Username and highlights array required' }, { status: 400 });
    }
    const kv = await getKv();
    await kv.set(`highlights-index:${username.toLowerCase()}`, highlights);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('KV Error (POST highlights-global):', error);
    return NextResponse.json({ error: 'Failed to save highlights' }, { status: 500 });
  }
}
