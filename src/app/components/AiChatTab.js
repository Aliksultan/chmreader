import React, { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function AiChatTab({ contentHtml, pageKey, targetLang, apiKey, onRequireApiKey }) {
  const [initialLoading, setInitialLoading] = useState(true);
  const [tips, setTips] = useState([]);
  const messagesEndRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = { id: Date.now().toString(), role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setTips([]); // Clear old hints instantly
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, apiKey, contextText: contentHtml })
      });

      if (res.status === 401 || res.status === 400) {
        onRequireApiKey();
        setIsLoading(false);
        return;
      }
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Chat failed');
      }

      setMessages(msgs => [...msgs, { id: 'ai' + Date.now().toString(), role: 'assistant', content: '' }]);
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let aiContent = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          aiContent += decoder.decode(value, { stream: true });
          
          let displayContent = aiContent;
          const hintMatch = aiContent.match(/\|\|HINTS\|\|\s*(.*)/);
          
          if (hintMatch) {
             const hintsRaw = hintMatch[1];
             const newTips = hintsRaw.split('|').map(t => t.trim()).filter(Boolean);
             setTips(newTips);
             displayContent = aiContent.replace(/\|\|HINTS\|\|[\s\S]*/, '').trim();
          }

          setMessages(msgs => {
            const updated = [...msgs];
            updated[updated.length - 1].content = displayContent;
            return updated;
          });
        }
      }
    } catch (error) {
       setMessages(msgs => [...msgs, { id: 'err' + Date.now().toString(), role: 'assistant', content: 'Error: ' + error.message }]);
    } finally {
       setIsLoading(false);
    }
  };

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!apiKey) {
      onRequireApiKey();
      return;
    }

    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchInitialExplanation() {
      try {
        setInitialLoading(true);
        // Load history from localStorage
        const storedHistory = localStorage.getItem(`chat_${pageKey}_${targetLang}`);
        if (storedHistory) {
          const parsedHistory = JSON.parse(storedHistory);
          if (parsedHistory.messages && parsedHistory.messages.length > 0 && parsedHistory.messages[0].id !== 'err') {
            setMessages(parsedHistory.messages);
            setTips(parsedHistory.tips || []);
            setInitialLoading(false);
            return;
          } else {
            localStorage.removeItem(`chat_${pageKey}_${targetLang}`);
          }
        }

        // Fetch new explanation from hub
        const res = await fetch('/api/ai/hub', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'explain', text: contentHtml, apiKey, pageKey, targetLang })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;

        const initialMsgs = [{ id: '1', role: 'assistant', content: parsed.explanation || parsed }];
        setMessages(initialMsgs);
        setTips(parsed.hints || []);

        // Save to local storage
        localStorage.setItem(`chat_${pageKey}_${targetLang}`, JSON.stringify({
          messages: initialMsgs,
          tips: parsed.hints || []
        }));

      } catch (err) {
        setMessages([{ id: 'err', role: 'assistant', content: 'Error loading explanation: ' + err.message }]);
      } finally {
        setInitialLoading(false);
      }
    }

    fetchInitialExplanation();
  }, [pageKey, targetLang, apiKey, contentHtml, onRequireApiKey, setMessages]);

  // Persist chat updates to localStorage
  useEffect(() => {
    if (!initialLoading && messages.length > 0) {
      if (messages[0].id === 'err') {
        localStorage.removeItem(`chat_${pageKey}_${targetLang}`);
      } else {
        localStorage.setItem(`chat_${pageKey}_${targetLang}`, JSON.stringify({ messages, tips }));
      }
    }
  }, [messages, tips, pageKey, targetLang, initialLoading]);

  const insertTip = (tipText) => {
    setInput(tipText);
    // You can also auto-trigger submit here if desired, but letting the user see it first is safe.
  };

  const handleInputChange = (e) => setInput(e.target.value);

  if (initialLoading) {
    return (
      <div className="ai-loading-state">
        <div className="loader"></div>
        <p>Analyzing text and drafting deep-dive explanation...</p>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map(m => (
          <div key={m.id} className={`chat-message ${m.role === 'user' ? 'user-msg' : 'ai-msg'}`}>
            <span className="msg-avatar">{m.role === 'user' ? '👤' : '🧠'}</span>
            <div className="msg-content markdown-body">
               <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="chat-message ai-msg">
            <span className="msg-avatar">🧠</span>
            <div className="msg-content typing">thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {tips.length > 0 && (
        <details className="rabbit-holes">
          <summary className="hint-title">🐰 Rabbit holes to explore <span className="expand-hint">(Tap to expand)</span></summary>
          <div className="hint-chips">
            {tips.map((t, i) => (
              <button key={i} className="hint-chip" onClick={() => insertTip(t)}>{t}</button>
            ))}
          </div>
        </details>
      )}

      <form onSubmit={handleSubmit} className="chat-input-area">
        <input
          className="chat-input"
          value={input}
          placeholder="Ask a deep follow-up question..."
          onChange={handleInputChange}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input?.trim()} className="chat-submit">
          Send
        </button>
      </form>

      <style jsx>{`
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          margin-bottom: 20px;
          padding-right: 10px;
        }
        .chat-message {
          display: flex;
          margin-bottom: 20px;
          animation: fadeIn 0.3s;
        }
        .user-msg {
          flex-direction: row-reverse;
        }
        .user-msg .msg-content {
          background: var(--blue-color, #007bff);
          color: white;
          border-bottom-right-radius: 4px;
        }
        .ai-msg .msg-content {
          background: var(--surface-bg);
          border: 1px solid var(--border-light);
          border-bottom-left-radius: 4px;
        }
        .msg-avatar {
          font-size: 1.5rem;
          margin: 0 12px;
        }
        .msg-content {
          padding: 12px 16px;
          border-radius: 12px;
          max-width: 85%;
          line-height: 1.6;
        }
        .typing {
          opacity: 0.6;
          font-style: italic;
        }
        .rabbit-holes {
          margin-bottom: 20px;
          padding: 10px;
          background: rgba(0,0,0,0.03);
          border-radius: 8px;
        }
        details.rabbit-holes summary {
          cursor: pointer;
          outline: none;
          list-style: none; /* Hide default arrow in some browsers */
        }
        details.rabbit-holes summary::-webkit-details-marker {
          display: none;
        }
        .rabbit-holes[open] .hint-chips {
          margin-top: 12px;
        }
        .hint-title {
          font-size: 0.9rem;
          margin: 0;
          color: var(--text-primary);
          font-weight: 600;
        }
        .expand-hint {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: normal;
          margin-left: 6px;
        }
        .hint-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .hint-chip {
          background: var(--surface-bg);
          border: 1px solid var(--border-light);
          padding: 6px 12px;
          border-radius: 16px;
          font-size: 0.85rem;
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.2s;
        }
        .hint-chip:hover {
          border-color: var(--primary);
          color: var(--primary);
        }
        .chat-input-area {
          display: flex;
          gap: 10px;
          margin-top: auto;
        }
        .chat-input {
          flex: 1;
          padding: 12px 16px;
          border-radius: 20px;
          border: 1px solid var(--border-light);
          background: var(--surface-bg);
          color: var(--text-primary);
          font-size: 1rem;
        }
        .chat-submit {
          padding: 10px 20px;
          border-radius: 20px;
          background: var(--primary);
          color: white;
          border: none;
          font-weight: 600;
          cursor: pointer;
        }
        .chat-submit:disabled {
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}
