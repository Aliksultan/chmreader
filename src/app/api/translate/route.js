import { NextResponse } from 'next/server';

const CHUNK_SIZE = 12000;
const MAX_OUTPUT_TOKENS = 16384;
const PRIMARY_MODEL = 'gemini-3-flash-preview';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite-preview';

// Optional Upstash/Vercel Redis - gracefully skip if not configured
let redis = null;
try {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (url && token) {
        const { Redis } = await import('@upstash/redis');
        redis = new Redis({ url, token });
        console.log('✅ Redis Cache Initialized:', url.includes('upstash') ? 'Upstash' : 'Vercel KV');
    }
} catch (e) {
    console.error('Redis initialization failed:', e.message);
}

async function getFromKV(key) {
    if (!redis) return null;
    try { return await redis.get(key); } catch (e) { return null; }
}

async function saveToKV(key, value) {
    if (!redis) return;
    try {
        // Cache for 30 days
        await redis.set(key, value, { ex: 60 * 60 * 24 * 30 });
    } catch (e) { /* ignore */ }
}

async function callGeminiModel(model, body, apiKey) {
    return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }
    );
}

async function translateChunk(text, langName, apiKey) {
    const body = {
        contents: [{
            parts: [{
                text: `You are a professional translator. Translate the following text to ${langName}.

IMPORTANT FORMATTING RULES:
- Return the translation as clean HTML
- Preserve the original structure: paragraphs, headings, lists, emphasis
- Use <h3> for section headings, <p> for paragraphs, <strong> for emphasis, <ul>/<li> for lists
- Keep paragraph breaks as separate <p> tags
- Do NOT add any wrapper elements, html/body tags, or CSS
- Do NOT add any notes, commentary, or translator remarks
- ONLY output the translated HTML, nothing else

TEXT TO TRANSLATE:
${text}`
            }]
        }],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: MAX_OUTPUT_TOKENS
        }
    };

    let response = await callGeminiModel(PRIMARY_MODEL, body, apiKey);

    if (response.status === 503) {
        console.log(`${PRIMARY_MODEL} unavailable, falling back to ${FALLBACK_MODEL}`);
        response = await callGeminiModel(FALLBACK_MODEL, body, apiKey);
    }

    if (!response.ok) {
        const errData = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errData}`);
    }

    const data = await response.json();
    let result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Clean up markdown code fences if Gemini wraps HTML in them
    result = result.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    return result;
}

function splitIntoChunks(text, maxChunkSize) {
    const chunks = [];
    const paragraphs = text.split(/\n\s*\n/);
    let currentChunk = '';

    for (const para of paragraphs) {
        if (currentChunk.length + para.length + 2 > maxChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }
        currentChunk += (currentChunk ? '\n\n' : '') + para;
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    const finalChunks = [];
    for (const chunk of chunks) {
        if (chunk.length <= maxChunkSize) {
            finalChunks.push(chunk);
        } else {
            const sentences = chunk.split(/(?<=[.!?])\s+/);
            let subChunk = '';
            for (const sentence of sentences) {
                if (subChunk.length + sentence.length + 1 > maxChunkSize && subChunk.length > 0) {
                    finalChunks.push(subChunk.trim());
                    subChunk = '';
                }
                subChunk += (subChunk ? ' ' : '') + sentence;
            }
            if (subChunk.trim()) {
                finalChunks.push(subChunk.trim());
            }
        }
    }

    return finalChunks;
}

export async function POST(request) {
    try {
        const { text, targetLang, apiKey, pageKey } = await request.json();

        if (!text || !targetLang) {
            return NextResponse.json({ error: 'Missing required fields: text, targetLang' }, { status: 400 });
        }

        const langNames = {
            'ru': 'Russian',
            'kk': 'Kazakh'
        };

        const langName = langNames[targetLang] || targetLang;

        // Check Vercel KV cache FIRST (allows free reads without API key)
        const kvKey = pageKey ? `tr:${pageKey}:${targetLang}` : null;
        if (kvKey) {
            const cached = await getFromKV(kvKey);
            if (cached) {
                return NextResponse.json({ translation: cached, source: 'kv-cache' });
            }
        }

        // Cache miss. Now we strictly require the API key to generate a new translation.
        if (!apiKey) {
            return NextResponse.json({ error: 'API_KEY_REQUIRED' }, { status: 401 });
        }

        let fullTranslation;

        if (text.length <= CHUNK_SIZE) {
            fullTranslation = await translateChunk(text, langName, apiKey);
        } else {
            const chunks = splitIntoChunks(text, CHUNK_SIZE);
            console.log(`Processing ${chunks.length} chunks in parallel...`);

            // Execute all chunks in parallel using Promise.all
            const translatedChunks = await Promise.all(
                chunks.map(chunk => translateChunk(chunk, langName, apiKey))
            );

            fullTranslation = translatedChunks.join('\n');
        }

        // Save to KV cache
        if (kvKey && fullTranslation) {
            await saveToKV(kvKey, fullTranslation);
        }

        return NextResponse.json({ translation: fullTranslation });
    } catch (err) {
        console.error('Translation error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
