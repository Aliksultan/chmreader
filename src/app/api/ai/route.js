import { NextResponse } from 'next/server';

const CHUNK_SIZE = 6000;
const MAX_OUTPUT_TOKENS = 16384;
const PRIMARY_MODEL = 'gemini-3-flash-preview';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite-preview';

async function callGemini(prompt, apiKey) {
    const body = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            temperature: 0.4,
            maxOutputTokens: MAX_OUTPUT_TOKENS
        }
    };

    let response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${PRIMARY_MODEL}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );

    if (response.status === 503) {
        console.log(`${PRIMARY_MODEL} unavailable, falling back to ${FALLBACK_MODEL}`);
        response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${FALLBACK_MODEL}:generateContent?key=${apiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );
    }

    if (!response.ok) {
        const errData = await response.text();
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    let result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Clean up markdown code fences if present
    result = result.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    return result;
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
            const prompt = `You are a knowledgeable assistant helping a Muslim reader understand Islamic texts.

Summarize the following text concisely but comprehensively in ${responseLang}.

FORMAT YOUR RESPONSE AS HTML:
- Use <h3> for the main summary title
- Use <h4> for sub-section headings (e.g., "Key Rulings", "Evidence", "Practical Takeaways")
- Use <ul><li> for bullet points
- Use <strong> to highlight important terms, rulings, and Arabic/Islamic terms
- Use <p> for explanatory paragraphs
- Use <blockquote> for Quran ayahs or hadith references
- Do NOT wrap in html/body tags or add CSS
- Do NOT add code fences

CONTENT GUIDELINES:
- Highlight the key Islamic rulings (hukm) and evidence (dalil)
- If the text references Quran ayahs or hadiths, mention them specifically
- Include practical takeaways for a Muslim's daily life
- Be thorough yet concise

TEXT:
${text}`;

            const result = await callGemini(prompt, apiKey);
            return NextResponse.json({ result });

        } else if (mode === 'explain') {
            const chunks = splitIntoChunks(text, CHUNK_SIZE);
            const explanations = [];

            for (const chunk of chunks) {
                const prompt = `You are a knowledgeable Islamic studies teacher helping a Muslim student understand a passage.

Explain the following passage in clear, accessible ${responseLang}.

FORMAT YOUR RESPONSE AS HTML:
- Use <h3> for passage topic headings
- Use <h4> for sub-topics
- Use <p> for explanations
- Use <strong> for Arabic/Islamic terms when first introduced
- Use <blockquote> for Quran ayahs or hadith quotes
- Use <ul><li> for listing rulings, conditions, or scholarly opinions
- Use <em> for transliterations
- Do NOT wrap in html/body tags or add CSS
- Do NOT add code fences

CONTENT GUIDELINES:
- Explain what each concept or ruling means in practical terms
- Define Arabic/Islamic terms clearly
- Provide context for any Quran or hadith references
- Note different scholarly opinions (ikhtilaf) when relevant
- Highlight how it applies to a Muslim's daily life

PASSAGE:
${chunk}`;

                const result = await callGemini(prompt, apiKey);
                explanations.push(result);
            }

            return NextResponse.json({ result: explanations.join('<hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--card-border);">') });
        }

        return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    } catch (err) {
        console.error('AI API error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
