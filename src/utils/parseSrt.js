/**
 * Parses an SRT string into an array of cue objects.
 * @param {string} srtText
 * @returns {{ id: number, start: number, end: number, text: string }[]}
 */
export function parseSrt(srtText) {
  if (!srtText) return [];
  const normalized = srtText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.trim().split(/\n\n+/);
  const cues = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    const id = parseInt(lines[0].trim(), 10);
    if (isNaN(id)) continue;
    const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
    if (!timeMatch) continue;
    const start = parseTimestamp(timeMatch[1]);
    const end = parseTimestamp(timeMatch[2]);
    const text = lines.slice(2).join(' ').trim();
    if (!text) continue;
    cues.push({ id, start, end, text });
  }
  return cues;
}

function parseTimestamp(ts) {
  const m = ts.match(/(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})/);
  if (!m) return 0;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 1000;
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
