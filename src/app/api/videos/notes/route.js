import { getKv } from '@/lib/kv';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const playlist = searchParams.get('playlist');
  const video = searchParams.get('video');

  if (!username || !playlist || !video) {
    return NextResponse.json({ note: null });
  }

  try {
    const kv = await getKv();
    const note = await kv.get(`vidnote:${username.toLowerCase()}:${playlist}:${video}`);
    return NextResponse.json({ note: note || null });
  } catch (e) {
    return NextResponse.json({ note: null });
  }
}

export async function POST(request) {
  try {
    const { username, playlist, video, content } = await request.json();
    if (!username || !playlist || !video) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    const kv = await getKv();
    await kv.set(`vidnote:${username.toLowerCase()}:${playlist}:${video}`, content || '');
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Video notes save error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
