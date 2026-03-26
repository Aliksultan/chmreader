import React, { useEffect, useState, useRef } from 'react';

export default function AiKnowledgeQuiz({ contentHtml, pageKey, targetLang, apiKey, onRequireApiKey }) {
    const [quizData, setQuizData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [answers, setAnswers] = useState({}); // { qIndex: selectedOptionIndex }
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
                    body: JSON.stringify({ action: 'knowQuiz', text: contentHtml, apiKey, pageKey, targetLang })
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

    const handleSelect = (qIndex, optIndex) => {
        if (answers[qIndex] !== undefined) return; // already answered
        setAnswers(prev => ({ ...prev, [qIndex]: optIndex }));
    };

    if (loading) {
        return (
            <div className="ai-loading-state">
                <div className="loader"></div>
                <p>Generating Comprehension Quiz...</p>
            </div>
        );
    }

    if (error) return <div className="api-error">Error: {error}</div>;
    if (!quizData || !quizData.questions) return <div>No quiz data available.</div>;

    const score = Object.keys(answers).filter(qIdx => answers[qIdx] === quizData.questions[qIdx].correctIndex).length;
    const isComplete = Object.keys(answers).length === quizData.questions.length;

    return (
        <div className="quiz-container">
            {isComplete && (
                <div className="quiz-score">
                    <h3>Score: {score} / {quizData.questions.length}</h3>
                    <p>{score === quizData.questions.length ? 'Perfectly understood! 🌟' : 'Keep studying the texts! 📚'}</p>
                </div>
            )}

            {quizData.questions.map((q, qIdx) => {
                const selectedOpt = answers[qIdx];
                const isAnswered = selectedOpt !== undefined;

                return (
                    <div key={qIdx} className="quiz-card">
                        <h4>{qIdx + 1}. {q.question}</h4>
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
                                        onClick={() => handleSelect(qIdx, optIdx)}
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

            <style jsx>{`
        .quiz-container {
          padding-bottom: 30px;
        }
        .quiz-score {
          background: rgba(var(--primary-rgb), 0.1);
          color: var(--primary);
          padding: 20px;
          border-radius: 12px;
          text-align: center;
          margin-bottom: 24px;
        }
        .quiz-score h3 { margin: 0 0 8px 0; font-size: 1.5rem; }
        .quiz-score p { margin: 0; }
        
        .quiz-card {
          background: var(--surface-bg);
          border: 1px solid var(--border-light);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
        }
        .quiz-card h4 {
          margin: 0 0 16px 0;
          color: var(--text-primary);
          line-height: 1.5;
        }
        .quiz-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .quiz-option {
          text-align: left;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid var(--border-light);
          background: var(--bg-color);
          color: var(--text-primary);
          cursor: pointer;
          font-size: 0.95rem;
          transition: all 0.2s;
        }
        .quiz-option:hover:not(:disabled) {
          border-color: var(--primary);
          background: rgba(var(--primary-rgb), 0.05);
        }
        .quiz-option.correct {
          background: rgba(40, 167, 69, 0.15);
          border-color: #28a745;
          color: #1e7e34;
          font-weight: 500;
        }
        .quiz-option.incorrect {
          background: rgba(220, 53, 69, 0.15);
          border-color: #dc3545;
          color: #b02a37;
        }
        .quiz-option.disabled:not(.correct):not(.incorrect) {
          opacity: 0.5;
        }
      `}</style>
        </div>
    );
}
