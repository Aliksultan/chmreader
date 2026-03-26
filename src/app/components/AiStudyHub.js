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

      <style jsx>{`
        .ai-hub-modal {
          background: var(--card-bg);
          width: 90%;
          max-width: 900px;
          height: 85vh;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          overflow: hidden;
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          border: 1px solid var(--card-border);
        }
        .ai-hub-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid var(--card-border);
          background: var(--background);
        }
        .ai-hub-title h2 {
          margin: 0;
          font-size: 1.25rem;
          color: var(--text-primary);
        }
        .ai-hub-subtitle {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin-top: 4px;
          display: block;
        }
        .ai-hub-tabs {
          display: flex;
          border-bottom: 1px solid var(--card-border);
          background: var(--card-bg);
          padding: 0 16px;
          overflow-x: auto;
        }
        .ai-tab {
          padding: 16px 20px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-weight: 500;
          font-size: 0.95rem;
          cursor: pointer;
          white-space: nowrap;
          border-bottom: 3px solid transparent;
          transition: all 0.2s ease;
        }
        .ai-tab:hover {
          color: var(--text-primary);
        }
        .ai-tab.active {
          color: var(--primary);
          border-bottom-color: var(--primary);
        }
        .ai-hub-body {
          flex: 1;
          overflow-y: auto;
          background: var(--background);
          position: relative;
        }

        @media (max-width: 1024px) {
          .ai-hub-modal {
            width: 100%;
            max-width: 100%;
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
            margin-top: 0;
            border: none;
            animation: slideUpMobile 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          }

          @keyframes slideUpMobile {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }

          .ai-hub-header {
            padding: 16px 20px;
          }

          .ai-tab {
            padding: 14px 16px;
            font-size: 0.88rem;
          }
        }
      `}</style>
    </div>
  );
}
