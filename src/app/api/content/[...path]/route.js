import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';

export async function GET(request, { params }) {
    try {
        const unwrappedParams = await params;
        const pathSegments = unwrappedParams.path;
        
        // Decode segments to handle spaces and special characters
        const decodedPath = pathSegments.map(decodeURIComponent).join('/');
        let fullPath = path.join(process.cwd(), 'db', decodedPath);

        // Security check to prevent directory traversal
        if (!fullPath.startsWith(path.join(process.cwd(), 'db'))) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        // Special fallback: The DB folders lack styles.css but the HTML files request it.
        // If styles.css is missing, pull it from the old cache where we know it exists.
        if (!fs.existsSync(fullPath)) {
            if (pathSegments[pathSegments.length - 1] === 'styles.css' || pathSegments[pathSegments.length - 1] === 'style.css') {
                fullPath = path.join(process.cwd(), 'public', 'cache', 'book', 'styles.css');
            } else if (path.extname(fullPath) === '.css') {
                fullPath = path.join(process.cwd(), 'public', 'cache', 'book', 'styles.css');
            }
        }

        if (!fs.existsSync(fullPath)) {
            return new NextResponse('File not found', { status: 404 });
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            return new NextResponse('Is a directory', { status: 400 });
        }

        const ext = path.extname(fullPath).toLowerCase();
        
        if (ext === '.html' || ext === '.htm') {
            const buffer = fs.readFileSync(fullPath);

            // Peek at the first 1024 bytes as latin1 (safe for any encoding) to read the meta charset.
            const head = buffer.slice(0, 1024).toString('latin1');
            const charsetMatch = head.match(/charset=["']?([\w-]+)/i);
            const declaredCharset = charsetMatch ? charsetMatch[1].toLowerCase() : 'windows-1254';

            let decodedHtml;
            if (declaredCharset === 'utf-8' || declaredCharset === 'utf8') {
                // New ingested files — read natively as UTF-8, no conversion needed
                decodedHtml = buffer.toString('utf8');
            } else {
                // Legacy CHM files encoded in windows-1254 / iso-8859-*
                decodedHtml = iconv.decode(buffer, 'windows-1254');
                // Rewrite the internal meta charset to match our utf-8 HTTP response
                decodedHtml = decodedHtml.replace(/charset=windows-125[0-9]/ig, 'charset=utf-8');
                decodedHtml = decodedHtml.replace(/charset=iso-8859-[0-9]/ig, 'charset=utf-8');
            }

            return new NextResponse(decodedHtml, {
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'public, max-age=3600, s-maxage=3600'
                }
            });
        }

        let contentType = 'application/octet-stream';
        switch (ext) {
            case '.css': contentType = 'text/css; charset=utf-8'; break;
            case '.js': contentType = 'application/javascript; charset=utf-8'; break;
            case '.json': contentType = 'application/json; charset=utf-8'; break;
            case '.png': contentType = 'image/png'; break;
            case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break;
            case '.gif': contentType = 'image/gif'; break;
            case '.svg': contentType = 'image/svg+xml'; break;
            case '.txt': contentType = 'text/plain; charset=utf-8'; break;
        }

        const fileStream = fs.createReadStream(fullPath);

        return new NextResponse(fileStream, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600, s-maxage=3600'
            }
        });
    } catch (error) {
        console.error("Content API error:", error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
