'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AddVideoPage() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState([]);
  
  // Form State
  const [url, setUrl] = useState('');
  const [youtubeId, setYoutubeId] = useState('');
  const [title, setTitle] = useState('');
  const [playlistId, setPlaylistId] = useState('');
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [episodeId, setEpisodeId] = useState('');
  const [srtFile, setSrtFile] = useState(null);
  
  // UI State
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch playlists on load
  useEffect(() => {
    fetch('/api/videos')
      .then(r => r.json())
      .then(d => {
        if (d.playlists) {
          setPlaylists(d.playlists);
          if (d.playlists.length > 0) {
            setPlaylistId(d.playlists[0].slug);
          }
        }
      });
  }, []);

  // Handle URL Paste to auto-parse metadata
  const handleUrlChange = async (e) => {
    const val = e.target.value;
    setUrl(val);
    setError('');

    if (val.includes('youtu')) {
      setIsParsing(true);
      try {
        const res = await fetch(`/api/videos/info?url=${encodeURIComponent(val)}`);
        const data = await res.json();
        
        if (res.ok) {
          setYoutubeId(data.youtubeId);
          setTitle(data.title);
          if (data.episodeId) {
            setEpisodeId(data.episodeId);
          }
        } else {
          setError(data.error || 'Failed to parse YouTube URL');
        }
      } catch (err) {
        setError('Network error while parsing URL');
      }
      setIsParsing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!youtubeId || !title || !playlistId || !episodeId || !srtFile) {
      setError('Please fill in all fields and select an SRT file.');
      return;
    }
    if (playlistId === 'NEW' && !newPlaylistTitle) {
      setError('Please provide a title for the new playlist.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const formData = new FormData();
    formData.append('youtubeId', youtubeId);
    formData.append('title', title);
    
    // If "NEW" is selected, generate a slug from the new title
    const finalPlaylistId = playlistId === 'NEW' 
      ? newPlaylistTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-') 
      : playlistId;
      
    formData.append('playlistId', finalPlaylistId);
    if (playlistId === 'NEW') {
      formData.append('newPlaylistTitle', newPlaylistTitle);
    }
    
    formData.append('episodeId', episodeId);
    formData.append('srtFile', srtFile);

    try {
      const res = await fetch('/api/videos/add', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (res.ok) {
        // Redirect to the newly created video page
        router.push(data.redirectUrl);
      } else {
        setError(data.error || 'Failed to save video');
        setIsSubmitting(false);
      }
    } catch (err) {
      setError('Network error while saving video');
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-ui)', padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '600px', background: 'var(--surface-up)', padding: '30px', borderRadius: '16px', boxShadow: 'var(--shadow-neu-lg)' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '12px' }}>
          <Link href="/videos" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '1rem', fontWeight: 700 }}>←</Link>
          <h1 style={{ fontSize: '1.4rem', color: 'var(--text)', margin: 0 }}>Add New Video</h1>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* URL Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>YouTube Link</label>
            <input 
              type="text" 
              value={url} 
              onChange={handleUrlChange}
              placeholder="https://youtu.be/..." 
              style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
              disabled={isParsing || isSubmitting}
            />
            {isParsing && <span style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>Extracting metadata from YouTube...</span>}
          </div>

          {/* Title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Video Title</label>
            <input 
              type="text" 
              value={title} 
              onChange={e => setTitle(e.target.value)}
              placeholder="Extracted automatically or type here..." 
              style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
              disabled={isSubmitting}
            />
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            {/* Playlist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 2 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Playlist</label>
              <select 
                value={playlistId} 
                onChange={e => setPlaylistId(e.target.value)}
                style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                disabled={isSubmitting}
              >
                {playlists.map(p => (
                  <option key={p.slug} value={p.slug}>{p.title}</option>
                ))}
                <option value="NEW">+ Create New Playlist</option>
              </select>
            </div>

            {/* Episode ID */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Episode ID</label>
              <input 
                type="text" 
                value={episodeId} 
                onChange={e => setEpisodeId(e.target.value)}
                placeholder="e.g. ep-02" 
                style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* New Playlist Title (Conditional) */}
          {playlistId === 'NEW' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>New Playlist Title</label>
              <input 
                type="text" 
                value={newPlaylistTitle} 
                onChange={e => setNewPlaylistTitle(e.target.value)}
                placeholder="My New Series..." 
                style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                disabled={isSubmitting}
              />
            </div>
          )}

          {/* SRT Upload */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Subtitles File (.srt)</label>
            <div style={{ padding: '20px', border: '2px dashed var(--surface-border)', borderRadius: '12px', textAlign: 'center', background: 'var(--surface)', cursor: 'pointer' }}>
              <input 
                type="file" 
                accept=".srt"
                onChange={e => setSrtFile(e.target.files[0])}
                style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting || !youtubeId}
            style={{ 
              padding: '14px', 
              borderRadius: '8px', 
              border: 'none', 
              background: (isSubmitting || !youtubeId) ? 'var(--surface-border)' : 'var(--primary)', 
              color: (isSubmitting || !youtubeId) ? 'var(--text-faint)' : '#fff', 
              fontWeight: 700, 
              fontSize: '1rem',
              cursor: (isSubmitting || !youtubeId) ? 'not-allowed' : 'pointer',
              marginTop: '10px',
              fontFamily: 'var(--font-ui)',
              transition: 'all 0.2s'
            }}
          >
            {isSubmitting ? 'Saving...' : 'Add Video'}
          </button>
        </form>
      </div>
    </div>
  );
}
