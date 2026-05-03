import { NextResponse } from 'next/server';

const CHUNK_SIZE = 12000;
const MAX_OUTPUT_TOKENS = 16384;
const PRIMARY_MODEL = 'gemini-3-flash-preview';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite-preview';

// Rate limiting: 10 translate requests per minute per IP
const rateLimitMap = new Map();
function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now - entry.start > 60000) {
        rateLimitMap.set(ip, { start: now, count: 1 });
        return false;
    }
    entry.count++;
    return entry.count > 10;
}

// Optional Upstash/Vercel Redis - gracefully skip if not configured
let redis = null;
try {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (url && token) {
        const { Redis } = await import('@upstash/redis');
        redis = new Redis({ url, token });
        console.log('✅ Translate API — Redis connected:', url.includes('upstash') ? 'Upstash' : 'Vercel KV');
    } else {
        console.warn('⚠️ Translate API — No Redis credentials. Translations will not be cached. Set UPSTASH_REDIS_REST_URL + TOKEN or KV_REST_API_URL + TOKEN.');
    }
} catch (e) {
    console.error('❌ Redis initialization failed:', e.message);
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

SPIRITUAL & CONTEXTUAL TRANSLATION GUIDELINES:
1. Core Meaning over Literal Translation: Do not translate word-for-word. Convey the deep meaning, spirit, and light of the sentence. Use the "mana-i harfī" (contextual/spiritual meaning) principle rather than "mana-i ismī" (literal/isolated meaning). Ask yourself: "How would a native speaker express this profound thought naturally?"
2. Cultural & Linguistic Nuance: Do not be bound by the original syntax. Use natural idioms, proverbs, and culturally appropriate expressions in ${langName} to convey the core intent and spiritual flavor. The text should feel natural, luminous, and impactful, not dry or mechanical.
3. Handling Arabic / Spiritual Terms (Dhikr, Duas): Preserve original Arabic terms, prayers, and dhikr where appropriate to maintain the spiritual rhythm. If kept in Arabic, provide a brief, natural in-line explanation or translation in parentheses contextually.
4. Faithfulness & Tone: Stay true to the author's profound purpose without adding personal opinions or distorting the intent. Maintain the eloquent, literary, and emotional weight of the original text.

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
    result = result.replace(/^```html ?\s *\n ? /i, '').replace(/\n ? ```\s*$/i, '').trim();

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
        const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
        if (isRateLimited(ip)) {
            return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
        }

        const { text, targetLang, apiKey, pageKey } = await request.json();

        if (!text || !targetLang) {
            return NextResponse.json({ error: 'Missing required fields: text, targetLang' }, { status: 400 });
        }

        const langNames = {
            'ru': 'Russian',
            'kk': 'Kazakh'
        };

        const langName = langNames[targetLang] || targetLang;

        let fullPath = null;
        let savePath = null;
        if (pageKey && pageKey.startsWith('/api/content/')) {
            const relativePath = decodeURIComponent(pageKey.substring('/api/content/'.length));
            fullPath = require('path').join(process.cwd(), 'db', relativePath);
            savePath = fullPath.replace(/\.html?$/i, `.${targetLang}.htm`);

            // Check DISK CACHE first (User requested saving translated HTM format)
            if (require('fs').existsSync(savePath)) {
                console.log(`Loading translation from disk: ${savePath}`);
                const doc = require('fs').readFileSync(savePath, 'utf8');
                const bodyMatch = doc.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                if (bodyMatch) {
                    return NextResponse.json({ translation: bodyMatch[1].trim(), source: 'disk-cache' });
                }
            }
        }

        // 1) Check Redis cache SECOND — no API key needed for cached translations
        const kvKey = pageKey ? `tr:${pageKey}:${targetLang}` : null;
        if (kvKey) {
            const cached = await getFromKV(kvKey);
            if (cached) {
                // Mirror it to disk for future use
                if (fullPath && savePath && require('fs').existsSync(fullPath)) {
                    saveToDiskHtm(fullPath, savePath, cached);
                }
                return NextResponse.json({ translation: cached, source: 'kv-cache' });
            }
        }

        // 2) No cache hit — need API key to generate a fresh translation
        if (!apiKey) {
            return NextResponse.json({ error: 'API_KEY_REQUIRED' }, { status: 401 });
        }

        let fullTranslation;

        if (text.length <= CHUNK_SIZE) {
            fullTranslation = await translateChunk(text, langName, apiKey);
        } else {
            const chunks = splitIntoChunks(text, CHUNK_SIZE);
            console.log(`Processing ${chunks.length} chunks in parallel...`);

            const translatedChunks = await Promise.all(
                chunks.map(chunk => translateChunk(chunk, langName, apiKey))
            );

            fullTranslation = translatedChunks.join('\n');
        }

        // Save to KV cache
        if (kvKey && fullTranslation) {
            await saveToKV(kvKey, fullTranslation);
        }

        // Save translation to DISK as HTM format
        if (fullPath && savePath && require('fs').existsSync(fullPath)) {
            saveToDiskHtm(fullPath, savePath, fullTranslation);
        }

        return NextResponse.json({ translation: fullTranslation });
    } catch (err) {
        console.error('Translation error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

function saveToDiskHtm(originalPath, savePath, translatedBodyHtml) {
    try {
        const fs = require('fs');
        const iconv = require('iconv-lite');
        const buffer = fs.readFileSync(originalPath);
        let originalHtml = iconv.decode(buffer, 'windows-1254');
        
        const bodyMatch = originalHtml.match(/<body[^>]*>/i);
        const endBodyMatch = originalHtml.match(/<\/body>/i);
        
        if (bodyMatch && endBodyMatch) {
            const beforeBody = originalHtml.substring(0, bodyMatch.index + bodyMatch[0].length);
            const afterBody = originalHtml.substring(endBodyMatch.index);
            
            let newHtml = beforeBody + '\n' + translatedBodyHtml + '\n' + afterBody;
            newHtml = newHtml.replace(/charset=windows-125[0-9]/ig, 'charset=utf-8');
            newHtml = newHtml.replace(/charset=iso-8859-[0-9]/ig, 'charset=utf-8');
            
            fs.writeFileSync(savePath, newHtml, 'utf8');
            console.log(`Successfully saved HTM translation to: ${savePath}`);
        }
    } catch (e) {
        console.error('Failed to write translated HTM to disk:', e);
    }
}
