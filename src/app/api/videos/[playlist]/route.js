import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request, { params }) {
  const { playlist } = await params;
  const pPath = path.join(process.cwd(), 'db', 'videos', playlist);
  if (!fs.existsSync(pPath)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let title = playlist, description = '';
  try {
    const m = JSON.parse(fs.readFileSync(path.join(pPath, '_meta.json'), 'utf8'));
    title = m.title || playlist; description = m.description || '';
  } catch {}

  const slugs = fs.readdirSync(pPath).filter(f =>
    !f.startsWith('_') && fs.statSync(path.join(pPath, f)).isDirectory()
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const videos = slugs.map(slug => {
    let vtitle = slug, youtubeId = '', vdesc = '';
    try {
      const vm = JSON.parse(fs.readFileSync(path.join(pPath, slug, 'meta.json'), 'utf8'));
      vtitle = vm.title || slug; youtubeId = vm.youtubeId || ''; vdesc = vm.description || '';
    } catch {}
    const hasSrt = fs.existsSync(path.join(pPath, slug, 'subtitles.srt'));
    return { slug, title: vtitle, youtubeId, description: vdesc, hasSrt };
  });

  return NextResponse.json({ playlist: { slug: playlist, title, description }, videos });
}
