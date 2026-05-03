import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const maxDuration = 120; // Allow up to 2 minutes for large PDFs

export async function POST(request) {
    let tmpPath = null;
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // Save uploaded PDF to a temp file so Python can read it
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        tmpPath = path.join(os.tmpdir(), `pdf_upload_${Date.now()}.pdf`);
        fs.writeFileSync(tmpPath, buffer);

        // Run the pdfminer extraction script
        const scriptPath = path.join(process.cwd(), 'scripts', 'extract_pdf.py');
        const result = await runPython(scriptPath, [tmpPath]);

        const parsed = JSON.parse(result);
        if (parsed.error) {
            return NextResponse.json({ error: parsed.error }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            totalPages: parsed.pages.length,
            pages: parsed.pages
        });

    } catch (error) {
        console.error('Extract API error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    } finally {
        // Clean up temp file
        if (tmpPath && fs.existsSync(tmpPath)) {
            fs.unlinkSync(tmpPath);
        }
    }
}

function runPython(scriptPath, args) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const errChunks = [];

        const proc = spawn('python', [scriptPath, ...args], {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
        });

        proc.stdout.on('data', (chunk) => chunks.push(chunk));
        proc.stderr.on('data', (chunk) => errChunks.push(chunk));

        proc.on('close', (code) => {
            const stdout = Buffer.concat(chunks).toString('utf8').trim();
            const stderr = Buffer.concat(errChunks).toString('utf8').trim();

            if (code !== 0) {
                // Our Python script prints JSON errors to stdout
                try {
                    const parsed = JSON.parse(stdout);
                    if (parsed.error) {
                        reject(new Error(`pdfminer error: ${parsed.error}`));
                        return;
                    }
                } catch (_) {}
                // Fall back to stderr or raw stdout
                reject(new Error(`Python exited ${code}: ${stderr || stdout || 'no output'}`));
            } else {
                resolve(stdout);
            }
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to spawn python: ${err.message}`));
        });
    });
}
