import { generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';

export async function POST(req) {
    try {
        const { translations, apiKey, targetLang } = await req.json();

        if (!translations || !apiKey || !targetLang) {
            return Response.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const customGoogleProvider = createGoogleGenerativeAI({ apiKey: apiKey.trim() });
        const customGoogle = customGoogleProvider('gemini-3-flash-preview');

        const { object } = await generateObject({
            model: customGoogle,
            schema: z.object({
                results: z.array(z.object({
                    isCorrect: z.boolean().describe("True if the user's translation reasonably captures the core meaning/essence, even if not word-for-word exact."),
                    feedback: z.string().describe(`Brief, encouraging feedback in ${targetLang} explaining the spiritual nuance of the phrase.`)
                }))
            }),
            prompt: `Act as a compassionate, expert language teacher of Turkish and Ottoman texts. 
I am providing a list of complex spiritual phrases, their intended meaning in ${targetLang}, and what the student guessed. 
Evaluate if the student's guess is meaningfully correct. Be lenient; reward them for capturing the spiritual essence.\n\nEvaluations to grade:\n${JSON.stringify(translations, null, 2)}`
        });

        return Response.json(object);
    } catch (err) {
        console.error('Grade API Error:', err);
        return Response.json({ error: err.message }, { status: 500 });
    }
}
