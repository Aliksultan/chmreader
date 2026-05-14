import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// KV for cached translated SRTs
let redis = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    const { Redis } = await import('@upstash/redis');
    redis = new Redis({ url, token });
  }
} catch {}

export async function GET(request, { params }) {
  const { playlist, video } = await params;
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get('lang'); // if present → subtitle mode

  const videoPath = path.join(process.cwd(), 'db', 'videos', playlist, video);
  if (!fs.existsSync(videoPath)) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  // ── Subtitle mode (?lang=tr/ru/kk) ───────────────────────────────────────
  if (lang) {
    if (lang === 'tr') {
      const srtPath = path.join(videoPath, 'subtitles.srt');
      if (!fs.existsSync(srtPath)) {
        return NextResponse.json({ error: 'Subtitles not found' }, { status: 404 });
      }
      const content = fs.readFileSync(srtPath, 'utf8');
      return new NextResponse(content, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // Check KV cache for translated subtitles
    if (redis) {
      try {
        const cached = await redis.get(`video-srt:${playlist}:${video}:${lang}`);
        if (cached) return NextResponse.json({ cues: cached, source: 'kv' });
      } catch {}
    }
    return NextResponse.json({ needsTranslation: true });
  }

  // ── Metadata mode (no ?lang) ─────────────────────────────────────────────
  const metaPath = path.join(videoPath, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    return NextResponse.json({ error: 'meta.json missing' }, { status: 404 });
  }
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return NextResponse.json(meta);
  } catch {
    return NextResponse.json({ error: 'Invalid meta.json' }, { status: 500 });
  }
}
