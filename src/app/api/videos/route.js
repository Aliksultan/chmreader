import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const videosPath = path.join(process.cwd(), 'db', 'videos');
  if (!fs.existsSync(videosPath)) return NextResponse.json({ playlists: [] });

  const dirs = fs.readdirSync(videosPath).filter(f =>
    !f.startsWith('_') && fs.statSync(path.join(videosPath, f)).isDirectory()
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const playlists = dirs.map(slug => {
    const pPath = path.join(videosPath, slug);
    let title = slug, description = '';
    try {
      const m = JSON.parse(fs.readFileSync(path.join(pPath, '_meta.json'), 'utf8'));
      title = m.title || slug; description = m.description || '';
    } catch {}

    const videos = fs.readdirSync(pPath).filter(f =>
      !f.startsWith('_') && fs.statSync(path.join(pPath, f)).isDirectory()
    ).sort();
    let firstVideoId = null;
    if (videos.length > 0) {
      try {
        const vm = JSON.parse(fs.readFileSync(path.join(pPath, videos[0], 'meta.json'), 'utf8'));
        firstVideoId = vm.youtubeId;
      } catch {}
    }
    return { slug, title, description, firstVideoId, videoCount: videos.length };
  });

  return NextResponse.json({ playlists });
}
