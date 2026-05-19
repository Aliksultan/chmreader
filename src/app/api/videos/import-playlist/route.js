import { NextResponse } from 'next/server';

const WHISPER_COST_PER_MINUTE = 0.006;

/**
 * GET /api/videos/import-playlist?playlistUrl=...&youtubeApiKey=...
 * Returns a list of all videos in the playlist with durations and cost estimate.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playlistUrl = searchParams.get('playlistUrl');
  const youtubeApiKey = searchParams.get('youtubeApiKey');

  if (!playlistUrl || !youtubeApiKey) {
    return NextResponse.json({ error: 'Missing playlistUrl or youtubeApiKey' }, { status: 400 });
  }

  // Extract playlist ID from URL
  let playlistId = '';
  try {
    const parsed = new URL(playlistUrl);
    playlistId = parsed.searchParams.get('list') || '';
  } catch {}

  if (!playlistId) {
    return NextResponse.json({ error: 'Could not extract playlist ID from URL. Make sure the URL contains ?list=...' }, { status: 400 });
  }

  // Step 1: Get all video IDs from the playlist using YouTube Data API v3
  const videoIds = [];
  let pageToken = '';

  try {
    do {
      const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
      url.searchParams.set('part', 'contentDetails,snippet');
      url.searchParams.set('playlistId', playlistId);
      url.searchParams.set('maxResults', '50');
      url.searchParams.set('key', youtubeApiKey);
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url.toString());
      const data = await res.json();

      if (!res.ok) {
        const errMsg = data?.error?.message || 'YouTube API error';
        return NextResponse.json({ error: `YouTube API Error: ${errMsg}` }, { status: 400 });
      }

      for (const item of (data.items || [])) {
        videoIds.push({
          videoId: item.contentDetails.videoId,
          title: item.snippet.title,
          position: item.snippet.position,
        });
      }

      pageToken = data.nextPageToken || '';
    } while (pageToken);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch playlist: ' + e.message }, { status: 500 });
  }

  if (videoIds.length === 0) {
    return NextResponse.json({ error: 'Playlist is empty or not accessible.' }, { status: 400 });
  }

  // Step 2: Get durations for all videos in batches of 50
  const videoDetails = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const ids = batch.map(v => v.videoId).join(',');

    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'contentDetails');
    url.searchParams.set('id', ids);
    url.searchParams.set('key', youtubeApiKey);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.error?.message || 'YouTube API error';
      return NextResponse.json({ error: `YouTube API Error (videos.list): ${errMsg}` }, { status: 400 });
    }

    const durationMap = {};
    for (const item of (data.items || [])) {
      durationMap[item.id] = parseIso8601Duration(item.contentDetails.duration);
    }

    for (const v of batch) {
      const durationSec = durationMap[v.videoId] || 0;
      videoDetails.push({
        videoId: v.videoId,
        title: v.title,
        position: v.position,
        durationSec,
        durationMin: durationSec / 60,
      });
    }
  }

  const totalSeconds = videoDetails.reduce((sum, v) => sum + v.durationSec, 0);
  const totalMinutes = totalSeconds / 60;
  const estimatedCost = totalMinutes * WHISPER_COST_PER_MINUTE;

  return NextResponse.json({
    playlistId,
    videoCount: videoDetails.length,
    videos: videoDetails,
    totalMinutes: Math.round(totalMinutes * 100) / 100,
    estimatedCostUsd: Math.round(estimatedCost * 1000) / 1000,
    costPerMinute: WHISPER_COST_PER_MINUTE,
  });
}

/**
 * POST /api/videos/import-playlist
 * Downloads audio via yt-dlp (using ffmpeg for compression when available),
 * transcribes with Whisper, saves SRT.
 */
