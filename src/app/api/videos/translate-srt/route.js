import { NextResponse } from 'next/server';

export const maxDuration = 60;

const PRIMARY  = 'gemini-3-flash-preview';  // Gemini 3 Flash (latest)
const FALLBACK = 'gemini-2.5-flash';          // Stable fallback

let redis = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    import('@upstash/redis').then(({ Redis }) => {
      redis = new Redis({ url, token });
    }).catch(e => console.error("Redis import failed:", e));
  }
} catch (e) {}

async function callGemini(model, prompt, apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    }
  );
  return res;
}

// Extracts {"0":"...", "1":"...", ...} from any LLM response robustly
function parseTranslations(raw, count) {
  // First try: clean JSON parse
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {}
  }

  // Second try: Regex extraction — salvages partial/truncated output
  const result = {};
  const re = /"(\d+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    result[m[1]] = m[2].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  if (Object.keys(result).length > 0) return result;

  return null;
}

async function translateCues(cues, contextBefore, contextAfter, langName, apiKey) {
  const inputMap = {};
  cues.forEach((c, i) => { inputMap[String(i)] = c.text.replace(/\n/g, ' ').trim(); });

  const beforeStr = contextBefore.map(c => c.text.replace(/\n/g, ' ').trim()).join(' | ');
  const afterStr  = contextAfter.map(c => c.text.replace(/\n/g, ' ').trim()).join(' | ');

  const prompt = `You are a professional translator specializing in Islamic and spiritual texts. Translate the following Turkish subtitle lines to ${langName}.

SPIRITUAL & CONTEXTUAL TRANSLATION GUIDELINES:
1. Core Meaning over Literal Translation: Do not translate word-for-word. Convey the deep meaning, spirit, and light of the sentence. Use the "mana-i harfī" (contextual/spiritual meaning) principle rather than "mana-i ismī" (literal/isolated meaning).
2. Cultural & Linguistic Nuance: Use natural idioms, proverbs, and culturally appropriate expressions in ${langName}. The subtitles should feel natural, luminous, and impactful — not dry or mechanical.
3. Handling Arabic / Spiritual Terms: Preserve original Arabic terms, prayers, and dhikr (e.g. "Allah", "İnşallah", "Bismillah", "sallallahu aleyhi ve sellem") — keep them in their original script or transliterate naturally. Do NOT translate them.
4. Faithfulness & Tone: Stay true to the speaker's profound spiritual purpose. Maintain the eloquent, warm, and emotionally rich tone of the original.
5. Subtitle Style: Keep each line concise and natural for reading on screen.

CONTEXT (do NOT translate — for grammar/continuity reference only):
Previous: ${beforeStr || '(none)'}
Upcoming: ${afterStr || '(none)'}

LINES TO TRANSLATE (return a JSON object with the same numeric keys — no extra text, no markdown):
${JSON.stringify(inputMap)}

Output (JSON only):`;

  let response = await callGemini(PRIMARY, prompt, apiKey);
  
  // Retry with fallback model on server errors or rate limits
  if (!response.ok && (response.status === 429 || response.status >= 500)) {
    console.warn(`Primary model ${response.status}, trying fallback...`);
    response = await callGemini(FALLBACK, prompt, apiKey);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  const translatedMap = parseTranslations(raw, cues.length);

  // Build result — if a translation is missing, mark isTranslated=false so retry loop catches it
  return cues.map((c, i) => {
    const val = translatedMap?.[String(i)];
    const ok = typeof val === 'string' && val.trim().length > 0;
    return { ...c, text: ok ? val.trim() : c.text, isTranslated: ok };
  });
}

// POST — translate a chunk of cues
export async function POST(request) {
  try {
    const { targetLang, apiKey, cues, contextBefore, contextAfter } = await request.json();

    if (!targetLang || !apiKey || !cues?.length) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    if (!['ru', 'kk'].includes(targetLang)) {
      return NextResponse.json({ error: 'Invalid language' }, { status: 400 });
    }

    const langNames = { ru: 'Russian', kk: 'Kazakh' };
    const result = await translateCues(cues, contextBefore || [], contextAfter || [], langNames[targetLang], apiKey);
    return NextResponse.json({ cues: result });
  } catch (err) {
    console.error('translate-srt POST error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — load cached translation from KV
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playlist = searchParams.get('playlist');
  const video = searchParams.get('video');
  const targetLang = searchParams.get('targetLang');

  if (!playlist || !video || !targetLang) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }
  if (!redis) return NextResponse.json({ cues: null });

  try {
    const key = `tr:${playlist}:${video}:${targetLang}`;
    const cached = await redis.get(key);
    return NextResponse.json({ cues: cached || null });
  } catch (e) {
    return NextResponse.json({ cues: null });
  }
}

// PUT — save translated cues to KV cache
export async function PUT(request) {
  try {
    const { playlist, video, targetLang, cues } = await request.json();
    if (!playlist || !video || !targetLang || !cues?.length) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    if (!redis) return NextResponse.json({ ok: true });

    const key = `tr:${playlist}:${video}:${targetLang}`;
    await redis.set(key, JSON.stringify(cues));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('translate-srt PUT error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — clear KV cache for a video
export async function DELETE(request) {
  try {
    const { playlist, video, targetLang } = await request.json();
    if (!redis) return NextResponse.json({ ok: true });
    const key = `tr:${playlist}:${video}:${targetLang}`;
    await redis.del(key);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
