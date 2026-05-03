import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    const dbPath = path.join(process.cwd(), 'db');
    let books = [];
    
    if (fs.existsSync(dbPath)) {
        const files = fs.readdirSync(dbPath);
        books = files.filter(file => {
            const stat = fs.statSync(path.join(dbPath, file));
            return stat.isDirectory();
        });
        
        // Sort alphabetically but considering leading numbers
        books.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }

    return NextResponse.json({ books });
}
