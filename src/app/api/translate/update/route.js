import { NextResponse } from 'next/server';
import sanitizeHtml from 'sanitize-html';

// Optional Upstash/Vercel Redis
let redis = null;
try {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (url && token) {
        const { Redis } = await import('@upstash/redis');
        redis = new Redis({ url, token });
        console.log('✅ Redis connected for translation updates');
    } else {
        console.warn('⚠️ No Redis credentials found (UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN) — translation editing will not work.');
    }
} catch (e) {
    console.error('❌ Redis init failed:', e.message);
}

// Simple password protection for edits (optional)
const EDITOR_PASSWORD = process.env.EDITOR_PASSWORD || '';

// Basic in-memory rate limiting: max 20 saves per minute per IP
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 20;

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(ip, { start: now, count: 1 });
        return false;
    }
    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) return true;
    return false;
}

export async function POST(request) {
    try {
        // Rate limit check
        const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
        if (isRateLimited(ip)) {
            return NextResponse.json({ error: 'Rate limit exceeded. Please wait before saving again.' }, { status: 429 });
        }

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

        // Sanitize HTML before saving to prevent XSS
        const cleanHtml = sanitizeHtml(html, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat([
                'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'span', 'div',
                'table', 'thead', 'tbody', 'tr', 'td', 'th', 'br', 'hr',
                'sup', 'sub', 'details', 'summary', 'figure', 'figcaption'
            ]),
            allowedAttributes: {
                ...sanitizeHtml.defaults.allowedAttributes,
                '*': ['class', 'id', 'style', 'dir', 'lang'],
                'img': ['src', 'alt', 'width', 'height'],
                'a': ['href', 'target', 'rel']
            },
            allowedSchemes: ['http', 'https', 'data'],
        });

        const kvKey = `tr:${pageKey}:${targetLang}`;

        // Save the sanitized translation to Redis (30-day TTL)
        await redis.set(kvKey, cleanHtml, { ex: 60 * 60 * 24 * 30 });

        console.log(`✏️ Translation updated: ${kvKey} (${cleanHtml.length} chars)`);

        return NextResponse.json({ success: true, key: kvKey });
    } catch (err) {
        console.error('Translation update error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
