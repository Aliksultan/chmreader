'use client';
import { useState } from 'react';
import Link from 'next/link';

const COST_PER_MINUTE = 0.006;

function formatDuration(sec) {
  if (!sec) return '?';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const STATUS = { IDLE: 'idle', PENDING: 'pending', PROCESSING: 'processing', DONE: 'done', ERROR: 'error', SKIPPED: 'skipped' };

export default function ImportPlaylistPage() {
  // Step 1: Config
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [playlistSlug, setPlaylistSlug] = useState('');
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [language, setLanguage] = useState('tr');
  const [concurrency, setConcurrency] = useState(3); // parallel workers

  // Step 2: Analysis + Selection
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set()); // videoIds to process

  // Step 3: Progress
  const [videoStatuses, setVideoStatuses] = useState({});
  const [isRunning, setIsRunning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // ── Derived selection stats ──
  const selectedVideos = analysis?.videos?.filter(v => selectedIds.has(v.videoId)) || [];
  const selectedMinutes = selectedVideos.reduce((s, v) => s + v.durationMin, 0);
  const selectedCost = selectedMinutes * COST_PER_MINUTE;
  const allSelected = analysis && selectedIds.size === analysis.videos.length;
  const noneSelected = selectedIds.size === 0;

  // ── Handlers ──
  const toggleVideo = (videoId) => {
    if (isRunning || confirmed) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(videoId) ? next.delete(videoId) : next.add(videoId);
      return next;
    });
  };

  const selectAll = () => {
    if (!analysis) return;
    setSelectedIds(new Set(analysis.videos.map(v => v.videoId)));
  };

  const deselectAll = () => setSelectedIds(new Set());

  const handleAnalyze = async (e) => {
    e.preventDefault();
    setAnalyzeError('');
    setAnalysis(null);
    setConfirmed(false);
    setVideoStatuses({});
    setSelectedIds(new Set());

    if (!playlistUrl || !youtubeApiKey) {
      setAnalyzeError('Please provide the playlist URL and your YouTube API Key.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await fetch(`/api/videos/import-playlist?playlistUrl=${encodeURIComponent(playlistUrl)}&youtubeApiKey=${encodeURIComponent(youtubeApiKey)}`);
      const data = await res.json();

      if (!res.ok) {
        setAnalyzeError(data.error || 'Failed to analyze playlist.');
      } else {
        setAnalysis(data);
        // Auto-slug
        if (!playlistSlug) {
          const listMatch = playlistUrl.match(/[?&]list=([^&]+)/);
          if (listMatch) setPlaylistSlug(listMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 32));
        }
        // Select all by default
        setSelectedIds(new Set(data.videos.map(v => v.videoId)));
      }
    } catch (err) {
      setAnalyzeError('Network error: ' + err.message);
    }
    setIsAnalyzing(false);
  };

  const handleStartImport = async () => {
    if (!openaiApiKey || !playlistSlug) {
      setAnalyzeError('Please provide your OpenAI API Key and a Playlist Slug before starting.');
      return;
    }
    if (selectedIds.size === 0) {
      setAnalyzeError('Please select at least one video to process.');
      return;
    }

    setIsRunning(true);
    setConfirmed(true);

    // Init statuses
    const initStatuses = {};
    analysis.videos.forEach(v => {
      initStatuses[v.videoId] = { status: selectedIds.has(v.videoId) ? STATUS.PENDING : STATUS.SKIPPED };
    });
    setVideoStatuses(initStatuses);

    // Build queue of selected videos (in playlist order)
    const queue = analysis.videos.filter(v => selectedIds.has(v.videoId));
    let queueIndex = 0; // shared pointer — workers pull from this

    // Process a single video and update its status
    const processVideo = async (video) => {
      setVideoStatuses(prev => ({ ...prev, [video.videoId]: { status: STATUS.PROCESSING } }));
      try {
        const res = await fetch('/api/videos/import-playlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: video.videoId,
            title: video.title,
            position: video.position,
            durationSec: video.durationSec,
            playlistSlug,
            playlistTitle,
            openaiApiKey,
            language,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setVideoStatuses(prev => ({ ...prev, [video.videoId]: { status: STATUS.DONE, episodeId: data.episodeId } }));
        } else {
          setVideoStatuses(prev => ({ ...prev, [video.videoId]: { status: STATUS.ERROR, error: data.error || 'Unknown error' } }));
        }
      } catch (err) {
        setVideoStatuses(prev => ({ ...prev, [video.videoId]: { status: STATUS.ERROR, error: err.message } }));
      }
    };

    // Worker: keeps pulling from the shared queue until empty
    const worker = async () => {
      while (true) {
        const idx = queueIndex++; // atomically grab next index
        if (idx >= queue.length) break;
        await processVideo(queue[idx]);
      }
    };

    // Launch `concurrency` workers in parallel
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

    setIsRunning(false);
  };

  const totalSelected = selectedIds.size;
  const totalDone = Object.values(videoStatuses).filter(s => s.status === STATUS.DONE).length;
  const totalErrors = Object.values(videoStatuses).filter(s => s.status === STATUS.ERROR).length;
  const totalProcessed = totalDone + totalErrors;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-ui)', color: 'var(--text)', padding: '40px 20px' }}>
      <div style={{ maxWidth: '820px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '32px' }}>
          <Link href="/videos" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '1.2rem', fontWeight: 700 }}>←</Link>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text)' }}>📥 Import YouTube Playlist</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Auto-transcribe selected videos using OpenAI Whisper large-v2
            </p>
          </div>
        </div>

        {/* ── STEP 1: Config ── */}
        <form onSubmit={handleAnalyze} style={cardStyle}>
          <StepHeader n="1" label="Playlist Configuration" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Field label="YouTube Playlist URL">
              <input type="text" value={playlistUrl} onChange={e => setPlaylistUrl(e.target.value)}
                placeholder="https://www.youtube.com/playlist?list=PLxxxxxxxx"
                disabled={isAnalyzing || isRunning} />
            </Field>

            <Field label="YouTube Data API Key" hint="Get free at console.cloud.google.com → YouTube Data API v3">
              <input type="password" value={youtubeApiKey} onChange={e => setYoutubeApiKey(e.target.value)}
                placeholder="AIzaSy..." disabled={isAnalyzing || isRunning} />
            </Field>

            <div style={{ display: 'flex', gap: '14px' }}>
              <Field label="Playlist Slug (folder name)" style={{ flex: 2 }}>
                <input type="text" value={playlistSlug}
                  onChange={e => setPlaylistSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="my-playlist" disabled={isRunning} />
              </Field>
              <Field label="Display Title (optional)" style={{ flex: 2 }}>
                <input type="text" value={playlistTitle} onChange={e => setPlaylistTitle(e.target.value)}
                  placeholder="My Playlist" disabled={isRunning} />
              </Field>
              <Field label="Language" style={{ flex: 1 }}>
                <select value={language} onChange={e => setLanguage(e.target.value)} disabled={isRunning}>
                  <option value="tr">🇹🇷 Turkish</option>
                  <option value="ar">🇸🇦 Arabic</option>
                  <option value="ru">🇷🇺 Russian</option>
                  <option value="kk">🇰🇿 Kazakh</option>
                  <option value="en">🇬🇧 English</option>
                </select>
              </Field>
              <Field label="Parallel Workers" hint="2–3 recommended" style={{ flex: 1 }}>
                <select value={concurrency} onChange={e => setConcurrency(Number(e.target.value))} disabled={isRunning}>
                  <option value={1}>1 (sequential)</option>
                  <option value={2}>2 workers</option>
                  <option value={3}>3 workers ★</option>
                  <option value={4}>4 workers</option>
                  <option value={5}>5 workers</option>
                </select>
              </Field>
            </div>

            {analyzeError && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '12px 16px', borderRadius: '10px', fontSize: '0.85rem' }}>
                {analyzeError}
              </div>
            )}

            <button type="submit" disabled={isAnalyzing || isRunning} style={btnStyle(!isAnalyzing && !isRunning)}>
              {isAnalyzing ? '⏳ Analyzing Playlist...' : '🔍 Analyze Playlist'}
            </button>
          </div>
        </form>

        {/* ── STEP 2: Select & Estimate ── */}
        {analysis && (
          <div style={{ ...cardStyle, marginBottom: '24px' }}>
            <StepHeader n="2" label="Select Videos & Review Cost" />

            {/* Summary bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '18px' }}>
              <SummaryCard label="Total" value={analysis.videoCount} icon="🎬" />
              <SummaryCard label="Selected" value={totalSelected} icon="✅" accent={totalSelected > 0} />
              <SummaryCard label="Duration" value={`${selectedMinutes.toFixed(1)} min`} icon="⏱️" />
              <SummaryCard label="Est. Cost" value={`$${selectedCost.toFixed(3)}`} icon="💰" accent={totalSelected > 0}
                hint={`$${COST_PER_MINUTE}/min via Whisper`} />
            </div>

            {/* Select all / none toolbar */}
            {!confirmed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', padding: '8px 14px', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--surface-border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = !allSelected && !noneSelected; }}
                    onChange={e => e.target.checked ? selectAll() : deselectAll()}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>
                    {allSelected ? 'Deselect All' : 'Select All'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    ({totalSelected} of {analysis.videoCount} selected)
                  </span>
                </label>
                <button type="button" onClick={selectAll}
                  style={{ padding: '4px 10px', border: 'none', borderRadius: '6px', background: 'var(--primary-light)', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                  All
                </button>
                <button type="button" onClick={deselectAll}
                  style={{ padding: '4px 10px', border: 'none', borderRadius: '6px', background: 'var(--surface-down)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                  None
                </button>
              </div>
            )}

            {/* Video list with checkboxes */}
            <div style={{ maxHeight: '380px', overflowY: 'auto', borderRadius: '10px', border: '1px solid var(--surface-border)' }}>
              {analysis.videos.map((v, i) => {
                const isSelected = selectedIds.has(v.videoId);
                const st = videoStatuses[v.videoId];
                const isLast = i === analysis.videos.length - 1;

                return (
                  <>
                    <div
                      key={v.videoId}
                      onClick={() => toggleVideo(v.videoId)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '10px 14px',
                        borderBottom: !isLast && !st?.error ? '1px solid var(--surface-border)' : 'none',
                        background: isSelected ? 'rgba(0,102,102,0.04)' : 'transparent',
                        cursor: confirmed ? 'default' : 'pointer',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => { if (!confirmed) e.currentTarget.style.background = isSelected ? 'rgba(0,102,102,0.08)' : 'var(--surface-up)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(0,102,102,0.04)' : 'transparent'; }}
                    >
                      {/* Checkbox */}
                      {!confirmed && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleVideo(v.videoId)}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '16px', height: '16px', flexShrink: 0, cursor: 'pointer', accentColor: 'var(--primary)' }}
                        />
                      )}

                      {/* Number */}
                      <span style={{ fontWeight: 700, color: 'var(--text-faint)', fontSize: '0.72rem', minWidth: '22px', textAlign: 'right', flexShrink: 0 }}>
                        {i + 1}
                      </span>

                      {/* Thumbnail */}
                      <img
                        src={`https://img.youtube.com/vi/${v.videoId}/default.jpg`}
                        alt=""
                        style={{ width: '48px', height: '34px', borderRadius: '5px', objectFit: 'cover', flexShrink: 0, opacity: isSelected ? 1 : 0.4, transition: 'opacity 0.15s' }}
                      />

                      {/* Title + duration */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '0.85rem', fontWeight: 600,
                          color: isSelected ? 'var(--text)' : 'var(--text-muted)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          transition: 'color 0.15s',
                        }}>
                          {v.title}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: '2px' }}>
                          {formatDuration(v.durationSec)} · ${(v.durationMin * COST_PER_MINUTE).toFixed(3)}
                        </div>
                      </div>

                      {/* Status badge (only after confirmed) */}
                      {confirmed
                        ? <StatusBadge status={st?.status} />
                        : isSelected && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700, background: 'var(--primary-light)', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 }}>
                              Selected
                            </span>
                          )
                      }
                    </div>
                    {/* Inline error — visible below the row */}
                    {st?.error && (
                      <div style={{ padding: '6px 14px 8px', fontSize: '0.75rem', color: '#ef4444', background: 'rgba(239,68,68,0.06)', borderBottom: !isLast ? '1px solid var(--surface-border)' : 'none' }}>
                        ❌ {st.error}
                      </div>
                    )}
                  </>
                );
              })}
            </div>

            {/* OpenAI Key + Confirm — only before start */}
            {!confirmed && (
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <Field label="OpenAI API Key (for Whisper)" hint="Never stored — used only for this session">
                  <input type="password" value={openaiApiKey} onChange={e => setOpenaiApiKey(e.target.value)}
                    placeholder="sk-..." disabled={isRunning} />
                </Field>

                {totalSelected > 0 && (
                  <div style={{ background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.28)', borderRadius: '10px', padding: '13px 16px', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    ⚠️ <strong>Confirm:</strong> Will transcribe <strong>{totalSelected} video{totalSelected !== 1 ? 's' : ''}</strong> ({selectedMinutes.toFixed(1)} min) using Whisper large-v2.
                    Estimated cost: <strong style={{ color: 'var(--primary)' }}>${selectedCost.toFixed(3)}</strong>.
                    Videos process one at a time — don't close this tab.
                  </div>
                )}

                <button
                  onClick={handleStartImport}
                  disabled={!openaiApiKey || !playlistSlug || noneSelected}
                  style={btnStyle(!!openaiApiKey && !!playlistSlug && !noneSelected, 'green')}
                >
                  ✅ Confirm & Start Transcription ({totalSelected} video{totalSelected !== 1 ? 's' : ''})
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Live Progress ── */}
        {confirmed && (
          <div style={cardStyle}>
            <StepHeader
              n="3"
              label={
                isRunning ? '⏳ Transcribing...'
                : totalErrors > 0 && totalDone === 0 ? '❌ Failed'
                : totalErrors > 0 ? '⚠️ Done with errors'
                : '✅ Done!'
              }
              color={
                isRunning ? '#f59e0b'
                : totalErrors > 0 && totalDone === 0 ? '#ef4444'
                : totalErrors > 0 ? '#f59e0b'
                : '#10b981'
              }
            />

            {/* Progress bar */}
            <div style={{ background: 'var(--surface-border)', borderRadius: '999px', height: '8px', marginBottom: '14px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${totalSelected > 0 ? (totalProcessed / totalSelected) * 100 : 0}%`,
                background: totalErrors > 0 ? 'linear-gradient(90deg, #10b981, #f59e0b)' : 'linear-gradient(90deg, var(--primary), #10b981)',
                transition: 'width 0.4s ease', borderRadius: '999px',
              }} />
            </div>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', fontSize: '0.82rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              <span>✅ Done: <strong style={{ color: '#10b981' }}>{totalDone}</strong></span>
              <span>❌ Errors: <strong style={{ color: '#ef4444' }}>{totalErrors}</strong></span>
              <span>⏳ Remaining: <strong>{Math.max(0, totalSelected - totalProcessed)}</strong></span>
              {isRunning && <span>⚡ Workers: <strong style={{ color: 'var(--primary)' }}>{concurrency}</strong> parallel</span>}
            </div>

            {/* ── Error details (shown directly here, not just in video list) ── */}
            {!isRunning && totalErrors > 0 && (
              <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(videoStatuses)
                  .filter(([, s]) => s.status === STATUS.ERROR)
                  .map(([vid, s]) => {
                    const v = analysis?.videos?.find(x => x.videoId === vid);
                    return (
                      <div key={vid} style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '12px 14px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444', marginBottom: '4px' }}>
                          ❌ {v?.title || vid}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-word' }}>
                          {s.error || 'Unknown error'}
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            )}

            {!isRunning && totalDone > 0 && (
              <Link href={`/videos/${playlistSlug}`} style={{
                display: 'inline-block', padding: '10px 20px',
                background: 'var(--primary)', color: '#fff',
                borderRadius: '10px', textDecoration: 'none',
                fontWeight: 700, fontSize: '0.88rem',
                boxShadow: '3px 3px 10px rgba(0,102,102,0.3)',
              }}>
                Open Playlist →
              </Link>
            )}
          </div>
        )}
      </div>

      <style>{`
        input[type="text"], input[type="password"], select {
          width: 100%; padding: 11px 14px; border-radius: 9px;
          border: 1px solid var(--surface-border);
          background: var(--surface); color: var(--text);
          font-family: var(--font-ui); font-size: 0.88rem;
          outline: none; box-sizing: border-box;
          transition: border-color 0.15s;
        }
        input[type="text"]:focus, input[type="password"]:focus, select:focus { border-color: var(--primary); }
        input:disabled, select:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

// ── Sub-components ──

const cardStyle = {
  background: 'var(--surface-up)', borderRadius: '16px',
  padding: '28px', boxShadow: 'var(--shadow-neu-sm)', marginBottom: '24px',
};

function StepHeader({ n, label, color }) {
  return (
    <h2 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ background: color || 'var(--primary)', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, flexShrink: 0 }}>{n}</span>
      {label}
    </h2>
  );
}

function Field({ label, hint, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', ...style }}>
      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
        {label}
        {hint && <span style={{ fontWeight: 400, marginLeft: '6px', opacity: 0.7 }}>— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function SummaryCard({ label, value, icon, accent, hint }) {
  return (
    <div style={{
      background: accent ? 'rgba(0,102,102,0.07)' : 'var(--surface)',
      border: accent ? '1px solid rgba(0,102,102,0.25)' : '1px solid var(--surface-border)',
      borderRadius: '12px', padding: '14px 10px', textAlign: 'center',
      boxShadow: 'var(--shadow-neu-sm)',
    }}>
      <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{icon}</div>
      <div style={{ fontSize: accent ? '1.1rem' : '1rem', fontWeight: 800, color: accent ? 'var(--primary)' : 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
      {hint && <div style={{ fontSize: '0.62rem', color: 'var(--text-faint)', marginTop: '1px' }}>{hint}</div>}
    </div>
  );
}

function StatusBadge({ status, error }) {
  if (!status || status === STATUS.IDLE) return null;
  const map = {
    [STATUS.PENDING]:    { label: '⏳ Waiting',    color: 'var(--text-muted)', bg: 'transparent' },
    [STATUS.PROCESSING]: { label: '🔄 Processing', color: '#f59e0b',           bg: 'rgba(245,158,11,0.1)' },
    [STATUS.DONE]:       { label: '✅ Done',       color: '#10b981',           bg: 'rgba(16,185,129,0.1)' },
    [STATUS.ERROR]:      { label: '❌ Error',      color: '#ef4444',           bg: 'rgba(239,68,68,0.1)'  },
    [STATUS.SKIPPED]:    { label: '⏭️ Skipped',   color: 'var(--text-faint)', bg: 'transparent'          },
  };
  const s = map[status] || map[STATUS.PENDING];
  return (
    <div title={error || ''} style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', background: s.bg, color: s.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {s.label}
    </div>
  );
}

function btnStyle(active, variant = 'primary') {
  const colors = {
    primary: { bg: 'var(--primary)', shadow: 'rgba(0,102,102,0.3)' },
    green:   { bg: '#10b981',        shadow: 'rgba(16,185,129,0.3)' },
  };
  const c = colors[variant] || colors.primary;
  return {
    padding: '13px 20px', borderRadius: '10px', border: 'none',
    background: active ? c.bg : 'var(--surface-border)',
    color: active ? '#fff' : 'var(--text-faint)',
    fontWeight: 700, fontSize: '0.95rem',
    cursor: active ? 'pointer' : 'not-allowed',
    fontFamily: 'var(--font-ui)',
    boxShadow: active ? `3px 3px 10px ${c.shadow}` : 'none',
    transition: 'all 0.2s',
  };
}
