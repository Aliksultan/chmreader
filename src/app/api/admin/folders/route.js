import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const dbPath = path.join(process.cwd(), 'db');
        if (!fs.existsSync(dbPath)) {
            fs.mkdirSync(dbPath, { recursive: true });
        }

        const folders = fs.readdirSync(dbPath).filter(file => {
            return fs.statSync(path.join(dbPath, file)).isDirectory();
        });

        // Ensure stable sort order
        folders.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        return NextResponse.json({ folders });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { folderName } = await request.json();
        
        if (!folderName || folderName.trim() === '') {
            return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
        }

        const safeName = folderName.replace(/[^a-zA-Z0-9 \-_.]/g, '').trim();
        const fullPath = path.join(process.cwd(), 'db', safeName);

        if (fs.existsSync(fullPath)) {
            return NextResponse.json({ error: 'Folder already exists' }, { status: 400 });
        }

        fs.mkdirSync(fullPath, { recursive: true });

        return NextResponse.json({ success: true, folder: safeName });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
