'use client';

import { useState, useEffect, useRef } from 'react';

export default function AdminPage() {
    const [folders, setFolders] = useState([]);
    const [selectedFolder, setSelectedFolder] = useState('');
    const [newFolderName, setNewFolderName] = useState('');
    
    const [file, setFile] = useState(null);
    const [apiKey, setApiKey] = useState('');
    
    // Status states
    const [status, setStatus] = useState('idle'); // idle | parsing | ai-mapping | processing | complete | error
    const [logs, setLogs] = useState([]);
    const [progress, setProgress] = useState(0);
    const logsEndRef = useRef(null);

    useEffect(() => {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) setApiKey(savedKey);
        fetchFolders();
    }, []);

    useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const addLog = (msg, type = 'info') => {
        setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
    };

    const fetchFolders = async () => {
        try {
            const res = await fetch('/api/admin/folders');
            const data = await res.json();
            if (data.folders) setFolders(data.folders);
        } catch (e) {
            console.error("Failed to fetch folders");
        }
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            const res = await fetch('/api/admin/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderName: newFolderName })
            });
            const data = await res.json();
            if (data.error) return addLog(`Error creating folder: ${data.error}`, 'error');
            await fetchFolders();
            setSelectedFolder(data.folder);
            setNewFolderName('');
            addLog(`Created new folder: ${data.folder}`, 'success');
        } catch (error) {
            addLog(`Failed to create folder: ${error.message}`, 'error');
        }
    };

    // Fast mapping using Gemini
    const analyzeStructureWithGemini = async (pages) => {
        const contentToAnalyze = pages.map(p => 
            `Page ${p.pageNumber}: ${(p.textSnippet || '').replace(/\n/g, ' ')}`
        ).join('\n');

        const prompt = `You are an expert editor and book formatter. 
        I have extracted the first 300 characters of text from every page of a PDF book.
        Your goal is to identify the STARTING page numbers of logical sections or chapters.
        
        Rules for identifying a section start:
        1. Look for explicit headers like "Chapter 1", "Introduction", "Part I".
        2. Look for changes in content topics or distinct title pages.
        3. The first page MUST always be the start of the first section automatically.
        
        Return exactly a JSON object containing an array of sections. Each section must have a 'title' and a 'startPage'.
        Order them chronologically. Example: { "sections": [{ "title": "Intro", "startPage": 1 }] }`;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt + '\n\n' + contentToAnalyze }]}],
                generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
            })
        });

        if (!res.ok) throw new Error("AI Mapping Failed (Invalid Key/Model access)");
        
        const data = await res.json();
        const jsonText = data.candidates[0].content.parts[0].text;
        
        const result = JSON.parse(jsonText);
        let sections = result.sections || [];
        
        if (!sections.find(s => s.startPage === 1)) {
            sections.unshift({ title: "Front Matter", startPage: 1 });
        }
        
        sections.sort((a, b) => a.startPage - b.startPage);
        return sections;
    };

    const calculateEndPages = (rawSections, totalPageCount) => {
        return rawSections.map((section, index) => {
            const nextSection = rawSections[index + 1];
            return {
                title: section.title,
                startPage: section.startPage,
                endPage: nextSection ? nextSection.startPage - 1 : totalPageCount
            };
        });
    };

    const handleStartIngestion = async () => {
        if (!selectedFolder) return alert("Select a target folder.");
        if (!file) return alert("Select a PDF file.");
        if (!apiKey) return alert("Enter your Gemini API Key.");

        localStorage.setItem('gemini_api_key', apiKey);
        setStatus('parsing');
        setProgress(0);
        setLogs([]);
        addLog(`Uploading ${file.name} to server-side PDF extractor (pdfminer)...`);

        try {
            // STEP 1: Server-side extraction via pdfminer.six Python
            const formData = new FormData();
            formData.append('file', file);

            const extractRes = await fetch('/api/admin/extract', {
                method: 'POST',
                body: formData
            });

            const extractData = await extractRes.json();
            if (!extractRes.ok) throw new Error(extractData.error || 'Extraction failed');

            const rawPages = extractData.pages; // [{ pageNumber, text }]
            const numPages = extractData.totalPages;
            addLog(`pdfminer extracted ${numPages} pages successfully!`, 'success');
            setProgress(30);

            // STEP 2: Use Gemini to map boundaries
            setStatus('ai-mapping');
            setProgress(40);
            addLog(`Requesting structural boundaries from Gemini AI...`);
            
            // Build snippets for AI analysis (first 300 chars of each page)
            const pageSnippets = rawPages.map(p => ({
                pageNumber: p.pageNumber,
                textSnippet: p.text.substring(0, 300)
            }));
            const boundaries = await analyzeStructureWithGemini(pageSnippets);
            const mappedSections = calculateEndPages(boundaries, numPages);
            
            addLog(`Gemini successfully mapped ${mappedSections.length} logical chapters!`, 'success');

            // STEP 3: Construct HTMs and transmit exactly to Server 
            setStatus('processing');
            for (let i = 0; i < mappedSections.length; i++) {
                const section = mappedSections[i];
                const sectionPercent = 50 + Math.round((i / mappedSections.length) * 50);
                setProgress(sectionPercent);
                addLog(`Assembling Chapter ${i + 1}: ${section.title}...`);

                // Gather all full text blocks within boundary range
                const startIdx = section.startPage - 1;
                const endIdx = Math.min(section.endPage, numPages) - 1;
                
                let chapterRawText = [];
                for(let p = startIdx; p <= endIdx; p++) {
                    if (rawPages[p]) chapterRawText.push(rawPages[p].text);
                }

                // Format native HTML structure rapidly locally
                const formattedBody = chapterRawText.join('\n\n')
                     .split(/\n\n+/)
                     .filter(p => p.trim().length > 0)
                     .map(p => `<p>${p.trim()}</p>`)
                     .join('\n');

                const htmlTemplate = `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
<title>${section.title}</title>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta http-equiv="X-UA-Compatible" content="IE=8" />
<style type="text/css" media="screen">
html { height: 100%; }
body { margin: 8px; font-family: sans-serif; line-height: 1.6; font-size: 18px; }
h3 { color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 8px; }
p { margin-bottom: 12px; }
</style>
<link type="text/css" href="styles.css" rel="stylesheet" />
</head>
<body>
<h3>${section.title}</h3>
${formattedBody}
</body>
</html>`;

                // Strip only actual filesystem-unsafe chars (/:*?"<>|\\), keep Turkish/Unicode
                const safeTitle = section.title.replace(/[\/\\:*?"<>|\x00-\x1f]/g, '').trim().substring(0, 60);
                const prefix = String(i + 1).padStart(2, '0');
                const fileName = `${prefix} ${safeTitle}.htm`;

                // Transmit to safe disk writer purely bypassing limits
                const postRes = await fetch('/api/admin/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        folderName: selectedFolder,
                        fileName: fileName,
                        htmlContent: htmlTemplate
                    })
                });

                if (!postRes.ok) throw new Error(`FileSystem API Failed saving ${fileName}`);
                addLog(`Successfully wrote HTM file: ${fileName}`, 'success');
            }

            setProgress(100);
            setStatus('complete');
            addLog(`✨ Database synchronization completely successfully!`, 'success');
            
        } catch (error) {
            addLog(`Process Architecture Failure: ${error.message}`, 'error');
            setStatus('error');
        }
    };

    return (
        <div className="admin-page">
            <style dangerouslySetInnerHTML={{__html: `
                .card {
                    background: var(--admin-card);
                    border: 1px solid var(--admin-border);
                    border-radius: 12px;
                    padding: 1.5rem;
                    margin-bottom: 1.5rem;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
                }
                .card-title {
                    font-size: 1.1rem;
                    font-weight: 500;
                    margin-top: 0;
                    margin-bottom: 1rem;
                    color: #fff;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .form-group {
                    margin-bottom: 1rem;
                }
                label {
                    display: block;
                    font-size: 0.85rem;
                    color: var(--admin-text-muted);
                    margin-bottom: 0.4rem;
                }
                input[type="text"], input[type="password"], select {
                    width: 100%;
                    padding: 0.6rem 0.8rem;
                    background: rgba(0,0,0,0.2);
                    border: 1px solid var(--admin-border);
                    border-radius: 6px;
                    color: white;
                    font-size: 0.95rem;
                    outline: none;
                    transition: border-color 0.2s;
                    box-sizing: border-box;
                }
                input:focus, select:focus {
                    border-color: var(--admin-accent);
                }
                .flex-row {
                    display: flex;
                    gap: 1rem;
                    align-items: flex-end;
                }
                .btn {
                    padding: 0.6rem 1.2rem;
                    background: var(--admin-accent);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    white-space: nowrap;
                }
                .btn:hover:not(:disabled) {
                    background: var(--admin-accent-hover);
                }
                .btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .btn-secondary {
                    background: transparent;
                    border: 1px solid var(--admin-border);
                }
                .btn-secondary:hover:not(:disabled) {
                    background: rgba(255,255,255,0.05);
                }
                
                .upload-zone {
                    border: 2px dashed var(--admin-border);
                    border-radius: 8px;
                    padding: 2rem;
                    text-align: center;
                    cursor: pointer;
                    transition: border-color 0.2s;
                    margin-bottom: 1rem;
                }
                .upload-zone:hover {
                    border-color: var(--admin-accent);
                }
                .upload-zone input[type="file"] {
                    display: none;
                }
                .upload-icon {
                    font-size: 2rem;
                    margin-bottom: 0.5rem;
                    color: var(--admin-text-muted);
                }

                .terminal {
                    background: #000;
                    border-radius: 8px;
                    padding: 1rem;
                    font-family: "Fira Code", monospace, Consolas;
                    font-size: 0.85rem;
                    height: 300px;
                    overflow-y: auto;
                    border: 1px solid var(--admin-border);
                }
                .log-line {
                    margin-bottom: 0.3rem;
                    display: flex;
                    gap: 0.5rem;
                }
                .log-time {
                    color: #6b7280;
                }
                .log-msg.info { color: #d1d5db; }
                .log-msg.success { color: #34d399; }
                .log-msg.error { color: #f87171; }

                .progress-container {
                    height: 6px;
                    background: var(--admin-border);
                    border-radius: 3px;
                    overflow: hidden;
                    margin-top: 1rem;
                }
                .progress-bar {
                    height: 100%;
                    background: var(--admin-accent);
                    transition: width 0.3s ease;
                }
            `}} />

            <div className="card">
                <h2 className="card-title">1. Target Database Location</h2>
                <div className="flex-row" style={{marginBottom: '1rem'}}>
                    <div style={{flex: 1}}>
                        <label>Select Existing Folder</label>
                        <select value={selectedFolder} onChange={e => setSelectedFolder(e.target.value)}>
                            <option value="">-- Choose Folder --</option>
                            {folders.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>
                    <div style={{color: 'var(--admin-text-muted)'}}>OR</div>
                    <div style={{flex: 1}}>
                        <label>Create New Folder</label>
                        <div className="flex-row" style={{gap: '0.5rem'}}>
                            <input 
                                type="text" 
                                placeholder="e.g. 15 NEW BOOK TITLE" 
                                value={newFolderName}
                                onChange={e => setNewFolderName(e.target.value)}
                            />
                            <button className="btn btn-secondary" onClick={handleCreateFolder}>Create</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card">
                <h2 className="card-title">2. AI Ingestion Configuration</h2>
                
                <div className="form-group" style={{maxWidth: '400px'}}>
                    <label>Gemini API Key (Required for Processing)</label>
                    <input 
                        type="password" 
                        value={apiKey} 
                        onChange={e => setApiKey(e.target.value)} 
                        placeholder="AIzaSy..."
                    />
                </div>

                <label>Select PDF Book</label>
                <div className="upload-zone" onClick={() => document.getElementById('pdf-upload').click()}>
                    <div className="upload-icon">📄</div>
                    {file ? (
                        <div style={{color: 'var(--admin-accent)', fontWeight: 500}}>{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</div>
                    ) : (
                        <div style={{color: 'var(--admin-text-muted)'}}>Click to browse or drag PDF here</div>
                    )}
                    <input 
                        id="pdf-upload" 
                        type="file" 
                        accept=".pdf" 
                        onChange={e => e.target.files[0] && setFile(e.target.files[0])}
                    />
                </div>

                <button 
                    className="btn" 
                    style={{width: '100%', padding: '1rem', fontSize: '1.05rem'}}
                    onClick={handleStartIngestion}
                    disabled={status === 'parsing' || status === 'processing'}
                >
                    {status === 'idle' ? 'Start AI Formatting Engine' : 
                     status === 'parsing' ? 'Extracting PDF Data...' : 
                     status === 'processing' ? `Formatting in Progress (${progress}%)` : 
                     status === 'complete' ? 'Ingestion Complete' : 'Retry Failed Ingestion'}
                </button>

                {(status !== 'idle') && (
                    <div className="progress-container">
                        <div className="progress-bar" style={{width: `${progress}%`}}></div>
                    </div>
                )}
            </div>

            <div className="card" style={{display: logs.length > 0 ? 'block' : 'none'}}>
                <h2 className="card-title">3. Live Execution Logs</h2>
                <div className="terminal">
                    {logs.map((log, idx) => (
                        <div key={idx} className="log-line">
                            <span className="log-time">[{log.time}]</span>
                            <span className={`log-msg ${log.type}`}>{log.msg}</span>
                        </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
            </div>

        </div>
    );
}
