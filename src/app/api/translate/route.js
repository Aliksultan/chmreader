import { NextResponse } from 'next/server';

const CHUNK_SIZE = 4000; // characters per chunk (safe for token limits)
const MAX_OUTPUT_TOKENS = 16384;

const PRIMARY_MODEL = 'gemini-3-flash-preview';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite-preview';

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
                text: `Translate the following text to ${langName}. Preserve the original formatting and paragraph structure. Only output the translation, nothing else.\n\n${text}`
            }]
        }],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: MAX_OUTPUT_TOKENS
        }
    };

    let response = await callGeminiModel(PRIMARY_MODEL, body, apiKey);

    // Fallback to lite model on 503 (high demand)
    if (response.status === 503) {
        console.log(`${PRIMARY_MODEL} unavailable, falling back to ${FALLBACK_MODEL}`);
        response = await callGeminiModel(FALLBACK_MODEL, body, apiKey);
    }

    if (!response.ok) {
        const errData = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errData}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function splitIntoChunks(text, maxChunkSize) {
    const chunks = [];
    const paragraphs = text.split(/\n\s*\n/); // Split by double newlines (paragraphs)
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

    // If any chunk is still too large, split by sentences
    const finalChunks = [];
    for (const chunk of chunks) {
        if (chunk.length <= maxChunkSize) {
            finalChunks.push(chunk);
        } else {
            // Split by sentences
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
        const { text, targetLang, apiKey } = await request.json();

        if (!text || !targetLang || !apiKey) {
            return NextResponse.json({ error: 'Missing required fields: text, targetLang, apiKey' }, { status: 400 });
        }

        const langNames = {
            'ru': 'Russian',
            'kk': 'Kazakh'
        };

        const langName = langNames[targetLang] || targetLang;

        // For short texts, translate in one shot
        if (text.length <= CHUNK_SIZE) {
            const translation = await translateChunk(text, langName, apiKey);
            return NextResponse.json({ translation });
        }

        // For large texts, split into chunks and translate each
        const chunks = splitIntoChunks(text, CHUNK_SIZE);
        const translatedChunks = [];

        for (const chunk of chunks) {
            const translated = await translateChunk(chunk, langName, apiKey);
            translatedChunks.push(translated);
        }

        const fullTranslation = translatedChunks.join('\n\n');
        return NextResponse.json({ translation: fullTranslation });
    } catch (err) {
        console.error('Translation error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