export async function POST(request) {
  const {
    videoId, title, position, playlistSlug, playlistTitle,
    openaiApiKey, language = 'tr', durationSec = 0,
  } = await request.json();

  if (!videoId || !playlistSlug || !openaiApiKey) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const WHISPER_LIMIT = 24.5 * 1024 * 1024; // 24.5 MB
  const SEGMENT_DURATION = 20 * 60;          // 20-min segments when splitting

  // ── Step 1: Check ffmpeg availability ─────────────────────────────────────
  let hasFfmpeg = false;
  try {
    require('child_process').execSync('ffmpeg -version', { stdio: 'ignore', timeout: 3000 });
    hasFfmpeg = true;
  } catch {}

  // ── Step 2: Download + compress audio via yt-dlp ──────────────────────────
  const os   = require('os');
  const path = require('path');
  const fs   = require('fs');
  const { execSync } = require('child_process');
  const tmpBase = path.join(os.tmpdir(), `yt_${videoId}_${Date.now()}`);
  const tmpMp3  = `${tmpBase}.mp3`;

  try {
    const youtubeDlExec = (await import('youtube-dl-exec')).default;

    if (hasFfmpeg) {
      // Transcode to 32 kbps MP3 via ffmpeg.
      // 32 kbps × 60 min ≈ 14 MB, × 80 min ≈ 18 MB  → fits under 25 MB.
      // Speech intelligibility is excellent even at 32 kbps.
      await youtubeDlExec(`https://www.youtube.com/watch?v=${videoId}`, {
        output: `${tmpBase}.%(ext)s`,
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: '9',                           // LAME VBR q9 ≈ 32 kbps
        postprocessorArgs: ['ffmpeg:-b:a 32k'],      // hard cap at 32 kbps CBR
        noPlaylist: true,
        quiet: true,
      });
      if (!fs.existsSync(tmpMp3)) throw new Error('mp3 output not found after ffmpeg conversion');
    } else {
      // No ffmpeg — download raw audio and check size
      await youtubeDlExec(`https://www.youtube.com/watch?v=${videoId}`, {
        output: `${tmpBase}.%(ext)s`,
        format: 'bestaudio',
        noPlaylist: true,
        quiet: true,
      });
      const found = ['m4a', 'webm', 'ogg', 'mp4', 'opus'].find(e => fs.existsSync(`${tmpBase}.${e}`));
      if (!found) throw new Error('Downloaded audio file not found');
      const rawFile = `${tmpBase}.${found}`;
      const { size } = fs.statSync(rawFile);
      if (size > WHISPER_LIMIT) {
        fs.unlinkSync(rawFile);
        const mb = (size / 1024 / 1024).toFixed(1);
        return NextResponse.json({
          error: `Audio too large (${mb} MB > 25 MB). Install ffmpeg for automatic compression: winget install Gyan.FFmpeg`,
        }, { status: 413 });
      }
      // Rename to .mp3 path so the rest of the code is uniform
      fs.renameSync(rawFile, tmpMp3);
    }
  } catch (e) {
    try { ['mp3','m4a','webm','ogg','mp4','opus'].forEach(ext => { try { fs.unlinkSync(`${tmpBase}.${ext}`); } catch {} }); } catch {}
    return NextResponse.json({ error: `Audio download failed: ${e.message}` }, { status: 500 });
  }

  // ── Step 3: Transcribe (with ffmpeg time-segment split if > 24.5 MB) ───────
  let srtContent;
  try {
    const { size: mp3Size } = fs.statSync(tmpMp3);

    if (mp3Size <= WHISPER_LIMIT) {
      // ── Single file — send directly ────────────────────────────────────────
      const buf = fs.readFileSync(tmpMp3);
      try { fs.unlinkSync(tmpMp3); } catch {}
      srtContent = await whisperTranscribe(buf, videoId, 'audio/mpeg', 'mp3', openaiApiKey, language);

    } else {
      // ── File too large even at 32 kbps (video > ~100 min): split with ffmpeg
      // ffmpeg splits at exact time boundaries → each segment is a valid mp3.
      // We know segment 0 starts at 0s, segment 1 at 20min, segment 2 at 40min, etc.
      const segBase = `${tmpBase}_seg`;
      execSync(
        `ffmpeg -i "${tmpMp3}" -f segment -segment_time ${SEGMENT_DURATION} -c copy "${segBase}_%03d.mp3" -y`,
        { stdio: 'ignore' }
      );
      try { fs.unlinkSync(tmpMp3); } catch {}

      // Collect segment files in order
      const segFiles = fs.readdirSync(os.tmpdir())
        .filter(f => f.startsWith(path.basename(segBase)) && f.endsWith('.mp3'))
        .sort()
        .map(f => path.join(os.tmpdir(), f));

      if (segFiles.length === 0) throw new Error('ffmpeg produced no segment files');

      const srtParts = [];
      for (let i = 0; i < segFiles.length; i++) {
        const buf = fs.readFileSync(segFiles[i]);
        try { fs.unlinkSync(segFiles[i]); } catch {}
        const offsetSec = i * SEGMENT_DURATION; // exact: segment i starts at i×20min
        const chunkSrt  = await whisperTranscribe(buf, `${videoId}_seg${i}`, 'audio/mpeg', 'mp3', openaiApiKey, language);
        srtParts.push({ srt: chunkSrt, offsetSec });
      }

      srtContent = mergeSrtChunks(srtParts);
    }
  } catch (e) {
    try { fs.unlinkSync(tmpMp3); } catch {}
    return NextResponse.json({ error: `Transcription failed: ${e.message}` }, { status: 500 });
  }


  // ── Step 4: Save to disk ───────────────────────────────────────────────────
  try {
    const playlistDir = path.join(process.cwd(), 'db', 'videos', playlistSlug);
    const episodeId   = `ep-${String(position + 1).padStart(2, '0')}`;
    const episodeDir  = path.join(playlistDir, episodeId);

    if (!fs.existsSync(playlistDir)) {
      fs.mkdirSync(playlistDir, { recursive: true });
      fs.writeFileSync(
        path.join(playlistDir, '_meta.json'),
        JSON.stringify({ title: playlistTitle || playlistSlug }, null, 2)
      );
    }
    if (!fs.existsSync(episodeDir)) fs.mkdirSync(episodeDir, { recursive: true });

    fs.writeFileSync(path.join(episodeDir, 'meta.json'),
      JSON.stringify({ id: episodeId, title, youtubeId: videoId }, null, 2));
    fs.writeFileSync(path.join(episodeDir, 'subtitles.srt'), srtContent);

    return NextResponse.json({ success: true, episodeId, playlistSlug,
      redirectUrl: `/videos/${playlistSlug}/${episodeId}` });
  } catch (e) {
    return NextResponse.json({ error: `Failed to save files: ${e.message}` }, { status: 500 });
  }
}


