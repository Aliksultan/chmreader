import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';

function cleanName(filename) {
    let name = filename;
    name = name.replace(/\.html?$/i, '');
    name = name.replace(/^[\d\s\-_]+/, '');
    return name;
}

function getTocMap(bookDirPath) {
    let map = {};
    if (!fs.existsSync(bookDirPath)) return map;

    const flatten = (dirPath, currentPath = [], relativePath = '') => {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            const stat = fs.statSync(fullPath);
            const nextRelativePath = relativePath ? `${relativePath}/${file}` : file;
            const cleaned = cleanName(file);
            const newPath = [...currentPath, cleaned];

            if (stat.isDirectory()) {
                flatten(fullPath, newPath, nextRelativePath);
            } else if (file.toLowerCase().endsWith('.htm') || file.toLowerCase().endsWith('.html')) {
                map[nextRelativePath] = newPath;
            }
        }
    };
    flatten(bookDirPath);
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
            // Note: backslashes replaced with forward slashes for cross-platform compatibility mapping
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
                const buffer = fs.readFileSync(fullPath);
                const content = iconv.decode(buffer, 'windows-1254');
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
                const link = `/reader/${encodeURIComponent(bookName)}?page=${encodeURIComponent(relativePath)}`;
                const directUrl = bookName === 'kutuphane' ? `/api/content/${relativePath}` : `/api/content/${bookName}/${relativePath}`;

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

        const bookName = targetBook || '';
        if (!bookName) return NextResponse.json({ results: [] });
        
        let bookDirPath = path.join(process.cwd(), 'db', bookName);
        if (bookName === 'kutuphane') {
            bookDirPath = path.join(process.cwd(), 'db');
        }
        
        const results = [];

        if (fs.existsSync(bookDirPath)) {
            const tocMap = getTocMap(bookDirPath);
            searchDirectory(bookDirPath, query, results, bookName, bookDirPath, tocMap);
        }

        results.sort((a, b) => b.score - a.score);

        return NextResponse.json({ results: results.slice(0, 200) });
    } catch (error) {
        console.error("Search API Error:", error);
        return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }
}
