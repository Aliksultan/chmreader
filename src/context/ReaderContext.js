'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ReaderContext = createContext();

export function ReaderProvider({ children }) {
  // ── User Profile ─────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);

  // ── Reader Settings ───────────────────────────────────────────────────────
  const [settings, setSettings] = useState({
    theme: 'light',
    mainFontFamily: 'var(--font-inter)',
    arabicFontFamily: 'var(--font-amiri)',
    mainFontSize: 18,
    arabicFontSize: 26,
    lineHeight: 1.8,
  });

  // ── Global Bookmarks (across all books) ───────────────────────────────────
  // Shape: { id, book, bookTitle, pageUrl, pageTitle, timestamp }
  const [bookmarks, setBookmarks] = useState([]);

  // ── Global Highlights Index (quotes for profile view) ─────────────────────
  // Shape: { id, book, bookTitle, pageId, text, color, note, timestamp }
  const [highlightsIndex, setHighlightsIndex] = useState([]);

  // ── Hydrate from localStorage + cloud on mount ────────────────────────────
  useEffect(() => {
    const savedUser = localStorage.getItem('rnk_user');
    if (savedUser) {
      try { setUser(JSON.parse(savedUser)); } catch { }
    }
    const savedSettings = localStorage.getItem('rnk_settings');
    if (savedSettings) {
      try { setSettings(prev => ({ ...prev, ...JSON.parse(savedSettings) })); } catch { }
    }
    const savedBookmarks = localStorage.getItem('rnk_bookmarks');
    if (savedBookmarks) {
      try { setBookmarks(JSON.parse(savedBookmarks)); } catch { }
    }
  }, []);

  // ── Apply theme class to <html> ───────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('rnk_settings', JSON.stringify(settings));
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark'); root.classList.remove('sepia');
    } else if (settings.theme === 'sepia') {
      root.classList.add('sepia'); root.classList.remove('dark');
    } else {
      root.classList.remove('dark', 'sepia');
    }
  }, [settings]);

  // ── Persist bookmarks locally ─────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('rnk_bookmarks', JSON.stringify(bookmarks));
  }, [bookmarks]);

  // ── Cloud sync: fetch settings + bookmarks + highlights on login ──────────
  const fetchCloudData = useCallback(async (uid) => {
    try {
      const [settingsRes, bookmarksRes, hlRes] = await Promise.all([
        fetch(`/api/sync/settings?username=${encodeURIComponent(uid)}`),
        fetch(`/api/sync/bookmarks?username=${encodeURIComponent(uid)}`),
        fetch(`/api/sync/highlights-global?username=${encodeURIComponent(uid)}`),
      ]);
      if (settingsRes.ok) {
        const d = await settingsRes.json();
        if (d.settings) setSettings(prev => ({ ...prev, ...d.settings }));
      }
      if (bookmarksRes.ok) {
        const d = await bookmarksRes.json();
        if (Array.isArray(d.bookmarks)) setBookmarks(d.bookmarks);
      }
      if (hlRes.ok) {
        const d = await hlRes.json();
        if (Array.isArray(d.highlights)) setHighlightsIndex(d.highlights);
      }
    } catch (e) {
      console.error('Cloud sync failed:', e);
    }
  }, []);

  useEffect(() => {
    if (user?.id) fetchCloudData(user.id);
  }, [user?.id, fetchCloudData]);

  // ── Login / Logout ────────────────────────────────────────────────────────
  const login = async (username) => {
    const newUser = { username, id: username.toLowerCase().replace(/\s+/g, '_') };
    setUser(newUser);
    localStorage.setItem('rnk_user', JSON.stringify(newUser));
    await fetchCloudData(newUser.id);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('rnk_user');
  };

  // ── Settings ──────────────────────────────────────────────────────────────
  const updateSettings = async (newSettings) => {
    const merged = { ...settings, ...newSettings };
    setSettings(merged);
    if (user) {
      try {
        await fetch('/api/sync/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user.id, settings: merged }),
        });
      } catch (e) { console.error('Settings sync failed', e); }
    }
  };

  // ── Bookmarks ─────────────────────────────────────────────────────────────
  const addBookmark = useCallback(async (bookmark) => {
    // bookmark: { book, bookTitle, pageUrl, pageTitle }
    const entry = { ...bookmark, id: crypto.randomUUID(), timestamp: Date.now() };
    setBookmarks(prev => {
      const exists = prev.some(b => b.pageUrl === entry.pageUrl);
      if (exists) return prev;
      const updated = [entry, ...prev];
      if (user) syncBookmarks(user.id, updated);
      return updated;
    });
  }, [user]); // eslint-disable-line

  const removeBookmark = useCallback(async (id) => {
    setBookmarks(prev => {
      const updated = prev.filter(b => b.id !== id);
      if (user) syncBookmarks(user.id, updated);
      return updated;
    });
  }, [user]); // eslint-disable-line

  const syncBookmarks = async (uid, list) => {
    try {
      await fetch('/api/sync/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uid, bookmarks: list }),
      });
    } catch (e) { console.error('Bookmark sync failed', e); }
  };

  // ── Highlights Global Index ───────────────────────────────────────────────
  const addToHighlightsIndex = useCallback(async (entry) => {
    // entry: { id, book, bookTitle, pageId, text, color, note, timestamp }
    setHighlightsIndex(prev => {
      const exists = prev.some(h => h.id === entry.id);
      if (exists) return prev;
      const updated = [entry, ...prev];
      if (user) syncHighlightsIndex(user.id, updated);
      return updated;
    });
  }, [user]); // eslint-disable-line

  const removeFromHighlightsIndex = useCallback(async (id) => {
    setHighlightsIndex(prev => {
      const updated = prev.filter(h => h.id !== id);
      if (user) syncHighlightsIndex(user.id, updated);
      return updated;
    });
  }, [user]); // eslint-disable-line

  const syncHighlightsIndex = async (uid, list) => {
    try {
      await fetch('/api/sync/highlights-global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uid, highlights: list }),
      });
    } catch (e) { console.error('Highlights index sync failed', e); }
  };

  return (
    <ReaderContext.Provider value={{
      user, login, logout,
      settings, updateSettings,
      bookmarks, addBookmark, removeBookmark,
      highlightsIndex, addToHighlightsIndex, removeFromHighlightsIndex,
    }}>
      {children}
    </ReaderContext.Provider>
  );
}

export function useReader() {
  return useContext(ReaderContext);
}
