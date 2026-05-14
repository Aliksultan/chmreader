import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const youtubeId = formData.get('youtubeId');
    const title = formData.get('title');
    const playlistId = formData.get('playlistId');
    const newPlaylistTitle = formData.get('newPlaylistTitle');
    const episodeId = formData.get('episodeId');
    const srtFile = formData.get('srtFile');

    if (!youtubeId || !title || !playlistId || !episodeId || !srtFile) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const playlistDir = path.join(process.cwd(), 'db', 'videos', playlistId);
    
    // Create playlist dir and _meta.json if it's a new playlist
    if (!fs.existsSync(playlistDir)) {
      fs.mkdirSync(playlistDir, { recursive: true });
      if (newPlaylistTitle) {
        fs.writeFileSync(
          path.join(playlistDir, '_meta.json'),
          JSON.stringify({ title: newPlaylistTitle }, null, 2)
        );
      }
    }

    const episodeDir = path.join(playlistDir, episodeId);
    
    // Create episode directory
    if (!fs.existsSync(episodeDir)) {
      fs.mkdirSync(episodeDir, { recursive: true });
    } else {
      return NextResponse.json({ error: 'An episode with this ID already exists in this playlist' }, { status: 400 });
    }

    // Write meta.json
    const metaObj = {
      id: episodeId,
      title: title,
      youtubeId: youtubeId
    };
    fs.writeFileSync(path.join(episodeDir, 'meta.json'), JSON.stringify(metaObj, null, 2));

    // Write subtitles.srt
    const arrayBuffer = await srtFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(path.join(episodeDir, 'subtitles.srt'), buffer);

    return NextResponse.json({ success: true, redirectUrl: `/videos/${playlistId}/${episodeId}` });

  } catch (error) {
    console.error('Error saving video:', error);
    return NextResponse.json({ error: 'Failed to save video: ' + error.message }, { status: 500 });
  }
}
