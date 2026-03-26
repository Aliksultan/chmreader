import React, { useEffect, useState, useRef } from 'react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function AiSummaryTab({ contentHtml, pageKey, targetLang, apiKey, onRequireApiKey }) {
    const [summary, setSummary] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (!apiKey) {
            onRequireApiKey();
            return;
        }

        if (fetchedRef.current) return;
        fetchedRef.current = true;

        async function fetchSummary() {
            try {
                setLoading(true);
                const res = await fetch('/api/ai/hub', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'summarize',
                        text: contentHtml,
                        apiKey,
                        pageKey,
                        targetLang
                    })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to generate summary');

                const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
                setSummary(parsed.summary || parsed);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchSummary();
    }, [contentHtml, pageKey, targetLang, apiKey, onRequireApiKey]);

    if (loading) {
        return (
            <div className="ai-loading-state">
                <div className="loader"></div>
                <p>Drafting Sohbet Cheat Sheet...</p>
            </div>
        );
    }

    if (error) {
        return <div className="api-error">Error: {error}</div>;
    }

    return (
        <div className="ai-summary-container">
            <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
            </div>
            <style jsx>{`
        .ai-summary-container {
          line-height: 1.7;
          font-size: 1.05rem;
        }
        .markdown-body ul {
          margin: 10px 0 20px 20px;
          padding: 0;
        }
        .markdown-body li {
          margin-bottom: 8px;
        }
      `}</style>
        </div>
    );
}
