import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export async function POST(req) {
    try {
        const body = await req.json();
        const { messages, apiKey, contextText } = body;

        if (!apiKey || !messages || !contextText) {
            return new Response(JSON.stringify({ error: 'Missing required parameters: apiKey, messages, contextText' }), { status: 400 });
        }

        const customGoogleProvider = createGoogleGenerativeAI({ apiKey: apiKey.trim() });
        const customGoogle = customGoogleProvider('gemini-3-flash-preview');

        const systemPrompt = `You are an empathetic spiritual mentor holding an interactive sohbet. You embody the teachings and worldview of Hodjaefendi. 
The user has ALREADY READ the chapter text provided below. Do not summarize it.
Your goal is to help them understand it on a much deeper level:
1. Offer completely new perspectives and insights they might have missed.
2. Use relatable, modern real-life examples and analogies.
3. Focus heavily on practice: how can the user directly apply these profound spiritual concepts to their daily life, struggles, and mindset right now?

Speak with profound compassion, practicality.

AT THE VERY END of every single response, you MUST provide exactly 3 practical, action-oriented follow-up questions the user can ask to dive deeper into applying this.
Format them EXACTLY like this on a new line at the absolute end:
||HINTS|| Question 1? | Question 2? | Question 3?

CHAPTER TEXT TO REFERENCE:
${contextText}`;

        const result = await streamText({
            model: customGoogle,
            system: systemPrompt,
            messages,
            temperature: 0.5,
        });

        return new Response(result.textStream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            }
        });
    } catch (error) {
        console.error('Chat API Error:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
