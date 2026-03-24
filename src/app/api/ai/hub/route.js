import { NextResponse } from 'next/server';
import { generateText, generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { Redis } from '@upstash/redis';

// Rate limiting map
const rateLimitMap = new Map();
function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now - entry.start > 60000) {
        rateLimitMap.set(ip, { start: now, count: 1 });
        return false;
    }
    entry.count++;
    return entry.count > 15; // slightly higher limit for multi-tab loads
}

// Redis setup
let redis = null;
try {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (url && token) {
        redis = new Redis({ url, token });
    }
} catch (e) {
    console.log('Redis initialization failed in ai/hub:', e);
}

export async function POST(req) {
    try {
        const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
        if (isRateLimited(ip)) {
            return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
        }

        const { action, text, apiKey, pageKey, targetLang } = await req.json();

        if (!action || !text || !apiKey || !pageKey || !targetLang) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Initialize custom Google provider with user's key
        const customGoogleProvider = createGoogleGenerativeAI({ apiKey: apiKey.trim() });
        const customGoogle = customGoogleProvider('gemini-3-flash-preview');

        // 1. Check Redis Cache
        const cacheKey = `ai:${action}:${pageKey}:${targetLang}`;
        if (redis) {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return NextResponse.json({ result: cached, cached: true });
            }
        }

        let resultData = null;

        // 2. Process based on action
        if (action === 'explain') {
            const { object } = await generateObject({
                model: customGoogle,
                schema: z.object({
                    explanation: z.string().describe(`Do not merely summarize. The user has already read this text. Provide an profound "Deep Dive". Analyze the text from a completely new perspective, explain complex spiritual concepts using engaging, modern real-life examples, and offer concrete, actionable advice on how to put these teachings into practice in daily life. Write in beautiful markdown in ${targetLang}.`),
                    hints: z.array(z.string()).length(3).describe(`3 practical, action-oriented follow-up questions the user can ask to dive deeper into applying this text to their life. Must be in ${targetLang}.`)
                }),
                prompt: `Analyze the following translated text:\n\n${text}`
            });
            resultData = object;
        }

        else if (action === 'summarize') {
            const { text: summaryText } = await generateText({
                model: customGoogle,
                prompt: `Create heavily structured, dotted-note bullet points summarizing the main theological arguments and core concepts of this text. It should act as a perfect "cheat sheet" for delivering a sohbet (study circle). Do not include any intro/outro filler. Write in Markdown in ${targetLang}.\n\nText: ${text}`
            });
            resultData = { summary: summaryText };
        }

        else if (action === 'langQuiz') {
            const { object } = await generateObject({
                model: customGoogle,
                schema: z.object({
                    multipleChoice: z.array(z.object({
                        term: z.string().describe("The complex Turkish or Ottoman term found in the text."),
                        context: z.string().describe("The sentence or phrase where it was used."),
                        question: z.string().describe(`Ask what the term means in ${targetLang}.`),
                        options: z.array(z.string()).length(4).describe(`4 possible meanings in ${targetLang}.`),
                        correctIndex: z.number().min(0).max(3).describe("Index of the correct option.")
                    })).length(15),
                    openEnded: z.array(z.object({
                        phrase: z.string().describe("A profound Turkish idiomatic or spiritual phrase from the text."),
                        intendedMeaning: z.string().describe(`The correct ${targetLang} translation/meaning.`)
                    })).length(5)
                }),
                prompt: `Extract 15 complex Ottoman/Turkish vocabulary terms and 5 idiomatic phrases from the following text to create a language learning quiz for a speaker of ${targetLang}.\n\nText: ${text}`
            });
            resultData = object;
        }

        else if (action === 'knowQuiz') {
            const { object } = await generateObject({
                model: customGoogle,
                schema: z.object({
                    questions: z.array(z.object({
                        question: z.string().describe(`A question testing deep comprehension of the 'mana-i harfi' arguments in the text. Written in ${targetLang}.`),
                        options: z.array(z.string()).length(4).describe(`4 possible answers in ${targetLang}.`),
                        correctIndex: z.number().min(0).max(3).describe("Index of the correct option.")
                    })).length(10)
                }),
                prompt: `Create a 10-question multiple-choice comprehension quiz testing the deep theological concepts and arguments presented in the following text. Write entirely in ${targetLang}.\n\nText: ${text}`
            });
            resultData = object;
        }

        else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        // 3. Save to Redis
        if (redis && resultData) {
            await redis.set(cacheKey, JSON.stringify(resultData), { ex: 60 * 60 * 24 * 30 }); // 30 days
        }

        return NextResponse.json({ result: resultData, cached: false });

    } catch (err) {
        console.error(`AI Hub API Error:`, err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
