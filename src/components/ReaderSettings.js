'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useReader } from '@/context/ReaderContext';

const FONTS = [
  { label: 'Inter', value: 'var(--font-inter)', preview: 'A', style: 'font-sans' },
  { label: 'Lora', value: 'var(--font-lora)', preview: 'A', style: 'font-serif' },
];

const ARABIC_FONTS = [
  { label: 'Amiri Quran', value: 'var(--font-amiri)', preview: 'بسم' },
];

const THEMES = [
  {
    id: 'light',
    label: 'Light',
    bg: '#ffffff',
    text: '#1a1a1a',
    border: '#e2e8f0',
    active: '#4f46e5',
  },
  {
    id: 'sepia',
    label: 'Sepia',
    bg: '#f4ecd8',
    text: '#5b4636',
    border: '#c0b196',
    active: '#d97706',
  },
  {
    id: 'dark',
    label: 'Dark',
    bg: '#1e293b',
    text: '#f1f5f9',
    border: '#334155',
    active: '#818cf8',
  },
];

export default function ReaderSettings() {
  const { settings, updateSettings, user, login, logout } = useReader();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState('type'); // 'type' | 'profile'
  const [usernameInput, setUsernameInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleLogin = async (e) => {
    e.preventDefault();
    const name = usernameInput.trim();
    if (!name || name.length < 2) {
      setLoginError('Enter at least 2 characters.');
      return;
    }
    setLoginError('');
    await login(name);
    setUsernameInput('');
    setTab('type');
  };

  const activeTheme = THEMES.find(t => t.id === settings.theme) || THEMES[0];

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      {/* Trigger Button */}
      <button
        id="reader-settings-btn"
        onClick={() => setIsOpen(v => !v)}
        title="Typography & Profile"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '999px',
          border: '1.5px solid var(--card-border)',
          background: isOpen ? 'var(--primary)' : 'var(--card-bg)',
          color: isOpen ? '#fff' : 'var(--text-primary)',
          fontFamily: 'var(--font-outfit)',
          fontWeight: 600,
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: isOpen ? '0 0 0 3px var(--primary-glow)' : 'var(--shadow-sm)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-lora)', fontSize: '16px' }}>Aa</span>
        {user && (
          <span style={{
            width: '22px', height: '22px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontSize: '11px', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginLeft: '2px',
          }}>
            {user.username.charAt(0).toUpperCase()}
          </span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 10px)',
            width: '320px',
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: '20px',
            boxShadow: 'var(--shadow-xl)',
            zIndex: 9999,
            overflow: 'hidden',
            backdropFilter: 'blur(24px)',
            animation: 'settingsFadeIn 0.18s ease',
          }}
        >
          {/* Tabs */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid var(--card-border)',
            padding: '4px',
            gap: '2px',
            background: 'var(--background)',
          }}>
            {[
              { id: 'type', label: '✏️ Typography' },
              { id: 'profile', label: user ? `👤 ${user.username}` : '👤 Profile' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: '12px',
                  border: 'none',
                  background: tab === t.id ? 'var(--card-bg)' : 'transparent',
                  color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)',
                  fontSize: '12.5px',
                  fontWeight: tab === t.id ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: tab === t.id ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ padding: '20px' }}>

            {/* ── TYPOGRAPHY TAB ── */}
            {tab === 'type' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Theme */}
                <Section label="Theme">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    {THEMES.map(theme => (
                      <button
                        key={theme.id}
                        onClick={() => updateSettings({ theme: theme.id })}
                        style={{
                          padding: '10px 4px 8px',
                          borderRadius: '12px',
                          border: `2px solid ${settings.theme === theme.id ? theme.active : theme.border}`,
                          background: theme.bg,
                          color: theme.text,
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: settings.theme === theme.id ? `0 0 0 3px ${theme.active}30` : 'none',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span style={{ fontSize: '16px' }}>
                          {theme.id === 'light' ? '☀️' : theme.id === 'sepia' ? '☕' : '🌙'}
                        </span>
                        {theme.label}
                      </button>
                    ))}
                  </div>
                </Section>

                {/* Main Font */}
                <Section label="Reading Font">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {FONTS.map(f => (
                      <button
                        key={f.value}
                        onClick={() => updateSettings({ mainFontFamily: f.value })}
                        style={{
                          padding: '10px',
                          borderRadius: '12px',
                          border: `2px solid ${settings.mainFontFamily === f.value ? 'var(--primary)' : 'var(--card-border)'}`,
                          background: settings.mainFontFamily === f.value ? 'var(--primary-glow)' : 'transparent',
                          color: settings.mainFontFamily === f.value ? 'var(--primary)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          fontFamily: f.value,
                        }}
                      >
                        <div style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1 }}>{f.preview}</div>
                        <div style={{ fontSize: '11px', marginTop: '4px', fontFamily: 'var(--font-inter)' }}>{f.label}</div>
                      </button>
                    ))}
                  </div>
                </Section>

                {/* Text Size */}
                <Section label={`Text Size — ${settings.mainFontSize}px`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <StepBtn onClick={() => updateSettings({ mainFontSize: Math.max(14, settings.mainFontSize - 1) })} label="A−" small />
                    <input
                      type="range" min="14" max="30" step="1"
                      value={settings.mainFontSize}
                      onChange={e => updateSettings({ mainFontSize: parseInt(e.target.value) })}
                      style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
                    />
                    <StepBtn onClick={() => updateSettings({ mainFontSize: Math.min(30, settings.mainFontSize + 1) })} label="A+" />
                  </div>
                </Section>

                {/* Line Height */}
                <Section label={`Line Spacing — ${settings.lineHeight}`}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[1.4, 1.6, 1.8, 2.0, 2.2].map(v => (
                      <button
                        key={v}
                        onClick={() => updateSettings({ lineHeight: v })}
                        style={{
                          flex: 1,
                          padding: '6px 2px',
                          borderRadius: '8px',
                          border: `1.5px solid ${settings.lineHeight === v ? 'var(--primary)' : 'var(--card-border)'}`,
                          background: settings.lineHeight === v ? 'var(--primary-glow)' : 'transparent',
                          color: settings.lineHeight === v ? 'var(--primary)' : 'var(--text-muted)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </Section>

                {/* Divider */}
                <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
                  <div style={{
                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                    color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '14px',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <span style={{ flex: 1, height: '1px', background: 'var(--card-border)' }} />
                    Arabic / Quranic
                    <span style={{ flex: 1, height: '1px', background: 'var(--card-border)' }} />
                  </div>

                  {/* Arabic Font Preview */}
                  <div style={{
                    background: 'var(--background)',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    textAlign: 'center',
                    direction: 'rtl',
                    fontFamily: settings.arabicFontFamily,
                    fontSize: `${settings.arabicFontSize}px`,
                    color: 'var(--text-primary)',
                    lineHeight: 2,
                    marginBottom: '14px',
                    border: '1px solid var(--card-border)',
                  }}>
                    بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ
                  </div>

                  {/* Arabic Font Family */}
                  <Section label="Quranic Font">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {ARABIC_FONTS.map(f => (
                        <button
                          key={f.value}
                          onClick={() => updateSettings({ arabicFontFamily: f.value })}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '10px',
                            border: `2px solid ${settings.arabicFontFamily === f.value ? 'var(--primary)' : 'var(--card-border)'}`,
                            background: settings.arabicFontFamily === f.value ? 'var(--primary-glow)' : 'transparent',
                            color: settings.arabicFontFamily === f.value ? 'var(--primary)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'all 0.15s',
                          }}
                        >
                          <span style={{ fontSize: '12px', fontFamily: 'var(--font-inter)', fontWeight: 600 }}>{f.label}</span>
                          <span style={{ fontFamily: f.value, fontSize: '18px', direction: 'rtl' }}>{f.preview}</span>
                        </button>
                      ))}
                    </div>
                  </Section>

                  {/* Arabic Font Size */}
                  <div style={{ marginTop: '14px' }}>
                    <Section label={`Arabic Size — ${settings.arabicFontSize}px`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <StepBtn onClick={() => updateSettings({ arabicFontSize: Math.max(20, settings.arabicFontSize - 2) })} label="−" small />
                        <input
                          type="range" min="20" max="60" step="2"
                          value={settings.arabicFontSize}
                          onChange={e => updateSettings({ arabicFontSize: parseInt(e.target.value) })}
                          style={{ flex: 1, accentColor: '#10b981', cursor: 'pointer' }}
                        />
                        <StepBtn onClick={() => updateSettings({ arabicFontSize: Math.min(60, settings.arabicFontSize + 2) })} label="+" accent="#10b981" />
                      </div>
                    </Section>
                  </div>
                </div>
              </div>
            )}

            {/* ── PROFILE TAB ── */}
            {tab === 'profile' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {user ? (
                  <>
                    {/* Avatar */}
                    <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                      <div style={{
                        width: '64px', height: '64px', margin: '0 auto 12px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '26px', fontWeight: 800, color: '#fff',
                        boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
                      }}>
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {user.username}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        ☁️ Highlights & settings synced
                      </div>
                    </div>

                    {/* Stats placeholder */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr',
                      gap: '10px',
                    }}>
                      {[
                        { label: 'Theme', val: settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1) },
                        { label: 'Font size', val: `${settings.mainFontSize}px` },
                        { label: 'Arabic size', val: `${settings.arabicFontSize}px` },
                        { label: 'Line height', val: `${settings.lineHeight}` },
                      ].map(s => (
                        <div key={s.label} style={{
                          background: 'var(--background)',
                          borderRadius: '12px',
                          padding: '10px 14px',
                          border: '1px solid var(--card-border)',
                        }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>{s.val}</div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={logout}
                      style={{
                        padding: '10px',
                        borderRadius: '12px',
                        border: '1.5px solid #fca5a5',
                        background: '#fff1f2',
                        color: '#dc2626',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff1f2'}
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ textAlign: 'center', padding: '8px 0' }}>
                      <div style={{ fontSize: '40px', marginBottom: '10px' }}>📖</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Save your reading profile
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
                        Highlights and typography settings sync across all your devices. No password needed.
                      </div>
                    </div>

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <input
                        type="text"
                        value={usernameInput}
                        onChange={e => { setUsernameInput(e.target.value); setLoginError(''); }}
                        placeholder="Enter a nickname (e.g. alik)"
                        autoFocus
                        style={{
                          padding: '12px 16px',
                          borderRadius: '12px',
                          border: `1.5px solid ${loginError ? '#fca5a5' : 'var(--card-border)'}`,
                          background: 'var(--background)',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          outline: 'none',
                          fontFamily: 'var(--font-inter)',
                          transition: 'border-color 0.2s',
                        }}
                        onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                        onBlur={e => e.target.style.borderColor = loginError ? '#fca5a5' : 'var(--card-border)'}
                      />
                      {loginError && (
                        <div style={{ fontSize: '12px', color: '#dc2626', padding: '0 4px' }}>{loginError}</div>
                      )}
                      <button
                        type="submit"
                        style={{
                          padding: '12px',
                          borderRadius: '12px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                          color: '#fff',
                          fontSize: '14px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          boxShadow: '0 4px 16px rgba(79,70,229,0.35)',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                      >
                        Start Reading →
                      </button>
                    </form>

                    <div style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      textAlign: 'center',
                      lineHeight: 1.5,
                      padding: '0 4px',
                    }}>
                      🔒 No email or password. Your nickname is your key.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes settingsFadeIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{
        fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function StepBtn({ onClick, label, small, accent }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: small ? '28px' : '30px',
        height: '28px',
        borderRadius: '8px',
        border: '1.5px solid var(--card-border)',
        background: 'var(--background)',
        color: accent || 'var(--text-primary)',
        fontSize: small ? '11px' : '13px',
        fontWeight: 700,
        cursor: 'pointer',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = accent || 'var(--primary)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--card-border)'}
    >
      {label}
    </button>
  );
}
