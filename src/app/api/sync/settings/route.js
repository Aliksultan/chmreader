import { getKv } from '@/lib/kv';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: 'Username required' }, { status: 400 });
  }

  try {
    const kv = await getKv();
    const settings = await kv.get(`settings:${username.toLowerCase()}`);
    return NextResponse.json({ settings: settings || null });
  } catch (error) {
    console.error('KV Error (GET settings):', error);
    return NextResponse.json({ error: 'Failed to retrieve settings' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { username, settings } = body;

    if (!username || !settings) {
      return NextResponse.json({ error: 'Username and settings required' }, { status: 400 });
    }

    const kv = await getKv();
    await kv.set(`settings:${username.toLowerCase()}`, settings);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('KV Error (POST settings):', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
