'use client';

import React, { useState } from 'react';
import AiChatTab from './AiChatTab';
import AiSummaryTab from './AiSummaryTab';
import AiLanguageQuiz from './AiLanguageQuiz';
import AiKnowledgeQuiz from './AiKnowledgeQuiz';

export default function AiStudyHub({
  isOpen,
  onClose,
  book,
  chapter,
  pageKey,
  contentHtml,
  targetLang,
  apiKey,
  onRequireApiKey
}) {
  const [activeTab, setActiveTab] = useState('chat'); // chat, summary, langQuiz, knowQuiz

  if (!isOpen) return null;

  const sharedProps = { contentHtml, pageKey, targetLang, apiKey, onRequireApiKey };

  return (
    <div className="search-modal-overlay" style={{ zIndex: 1100 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ai-hub-modal">
        <div className="ai-hub-header">
          <div className="ai-hub-title">
            <h2>🧠 AI Study Hub</h2>
            <span className="ai-hub-subtitle">{chapter || book}</span>
          </div>
          <button className="icon-button" onClick={onClose}>✕</button>
        </div>

        <div className="ai-hub-tabs">
          <button
            className={`ai-tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            💬 Deep Dive
          </button>
          <button
            className={`ai-tab ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            📖 Cheat Sheet
          </button>
          <button
            className={`ai-tab ${activeTab === 'langQuiz' ? 'active' : ''}`}
            onClick={() => setActiveTab('langQuiz')}
          >
            🇹🇷 Language Quiz
          </button>
          <button
            className={`ai-tab ${activeTab === 'knowQuiz' ? 'active' : ''}`}
            onClick={() => setActiveTab('knowQuiz')}
          >
            🧠 Knowledge Quiz
          </button>
        </div>

        <div className="ai-hub-body">
          {activeTab === 'chat' && <AiChatTab {...sharedProps} />}
          {activeTab === 'summary' && <AiSummaryTab {...sharedProps} />}
          {activeTab === 'langQuiz' && <AiLanguageQuiz {...sharedProps} />}
          {activeTab === 'knowQuiz' && <AiKnowledgeQuiz {...sharedProps} />}
        </div>
      </div>

    </div>
  );
}
