import { NextResponse } from 'next/server';

const CHUNK_SIZE = 6000;
const MAX_OUTPUT_TOKENS = 16384;

async function callGemini(prompt, apiKey) {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: MAX_OUTPUT_TOKENS
                }
            })
        }
    );

    if (!response.ok) {
        const errData = await response.text();
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function splitIntoChunks(text, maxSize) {
    const chunks = [];
    const paragraphs = text.split(/\n\s*\n/);
    let current = '';

    for (const para of paragraphs) {
        if (current.length + para.length + 2 > maxSize && current.length > 0) {
            chunks.push(current.trim());
            current = '';
        }
        current += (current ? '\n\n' : '') + para;
    }
    if (current.trim()) chunks.push(current.trim());

    // Handle single paragraphs that are too large
    const final = [];
    for (const chunk of chunks) {
        if (chunk.length <= maxSize) {
            final.push(chunk);
        } else {
            const sentences = chunk.split(/(?<=[.!?])\s+/);
            let sub = '';
            for (const s of sentences) {
                if (sub.length + s.length + 1 > maxSize && sub.length > 0) {
                    final.push(sub.trim());
                    sub = '';
                }
                sub += (sub ? ' ' : '') + s;
            }
            if (sub.trim()) final.push(sub.trim());
        }
    }
    return final;
}

export async function POST(request) {
    try {
        const { text, mode, lang, apiKey } = await request.json();

        if (!text || !mode || !apiKey) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const responseLang = lang === 'kk' ? 'Kazakh' : lang === 'tr' ? 'Turkish' : 'Russian';

        if (mode === 'summarize') {
            const prompt = `You are a knowledgeable assistant helping a Muslim reader understand Islamic texts. The reader is studying from an Islamic book.

Summarize the following text concisely but comprehensively. Highlight the key Islamic rulings (hukm), evidence (dalil), and practical takeaways. If the text references Quran ayahs or hadiths, mention them specifically. Structure the summary with clear bullet points.

Respond in ${responseLang}.

TEXT:
${text}`;

            const result = await callGemini(prompt, apiKey);
            return NextResponse.json({ result });

        } else if (mode === 'explain') {
            // For large texts, chunk and explain each part
            const chunks = splitIntoChunks(text, CHUNK_SIZE);
            const explanations = [];

            for (const chunk of chunks) {
                const prompt = `You are a knowledgeable Islamic studies teacher helping a Muslim student understand a passage from an Islamic textbook. 

Explain the following passage in simple, clear language. For each key concept or ruling:
- Explain what it means in practical terms
- If there are Arabic/Islamic terms, define them
- If Quran ayahs or hadiths are referenced, provide brief context
- Note if there are different scholarly opinions (ikhtilaf) when relevant
- Highlight the practical application for a Muslim's daily life

Keep the explanation well-structured with paragraph breaks. Be thorough but accessible.

Respond in ${responseLang}.

PASSAGE:
${chunk}`;

                const result = await callGemini(prompt, apiKey);
                explanations.push(result);
            }

            return NextResponse.json({ result: explanations.join('\n\n---\n\n') });
        }

        return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    } catch (err) {
        console.error('AI API error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
