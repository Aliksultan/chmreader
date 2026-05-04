'use client';

import { useState } from 'react';
import { useReader } from '@/context/ReaderContext';
import Link from 'next/link';
import WhatsNew from '@/components/WhatsNew';

const COLOR_MAP = {
  yellow: { bg: '#fde68a', text: '#78350f', border: '#fbbf24' },
  green:  { bg: '#a7f3d0', text: '#064e3b', border: '#34d399' },
  blue:   { bg: '#bfdbfe', text: '#1e3a8a', border: '#60a5fa' },
  pink:   { bg: '#fbcfe8', text: '#831843', border: '#f472b6' },
  purple: { bg: '#ddd6fe', text: '#4c1d95', border: '#a78bfa' },
};

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProfilePage() {
  const { user, login, logout, bookmarks, removeBookmark, highlightsIndex, removeFromHighlightsIndex } = useReader();
  const [tab, setTab] = useState('bookmarks');
  const [usernameInput, setUsernameInput] = useState('');
  const [error, setError] = useState('');
  const [filterBook, setFilterBook] = useState('all');
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  // Unique books that appear in highlights
  const quoteBooks = ['all', ...new Set(highlightsIndex.map(h => h.book))];
  const bmBooks    = ['all', ...new Set(bookmarks.map(b => b.book))];

  const filteredQuotes = filterBook === 'all'
    ? highlightsIndex
    : highlightsIndex.filter(h => h.book === filterBook);

  const filteredBookmarks = filterBook === 'all'
    ? bookmarks
    : bookmarks.filter(b => b.book === filterBook);

  const handleLogin = async (e) => {
    e.preventDefault();
    const name = usernameInput.trim();
    if (name.length < 2) { setError('Enter at least 2 characters.'); return; }
    setError('');
    await login(name);
    setUsernameInput('');
  };

  const s = {
    page: {
      minHeight: '100vh',
      background: 'var(--surface)',
      fontFamily: 'var(--font-ui)',
      color: 'var(--text)',
    },
    nav: {
      height: '56px',
      background: 'var(--surface-up)',
      boxShadow: '0 2px 12px var(--neu-dark)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 28px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    },
    navLogo: {
      fontSize: '1rem',
      fontWeight: 700,
      color: 'var(--primary)',
      letterSpacing: '0.08em',
      textDecoration: 'none',
    },
    navRight: { display: 'flex', alignItems: 'center', gap: '12px' },
    container: {
      maxWidth: '900px',
      margin: '0 auto',
      padding: '40px 24px',
    },
    // Login card
    loginCard: {
      background: 'var(--surface)',
      boxShadow: 'var(--shadow-neu-out)',
      borderRadius: '20px',
      padding: '48px 40px',
      maxWidth: '420px',
      margin: '80px auto',
      textAlign: 'center',
    },
    // Profile header
    profileHeader: {
      background: 'var(--surface)',
      boxShadow: 'var(--shadow-neu-out)',
      borderRadius: '20px',
      padding: '28px 32px',
      marginBottom: '28px',
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
    },
    avatar: {
      width: '60px', height: '60px',
      borderRadius: '50%',
      background: 'var(--primary)',
      color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '1.5rem',
      fontWeight: 700,
      boxShadow: 'var(--shadow-neu-sm)',
      flexShrink: 0,
    },
  };

  if (!user) {
    return (
      <div style={s.page}>
        <nav style={s.nav}>
          <Link href="/" style={s.navLogo}>Kütüphane</Link>
        </nav>
        <div style={s.loginCard}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>📚</div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text)' }}>
            Sign in to your library
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '28px', lineHeight: 1.6 }}>
            Your bookmarks and highlights are saved here.
          </p>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <input
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
              placeholder="Enter your nickname…"
              style={{
                background: 'var(--surface)',
                boxShadow: 'var(--shadow-neu-in)',
                border: 'none',
                borderRadius: '10px',
                padding: '12px 16px',
                fontSize: '0.95rem',
                fontFamily: 'var(--font-ui)',
                color: 'var(--text)',
                outline: 'none',
                width: '100%',
              }}
            />
            {error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{error}</p>}
            <button type="submit" style={{
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 24px',
              fontFamily: 'var(--font-ui)',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '4px 4px 12px rgba(0,102,102,0.3)',
              transition: 'all 0.15s',
            }}>
              Enter Library →
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      {/* Nav */}
      <nav style={s.nav}>
        <Link href="/" style={s.navLogo}>Kütüphane</Link>
        <div style={s.navRight}>
          <Link href="/" style={{
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            textDecoration: 'none',
            fontFamily: 'var(--font-ui)',
          }}>← Library</Link>
          <button onClick={logout} style={{
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-neu-sm)',
            border: 'none',
            borderRadius: '8px',
            padding: '7px 14px',
            fontFamily: 'var(--font-ui)',
            fontSize: '0.78rem',
            color: 'var(--danger)',
            cursor: 'pointer',
          }}>
            Sign out
          </button>
        </div>
      </nav>

      <div style={s.container}>
        {/* Profile Header */}
        <div style={s.profileHeader}>
          <div style={s.avatar}>
            {user.username[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              {user.username}
            </h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {bookmarks.length} bookmarks · {highlightsIndex.length} quotes
            </p>
          </div>
          <button onClick={() => setShowWhatsNew(true)} style={{
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-neu-sm)',
            border: 'none', borderRadius: '10px',
            padding: '9px 16px',
            fontFamily: 'var(--font-ui)', fontSize: '0.78rem', fontWeight: 700,
            color: 'var(--primary)', cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}>🎉 Жаңарту</button>
          <Link href="/" style={{
            background: 'var(--primary)',
            color: '#fff',
            borderRadius: '10px',
            padding: '9px 18px',
            fontFamily: 'var(--font-ui)',
            fontSize: '0.82rem',
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '3px 3px 10px rgba(0,102,102,0.25)',
            whiteSpace: 'nowrap',
          }}>
            Кітапханаға →
          </Link>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-neu-in)',
          borderRadius: '12px',
          padding: '6px',
        }}>
          {[
            { id: 'bookmarks', label: `🔖 Bookmarks (${bookmarks.length})` },
            { id: 'quotes',    label: `✨ Quotes (${highlightsIndex.length})` },
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setFilterBook('all'); }} style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              fontFamily: 'var(--font-ui)',
              fontSize: '0.85rem',
              fontWeight: tab === t.id ? 700 : 400,
              cursor: 'pointer',
              background: tab === t.id ? 'var(--surface)' : 'transparent',
              boxShadow: tab === t.id ? 'var(--shadow-neu-sm)' : 'none',
              color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)',
              transition: 'all 0.18s',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Book filter */}
        {(tab === 'bookmarks' ? bmBooks : quoteBooks).length > 2 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {(tab === 'bookmarks' ? bmBooks : quoteBooks).map(bk => (
              <button key={bk} onClick={() => setFilterBook(bk)} style={{
                padding: '5px 14px',
                borderRadius: '999px',
                border: 'none',
                fontFamily: 'var(--font-ui)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                background: filterBook === bk ? 'var(--primary)' : 'var(--surface)',
                boxShadow: filterBook === bk ? '2px 2px 8px rgba(0,102,102,0.3)' : 'var(--shadow-neu-sm)',
                color: filterBook === bk ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}>
                {bk === 'all' ? 'All books' : bk}
              </button>
            ))}
          </div>
        )}

        {/* ── BOOKMARKS TAB ─────────────────────────────────────────────────── */}
        {tab === 'bookmarks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredBookmarks.length === 0 && (
              <EmptyState
                icon="🔖"
                title="No bookmarks yet"
                desc="While reading, tap the bookmark icon to save your place."
              />
            )}
            {filteredBookmarks.map(bm => (
              <div key={bm.id} style={{
                background: 'var(--surface)',
                boxShadow: 'var(--shadow-neu-sm)',
                borderRadius: '14px',
                padding: '18px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                transition: 'box-shadow 0.15s',
              }}>
                <div style={{
                  width: '36px', height: '36px',
                  borderRadius: '10px',
                  background: 'var(--primary-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.1rem',
                  flexShrink: 0,
                  boxShadow: 'var(--shadow-neu-sm-in)',
                }}>📌</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', margin: 0 }}>
                    {bm.pageTitle || 'Untitled page'}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {bm.bookTitle || bm.book} · {formatDate(bm.timestamp)}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Link href={`/reader/${encodeURIComponent(bm.book)}?page=${encodeURIComponent(bm.pageUrl)}`}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      background: 'var(--primary)',
                      color: '#fff',
                      textDecoration: 'none',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-ui)',
                      fontWeight: 700,
                      boxShadow: '2px 2px 8px rgba(0,102,102,0.25)',
                    }}>
                    Open →
                  </Link>
                  <button onClick={() => removeBookmark(bm.id)} style={{
                    padding: '7px 10px',
                    borderRadius: '8px',
                    background: 'var(--surface)',
                    boxShadow: 'var(--shadow-neu-sm)',
                    border: 'none',
                    color: 'var(--danger)',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }} title="Remove bookmark">×</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── QUOTES TAB ────────────────────────────────────────────────────── */}
        {tab === 'quotes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filteredQuotes.length === 0 && (
              <EmptyState
                icon="✨"
                title="No quotes yet"
                desc="Select any text while reading to highlight it and save it here as a quote."
              />
            )}
            {filteredQuotes.map(h => {
              const c = COLOR_MAP[h.color] || COLOR_MAP.yellow;
              return (
                <div key={h.id} style={{
                  background: 'var(--surface)',
                  boxShadow: 'var(--shadow-neu-sm)',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  transition: 'box-shadow 0.15s',
                }}>
                  {/* Color accent bar */}
                  <div style={{ height: '4px', background: c.border }} />
                  <div style={{ padding: '20px 22px' }}>
                    {/* Quote text */}
                    <blockquote style={{
                      margin: 0,
                      borderLeft: `3px solid ${c.border}`,
                      paddingLeft: '16px',
                      fontFamily: 'var(--font-read)',
                      fontSize: '1rem',
                      lineHeight: 1.7,
                      color: 'var(--text)',
                      fontStyle: 'italic',
                    }}>
                      "{h.text}"
                    </blockquote>
                    {/* Note */}
                    {h.note && (
                      <p style={{
                        fontSize: '0.82rem',
                        color: 'var(--text-muted)',
                        marginTop: '10px',
                        paddingLeft: '19px',
                        fontFamily: 'var(--font-ui)',
                      }}>
                        💭 {h.note}
                      </p>
                    )}
                    {/* Footer: book + date + link */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: '14px',
                      paddingTop: '12px',
                      borderTop: '1px solid var(--surface-border)',
                    }}>
                      <div>
                        <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', margin: 0, fontFamily: 'var(--font-ui)' }}>
                          {h.bookTitle || h.book}
                        </p>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-ui)' }}>
                          {formatDate(h.timestamp)}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <Link
                          href={`/reader/${encodeURIComponent(h.book)}?page=${encodeURIComponent(h.pageId)}`}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            background: 'var(--primary)',
                            color: '#fff',
                            textDecoration: 'none',
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-ui)',
                            fontWeight: 700,
                            boxShadow: '2px 2px 8px rgba(0,102,102,0.25)',
                          }}>
                          Go to page →
                        </Link>
                        <button onClick={() => removeFromHighlightsIndex(h.id)} style={{
                          padding: '6px 10px',
                          borderRadius: '8px',
                          background: 'var(--surface)',
                          boxShadow: 'var(--shadow-neu-sm)',
                          border: 'none',
                          color: 'var(--danger)',
                          fontSize: '0.9rem',
                          cursor: 'pointer',
                        }} title="Remove quote">×</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        maxWidth: '900px', margin: '0 auto',
        padding: '0 24px 48px',
        display: 'flex', flexDirection: 'column', gap: '12px',
      }}>
        <div style={{
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-neu-in)',
          borderRadius: '16px',
          padding: '18px 22px',
          display: 'flex', flexDirection: 'column', gap: '12px',
        }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Байланыс</p>
          <a href="https://t.me/anonaskbot?start=n37k833uklxykpfu" target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: '0.85rem' }}>
            <span style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>💬</span>
            <span>Идеялар мен кері байланыс — <strong style={{ color: 'var(--primary)' }}>t.me/anonaskbot</strong></span>
          </a>
          <a href="https://send.monobank.ua/jar/4003035112072389" target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: '0.85rem' }}>
            <span style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>☕</span>
            <span>Демеу: <strong style={{ color: 'var(--primary)' }}>4003035112072389</strong> (Monobank)</span>
          </a>
        </div>
        <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: '0.72rem', color: 'var(--text-faint)', textAlign: 'center' }}>
          Сіздің әр аудармаңыз тиын тұрады 🤍
        </p>
      </div>

      {showWhatsNew && <WhatsNew forceShow onClose={() => setShowWhatsNew(false)} />}
    </div>
  );
}

function EmptyState({ icon, title, desc }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '60px 24px',
      background: 'var(--surface)',
      boxShadow: 'var(--shadow-neu-in)',
      borderRadius: '16px',
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '16px' }}>{icon}</div>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{title}</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px', maxWidth: '300px', margin: '8px auto 0', lineHeight: 1.6 }}>{desc}</p>
    </div>
  );
}
