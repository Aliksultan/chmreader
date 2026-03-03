import { NextResponse } from 'next/server';

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

        // Truncate text to avoid exceeding token limits
        const maxChars = 50000;
        const truncatedText = text.length > maxChars ? text.substring(0, maxChars) + '\n\n[Content truncated...]' : text;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Translate the following text to ${langName}. Preserve the original formatting and paragraph structure. Only output the translation, nothing else.\n\n${truncatedText}`
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 8192
                    }
                })
            }
        );

        if (!response.ok) {
            const errData = await response.text();
            console.error('Gemini API error:', errData);
            return NextResponse.json({ error: `Gemini API error: ${response.status}` }, { status: 500 });
        }

        const data = await response.json();
        const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return NextResponse.json({ translation: translatedText });
    } catch (err) {
        console.error('Translation error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
