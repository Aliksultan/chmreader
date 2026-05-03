import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';

export async function POST(request) {
    try {
        const { folderName, fileName, htmlContent } = await request.json();

        if (!folderName || !fileName || !htmlContent) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const safeFolderName = folderName.replace(/[\/\\:*?"<>|\x00-\x1f]/g, '').trim();
        const safeFileName = fileName.replace(/[\/\\:*?"<>|\x00-\x1f]/g, '').trim();

        const fullPath = path.join(process.cwd(), 'db', safeFolderName, safeFileName);
        
        // Write as UTF-8. The content API detects charset from the HTML meta tag and serves accordingly.
        fs.writeFileSync(fullPath, htmlContent, 'utf8');

        return NextResponse.json({ success: true, fileName: safeFileName });

    } catch (error) {
        console.error("File Write API error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
