import React, { useEffect, useState, useRef } from 'react';

export default function AiLanguageQuiz({ contentHtml, pageKey, targetLang, apiKey, onRequireApiKey }) {
    const [quizData, setQuizData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [mcAnswers, setMcAnswers] = useState({}); // { qIndex: optIndex }
    const [openInputs, setOpenInputs] = useState({}); // { qIndex: string }
    const [openResults, setOpenResults] = useState(null); // API grade results
    const [grading, setGrading] = useState(false);
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (!apiKey) {
            onRequireApiKey();
            return;
        }

        if (fetchedRef.current) return;
        fetchedRef.current = true;

        async function fetchQuiz() {
            try {
                setLoading(true);
                const res = await fetch('/api/ai/hub', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'langQuiz', text: contentHtml, apiKey, pageKey, targetLang })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error);

                const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
                setQuizData(parsed);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchQuiz();
    }, [contentHtml, pageKey, targetLang, apiKey, onRequireApiKey]);

    const handleMcSelect = (qIndex, optIndex) => {
        if (mcAnswers[qIndex] !== undefined) return;
        setMcAnswers(prev => ({ ...prev, [qIndex]: optIndex }));
    };

    const handleGradeTranslations = async () => {
        if (!quizData || !quizData.openEnded || Object.keys(openInputs).length === 0) return;

        // Build payload
        const translationsPayload = quizData.openEnded.map((q, idx) => ({
            phrase: q.phrase,
            intendedMeaning: q.intendedMeaning,
            userTranslation: openInputs[idx] || ''
        }));

        try {
            setGrading(true);
            const res = await fetch('/api/ai/grade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ translations: translationsPayload, apiKey, targetLang })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setOpenResults(data.results);
        } catch (err) {
            alert("Error grading: " + err.message);
        } finally {
            setGrading(false);
        }
    };

    if (loading) return (
        <div className="ai-loading-state">
            <div className="loader"></div>
            <p>Extracting terminology and drafting Language Quiz...</p>
        </div>
    );

    if (error) return <div className="api-error">Error: {error}</div>;
    if (!quizData) return <div>No quiz data available.</div>;

    return (
        <div className="quiz-container">
            <h3>Part 1: Vocabulary & Terminology</h3>
            <p className="quiz-subtitle">Select the correct contextual meaning of these terms from the text.</p>

            {quizData.multipleChoice?.map((q, qIdx) => {
                const selectedOpt = mcAnswers[qIdx];
                const isAnswered = selectedOpt !== undefined;

                return (
                    <div key={`mc-${qIdx}`} className="quiz-card">
                        <h4>{qIdx + 1}. What does <strong>"{q.term}"</strong> mean?</h4>
                        <div className="quiz-context">Context: <em>"{q.context}"</em></div>
                        <div className="quiz-options">
                            {q.options.map((opt, optIdx) => {
                                let btnClass = 'quiz-option';
                                if (isAnswered) {
                                    if (optIdx === q.correctIndex) btnClass += ' correct';
                                    else if (optIdx === selectedOpt) btnClass += ' incorrect';
                                    else btnClass += ' disabled';
                                }
                                return (
                                    <button
                                        key={optIdx}
                                        className={btnClass}
                                        onClick={() => handleMcSelect(qIdx, optIdx)}
                                        disabled={isAnswered}
                                    >
                                        {String.fromCharCode(65 + optIdx)}) {opt}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            <h3 style={{ marginTop: '40px' }}>Part 2: Idiomatic Translation</h3>
            <p className="quiz-subtitle">Translate these deep phrases to {targetLang}. The AI will review your essence.</p>

            {quizData.openEnded?.map((q, qIdx) => {
                const result = openResults?.[qIdx];
                return (
                    <div key={`oe-${qIdx}`} className="quiz-card">
                        <h4>{qIdx + 1}. Phrase: <strong>{q.phrase}</strong></h4>
                        <input
                            type="text"
                            className="translation-input"
                            placeholder={`Translate to ${targetLang}...`}
                            value={openInputs[qIdx] || ''}
                            onChange={e => setOpenInputs(prev => ({ ...prev, [qIdx]: e.target.value }))}
                            disabled={grading || openResults !== null}
                        />

                        {result && (
                            <div className={`grading-feedback ${result.isCorrect ? 'correct' : 'incorrect'}`}>
                                <strong>{result.isCorrect ? '✨ Correct Essence!' : '❌ Missed the Mark'}</strong>
                                <p>{result.feedback}</p>
                                <p className="intended">Intended: {q.intendedMeaning}</p>
                            </div>
                        )}
                    </div>
                );
            })}

            {!openResults && quizData.openEnded && quizData.openEnded.length > 0 && (
                <button
                    className="grade-btn"
                    onClick={handleGradeTranslations}
                    disabled={grading}
                >
                    {grading ? 'Evaluating...' : 'Submit Translations to AI Scholar'}
                </button>
            )}

            <style jsx>{`
        .quiz-container { padding-bottom: 40px; }
        h3 { margin-bottom: 8px; color: var(--text-primary); }
        .quiz-subtitle { color: var(--text-muted); margin-bottom: 24px; font-size: 0.9rem; }
        
        .quiz-card {
          background: var(--surface-bg);
          border: 1px solid var(--border-light);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
        }
        .quiz-card h4 { margin: 0 0 8px 0; color: var(--text-primary); font-weight: 500; }
        .quiz-context { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; border-left: 2px solid var(--border-light); padding-left: 10px; }
        
        .quiz-options { display: flex; flex-direction: column; gap: 8px; }
        .quiz-option {
          text-align: left; padding: 10px 16px; border-radius: 8px; border: 1px solid var(--border-light);
          background: var(--bg-color); color: var(--text-primary); cursor: pointer; transition: all 0.2s;
        }
        .quiz-option:hover:not(:disabled) { border-color: var(--primary); }
        .quiz-option.correct { background: rgba(40, 167, 69, 0.1); border-color: #28a745; color: #1e7e34; }
        .quiz-option.incorrect { background: rgba(220, 53, 69, 0.1); border-color: #dc3545; color: #b02a37; }
        .quiz-option.disabled:not(.correct):not(.incorrect) { opacity: 0.5; }

        .translation-input {
          width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-light);
          background: var(--bg-color); color: var(--text-primary); font-size: 1rem; margin-top: 10px;
        }
        
        .grade-btn {
          width: 100%; padding: 14px; background: var(--primary); color: white; border: none;
          border-radius: 12px; font-weight: 600; font-size: 1rem; cursor: pointer; margin-top: 20px;
        }
        .grade-btn:disabled { opacity: 0.7; }
        
        .grading-feedback {
          margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 0.9rem;
        }
        .grading-feedback.correct { background: rgba(40, 167, 69, 0.1); border-left: 4px solid #28a745; }
        .grading-feedback.incorrect { background: rgba(220, 53, 69, 0.1); border-left: 4px solid #dc3545; }
        .grading-feedback p { margin: 6px 0 0 0; }
        .intended { opacity: 0.7; font-size: 0.8rem; margin-top: 8px !important; }
      `}</style>
        </div>
    );
}
