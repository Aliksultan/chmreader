import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get('url');

  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing YouTube URL' }, { status: 400 });
  }

  try {
    let videoId = '';

    // Strategy 1: Parse as a proper URL and read the `v` query parameter
    // This handles: watch?v=ID&list=... and all playlist URLs perfectly
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname.includes('youtube.com')) {
        videoId = parsed.searchParams.get('v') || '';
      } else if (parsed.hostname === 'youtu.be') {
        // https://youtu.be/ID format
        videoId = parsed.pathname.slice(1).split('?')[0];
      }
    } catch {}

    // Strategy 2: Fallback regex for malformed URLs
    if (!videoId || videoId.length !== 11) {
      const match = rawUrl.match(/(?:youtu\.be\/|[?&]v=)([A-Za-z0-9_-]{11})/);
      if (match) videoId = match[1];
    }

    if (!videoId || videoId.length !== 11) {
      return NextResponse.json({ error: 'Could not extract video ID from URL' }, { status: 400 });
    }

    // Fetch title via YouTube oEmbed (no API key needed)
    // oEmbed can fail (401/403) for private, unlisted, or age-restricted videos — handle gracefully
    let title = '';
    let episodeId = '';
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        title = data.title || '';

        // Try to extract an episode number from the title (e.g. "Ahlaki Mülahazalar 1" → "ep-01")
        const numMatch = title.match(/\b(\d+)\s*$/);
        if (numMatch) {
          episodeId = `ep-${numMatch[1].padStart(2, '0')}`;
        }
      } else {
        console.warn(`oEmbed returned ${oembedRes.status} for video ${videoId} — title may be private/restricted`);
      }
    } catch (oembedErr) {
      console.warn(`oEmbed fetch failed for ${videoId}:`, oembedErr.message);
    }

    // Always return the video ID — user can fill in title manually if oEmbed failed
    return NextResponse.json({ youtubeId: videoId, title, episodeId });

  } catch (e) {
    console.error('Info extract error:', e);
    return NextResponse.json({ error: 'Could not extract metadata: ' + e.message }, { status: 500 });
  }
}