// ── Helper: send one audio buffer to Whisper, return SRT string ───────────────
async function whisperTranscribe(buffer, name, mime, ext, openaiApiKey, language) {
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: mime }), `${name}.${ext}`);
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'srt');
  formData.append('language', language);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${openaiApiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Whisper error: ${err?.error?.message || `HTTP ${res.status}`}`);
  }

  return await res.text();
}


// ── Helper: merge multiple SRT chunks with timestamp offsets ─────────────────
function mergeSrtChunks(parts) {
  let globalIndex = 1;
  const merged = [];

  for (const { srt, offsetSec } of parts) {
    if (!srt?.trim()) continue;

    // Parse individual SRT entries
    const entries = srt.trim().split(/\n\n+/);
    for (const entry of entries) {
      const lines = entry.trim().split('\n');
      if (lines.length < 2) continue;

      // Find the timestamp line (may or may not have a number line first)
      const tsLineIdx = lines.findIndex(l => l.includes('-->'));
      if (tsLineIdx === -1) continue;

      const tsLine = lines[tsLineIdx];
      const textLines = lines.slice(tsLineIdx + 1).join('\n').trim();
      if (!textLines) continue;

      const offsetted = tsLine.replace(
        /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/,
        (_, h1, m1, s1, ms1, h2, m2, s2, ms2) =>
          `${addSecs(h1, m1, s1, ms1, offsetSec)} --> ${addSecs(h2, m2, s2, ms2, offsetSec)}`
      );

      merged.push(`${globalIndex}\n${offsetted}\n${textLines}`);
      globalIndex++;
    }
  }

  return merged.join('\n\n');
}

// ── Helper: add offsetSec to an SRT timestamp component group ────────────────
function addSecs(h, m, s, ms, offsetSec) {
  let totalMs = (parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s)) * 1000
    + parseInt(ms) + Math.round(offsetSec * 1000);
  totalMs = Math.max(0, totalMs);
  const oh = Math.floor(totalMs / 3600000);
  const om = Math.floor((totalMs % 3600000) / 60000);
  const os = Math.floor((totalMs % 60000) / 1000);
  const oms = totalMs % 1000;
  return `${String(oh).padStart(2,'0')}:${String(om).padStart(2,'0')}:${String(os).padStart(2,'0')},${String(oms).padStart(3,'0')}`;
}

// ── Helper: Parse ISO 8601 duration string (PT1H2M3S) to total seconds ────────
function parseIso8601Duration(dur) {
  if (!dur) return 0;
  const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1]||'0') * 3600 + parseInt(match[2]||'0') * 60 + parseInt(match[3]||'0');
}
