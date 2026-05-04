import { getKv } from '@/lib/kv';
import { NextResponse } from 'next/server';

// GET /api/sync/bookmarks?username=&book=(optional)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  if (!username) return NextResponse.json({ error: 'Username required' }, { status: 400 });

  try {
    const kv = await getKv();
    const bookmarks = await kv.get(`bookmarks:${username.toLowerCase()}`);
    return NextResponse.json({ bookmarks: bookmarks || [] });
  } catch (error) {
    console.error('KV Error (GET bookmarks):', error);
    return NextResponse.json({ error: 'Failed to retrieve bookmarks' }, { status: 500 });
  }
}

// POST /api/sync/bookmarks  { username, bookmarks: [...] }
export async function POST(request) {
  try {
    const { username, bookmarks } = await request.json();
    if (!username || !Array.isArray(bookmarks)) {
      return NextResponse.json({ error: 'Username and bookmarks array required' }, { status: 400 });
    }
    const kv = await getKv();
    await kv.set(`bookmarks:${username.toLowerCase()}`, bookmarks);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('KV Error (POST bookmarks):', error);
    return NextResponse.json({ error: 'Failed to save bookmarks' }, { status: 500 });
  }
}
