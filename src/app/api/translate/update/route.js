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

export async function POST(request) {
    try {
        const { pageKey, targetLang, html, password } = await request.json();

        if (!pageKey || !targetLang || !html) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Simple security: check if EDIT_PASSWORD env var is set
        // If it is set, incoming password must match it. If not set, anyone can edit.
        const expectedPassword = process.env.EDIT_PASSWORD;
        if (expectedPassword && password !== expectedPassword) {
            return NextResponse.json({ error: 'INVALID_PASSWORD' }, { status: 403 });
        }

        if (!redis) {
            return NextResponse.json({ error: 'Redis cache is not configured' }, { status: 500 });
        }

        const kvKey = `tr:${pageKey}:${targetLang}`;

        // Save to cache for 30 days
        await redis.set(kvKey, html, { ex: 60 * 60 * 24 * 30 });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Translation update error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
