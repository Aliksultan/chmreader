import { NextResponse } from 'next/server';

// Optional Upstash/Vercel Redis
let redis = null;
try {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (url && token) {
        const { Redis } = await import('@upstash/redis');
        redis = new Redis({ url, token });
    }
} catch (e) {
    console.error('Redis init failed:', e.message);
}

// Simple password protection for edits (optional)
const EDITOR_PASSWORD = process.env.EDITOR_PASSWORD || '';

export async function POST(request) {
    try {
        const { pageKey, targetLang, html, password } = await request.json();

        if (!pageKey || !targetLang || !html) {
            return NextResponse.json({ error: 'Missing required fields: pageKey, targetLang, html' }, { status: 400 });
        }

        // Check password if one is configured
        if (EDITOR_PASSWORD && password !== EDITOR_PASSWORD) {
            return NextResponse.json({ error: 'Invalid editor password' }, { status: 403 });
        }

        if (!redis) {
            return NextResponse.json({ error: 'Redis is not configured on this server' }, { status: 500 });
        }

        const kvKey = `tr:${pageKey}:${targetLang}`;

        // Save the edited translation to Redis (30-day TTL)
        await redis.set(kvKey, html, { ex: 60 * 60 * 24 * 30 });

        console.log(`✏️ Translation updated: ${kvKey} (${html.length} chars)`);

        return NextResponse.json({ success: true, key: kvKey });
    } catch (err) {
        console.error('Translation update error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
