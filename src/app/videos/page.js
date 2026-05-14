'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function VideosPage() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/videos').then(r => r.json()).then(d => { setPlaylists(d.playlists || []); setLoading(false); });
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-ui)' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 28px', background: 'var(--surface)', boxShadow: '0 2px 12px var(--neu-dark)', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)', textDecoration: 'none', letterSpacing: '-0.02em' }}>Kütüphane</Link>
        <span style={{ color: 'var(--text-faint)' }}>/</span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>📹 Videos</span>
        <div style={{ flex: 1 }} />
        <Link href="/videos/add" style={{ padding: '6px 12px', background: 'var(--primary)', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700 }}>+ Add Video</Link>
        <Link href="/" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'none' }}>← Library</Link>
      </nav>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>Video Dersler</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '32px' }}>Türkçe altyazılı, çevrilebilir video dersler</p>

        {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div className="loader" /></div>}

        {!loading && playlists.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📭</div>
            <p>No playlists yet. Add videos to <code>db/videos/</code></p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {playlists.map(pl => (
            <Link key={pl.slug} href={`/videos/${pl.slug}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-neu-sm)', borderRadius: '16px', overflow: 'hidden', transition: 'box-shadow 0.2s', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-neu-out)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow-neu-sm)'}
              >
                {pl.firstVideoId ? (
                  <img src={`https://img.youtube.com/vi/${pl.firstVideoId}/mqdefault.jpg`} alt={pl.title}
                    style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', aspectRatio: '16/9', background: 'var(--surface-down)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}>📹</div>
                )}
                <div style={{ padding: '16px' }}>
                  <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>{pl.title}</h2>
                  {pl.description && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>{pl.description}</p>}
                  <span style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 700 }}>{pl.videoCount} video →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
