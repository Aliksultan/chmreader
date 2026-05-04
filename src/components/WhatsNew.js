'use client';

import { useState, useEffect } from 'react';

const VERSION = 'v2-neumorphic'; // bump this string to show the popup again on next deploy

export default function WhatsNew({ forceShow = false, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (forceShow) { setVisible(true); return; }
    const seen = localStorage.getItem('whats_new_seen');
    if (seen !== VERSION) setVisible(true);
  }, [forceShow]);

  const dismiss = () => {
    localStorage.setItem('whats_new_seen', VERSION);
    setVisible(false);
    onClose?.();
  };

  if (!visible) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div style={{
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-neu-out)',
        borderRadius: '24px',
        width: '100%',
        maxWidth: '420px',
        overflow: 'hidden',
        animation: 'slideUp 0.25s cubic-bezier(.4,0,.2,1)',
      }}>
        {/* Header accent */}
        <div style={{
          background: 'linear-gradient(135deg, var(--primary), #00a0a0)',
          padding: '24px 28px 20px',
          color: '#fff',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '6px' }}>🎉</div>
          <h2 style={{
            margin: 0, fontSize: '1.2rem', fontWeight: 700,
            fontFamily: 'var(--font-ui)', letterSpacing: '0.02em',
          }}>Жаңа жаңарту!</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.85, fontFamily: 'var(--font-ui)' }}>
            Кітапхана жаңа мүмкіндіктермен толықты
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 28px' }}>
          <ul style={{
            listStyle: 'none', margin: 0, padding: 0,
            display: 'flex', flexDirection: 'column', gap: '14px',
          }}>
            {[
              { icon: '👤', text: 'Профиль жасап, мәтінді белгілей аласыз — белгілеулеріңіз профильде автоматты сақталады' },
              { icon: '✨', text: 'Белгіленген үзінділерді профильден кітап бетіне тікелей өтуге болады' },
              { icon: '🎨', text: 'Толықтай жаңа ыңғайлы дизайн (бета нұсқасы)' },
              { icon: '📚', text: 'RNK Кітапханасы қосылды' },
            ].map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{
                  width: '32px', height: '32px', borderRadius: '10px',
                  background: 'var(--surface)',
                  boxShadow: 'var(--shadow-neu-sm-in)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1rem', flexShrink: 0,
                }}>{item.icon}</span>
                <p style={{
                  margin: 0, fontSize: '0.85rem',
                  color: 'var(--text)', lineHeight: 1.6,
                  fontFamily: 'var(--font-ui)',
                  paddingTop: '4px',
                }}>{item.text}</p>
              </li>
            ))}
          </ul>

          <div style={{
            marginTop: '20px', padding: '14px 16px',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-neu-in)',
            borderRadius: '12px',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            <a href="https://t.me/anonaskbot?start=n37k833uklxykpfu" target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'var(--primary)', fontFamily: 'var(--font-ui)', fontSize: '0.82rem', fontWeight: 700 }}>
              <span>💬</span> Идеялар мен кері байланыс
            </a>
            <a href="https://send.monobank.ua/jar/4003035112072389" target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', fontSize: '0.82rem' }}>
              <span>☕</span> Демеу: 4003035112072389
            </a>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '0 28px 24px' }}>
          <button
            onClick={dismiss}
            style={{
              width: '100%', padding: '12px',
              background: 'var(--primary)', color: '#fff',
              border: 'none', borderRadius: '12px',
              fontFamily: 'var(--font-ui)', fontSize: '0.9rem', fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '4px 4px 12px rgba(0,102,102,0.3)',
              transition: 'all 0.15s',
            }}
          >
            Түсінікті, бастайық →
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity:0; transform:translateY(24px) scale(0.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes fadeIn {
          from { opacity:0; } to { opacity:1; }
        }
      `}</style>
    </div>
  );
}
