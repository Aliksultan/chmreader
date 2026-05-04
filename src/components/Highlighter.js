'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useReader } from '@/context/ReaderContext';
import { serializeRange, applyHighlight } from '@/utils/domHighlight';

const COLORS = [
  { id: 'yellow', hex: '#fde68a', dark: '#92400e', label: 'Yellow' },
  { id: 'green',  hex: '#a7f3d0', dark: '#065f46', label: 'Green'  },
  { id: 'blue',   hex: '#bfdbfe', dark: '#1e3a8a', label: 'Blue'   },
  { id: 'pink',   hex: '#fbcfe8', dark: '#831843', label: 'Pink'   },
  { id: 'purple', hex: '#ddd6fe', dark: '#4c1d95', label: 'Purple' },
];

export default function Highlighter({ iframeRef, currentPage, bookId }) {
  const { user, addToHighlightsIndex, removeFromHighlightsIndex } = useReader();

  const [highlights, setHighlights]     = useState([]);
  const [toolbarPos, setToolbarPos]     = useState(null);  // { top, left }
  const [selectedRange, setSelectedRange] = useState(null);
  const [activeColor, setActiveColor]   = useState('yellow');
  const [annotation, setAnnotation]     = useState('');
  const [showAnnotationBox, setShowAnnotationBox] = useState(false);
  const [panelOpen, setPanelOpen]       = useState(false);
  const [pendingHighlight, setPendingHighlight] = useState(null);

  const isSyncing = useRef(false);
  const toolbarRef = useRef(null);

  // ── 1. Fetch highlights when page changes ──────────────────────────────────
  useEffect(() => {
    setHighlights([]);
    setToolbarPos(null);
    if (!user || !bookId || !currentPage) return;

    fetch(`/api/sync/highlights?username=${encodeURIComponent(user.id)}&book=${encodeURIComponent(bookId)}`)
      .then(r => r.json())
      .then(data => {
        const pageHighlights = (data.highlights || []).filter(h => h.pageId === currentPage);
        setHighlights(pageHighlights);
      })
      .catch(console.error);
  }, [user, bookId, currentPage]);

  // ── 2. Sync all highlights to KV ──────────────────────────────────────────
  const syncHighlights = useCallback(async (list) => {
    if (!user || !bookId || isSyncing.current) return;
    isSyncing.current = true;
    try {
      const res = await fetch(`/api/sync/highlights?username=${encodeURIComponent(user.id)}&book=${encodeURIComponent(bookId)}`);
      const data = res.ok ? await res.json() : { highlights: [] };
      const others = (data.highlights || []).filter(h => h.pageId !== currentPage);
      await fetch('/api/sync/highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.id, book: bookId, highlights: [...others, ...list] }),
      });
    } catch (e) {
      console.error('Sync failed', e);
    } finally {
      isSyncing.current = false;
    }
  }, [user, bookId, currentPage]);

  // ── 3. Inject <mark> tags into iframe DOM ─────────────────────────────────
  useEffect(() => {
    const doc = iframeRef.current?.contentWindow?.document;
    if (!doc?.body) return;

    // Clear old marks
    doc.querySelectorAll('mark[data-highlight-id]').forEach(m => {
      const p = m.parentNode;
      if (p) { while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); }
    });

    const removeHighlight = (id) => {
      const updated = highlights.filter(h => h.id !== id);
      setHighlights(updated);
      syncHighlights(updated);
    };

    highlights.forEach(h => applyHighlight(h, doc.body, removeHighlight));
  }, [highlights, iframeRef, syncHighlights]);

  // ── 4. Listen to iframe text selection (re-bind on every load) ───────────
  useEffect(() => {
    const iframeEl = iframeRef.current;
    if (!iframeEl) return;

    const bindListeners = () => {
      const win = iframeEl.contentWindow;
      const doc = win?.document;
      if (!win || !doc) return;

      const onMouseUp = () => {
        const sel = win.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          setToolbarPos(null);
          setSelectedRange(null);
          return;
        }
        const range = sel.getRangeAt(0);
        const rRect = range.getBoundingClientRect();
        const iRect = iframeEl.getBoundingClientRect();

        setToolbarPos({
          top:  rRect.top  + iRect.top  - 56,
          left: rRect.left + iRect.left + rRect.width / 2,
        });
        setSelectedRange(range);
        setAnnotation('');
        setShowAnnotationBox(false);
      };

      const onSelectionChange = () => {
        const sel = win.getSelection();
        if (!sel || sel.isCollapsed) setToolbarPos(null);
      };

      // Clean up any old listeners before re-adding
      doc.removeEventListener('mouseup', onMouseUp);
      doc.removeEventListener('selectionchange', onSelectionChange);
      doc.addEventListener('mouseup', onMouseUp);
      doc.addEventListener('selectionchange', onSelectionChange);
    };

    // Bind immediately (if iframe already loaded) and re-bind on every load
    bindListeners();
    iframeEl.addEventListener('load', bindListeners);
    return () => iframeEl.removeEventListener('load', bindListeners);
  }, [iframeRef, currentPage]);

  // ── 5. Commit a highlight ─────────────────────────────────────────────────
  const commitHighlight = useCallback((color, note = '') => {
    if (!selectedRange) return;
    const doc = iframeRef.current.contentWindow.document;
    const h = serializeRange(selectedRange, doc.body, currentPage, color);
    h.note = note;
    const updated = [...highlights, h];
    setHighlights(updated);
    if (user) syncHighlights(updated);
    // Add to global profile quotes index
    addToHighlightsIndex({
      id: h.id, book: bookId, bookTitle: bookId,
      pageId: currentPage, text: h.text,
      color, note, timestamp: h.timestamp,
    });
    iframeRef.current.contentWindow.getSelection().removeAllRanges();
    setToolbarPos(null);
    setShowAnnotationBox(false);
    setAnnotation('');
  }, [selectedRange, user, iframeRef, highlights, currentPage, syncHighlights, addToHighlightsIndex, bookId]);

  const handleColorClick = (colorId) => {
    setActiveColor(colorId);
    if (showAnnotationBox) return; // wait for note submit
    commitHighlight(colorId);
  };

  const handleAnnotationSubmit = (e) => {
    e.preventDefault();
    commitHighlight(activeColor, annotation);
  };

  // ── Highlights Panel ─────────────────────────────────────────────────────
  const removeById = (id) => {
    const updated = highlights.filter(h => h.id !== id);
    setHighlights(updated);
    syncHighlights(updated);
    removeFromHighlightsIndex(id); // remove from global profile
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Floating Color Toolbar */}
      {toolbarPos && (
        <div
          ref={toolbarRef}
          style={{
            position: 'fixed',
            top: `${toolbarPos.top}px`,
            left: `${toolbarPos.left}px`,
            transform: 'translateX(-50%)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            pointerEvents: 'all',
            animation: 'hlFadeIn 0.15s ease',
          }}
        >
          {/* Color row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 10px',
            background: 'rgba(15,23,42,0.95)',
            backdropFilter: 'blur(16px)',
            borderRadius: '999px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)',
          }}>
            {COLORS.map(c => (
              <button
                key={c.id}
                onClick={() => handleColorClick(c.id)}
                title={c.label}
                style={{
                  width: '22px', height: '22px',
                  borderRadius: '50%',
                  background: c.hex,
                  border: `2.5px solid ${activeColor === c.id ? '#fff' : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'transform 0.12s, border-color 0.12s',
                  boxShadow: activeColor === c.id ? `0 0 0 2px ${c.hex}80` : 'none',
                  flexShrink: 0,
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              />
            ))}

            <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />

            {/* Annotation toggle */}
            <button
              onClick={() => setShowAnnotationBox(v => !v)}
              title="Add note"
              style={{
                width: '28px', height: '28px',
                borderRadius: '8px',
                background: showAnnotationBox ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)',
                border: showAnnotationBox ? '1.5px solid #818cf8' : '1.5px solid transparent',
                color: '#fff',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.12s',
              }}
            >
              ✏️
            </button>

            {/* Panel toggle */}
            {user && highlights.length > 0 && (
              <button
                onClick={() => { setPanelOpen(v => !v); setToolbarPos(null); }}
                title={`View ${highlights.length} highlights`}
                style={{
                  width: '28px', height: '28px',
                  borderRadius: '8px',
                  background: panelOpen ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)',
                  border: '1.5px solid transparent',
                  color: '#fff',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.12s',
                  fontWeight: 700,
                }}
              >
                {highlights.length}
              </button>
            )}
          </div>

          {/* Annotation box */}
          {showAnnotationBox && (
            <form
              onSubmit={handleAnnotationSubmit}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '10px',
                background: 'rgba(15,23,42,0.97)',
                backdropFilter: 'blur(16px)',
                borderRadius: '14px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.08)',
                minWidth: '240px',
                animation: 'hlFadeIn 0.15s ease',
              }}
            >
              <textarea
                autoFocus
                value={annotation}
                onChange={e => setAnnotation(e.target.value)}
                placeholder="Add a note (optional)…"
                rows={2}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  color: '#f1f5f9',
                  fontSize: '13px',
                  fontFamily: 'var(--font-inter)',
                  resize: 'none',
                  outline: 'none',
                }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnnotationSubmit(e); } }}
              />
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAnnotationBox(false)}
                  style={{ padding: '5px 12px', borderRadius: '7px', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit"
                  style={{ padding: '5px 14px', borderRadius: '7px', border: 'none', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  Highlight
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Highlights Panel */}
      {panelOpen && highlights.length > 0 && (
        <div
          style={{
            position: 'fixed',
            right: '16px',
            bottom: '80px',
            width: '300px',
            maxHeight: '420px',
            background: 'rgba(15,23,42,0.97)',
            backdropFilter: 'blur(24px)',
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            zIndex: 9998,
            overflow: 'hidden',
            animation: 'hlFadeIn 0.18s ease',
          }}
        >
          <div style={{
            padding: '14px 16px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '14px' }}>
              📌 {highlights.length} Highlight{highlights.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setPanelOpen(false)}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: '360px', padding: '8px' }}>
            {highlights.map(h => {
              const color = COLORS.find(c => c.id === h.color) || COLORS[0];
              return (
                <div
                  key={h.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    marginBottom: '6px',
                    background: `${color.hex}18`,
                    border: `1px solid ${color.hex}40`,
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{
                      width: '10px', height: '10px',
                      borderRadius: '50%',
                      background: color.hex,
                      flexShrink: 0,
                      marginTop: '4px',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: '13px',
                        color: '#e2e8f0',
                        lineHeight: 1.5,
                        margin: 0,
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        "{h.text}"
                      </p>
                      {h.note && (
                        <p style={{
                          fontSize: '11px',
                          color: '#94a3b8',
                          marginTop: '5px',
                          fontStyle: 'italic',
                          borderLeft: `2px solid ${color.hex}`,
                          paddingLeft: '8px',
                        }}>
                          {h.note}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removeById(h.id)}
                      title="Remove highlight"
                      style={{
                        background: 'none', border: 'none',
                        color: '#475569', cursor: 'pointer', fontSize: '14px',
                        flexShrink: 0, padding: '2px',
                        transition: 'color 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = '#475569'}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Page highlights badge — always visible when logged in */}
      {user && highlights.length > 0 && !toolbarPos && (
        <button
          onClick={() => setPanelOpen(v => !v)}
          style={{
            position: 'fixed',
            right: '16px',
            bottom: '80px',
            width: '40px', height: '40px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
            border: 'none',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            zIndex: 9997,
            boxShadow: '0 4px 16px rgba(79,70,229,0.45)',
            display: panelOpen ? 'none' : 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.15s',
          }}
          title="View highlights"
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {highlights.length}
        </button>
      )}

      <style>{`
        @keyframes hlFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(6px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        mark[data-highlight-id] {
          cursor: pointer;
          border-radius: 3px;
          transition: filter 0.15s;
          padding: 1px 2px;
        }
        mark[data-highlight-id]:hover {
          filter: brightness(0.88);
        }
        mark[data-highlight-id].hl-yellow { background: #fde68a; color: #78350f; }
        mark[data-highlight-id].hl-green  { background: #a7f3d0; color: #064e3b; }
        mark[data-highlight-id].hl-blue   { background: #bfdbfe; color: #1e3a8a; }
        mark[data-highlight-id].hl-pink   { background: #fbcfe8; color: #831843; }
        mark[data-highlight-id].hl-purple { background: #ddd6fe; color: #4c1d95; }
      `}</style>
    </>
  );
}
