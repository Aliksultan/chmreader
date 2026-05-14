'use client';
import { useEffect, useState, useRef, useMemo, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { parseSrt, formatTime } from '@/utils/parseSrt';
import { useReader } from '@/context/ReaderContext';
import AiStudyHub from '@/app/components/AiStudyHub';

const LANG_LABELS = { tr: '🇹🇷 TR', ru: '🇷🇺 RU', kk: '🇰🇿 KZ' };

export default function VideoPlayerPage({ params, searchParams }) {
  const { playlist, video } = use(params);
  const sp = use(searchParams);
  const seekOnLoad = sp.t ? parseFloat(sp.t) : null;

  const { user, addToHighlightsIndex } = useReader();

  // ── Meta ────────────────────────────────────────────────────────────────
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    fetch(`/api/videos/${playlist}/${video}`)
      .then(r => r.json()).then(setMeta).catch(console.error);
  }, [playlist, video]);

  // ── YouTube Player ───────────────────────────────────────────────────────
  const playerRef = useRef(null);
  const videoContainerRef = useRef(null); // container for fullscreen
  const [playerReady, setPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!meta?.youtubeId) return;
    const createPlayer = () => {
      if (playerRef.current) { try { playerRef.current.destroy(); } catch {} }
      playerRef.current = new window.YT.Player('yt-player', {
        videoId: meta.youtubeId,
        playerVars: { rel: 0, modestbranding: 1, cc_load_policy: 0, fs: 0 }, // fs:0 = disable YT fullscreen (we use custom)
        events: {
          onReady: (e) => {
            setPlayerReady(true);
            if (seekOnLoad) e.target.seekTo(seekOnLoad, true);
          },
          onStateChange: (e) => {
            setIsPlaying(e.data === window.YT.PlayerState.PLAYING);
          },
        },
      });
    };

    // Track fullscreen changes
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);

    if (window.YT?.Player) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
    }
    return () => {
      try { playerRef.current?.destroy(); } catch {}
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, [meta?.youtubeId]);

  // Poll currentTime every 200ms
  useEffect(() => {
    if (!playerReady) return;
    const id = setInterval(() => {
      try { setCurrentTime(playerRef.current?.getCurrentTime?.() || 0); } catch {}
    }, 200);
    return () => clearInterval(id);
  }, [playerReady]);

  const seekTo = useCallback((t) => {
    try { playerRef.current?.seekTo?.(t, true); } catch {}
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = videoContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  // ── Subtitles ────────────────────────────────────────────────────────────
  const [trCues, setTrCues] = useState([]);
  const [translatedCues, setTranslatedCues] = useState([]);
  const [activeLang, setActiveLang] = useState('tr');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [dualMode, setDualMode] = useState(false);
  const [captionScale, setCaptionScale] = useState(1);

  // ── Playlist episodes (for prev/next nav) ───────────────────────────────────
  const [episodes, setEpisodes] = useState([]);
  useEffect(() => {
    fetch(`/api/videos/${playlist}`)
      .then(r => r.json())
      .then(d => setEpisodes((d.videos || []).map(v => v.slug)))
      .catch(() => {});
  }, [playlist]);
  const currentEpIdx = episodes.indexOf(video);
  const prevEp = currentEpIdx > 0 ? episodes[currentEpIdx - 1] : null;
  const nextEp = currentEpIdx !== -1 && currentEpIdx < episodes.length - 1 ? episodes[currentEpIdx + 1] : null;

  // ── Notes ───────────────────────────────────────────────────────────────────
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteSaveStatus, setNoteSaveStatus] = useState(''); // '' | 'saving' | 'saved'
  const noteSaveTimer = useRef(null);
  const notesEditorRef = useRef(null);

  // Load note from KV on mount (if user logged in)
  useEffect(() => {
    if (!user?.username) return;
    fetch(`/api/videos/notes?username=${user.username}&playlist=${playlist}&video=${video}`)
      .then(r => r.json())
      .then(d => {
        if (d.note && notesEditorRef.current) {
          notesEditorRef.current.innerHTML = d.note;
          setNoteContent(d.note);
        }
      })
      .catch(() => {});
  }, [user?.username, playlist, video]);

  const saveNote = useCallback(() => {
    if (!user?.username || !notesEditorRef.current) return;
    const content = notesEditorRef.current.innerHTML;
    setNoteSaveStatus('saving');
    fetch('/api/videos/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user.username, playlist, video, content }),
    }).then(() => {
      setNoteSaveStatus('saved');
      setTimeout(() => setNoteSaveStatus(''), 2000);
    }).catch(() => setNoteSaveStatus(''));
  }, [user?.username, playlist, video]);

  const handleNoteInput = useCallback(() => {
    clearTimeout(noteSaveTimer.current);
    setNoteSaveStatus('');
    noteSaveTimer.current = setTimeout(saveNote, 2000);
  }, [saveNote]);

  const execNoteFormat = (cmd, val) => {
    document.execCommand(cmd, false, val);
    notesEditorRef.current?.focus();
    handleNoteInput();
  };

  // ── AI panel state ──────────────────────────────────────────────────────────
  const [showAiPanel, setShowAiPanel] = useState(false);

  // ── Load Turkish SRT ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/videos/${playlist}/${video}?lang=tr`)
      .then(r => {
        if (!r.ok) throw new Error(`SRT fetch failed: ${r.status}`);
        return r.text();
      })
      .then(text => {
        const parsed = parseSrt(text);
        setTrCues(parsed);
      })
      .catch(e => console.error('SRT load error:', e));
  }, [playlist, video]);

  // Load Gemini key from localStorage
  useEffect(() => {
    const k = localStorage.getItem('gemini_api_key');
    if (k) setGeminiKey(k);
  }, []);

  const handleLangChange = async (lang) => {
    if (lang === 'tr') { setActiveLang('tr'); setTranslatedCues([]); setDualMode(false); return; }
    setActiveLang(lang);
    const res = await fetch(`/api/videos/${playlist}/${video}?lang=${lang}`);
    const data = await res.json();
    if (data.cues) { 
      setTranslatedCues(data.cues); 
      // even if we loaded from cache, start the engine to finish any untranslated parts
      if (geminiKey) {
        runTranslation(lang, geminiKey, false, data.cues);
      }
      return; 
    }
    if (!geminiKey) { setShowKeyPrompt(true); return; }
    await runTranslation(lang, geminiKey);
  };

  const [translateProgress, setTranslateProgress] = useState(0);
  const translationLoopRef = useRef(null);

  const runTranslation = async (lang, key, forceFresh = false, initialCues = null) => {
    if (!trCues.length) { setTranslateError('No subtitles loaded yet.'); return; }

    // Cancel any previous run
    if (translationLoopRef.current) translationLoopRef.current.cancel = true;
    const loop = { cancel: false };
    translationLoopRef.current = loop;

    setIsTranslating(true);
    setTranslateError('');
    setTranslateProgress(0);

    if (forceFresh) {
      try {
        await fetch('/api/videos/translate-srt', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlist, video, targetLang: lang }),
        });
      } catch {}
    }

    // Working copy — start from cache or fresh
    const working = forceFresh ? [...trCues] : (initialCues ? [...initialCues] : [...trCues]);
    if (forceFresh) setTranslatedCues([...working]);

    // ── Build block queue ────────────────────────────────────────────────────
    const CHUNK = 25; // Small chunks = reliable JSON output, fast retries
    const CONCURRENCY = 6; // In-flight requests at once

    const blocks = [];
    for (let i = 0; i < trCues.length; i += CHUNK) {
      const items = trCues.slice(i, i + CHUNK);
      // Check if block already fully translated from cache
      const alreadyDone = items.every((cue, offset) => {
        const w = working[i + offset];
        return w.isTranslated === true || (w.isTranslated === undefined && w.text !== cue.text);
      });
      blocks.push({ startIdx: i, items, done: alreadyDone, failures: 0 });
    }

    // Atomic pointer — workers just grab the next undone block by index
    let nextBlockIdx = 0;
    const getNextBlock = () => {
      while (nextBlockIdx < blocks.length && blocks[nextBlockIdx].done) nextBlockIdx++;
      if (nextBlockIdx >= blocks.length) return null;
      const b = blocks[nextBlockIdx];
      b.done = true; // claim it
      nextBlockIdx++;
      return b;
    };

    let completed = blocks.filter(b => b.done).length;
    const total = blocks.length;
    setTranslateProgress(Math.round((completed / total) * 100));

    // ── Save helper ──────────────────────────────────────────────────────────
    let saveTimer = null;
    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        fetch('/api/videos/translate-srt', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlist, video, targetLang: lang, cues: working }),
        }).catch(() => {});
      }, 2000); // Debounce saves — max once per 2 seconds
    };

    // ── Worker function ──────────────────────────────────────────────────────
    const worker = async () => {
      while (!loop.cancel) {
        const block = getNextBlock();
        if (!block) break;

        try {
          const contextBefore = trCues.slice(Math.max(0, block.startIdx - 3), block.startIdx);
          const contextAfter  = trCues.slice(block.startIdx + CHUNK, block.startIdx + CHUNK + 3);

          const res = await fetch('/api/videos/translate-srt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetLang: lang, apiKey: key, cues: block.items, contextBefore, contextAfter }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${res.status}`);
          }

          const data = await res.json();
          const resultCues = data.cues || [];

          // Merge by position (index within the block) — simple and never fails
          resultCues.forEach((rc, i) => { working[block.startIdx + i] = rc; });

          completed++;
          setTranslateProgress(Math.round((completed / total) * 100));
          setTranslatedCues([...working]);
          scheduleSave();

          // If block was only partially translated, put it back in the retry queue
          const anyMissed = resultCues.some(rc => !rc.isTranslated);
          if (anyMissed && block.failures < 3) {
            block.done = false;
            block.failures++;
            completed--; // Don't count it as done yet
            // Re-insert at current nextBlockIdx position so it gets retried soon
            blocks.splice(nextBlockIdx, 0, block);
          }

        } catch (e) {
          console.warn(`Block ${block.startIdx} error: ${e.message}`);
          block.failures++;
          if (block.failures < 3) {
            block.done = false;
            // Small flat delay before retry — no exponential backoff blocking
            await new Promise(r => setTimeout(r, 1500));
            blocks.splice(nextBlockIdx, 0, block);
          } else {
            // Give up on this block after 3 attempts — don't stall forever
            completed++;
            setTranslateProgress(Math.round((completed / total) * 100));
          }
        }
      }
    };

    // ── Launch workers ───────────────────────────────────────────────────────
    try {
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    } catch (e) {
      setTranslateError(e.message);
    }

    if (!loop.cancel) {
      setIsTranslating(false);
      setTranslateProgress(100);
      clearTimeout(saveTimer);
      // Final definitive save
      fetch('/api/videos/translate-srt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist, video, targetLang: lang, cues: working }),
      }).catch(() => {});
    }
  };

  const forceRetranslate = () => {
    if (!geminiKey) { setShowKeyPrompt(true); return; }
    setTranslatedCues([]);
    runTranslation(activeLang, geminiKey, true);
  };


  // Active cues
  const activeTrCue = useMemo(() =>
    trCues.find(c => currentTime >= c.start && currentTime <= c.end) || null,
    [trCues, currentTime]);

  const activeTransCue = useMemo(() =>
    translatedCues.find(c => currentTime >= c.start && currentTime <= c.end) || null,
    [translatedCues, currentTime]);

  const displayCues = activeLang === 'tr' ? trCues : (translatedCues.length ? translatedCues : trCues);
  const activePrimary = activeLang === 'tr' ? activeTrCue : (activeTransCue || activeTrCue);

  // ── Transcript panel split ────────────────────────────────────────────────
  const [splitPct, setSplitPct] = useState(60);
  const containerRef = useRef(null);

  const handleDividerDrag = useCallback((e) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const onMove = (ev) => {
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const pct = ((clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.max(30, Math.min(75, pct)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove);
    document.addEventListener('touchend', onUp);
  }, []);

  // ── Transcript auto-scroll ────────────────────────────────────────────────
  const transcriptRef = useRef(null);
  const activeCueRef = useRef(null);
  useEffect(() => {
    if (activeCueRef.current && transcriptRef.current) {
      activeCueRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activePrimary?.id]);

  // ── Highlight / quote from transcript ────────────────────────────────────
  const [hlToolbar, setHlToolbar] = useState(null); // { x, y, text, cueStart }
  const [hlColor, setHlColor] = useState('yellow');
  const HL_COLORS = [
    { id: 'yellow', hex: '#fde68a' }, { id: 'green', hex: '#a7f3d0' },
    { id: 'blue', hex: '#bfdbfe' }, { id: 'pink', hex: '#fbcfe8' }, { id: 'purple', hex: '#ddd6fe' },
  ];

  useEffect(() => {
    const onMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) { setHlToolbar(null); return; }
      if (!transcriptRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) { setHlToolbar(null); return; }
      const rr = sel.getRangeAt(0).getBoundingClientRect();
      setHlToolbar({ x: rr.left + rr.width / 2, y: rr.top - 52, text: sel.toString().trim(), cueStart: null });
    };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, []);

  const saveHighlight = useCallback((color) => {
    if (!hlToolbar?.text || !user) return;
    const id = `hl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    addToHighlightsIndex({
      id, book: `videos/${playlist}/${video}`,
      bookTitle: meta?.title || video,
      pageId: `videos/${playlist}/${video}`,
      text: hlToolbar.text, color,
      videoTimestamp: currentTime,
      lang: activeLang,
      timestamp: Date.now(),
    });
    window.getSelection()?.removeAllRanges();
    setHlToolbar(null);
  }, [hlToolbar, user, playlist, video, meta, currentTime, activeLang, addToHighlightsIndex]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', fontFamily: 'var(--font-ui)', overflow: 'hidden' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 20px', background: 'var(--surface)', boxShadow: '0 2px 12px var(--neu-dark)', zIndex: 200, flexShrink: 0 }}>
        <Link href={`/videos/${playlist}`} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.82rem' }}>← Back</Link>
        <span style={{ color: 'var(--text-faint)' }}>|</span>

        {/* Prev / Next episode */}
        {prevEp && (
          <Link href={`/videos/${playlist}/${prevEp}`} style={{ padding: '4px 10px', borderRadius: '7px', background: 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>‹ Prev</Link>
        )}
        {nextEp && (
          <Link href={`/videos/${playlist}/${nextEp}`} style={{ padding: '4px 10px', borderRadius: '7px', background: 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>Next ›</Link>
        )}

        <span style={{ color: 'var(--text)', fontSize: '0.85rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta?.title || '...'}</span>

        {/* Lang switcher */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-down)', borderRadius: '10px', padding: '4px' }}>
          {['tr', 'ru', 'kk'].map(lang => (
            <button key={lang} onClick={() => handleLangChange(lang)} style={{ padding: '5px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.73rem', fontWeight: 700, background: activeLang === lang ? 'var(--primary)' : 'transparent', color: activeLang === lang ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s' }}>
              {LANG_LABELS[lang]}
            </button>
          ))}
        </div>

        {/* Dual mode */}
        {activeLang !== 'tr' && translatedCues.length > 0 && (
          <button onClick={() => setDualMode(v => !v)} style={{ padding: '5px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 700, fontFamily: 'var(--font-ui)', background: dualMode ? 'var(--primary)' : 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', color: dualMode ? '#fff' : 'var(--text-muted)' }}>
            ⚖️ Dual
          </button>
        )}

        {/* Notes toggle */}
        <button onClick={() => setNotesOpen(v => !v)} style={{ padding: '5px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 700, fontFamily: 'var(--font-ui)', background: notesOpen ? 'var(--primary)' : 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', color: notesOpen ? '#fff' : 'var(--text-muted)' }}>✏️ Notes</button>

        {/* AI Hub */}
        <button onClick={() => { if (!geminiKey) { setShowKeyPrompt(true); return; } setShowAiPanel(true); }} style={{ padding: '5px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 700, fontFamily: 'var(--font-ui)', background: 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', color: 'var(--text-muted)' }}>🧠 AI Hub</button>
      </nav>

      {/* Main content: video + transcript */}
      <div ref={containerRef} style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* Left: Video with in-video subtitle overlay + controls bar */}
        <div style={{ width: `${splitPct}%`, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, background: 'var(--surface)' }}>

          {/* Video container with subtitle overlay — ref'd for custom fullscreen */}
          <div ref={videoContainerRef} style={{ position: 'relative', width: '100%', aspectRatio: isFullscreen ? undefined : '16/9', height: isFullscreen ? '100%' : undefined, background: '#000', flexShrink: 0 }}>
            <div id="yt-player" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

            {/* Subtitle overlay — inside the fullscreen container so it shows in fullscreen */}
            <div style={{ position: 'absolute', bottom: isFullscreen ? '72px' : '52px', left: '8px', right: '8px', zIndex: 10, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              {/* Dual: Turkish on top (secondary) */}
              {dualMode && activeTrCue && activeLang !== 'tr' && (
                <div style={{
                  padding: '4px 14px', background: 'rgba(0,0,0,0.55)', borderRadius: '6px',
                  fontSize: `calc(${isFullscreen ? '1.1rem' : '0.8rem'} * ${captionScale})`, color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-read)',
                  lineHeight: 1.45, textAlign: 'center', textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                  backdropFilter: 'blur(4px)', maxWidth: '90%',
                }}>
                  {activeTrCue.text}
                </div>
              )}
              {/* Primary subtitle (active lang) */}
              {activePrimary && (
                <div style={{
                  padding: '5px 16px', background: 'rgba(0,0,0,0.72)', borderRadius: '6px',
                  fontSize: `calc(${isFullscreen ? '1.4rem' : '1rem'} * ${captionScale})`, color: '#ffffff', fontFamily: 'var(--font-read)',
                  lineHeight: 1.5, textAlign: 'center', textShadow: '0 1px 4px rgba(0,0,0,0.9)',
                  backdropFilter: 'blur(6px)', maxWidth: '92%', fontWeight: 500,
                }}>
                  {activePrimary.text}
                </div>
              )}
            </div>

            {/* Custom fullscreen button */}
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              style={{
                position: 'absolute', bottom: '8px', right: '8px', zIndex: 20,
                width: '32px', height: '32px', borderRadius: '6px',
                background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff',
                cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(4px)', transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.8)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.55)'}
            >
              {isFullscreen ? '⛶' : '⛶'}
            </button>
          </div>

          {/* Notes panel — collapsible, below controls bar */}
          {notesOpen && (
            <div style={{ flexShrink: 0, borderTop: '1px solid var(--surface-border)', background: 'var(--surface-down)' }}>
              {/* Notes toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderBottom: '1px solid var(--surface-border)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: '4px' }}>✏️ Notes</span>
                {[['B', 'bold'], ['I', 'italic'], ['U', 'underline']].map(([label, cmd]) => (
                  <button key={cmd} onMouseDown={e => { e.preventDefault(); execNoteFormat(cmd); }}
                    style={{ padding: '2px 8px', border: 'none', borderRadius: '5px', background: 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>{label}</button>
                ))}
                <span style={{ width: '1px', height: '16px', background: 'var(--surface-border)', margin: '0 2px' }} />
                <button onMouseDown={e => { e.preventDefault(); execNoteFormat('formatBlock', '<h3>'); }} style={{ padding: '2px 8px', border: 'none', borderRadius: '5px', background: 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>H3</button>
                <button onMouseDown={e => { e.preventDefault(); execNoteFormat('insertUnorderedList'); }} style={{ padding: '2px 8px', border: 'none', borderRadius: '5px', background: 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>• List</button>
                <button onMouseDown={e => { e.preventDefault(); execNoteFormat('removeFormat'); }} style={{ padding: '2px 8px', border: 'none', borderRadius: '5px', background: 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>✕</button>
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: noteSaveStatus === 'saved' ? 'var(--primary)' : 'var(--text-faint)' }}>
                  {!user ? '🔒 Sign in to save' : noteSaveStatus === 'saving' ? 'saving...' : noteSaveStatus === 'saved' ? '✓ Saved' : ''}
                </span>
              </div>
              {/* Editor area */}
              <div
                ref={notesEditorRef}
                contentEditable={!!user}
                suppressContentEditableWarning
                onInput={handleNoteInput}
                style={{
                  minHeight: '120px', maxHeight: '200px', overflowY: 'auto',
                  padding: '12px 16px', outline: 'none',
                  fontFamily: 'var(--font-read)', fontSize: '0.85rem', lineHeight: 1.6,
                  color: 'var(--text)',
                }}
                data-placeholder="Write your notes here..."
              />
              {!user && (
                <p style={{ margin: '0 16px 10px', fontSize: '0.75rem', color: 'var(--text-faint)' }}>Notes are saved to your profile. <Link href="/profile" style={{ color: 'var(--primary)' }}>Sign in</Link> to enable saving.</p>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: 'var(--surface-down)', flexShrink: 0, flexWrap: 'wrap', minHeight: '42px' }}>
            {isTranslating && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                <div className="loader small" />
                <div style={{ flex: 1, height: '4px', background: 'var(--surface-border)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${translateProgress}%`, background: 'var(--primary)', borderRadius: '2px', transition: 'width 0.3s ease' }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{translateProgress}%</span>
              </div>
            )}
            {translateError && !isTranslating && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--danger)', flex: 1 }}>⚠️ {translateError}</span>
                <button onClick={() => setTranslateError('')} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: '14px' }}>×</button>
              </div>
            )}
            {!isTranslating && !translateError && activeLang !== 'tr' && !translatedCues.length && (
              <button onClick={() => geminiKey ? runTranslation(activeLang, geminiKey) : setShowKeyPrompt(true)}
                style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'var(--font-ui)' }}>
                ✨ Translate to {activeLang.toUpperCase()}
              </button>
            )}
            
            {/* Sizing controls are always visible if subtitles exist */}
            {trCues.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--surface)', borderRadius: '8px', padding: '2px', boxShadow: 'var(--shadow-neu-sm)' }}>
                <button onClick={() => setCaptionScale(s => Math.max(0.5, Number((s - 0.1).toFixed(1))))} style={{ background: 'none', border: 'none', padding: '4px 8px', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 700 }}>A-</button>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)', minWidth: '36px', textAlign: 'center', fontFamily: 'var(--font-ui)' }}>{Math.round(captionScale * 100)}%</span>
                <button onClick={() => setCaptionScale(s => Math.min(2, Number((s + 0.1).toFixed(1))))} style={{ background: 'none', border: 'none', padding: '4px 8px', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 700 }}>A+</button>
              </div>
            )}

            {/* Translation-specific controls */}
            {activeLang !== 'tr' && translatedCues.length > 0 && (
              <>
                <button onClick={() => setDualMode(v => !v)}
                  style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'var(--font-ui)', background: dualMode ? 'var(--primary)' : 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', color: dualMode ? '#fff' : 'var(--text-muted)' }}>
                  ⚖️ Dual subtitles
                </button>
                <button onClick={forceRetranslate}
                  style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'var(--font-ui)', background: 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', color: 'var(--text-muted)' }}>
                  🔄 Re-translate
                </button>
              </>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-faint)', fontFamily: 'var(--font-ui)' }}>
              {activePrimary ? `${formatTime(activePrimary.start)} · ${LANG_LABELS[activeLang]}` : LANG_LABELS[activeLang]}
            </span>
          </div>
        </div>

        {/* Resizable divider */}
        <div onMouseDown={handleDividerDrag} onTouchStart={handleDividerDrag}
          style={{ width: '6px', background: 'var(--surface-border)', cursor: 'col-resize', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: '10px', userSelect: 'none', zIndex: 10 }}>⋮</div>

        {/* Right: Transcript panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface-up)', flexShrink: 0 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>TRANSCRIPT</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>{displayCues.length} cues</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700, marginLeft: 'auto' }}>{LANG_LABELS[activeLang]}</span>
          </div>

          <div ref={transcriptRef} style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {displayCues.map(cue => {
              const isActive = activePrimary?.id === cue.id;
              const trCue = dualMode ? trCues.find(c => c.id === cue.id) : null;
              return (
                <div key={cue.id} ref={isActive ? activeCueRef : null}
                  onClick={() => seekTo(cue.start)}
                  style={{ padding: '10px 12px', marginBottom: '4px', borderRadius: '10px', cursor: 'pointer', background: isActive ? 'var(--primary-light)' : 'transparent', borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent', transition: 'all 0.15s' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', display: 'block', marginBottom: '2px' }}>{formatTime(cue.start)}</span>
                  <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.55, color: isActive ? 'var(--primary)' : 'var(--text)', fontFamily: 'var(--font-read)', fontWeight: isActive ? 600 : 400 }}>{cue.text}</p>
                  {dualMode && trCue && activeLang !== 'tr' && (
                    <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-read)', opacity: 0.8 }}>🇹🇷 {trCue.text}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Highlight toolbar */}
      {hlToolbar && (
        <div style={{ position: 'fixed', top: `${hlToolbar.y}px`, left: `${hlToolbar.x}px`, transform: 'translateX(-50%)', zIndex: 99999, display: 'flex', gap: '6px', padding: '7px 10px', background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(16px)', borderRadius: '999px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          {HL_COLORS.map(c => (
            <button key={c.id} onClick={() => saveHighlight(c.id)}
              style={{ width: '22px', height: '22px', borderRadius: '50%', background: c.hex, border: `2.5px solid ${hlColor === c.id ? '#fff' : 'transparent'}`, cursor: 'pointer' }}
              onMouseEnter={e => { setHlColor(c.id); e.currentTarget.style.transform = 'scale(1.2)'; }}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'} />
          ))}
          {!user && <span style={{ color: '#94a3b8', fontSize: '11px', lineHeight: '22px', paddingLeft: '6px' }}>Login to save</span>}
        </div>
      )}

      {/* Gemini key prompt */}
      {showKeyPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }} onClick={e => { if (e.target === e.currentTarget) setShowKeyPrompt(false); }}>
          <div style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-neu-out)', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '440px' }}>
            <h2 style={{ margin: '0 0 12px', fontFamily: 'var(--font-ui)', fontSize: '1rem' }}>🔑 Gemini API Key</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px', fontFamily: 'var(--font-ui)' }}>Subtitle translation requires a Gemini API key.</p>
            <input value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="AIza..." style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: 'none', background: 'var(--surface-down)', boxSizing: 'border-box', fontFamily: 'var(--font-ui)', fontSize: '0.85rem', color: 'var(--text)', outline: 'none', marginBottom: '12px' }} />
            <button onClick={() => { localStorage.setItem('gemini_api_key', geminiKey); setShowKeyPrompt(false); if (activeLang !== 'tr') runTranslation(activeLang, geminiKey); }}
              style={{ width: '100%', padding: '11px', borderRadius: '10px', border: 'none', background: 'var(--primary)', color: '#fff', fontFamily: 'var(--font-ui)', fontWeight: 700, cursor: 'pointer' }}>
              Save & Translate
            </button>
          </div>
        </div>
      )}

      {/* Full AI Study Hub — matches book reader */}
      <AiStudyHub
        isOpen={showAiPanel}
        onClose={() => setShowAiPanel(false)}
        book={`videos/${playlist}`}
        chapter={meta?.title || video}
        pageKey={`videos:${playlist}:${video}`}
        contentHtml={`<p>${trCues.map(c => c.text).join(' ')}</p>`}
        targetLang={activeLang === 'tr' ? 'kk' : activeLang}
        apiKey={geminiKey}
        onRequireApiKey={() => setShowKeyPrompt(true)}
      />

      <style>{`
        .loader { width:36px;height:36px;border:3px solid var(--surface-border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite; }
        .loader.small { width:18px;height:18px;border-width:2px; }
        @keyframes spin { to { transform:rotate(360deg); } }
        /* Custom fullscreen: the video container div fills the screen */
        :fullscreen { background:#000; display:flex; flex-direction:column; }
        :-webkit-full-screen { background:#000; display:flex; flex-direction:column; }
        :fullscreen #yt-player { position:absolute; inset:0; width:100%!important; height:100%!important; }
        :-webkit-full-screen #yt-player { position:absolute; inset:0; width:100%!important; height:100%!important; }
        /* Notes editor placeholder */
        [data-placeholder]:empty::before { content: attr(data-placeholder); color: var(--text-faint); pointer-events: none; }
      `}</style>
    </div>
  );
}
