'use client';
import { useEffect, useState, use } from 'react';
import Link from 'next/link';

export default function PlaylistPage({ params }) {
  const { playlist } = use(params);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`/api/videos/${playlist}`).then(r => r.json()).then(setData);
  }, [playlist]);

  const pl = data?.playlist;
  const videos = data?.videos || [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-ui)' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 24px', background: 'var(--surface)', boxShadow: '0 2px 12px var(--neu-dark)', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href="/" style={{ fontWeight: 800, color: 'var(--primary)', textDecoration: 'none' }}>Kütüphane</Link>
        <span style={{ color: 'var(--text-faint)' }}>/</span>
        <Link href="/videos" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.88rem' }}>Videos</Link>
        <span style={{ color: 'var(--text-faint)' }}>/</span>
        <span style={{ color: 'var(--text)', fontSize: '0.88rem', fontWeight: 600 }}>{pl?.title || playlist}</span>
      </nav>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        {!data && <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div className="loader" /></div>}
        {pl && (
          <>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>{pl.title}</h1>
            {pl.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '28px' }}>{pl.description}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {videos.map((v, idx) => (
                <Link key={v.slug} href={`/videos/${playlist}/${v.slug}`} style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', background: 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', borderRadius: '14px', padding: '14px 16px', transition: 'box-shadow 0.18s', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-neu-out)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow-neu-sm)'}>
                    <div style={{ width: '120px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, background: 'var(--surface-down)', aspectRatio: '16/9', position: 'relative' }}>
                      {v.youtubeId
                        ? <img src={`https://img.youtube.com/vi/${v.youtubeId}/mqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>▶</div>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 700, marginBottom: '4px' }}>Ep {idx + 1}</p>
                      <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{v.title}</p>
                      {v.description && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{v.description}</p>}
                      {v.hasSrt && <span style={{ fontSize: '0.68rem', color: 'var(--text-faint)', marginTop: '6px', display: 'block' }}>🇹🇷 Altyazı mevcut · çevrilebilir</span>}
                    </div>
                    <span style={{ color: 'var(--primary)', fontSize: '1.2rem', flexShrink: 0 }}>→</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
