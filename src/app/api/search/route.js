import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parseHHC } from '../toc/[book]/hhcParser';

const memoizedTocMap = {};

function getTocMap(bookCachePath) {
    if (memoizedTocMap[bookCachePath]) return memoizedTocMap[bookCachePath];

    let map = {};
    if (!fs.existsSync(bookCachePath)) return map;

    const files = fs.readdirSync(bookCachePath);
    const hhcFile = files.find(file => file.toLowerCase().endsWith('.hhc'));
    if (!hhcFile) return map;

    try {
        const hhcPath = path.join(bookCachePath, hhcFile);
        const tocInfo = parseHHC(hhcPath);

        const flatten = (nodes, currentPath = []) => {
            for (const node of nodes) {
                const newPath = [...currentPath, node.name];
                if (node.local) map[node.local] = newPath;
                if (node.children) flatten(node.children, newPath);
            }
        };
        flatten(tocInfo);
        memoizedTocMap[bookCachePath] = map;
    } catch (e) {
        console.error("Error creating toc map for search:", e);
    }
    return map;
}

function searchDirectory(dir, query, results, bookName, basePath, tocMap) {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            searchDirectory(fullPath, query, results, bookName, basePath, tocMap);
        } else if (file.toLowerCase().endsWith('.html') || file.toLowerCase().endsWith('.htm')) {
            const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');
            const hierarchy = tocMap[relativePath] || [file];
            const lowerQuery = query.toLowerCase();

            let score = 0;
            const bookNameMatch = bookName.toLowerCase().includes(lowerQuery);
            const nodeMatch = hierarchy[hierarchy.length - 1].toLowerCase().includes(lowerQuery);

            if (bookNameMatch) {
                if (hierarchy.length <= 1) score += 10000;
                else score += 5;
            }

            if (nodeMatch) {
                if (hierarchy.length <= 1) score += 1000;
                else score += 100;
            }

            let parentMatch = false;
            for (let i = 0; i < hierarchy.length - 1; i++) {
                if (hierarchy[i].toLowerCase().includes(lowerQuery)) {
                    parentMatch = true;
                    score += 1;
                }
            }

            let snippet = '';
            try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const lowerContent = content.toLowerCase();

                if (lowerContent.indexOf(lowerQuery) !== -1) {
                    const textOnly = content.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ');
                    const textLower = textOnly.toLowerCase();
                    const textIdx = textLower.indexOf(lowerQuery);

                    if (textIdx !== -1) {
                        const start = Math.max(0, textIdx - 60);
                        const end = Math.min(textOnly.length, textIdx + query.length + 60);

                        let rawSnippet = textOnly.substring(start, end).trim();
                        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const searchRegex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
                        snippet = rawSnippet.replace(searchRegex, '<strong>$1</strong>');
                        snippet = '...' + snippet + '...';
                        score += 10;
                    }
                }
            } catch (err) { }

            const isDirectMatch = nodeMatch || (bookNameMatch && hierarchy.length <= 1) || snippet;

            if (isDirectMatch) {
                const link = `/reader/${encodeURIComponent(bookName + '.chm')}?page=${encodeURIComponent(relativePath)}`;
                const directUrl = `/cache/${bookName}/${relativePath}`;

                results.push({
                    book: bookName,
                    file: hierarchy[hierarchy.length - 1],
                    hierarchy: hierarchy,
                    snippet: snippet || '(Matched in title only)',
                    link: link,
                    directUrl: directUrl,
                    localId: relativePath,
                    score: score
                });
            }
        }
        if (results.length >= 300) break;
    }
}

export async function POST(request) {
    try {
        const { query, targetBook } = await request.json();
        if (!query || query.length < 3) return NextResponse.json({ results: [] });

        // Single-book mode: search the pre-deployed cache directly
        const bookName = targetBook || 'book';
        const bookCachePath = path.join(process.cwd(), 'public', 'cache', bookName);

        const results = [];

        if (fs.existsSync(bookCachePath)) {
            const tocMap = getTocMap(bookCachePath);
            searchDirectory(bookCachePath, query, results, bookName, bookCachePath, tocMap);
        }

        results.sort((a, b) => b.score - a.score);

        return NextResponse.json({ results: results.slice(0, 200) });
    } catch (error) {
        console.error("Search API Error:", error);
        return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }
}
