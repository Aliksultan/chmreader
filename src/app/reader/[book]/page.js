'use client';

import { useEffect, useState, use, useRef, useCallback } from 'react';
import Link from 'next/link';
import AiStudyHub from '../../components/AiStudyHub';

function TocNode({ item, cacheUrl, setCurrentPage, currentPage, level = 0, expandedPaths, onToggleExpand, nodePath }) {
  const hasChildren = item.children && item.children.length > 0;
  const isCurrent = currentPage === `${cacheUrl}/${item.local}`;
  const expanded = expandedPaths.has(nodePath);
  const nodeRef = useRef(null);

  // Auto-scroll active node into view
  useEffect(() => {
    if (isCurrent && nodeRef.current) {
      nodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isCurrent]);

  return (
    <li className="toc-item" style={{ marginLeft: level > 0 ? '1rem' : '0' }}>
      <div ref={nodeRef} className={`toc-item-header ${isCurrent ? 'active-node' : ''}`}>
        {hasChildren ? (
          <button
            className="toc-toggle"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(nodePath);
            }}
          >
            {expanded ? 'v' : '>'}
          </button>
        ) : (
          <span className="toc-toggle-spacer" />
        )}
        <button
          className={`toc-button ${!item.local ? 'toc-folder' : ''}`}
          onClick={() => {
            if (item.local) {
              setCurrentPage(`${cacheUrl}/${item.local}`);
            } else if (hasChildren) {
              onToggleExpand(nodePath);
            }
          }}
        >
          <span className="toc-icon">{hasChildren ? (expanded ? '📂' : '📁') : '📄'}</span>
          <span className="toc-text" title={item.name}>{item.name}</span>
        </button>
      </div>
      {hasChildren && expanded && (
        <ul className="toc-list sub-list">
          {item.children.map((child, idx) => (
            <TocNode
              key={idx}
              item={child}
              cacheUrl={cacheUrl}
              setCurrentPage={setCurrentPage}
              currentPage={currentPage}
              level={level + 1}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              nodePath={`${nodePath}/${idx}`}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Reader({ params, searchParams }) {
  const unwrappedParams = use(params);
  const unwrappedSearchParams = use(searchParams);
  const book = decodeURIComponent(unwrappedParams.book);
  const targetPage = unwrappedSearchParams.page ? decodeURIComponent(unwrappedSearchParams.page) : null;
  const [cacheUrl, setCacheUrl] = useState(null);
  const [toc, setToc] = useState([]);
  const [tocMap, setTocMap] = useState({});
  const [flattenedToc, setFlattenedToc] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [splitPercent, setSplitPercent] = useState(50);
  const compareContentRef = useRef(null);

  // New Toolbar States
  const [theme, setTheme] = useState('system');
  const [zoomLevel, setZoomLevel] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('reader_zoom');
      return saved ? parseInt(saved, 10) : 100;
    }
    return 100;
  });
  const [tocFilter, setTocFilter] = useState('');
  const [iframeLoading, setIframeLoading] = useState(false);
  const scrollPositionsRef = useRef({});
  const [searchQuery, setSearchQuery] = useState('');

  // Book-Wide Search
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchModalPage, setSearchModalPage] = useState(1);
  const RESULTS_PER_PAGE = 50;
  const iframeRef = useRef(null);
  const pendingHighlightRef = useRef(null);

  // Translation States
  const [isTranslating, setIsTranslating] = useState(false);
  const [activeLang, setActiveLang] = useState('tr'); // 'tr' = original, 'ru', 'kk'
  const originalHtmlRef = useRef(null);
  const translationCacheRef = useRef({}); // { ru: '<html>...', kk: '<html>...' }
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [pendingLang, setPendingLang] = useState(null);

  // AI Features States
  const [aiResult, setAiResult] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiMode, setAiMode] = useState(''); // 'summarize' | 'explain'
  const [pendingAiMode, setPendingAiMode] = useState(null);

  // Comparative Mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareHtml, setCompareHtml] = useState('');

  // Translation Editing
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef(null);

  // Bookmarks
  const [bookmarks, setBookmarks] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // Sidebar tab
  const [sidebarTab, setSidebarTab] = useState('toc'); // 'toc' | 'bookmarks'

  // Premium Mobile UI State
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);
  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false);
  const [isNavVisible, setIsNavVisible] = useState(true);

  // Load saved API key, bookmarks, and persist zoom
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setGeminiApiKey(savedKey);
    const savedBookmarks = localStorage.getItem(`bookmarks_${book}`);
    if (savedBookmarks) {
      try { setBookmarks(JSON.parse(savedBookmarks)); } catch (e) { }
    }
  }, []);

  // Persist zoom level
  useEffect(() => {
    localStorage.setItem('reader_zoom', String(zoomLevel));
  }, [zoomLevel]);

  // Navigation helpers
  const getCurrentIndex = () => {
    if (!flattenedToc.length || !currentPage) return -1;
    const clean = currentPage.split('?')[0].split('#')[0];
    return flattenedToc.findIndex(local => clean.endsWith('/' + local.split('?')[0].split('#')[0]));
  };

  const navigatePrev = () => {
    const idx = getCurrentIndex();
    if (idx > 0) {
      saveScrollPosition();
      setIframeLoading(true);
      setCurrentPage(`${cacheUrl || `/cache/${book.replace('.chm', '')}`}/${flattenedToc[idx - 1]}`);
    }
  };

  const navigateNext = () => {
    const idx = getCurrentIndex();
    if (idx !== -1 && idx < flattenedToc.length - 1) {
      saveScrollPosition();
      setIframeLoading(true);
      setCurrentPage(`${cacheUrl || `/cache/${book.replace('.chm', '')}`}/${flattenedToc[idx + 1]}`);
    }
  };

  const toggleBookmark = () => {
    if (!currentPage) return;
    const clean = currentPage.split('?')[0].split('#')[0];
    const tocIndex = getCurrentIndex();
    const title = tocIndex !== -1 ? (tocMap[flattenedToc[tocIndex]] || flattenedToc[tocIndex]) : clean.split('/').pop();
    const exists = bookmarks.some(b => b.url === clean);
    let updated;
    if (exists) {
      updated = bookmarks.filter(b => b.url !== clean);
    } else {
      updated = [...bookmarks, { url: clean, title, page: currentPage, addedAt: Date.now() }];
    }
    setBookmarks(updated);
    localStorage.setItem(`bookmarks_${book}`, JSON.stringify(updated));
  };

  const isBookmarked = () => {
    if (!currentPage) return false;
    const clean = currentPage.split('?')[0].split('#')[0];
    return bookmarks.some(b => b.url === clean);
  };

  // Find the path in the TOC tree to a given local file
  const findPathInToc = useCallback((nodes, targetLocal, currentPath = '') => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const thisPath = `${currentPath}/${i}`;
      if (node.local && targetLocal.endsWith(node.local.split('?')[0].split('#')[0])) {
        return [thisPath];
      }
      if (node.children) {
        const childResult = findPathInToc(node.children, targetLocal, thisPath);
        if (childResult) {
          return [thisPath, ...childResult];
        }
      }
    }
    return null;
  }, []);

  // Expand the TOC path for a given page URL
  const expandTocPathForPage = useCallback((pageUrl) => {
    if (!toc.length || !pageUrl) return;
    const pathResult = findPathInToc(toc, pageUrl);
    if (pathResult) {
      setExpandedPaths(prev => {
        const next = new Set(prev);
        pathResult.forEach(p => next.add(p));
        return next;
      });
    }
  }, [toc, findPathInToc]);

  const onToggleExpand = useCallback((nodePath) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(nodePath)) {
        next.delete(nodePath);
      } else {
        next.add(nodePath);
      }
      return next;
    });
  }, []);

  // Expand TOC path whenever currentPage changes
  useEffect(() => {
    if (currentPage) {
      expandTocPathForPage(currentPage);
    }
  }, [currentPage, expandTocPathForPage]);

  // ─── Editor helpers ───
  const execFormat = (cmd, value = null) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  };

  const startEditing = () => {
    if (activeLang === 'tr' || !translationCacheRef.current[activeLang]) return;
    setIsEditing(true);
    // Force compare mode so we see original + editable translation side by side
    if (!compareMode) {
      setCompareMode(true);
      setCompareHtml(translationCacheRef.current[activeLang]);
      if (originalHtmlRef.current && iframeRef.current?.contentWindow?.document?.body) {
        iframeRef.current.contentWindow.document.body.innerHTML = originalHtmlRef.current;
        applyIframeTheme(activeLang);
      }
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    // Revert the compare panel to the saved translation
    if (translationCacheRef.current[activeLang]) {
      setCompareHtml(translationCacheRef.current[activeLang]);
    }
  };

  const saveTranslation = async () => {
    if (!editorRef.current) return;
    const editedHtml = editorRef.current.innerHTML;
    const pageKey = (currentPage || '').replace(/^.*\/cache\//, '').replace(/[^a-zA-Z0-9]/g, '_');

    setIsSaving(true);
    try {
      const res = await fetch('/api/translate/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageKey, targetLang: activeLang, html: editedHtml, password: '' })
      });
      const data = await res.json();
      if (data.error) {
        alert('Save failed: ' + data.error);
      } else {
        // Persist to in-memory cache so the app uses the edited version
        translationCacheRef.current[activeLang] = editedHtml;
        setCompareHtml(editedHtml);
        setIsEditing(false);
      }
    } catch (err) {
      alert('Save error: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Translation (cache-first – no API key needed for cached) ───
  const handleTranslate = async (targetLang) => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;
    const doc = iframeRef.current.contentWindow.document;
    if (!doc.body) return;

    // Save original HTML once
    if (!originalHtmlRef.current) {
      originalHtmlRef.current = doc.body.innerHTML;
    }

    // Exit editing when switching languages
    setIsEditing(false);

    // Switching back to Turkish — just restore original
    if (targetLang === 'tr') {
      doc.body.innerHTML = originalHtmlRef.current;
      setActiveLang('tr');
      applyIframeTheme('tr');
      return;
    }

    const pageKey = (currentPage || '').replace(/^.*\/cache\//, '').replace(/[^a-zA-Z0-9]/g, '_');

    // 1) In-memory cache
    if (translationCacheRef.current[targetLang]) {
      setActiveLang(targetLang);
      if (compareMode) {
        setCompareHtml(translationCacheRef.current[targetLang]);
        doc.body.innerHTML = originalHtmlRef.current;
      } else {
        doc.body.innerHTML = translationCacheRef.current[targetLang];
      }
      applyIframeTheme(targetLang);
      return;
    }

    // 2) Call API (checks Redis first, then translates if API key present)
    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = originalHtmlRef.current;
      const bodyText = tempDiv.innerText || '';
      if (!bodyText.trim()) return;

      setIsTranslating(true);

      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: bodyText, targetLang, apiKey: geminiApiKey, pageKey })
      });

      const data = await res.json();

      // No cache and no API key → prompt for key
      if (res.status === 401 || data.error === 'API_KEY_REQUIRED') {
        setIsTranslating(false);
        setPendingLang(targetLang);
        setShowApiKeyInput(true);
        return;
      }

      if (data.error) {
        alert(`Translation error: ${data.error}`);
      } else {
        const translatedHtml = data.translation;
        translationCacheRef.current[targetLang] = translatedHtml;
        setActiveLang(targetLang);
        if (compareMode) {
          setCompareHtml(translatedHtml);
        } else {
          doc.body.innerHTML = translatedHtml;
        }
        applyIframeTheme(targetLang);
      }
    } catch (err) {
      alert(`Translation error: ${err.message}`);
    } finally {
      setIsTranslating(false);
    }
  };

  // Reset original HTML when page changes
  useEffect(() => {
    originalHtmlRef.current = null;
    translationCacheRef.current = {};
    setActiveLang('tr');
    setCompareHtml('');
    setCompareMode(false);
  }, [currentPage]);

  const handleRandomSection = () => {
    if (flattenedToc.length === 0) return;
    const randomIndex = Math.floor(Math.random() * flattenedToc.length);
    const newPage = `${cacheUrl || `/cache/${book.replace('.chm', '')}`}/${flattenedToc[randomIndex]}`;
    setCurrentPage(newPage);
    setSidebarOpen(true);
  };

  const handleAi = async (mode) => {
    if (!geminiApiKey) {
      setPendingAiMode(mode);
      setShowApiKeyInput(true);
      return;
    }
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;

    const doc = iframeRef.current.contentWindow.document;
    if (!doc.body) return;

    // Use original text if we have it, otherwise use current
    const bodyText = originalHtmlRef.current
      ? (() => { const temp = document.createElement('div'); temp.innerHTML = originalHtmlRef.current; return temp.innerText; })()
      : doc.body.innerText || '';

    if (!bodyText.trim()) return;

    setIsAiLoading(true);
    setShowAiPanel(true);
    setAiMode(mode);
    setAiResult('');

    // Determine response language based on active translation
    const lang = activeLang === 'tr' ? 'ru' : activeLang;

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: bodyText,
          mode: mode,
          lang: lang,
          apiKey: geminiApiKey
        })
      });

      const data = await res.json();
      if (data.error) {
        setAiResult(`Error: ${data.error}`);
      } else {
        setAiResult(data.result);
      }
    } catch (err) {
      setAiResult(`Error: ${err.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const formatHierarchy = (res) => {
    let volume = res.hierarchy && res.hierarchy.length > 0 ? res.hierarchy[0] : res.book;
    let book = res.book;
    let section = res.hierarchy && res.hierarchy.length > 1 ? res.hierarchy.slice(1).join(' ➔ ') : res.file;

    let parts = [volume];
    if (book && book !== volume) parts.push(book);
    if (section && section !== book && section !== volume) parts.push(section);

    return parts.join(' ➔ ');
  };

  // Theme Sync
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.remove('dark', 'light');
    }
  }, [theme]);

  // Read Progress Save
  useEffect(() => {
    if (currentPage && !loading && !error) {
      localStorage.setItem(`chm_progress_${book}`, currentPage);
    }
  }, [currentPage, book, loading, error]);

  useEffect(() => {
    fetch(`/api/read/${encodeURIComponent(book)}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to decompile book');
        return res.json();
      })
      .then(data => {
        setCacheUrl(data.cacheUrl);
        return fetch(`/api/toc/${encodeURIComponent(book)}`).then(res => res.json()).then(tocData => ({ ...data, tocData }));
      })
      .then(({ cacheUrl, tocData }) => {
        setToc(tocData.toc || []);

        const buildTocMap = (nodes) => {
          let map = {};
          for (const node of nodes) {
            if (node.local) map[node.local] = node.name;
            if (node.children) Object.assign(map, buildTocMap(node.children));
          }
          return map;
        };
        setTocMap(buildTocMap(tocData.toc || []));

        const flattenList = (nodes) => {
          let list = [];
          for (const node of nodes) {
            if (node.local) list.push(node.local);
            if (node.children) list = list.concat(flattenList(node.children));
          }
          return list;
        };
        setFlattenedToc(flattenList(tocData.toc || []));

        // Restore progress or find first link
        const savedPage = localStorage.getItem(`chm_progress_${book}`);

        if (targetPage) {
          // If a specific page is requested via URL, load it
          setCurrentPage(`${cacheUrl || `/cache/${book.replace('.chm', '')}`}/${targetPage}`);
        } else if (savedPage) {
          // Otherwise load saved progress
          setCurrentPage(savedPage);
        } else {
          let firstLink = null;
          const findFirstLink = (nodes) => {
            for (const node of nodes) {
              if (node.local) return node.local;
              if (node.children) {
                const childLink = findFirstLink(node.children);
                if (childLink) return childLink;
              }
            }
            return null;
          };

          if (tocData.toc && tocData.toc.length > 0) {
            firstLink = findFirstLink(tocData.toc);
            if (firstLink) {
              setCurrentPage(`${cacheUrl || `/cache/${book.replace('.chm', '')}`}/${firstLink}`);
            } else {
              setCurrentPage(`${cacheUrl}/index.htm`);
            }
          }
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [book]);

  // Book-wide search effect
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults(null);
      setIsSearching(false);
      setIsSearchModalOpen(false);
      setSearchModalPage(1);
      return;
    }

    setIsSearching(true);
    const delayDebounceFn = setTimeout(() => {
      fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          targetBook: book.replace('.chm', '').replace('.CHM', '')
        })
      })
        .then(res => res.json())
        .then(data => {
          setSearchResults(data.results || []);
          setIsSearching(false);
          setSearchModalPage(1);
        })
        .catch(err => {
          console.error(err);
          setIsSearching(false);
        });
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, book]);

  // Keyboard shortcuts (Escape + ← →)
  useEffect(() => {
    const handleKeydown = (e) => {
      // Don't trigger if typing in an input, textarea, or contentEditable
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.target.isContentEditable) return;
      if (e.key === 'Escape') setSearchQuery('');
      if (e.key === 'ArrowLeft') navigatePrev();
      if (e.key === 'ArrowRight') navigateNext();
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [flattenedToc, currentPage, cacheUrl]);

  // Swipe gestures on mobile
  useEffect(() => {
    const main = document.querySelector('.main-content');
    if (!main) return;
    let startX = 0, startY = 0;
    const onStart = (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onEnd = (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx > 0) navigatePrev();
        else navigateNext();
      }
    };
    main.addEventListener('touchstart', onStart, { passive: true });
    main.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      main.removeEventListener('touchstart', onStart);
      main.removeEventListener('touchend', onEnd);
    };
  }, [flattenedToc, currentPage, cacheUrl]);

  // Scroll sync in compare mode
  useEffect(() => {
    if (!compareMode || !compareHtml) return;
    const iframe = iframeRef.current;
    const compareEl = compareContentRef.current;
    if (!iframe || !compareEl) return;
    let syncing = false;
    const syncFromIframe = () => {
      if (syncing) return;
      syncing = true;
      try {
        const doc = iframe.contentWindow.document;
        const maxScroll = doc.documentElement.scrollHeight - doc.documentElement.clientHeight;
        const pct = maxScroll > 0 ? doc.documentElement.scrollTop / maxScroll : 0;
        const compareMax = compareEl.scrollHeight - compareEl.clientHeight;
        compareEl.scrollTop = pct * compareMax;
      } catch (e) { }
      setTimeout(() => { syncing = false; }, 50);
    };
    try {
      iframe.contentWindow.addEventListener('scroll', syncFromIframe);
    } catch (e) { }
    return () => {
      try { iframe.contentWindow.removeEventListener('scroll', syncFromIframe); } catch (e) { }
    };
  }, [compareMode, compareHtml, currentPage]);

  // Pinch-to-zoom on mobile
  useEffect(() => {
    let initialDist = 0;
    let initialZoom = zoomLevel;
    const getDistance = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        initialDist = getDistance(e.touches);
        initialZoom = zoomLevel;
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 2) {
        const dist = getDistance(e.touches);
        const scale = dist / initialDist;
        const newZoom = Math.max(50, Math.min(200, Math.round(initialZoom * scale)));
        setZoomLevel(newZoom);
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, [zoomLevel]);

  // Save scroll position before page change
  const saveScrollPosition = () => {
    try {
      if (currentPage && iframeRef.current?.contentWindow?.document?.documentElement) {
        scrollPositionsRef.current[currentPage] = iframeRef.current.contentWindow.document.documentElement.scrollTop;
      }
    } catch (e) { }
  };

  // Restore scroll position after page load
  const restoreScrollPosition = (page) => {
    const saved = scrollPositionsRef.current[page];
    if (saved && iframeRef.current?.contentWindow) {
      setTimeout(() => {
        try { iframeRef.current.contentWindow.scrollTo(0, saved); } catch (e) { }
      }, 100);
    }
  };

  const handleIframeLoad = () => {
    setIframeLoading(false);
    applyZoom();
    applyIframeTheme(activeLang);
    restoreScrollPosition(currentPage);
    // Highlight search term if we navigated from a search result
    if (pendingHighlightRef.current && iframeRef.current?.contentWindow) {
      const term = pendingHighlightRef.current;
      pendingHighlightRef.current = null;
      try {
        const doc = iframeRef.current.contentWindow.document;
        const body = doc.body;
        if (!body) return;
        // Use TreeWalker to find text nodes containing the term
        const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
        let firstMatch = null;
        const matches = [];
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const idx = node.textContent.toLowerCase().indexOf(term.toLowerCase());
          if (idx !== -1) {
            matches.push({ node, idx });
          }
        }
        // Wrap matches in <mark> elements
        matches.forEach(({ node, idx }) => {
          const range = doc.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + term.length);
          const mark = doc.createElement('mark');
          mark.className = 'search-highlight';
          mark.style.cssText = 'background: #fbbf24; color: #1a1a1a; padding: 1px 3px; border-radius: 3px; transition: background 0.5s;';
          range.surroundContents(mark);
          if (!firstMatch) firstMatch = mark;
        });
        // Scroll to first match
        if (firstMatch) {
          firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Add a pulsing effect
          firstMatch.style.background = '#f59e0b';
          firstMatch.style.boxShadow = '0 0 8px rgba(245, 158, 11, 0.6)';
        }
        // Remove highlights after 7 seconds
        setTimeout(() => {
          try {
            const marks = doc.querySelectorAll('mark.search-highlight');
            marks.forEach(m => {
              m.style.background = 'transparent';
              m.style.boxShadow = 'none';
              setTimeout(() => {
                const parent = m.parentNode;
                if (parent) {
                  parent.replaceChild(doc.createTextNode(m.textContent), m);
                  parent.normalize();
                }
              }, 500);
            });
          } catch (e) { }
        }, 7000);
      } catch (e) { console.warn('Highlight injection failed', e); }
    }

    // Auto-hide navigation on scroll and toggle on tap
    try {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        const win = iframeRef.current.contentWindow;
        const doc = win.document;
        let lastScrollY = win.scrollY || doc.documentElement.scrollTop;
        
        win.addEventListener('scroll', () => {
          const currentScrollY = win.scrollY || doc.documentElement.scrollTop;
          if (currentScrollY > lastScrollY + 30) {
            setIsNavVisible(false);
            lastScrollY = currentScrollY;
          } else if (currentScrollY < lastScrollY - 30 || currentScrollY <= 10) {
            setIsNavVisible(true);
            lastScrollY = currentScrollY;
          }
        }, { passive: true });

        // Tapping the text toggles the UI bars
        doc.body.addEventListener('click', (e) => {
          if (e.target.tagName !== 'A' && e.target.tagName !== 'BUTTON') {
            setIsNavVisible(v => !v);
          }
        }, { passive: true });
      }
    } catch (e) { console.warn('Scroll injection failed', e); }
  };

  const applyZoom = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.document.body.style.zoom = `${zoomLevel}%`;
      } catch (e) {
        console.warn('Cannot apply zoom to iframe (cross-origin or sandboxed)', e);
      }
    }
    // Also apply zoom to compare pane
    if (compareContentRef.current) {
      compareContentRef.current.style.zoom = `${zoomLevel}%`;
    }
  };

  const handleSplitDrag = (e) => {
    e.preventDefault();
    const wrapper = e.target.closest('.iframe-wrapper');
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const isVertical = rect.width < 768; // mobile stacks vertically

    const onMove = (moveEvent) => {
      const clientPos = moveEvent.touches ? moveEvent.touches[0] : moveEvent;
      let pct;
      if (isVertical) {
        pct = ((clientPos.clientY - rect.top) / rect.height) * 100;
      } else {
        pct = ((clientPos.clientX - rect.left) / rect.width) * 100;
      }
      setSplitPercent(Math.max(20, Math.min(80, pct)));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove);
    document.addEventListener('touchend', onUp);
  };

  const applyIframeTheme = (currentLang = activeLang) => {
    // Inject CSS to fix dark mode text contrast issues on legacy HTML
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        const doc = iframeRef.current.contentWindow.document;
        const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

        if (isDark) {
          let style = doc.getElementById('dark-theme-override');
          if (!style) {
            style = doc.createElement('style');
            style.id = 'dark-theme-override';
            doc.head.appendChild(style);
          }
          // Force all elements to light text and no background so the body background shows through
          style.innerHTML = `
            html, body {
              background-color: #1e293b !important;
              color: #f8fafc !important;
            }
            p, div, span, td, th, li, a, h1, h2, h3, h4, h5, h6, font {
              color: #e2e8f0 !important;
              background-color: transparent !important;
              border-color: #334155 !important;
            }
            table, tr, td, th {
              border-color: #334155 !important;
            }
            a {
              color: #818cf8 !important;
            }
          `;
        } else {
          const style = doc.getElementById('dark-theme-override');
          if (style) style.remove();
          doc.body.style.backgroundColor = '';
          doc.body.style.color = '';
        }

        let responsiveStyle = doc.getElementById('responsive-override');
        if (!responsiveStyle) {
          responsiveStyle = doc.createElement('style');
          responsiveStyle.id = 'responsive-override';
          doc.head.appendChild(responsiveStyle);
        }
        
        // Use the parent window width to determine if we need mobile padding blockouts
        const isMobileView = window.innerWidth <= 1024;
        
        // Apply comfortable reading layout to ALL pages, native or translated
        responsiveStyle.innerHTML = `
          body {
            max-width: 800px !important;
            margin: 0 auto !important;
            padding: ${isMobileView ? '80px 24px 100px 24px' : '30px 40px'} !important;
            font-size: 115% !important;
            line-height: 1.6 !important;
          }
          img {
            max-width: 100% !important;
            height: auto !important;
            border-radius: 8px;
          }
        `;

        // Inject readable typography for translated content
        const isTranslated = currentLang && currentLang !== 'tr';
        let readableStyle = doc.getElementById('readable-typography');
        if (isTranslated) {
          if (!readableStyle) {
            readableStyle = doc.createElement('style');
            readableStyle.id = 'readable-typography';
            doc.head.appendChild(readableStyle);
          }
          readableStyle.innerHTML = `
            body {
              font-family: 'Georgia', 'Times New Roman', 'Noto Serif', serif !important;
              line-height: 1.85 !important;
              padding: 20px !important;
              max-width: 720px !important;
              margin: 0 auto !important;
              font-size: 18px !important;
              letter-spacing: 0.01em !important;
              word-spacing: 0.05em !important;
            }
            p, div {
              margin-bottom: 1em !important;
              text-align: justify !important;
              text-justify: inter-word !important;
            }
            h1, h2, h3, h4, h5, h6 {
              font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif !important;
              line-height: 1.3 !important;
              margin-top: 1.5em !important;
              margin-bottom: 0.6em !important;
              text-align: left !important;
            }
            h1 { font-size: 1.6em !important; }
            h2 { font-size: 1.35em !important; }
            h3 { font-size: 1.15em !important; }
            blockquote {
              border-left: 3px solid #6366f1 !important;
              padding-left: 16px !important;
              margin: 1.2em 0 !important;
              font-style: italic !important;
              opacity: 0.9;
            }
            ul, ol {
              padding-left: 24px !important;
              margin-bottom: 1em !important;
            }
            li {
              margin-bottom: 0.4em !important;
            }
            img {
              max-width: 100% !important;
              height: auto !important;
              border-radius: 6px;
            }
            .arabic-text {
              font-family: 'Amiri', 'Traditional Arabic', 'Scheherazade New', 'Arabic Typesetting', serif !important;
              font-size: 2em !important;
              line-height: 1.6 !important;
              direction: rtl;
              display: inline-block;
              margin: 0 4px;
            }
          `;

          // Use a TreeWalker to safely find and wrap Arabic text in translation to make it 2x larger
          try {
            const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
            const nodesToReplace = [];
            while (walker.nextNode()) {
              const node = walker.currentNode;
              const parent = node.parentElement;
              if (!parent || parent.tagName === 'STYLE' || parent.tagName === 'SCRIPT' || parent.classList.contains('arabic-text')) {
                continue;
              }
              if (/[\u0600-\u06FF]/.test(node.nodeValue)) {
                nodesToReplace.push(node);
              }
            }

            nodesToReplace.forEach(node => {
              // Regex: 1+ Arabic chars, followed by 0+ groups of (spaces/punctuation + 1+ Arabic chars)
              const arabicRegex = /([\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+(?:[ \t\n\r\.,،؛؟()«»"'-]+[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+)*)/;
              const parts = node.nodeValue.split(arabicRegex);
              if (parts.length > 1) {
                const fragment = doc.createDocumentFragment();
                parts.forEach(part => {
                  if (arabicRegex.test(part)) {
                    const span = doc.createElement('span');
                    span.className = 'arabic-text';
                    span.dir = 'rtl';
                    span.textContent = part;
                    fragment.appendChild(span);
                  } else if (part.length > 0) {
                    fragment.appendChild(doc.createTextNode(part));
                  }
                });
                if (node.parentNode) {
                  node.parentNode.replaceChild(fragment, node);
                }
              }
            });
          } catch (err) {
            console.error('Error scaling Arabic text:', err);
          }
        } else if (readableStyle) {
          readableStyle.remove();
        }
      } catch (e) { }
    }
  };

  useEffect(() => {
    applyZoom();
  }, [zoomLevel]);

  useEffect(() => {
    applyIframeTheme(activeLang);
  }, [theme, activeLang]);

  // If there's an active result search string, inject it into the iframe after load
  // (Optional feature, omitting for now to keep things stable)

  // Progress calculation
  const currentIndex = getCurrentIndex();
  const progressPercent = flattenedToc.length > 0 ? ((currentIndex + 1) / flattenedToc.length) * 100 : 0;

  // Build breadcrumb from TOC hierarchy
  const getBreadcrumb = () => {
    if (!currentPage || !toc) return [book.replace('.chm', '')];

    const clean = currentPage.split('?')[0].split('#')[0];

    const findPath = (nodes, currentPath) => {
      for (const node of nodes) {
        const pathObj = [...currentPath, node.name];
        if (node.local && clean.endsWith('/' + node.local)) {
          return pathObj;
        }
        if (node.children && node.children.length > 0) {
          const found = findPath(node.children, pathObj);
          if (found) return found;
        }
      }
      return null;
    };

    const foundPath = findPath(toc, []);

    if (foundPath) {
      if (foundPath[0] === book.replace('.chm', '')) {
        return foundPath;
      }
      return [book.replace('.chm', ''), ...foundPath];
    }

    if (tocMap) {
      for (const [local, name] of Object.entries(tocMap)) {
        if (clean.endsWith('/' + local)) return [book.replace('.chm', ''), name];
      }
    }

    return [book.replace('.chm', '')];
  };
  const breadcrumb = getBreadcrumb();

  // Filter TOC nodes recursively
  const filterTocNodes = (nodes, query) => {
    if (!query.trim()) return nodes;
    const q = query.toLowerCase();
    return nodes.reduce((acc, node) => {
      const nameMatch = node.name.toLowerCase().includes(q);
      const filteredChildren = node.children ? filterTocNodes(node.children, query) : [];
      if (nameMatch || filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren });
      }
      return acc;
    }, []);
  };
  const filteredToc = filterTocNodes(toc, tocFilter);

  // Swipe hint (first visit only, defer to avoid hydration mismatch)
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem('swipe_hint_seen')) setShowSwipeHint(true);
  }, []);
  const dismissSwipeHint = () => {
    setShowSwipeHint(false);
    localStorage.setItem('swipe_hint_seen', '1');
  };

  const toggleCompareMode = () => {
    const next = !compareMode;
    setCompareMode(next);
    if (next && activeLang !== 'tr' && translationCacheRef.current[activeLang]) {
      setCompareHtml(translationCacheRef.current[activeLang]);
      if (originalHtmlRef.current && iframeRef.current?.contentWindow?.document?.body) {
        iframeRef.current.contentWindow.document.body.innerHTML = originalHtmlRef.current;
        applyIframeTheme('tr');
      }
    } else if (!next && activeLang !== 'tr' && translationCacheRef.current[activeLang]) {
      if (iframeRef.current?.contentWindow?.document?.body) {
        iframeRef.current.contentWindow.document.body.innerHTML = translationCacheRef.current[activeLang];
        applyIframeTheme(activeLang);
      }
      setCompareHtml('');
    }
  };

  return (
    <div className="reader-layout">
      {/* Reading Progress Bar */}
      {flattenedToc.length > 0 && (
        <div className="progress-bar-container" title={`Section ${currentIndex + 1} of ${flattenedToc.length}`}>
          <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header glass-panel">
          <Link href="/" className="back-button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            <span>Library</span>
          </Link>
          <button
            className="icon-button close-sidebar-btn"
            onClick={() => setSidebarOpen(false)}
            title="Close Sidebar"
          >
            ✕
          </button>
        </div>

        <div className="sidebar-content">
          <h2 className="book-title-sidebar">{book.replace('.chm', '')}</h2>

          <div className="sidebar-tabs">
            <button className={`sidebar-tab ${sidebarTab === 'toc' ? 'active' : ''}`} onClick={() => setSidebarTab('toc')}>
              📖 Contents
            </button>
            <button className={`sidebar-tab ${sidebarTab === 'bookmarks' ? 'active' : ''}`} onClick={() => setSidebarTab('bookmarks')}>
              ⭐ Bookmarks {bookmarks.length > 0 && <span className="bookmark-count">{bookmarks.length}</span>}
            </button>
          </div>

          {sidebarTab === 'toc' ? (
            <>
              {/* TOC Filter */}
              <div className="toc-filter-wrap">
                <input
                  className="toc-filter-input"
                  type="text"
                  placeholder="Filter chapters..."
                  value={tocFilter}
                  onChange={e => setTocFilter(e.target.value)}
                />
                {tocFilter && <button className="toc-filter-clear" onClick={() => setTocFilter('')}>✕</button>}
              </div>
              {loading ? (
                <div className="loader-container-small">
                  <div className="loader small"></div>
                </div>
              ) : error ? (
                <div className="error-text">Failed to load content</div>
              ) : (
                <ul className="toc-list root-list">
                  {filteredToc.map((item, index) => (
                    <TocNode
                      key={index}
                      item={item}
                      cacheUrl={cacheUrl}
                      setCurrentPage={(page) => { saveScrollPosition(); setIframeLoading(true); setCurrentPage(page); setSidebarOpen(false); }}
                      currentPage={currentPage}
                      expandedPaths={expandedPaths}
                      onToggleExpand={onToggleExpand}
                      nodePath={`/${index}`}
                    />
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="bookmarks-list">
              {bookmarks.length === 0 ? (
                <div className="empty-bookmarks">
                  <p>No bookmarks yet</p>
                  <p className="text-small">Click the ⭐ button in the toolbar to bookmark the current page</p>
                </div>
              ) : (
                bookmarks.map((bm, i) => (
                  <button
                    key={i}
                    className={`bookmark-item ${currentPage && currentPage.includes(bm.url) ? 'active' : ''}`}
                    onClick={() => setCurrentPage(bm.page)}
                  >
                    <span className="bookmark-title">{bm.title}</span>
                    <button
                      className="bookmark-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        const updated = bookmarks.filter((_, idx) => idx !== i);
                        setBookmarks(updated);
                        localStorage.setItem(`bookmarks_${book}`, JSON.stringify(updated));
                      }}
                    >
                      ✕
                    </button>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Toolbar */}
        <div className="reader-toolbar glass-panel desktop-only-toolbar">
          <div className="toolbar-left">
            {!sidebarOpen && (
              <button
                className="icon-button primary sidebar-toggle"
                onClick={() => setSidebarOpen(true)}
                title="Open Sidebar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
            )}
            <div className="mobile-header-title">{book.replace('.chm', '')}</div>

            <div className="search-container">
              <div className="local-search-form">
                <input
                  type="text"
                  placeholder="Find in book..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="toolbar-input"
                />
                {(searchQuery || isSearching) && (
                  <button type="button" className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
                )}
              </div>

              {/* Dropdown Results */}
              {searchResults !== null && (
                <div className="book-search-results glass-panel">
                  <div className="search-results-header">
                    <h4>Results {isSearching ? <span className="search-spinner-small"></span> : `(${searchResults.length})`}</h4>
                  </div>
                  <div className="search-results-list-small">
                    {searchResults.length === 0 && !isSearching ? (
                      <p className="no-results">No matches found.</p>
                    ) : (
                      searchResults.slice(0, 10).map((res, i) => (
                        <button
                          key={i}
                          className="search-result-item"
                          onClick={() => {
                            const query = searchQuery;
                            setCurrentPage(res.directUrl || res.link);
                            pendingHighlightRef.current = query;
                            setSearchQuery(''); // Close panel on select
                            setIsSearchModalOpen(false);
                            if (iframeRef.current && iframeRef.current.contentWindow) {
                              iframeRef.current.contentWindow.focus();
                            }
                          }}
                        >
                          <div className="res-file">{formatHierarchy(res)}</div>
                          <div className="res-snippet" dangerouslySetInnerHTML={{ __html: res.snippet }}></div>
                        </button>
                      ))
                    )}
                    {!isSearching && searchResults.length > 10 && (
                      <button
                        className="show-more-btn"
                        onClick={() => setIsSearchModalOpen(true)}
                      >
                        Show all {searchResults.length} results
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="toolbar-right">
            <div className="nav-controls">
              <button
                className="icon-button"
                onClick={navigatePrev}
                disabled={getCurrentIndex() <= 0}
                title="Previous Section (←)"
              >
                ◀
              </button>
              <button
                className="icon-button"
                onClick={navigateNext}
                disabled={getCurrentIndex() === -1 || getCurrentIndex() >= flattenedToc.length - 1}
                title="Next Section (→)"
              >
                ▶
              </button>
            </div>

            <button
              className="icon-button random-btn"
              onClick={handleRandomSection}
              disabled={flattenedToc.length === 0}
              title="Random Section"
            >
              🎲
            </button>

            <div className="translate-controls">
              <button
                className={`lang-btn ${activeLang === 'tr' ? 'active' : ''}`}
                onClick={() => handleTranslate('tr')}
                disabled={isTranslating || activeLang === 'tr'}
                title="Original Turkish"
              >
                🇹🇷 TR
              </button>
              <button
                className={`lang-btn ${activeLang === 'ru' ? 'active' : ''}`}
                onClick={() => handleTranslate('ru')}
                disabled={isTranslating}
                title="Translate to Russian"
              >
                {isTranslating && activeLang === 'ru' ? '⏳' : `🇷🇺 RU${translationCacheRef.current['ru'] ? ' ✓' : ''}`}
              </button>
              <button
                className={`lang-btn ${activeLang === 'kk' ? 'active' : ''}`}
                onClick={() => handleTranslate('kk')}
                disabled={isTranslating}
                title="Translate to Kazakh"
              >
                {isTranslating && activeLang === 'kk' ? '⏳' : `🇰🇿 KZ${translationCacheRef.current['kk'] ? ' ✓' : ''}`}
              </button>
            </div>

            <button
              className={`icon-button ${isBookmarked() ? 'primary bookmark-active' : ''}`}
              onClick={toggleBookmark}
              title={isBookmarked() ? 'Remove Bookmark' : 'Bookmark this page'}
            >
              {isBookmarked() ? '⭐' : '☆'}
            </button>

              <button
                className={`icon-button ${compareMode ? 'primary' : ''}`}
                onClick={toggleCompareMode}
                disabled={activeLang === 'tr'}
                title="Compare Side-by-Side"
              >
                ⚖️
              </button>

            {/* Edit / Save / Cancel */}
            {!isEditing ? (
              <button
                className="icon-button"
                onClick={startEditing}
                disabled={activeLang === 'tr'}
                title="Edit Translation"
              >
                ✏️
              </button>
            ) : (
              <>
                <button
                  className="icon-button primary"
                  onClick={saveTranslation}
                  disabled={isSaving}
                  title="Save Translation"
                >
                  {isSaving ? '⏳' : '💾'}
                </button>
                <button
                  className="icon-button"
                  onClick={cancelEditing}
                  title="Cancel Edit"
                >
                  ❌
                </button>
              </>
            )}

            <div className="ai-controls">
              <button
                className="icon-button ai-btn"
                onClick={() => setShowAiPanel(true)}
                title="Open AI Study Hub"
              >
                🧠 <span className="tooltip">AI Hub</span>
              </button>
            </div>

            <div className="zoom-controls">
              <button className="icon-button" onClick={() => setZoomLevel(z => Math.max(50, z - 10))} title="Zoom Out">
                A-
              </button>
              <span className="zoom-level">{zoomLevel}%</span>
              <button className="icon-button" onClick={() => setZoomLevel(z => Math.min(200, z + 10))} title="Zoom In">
                A+
              </button>
            </div>

            <div className="theme-controls">
              <button
                className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
                title="Light Mode"
              >
                ☀️
              </button>
              <button
                className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
                title="Dark Mode"
              >
                🌙
              </button>
              <button
                className={`theme-btn ${theme === 'system' ? 'active' : ''}`}
                onClick={() => setTheme('system')}
                title="System Theme"
              >
                💻
              </button>
            </div>
          </div>
        </div>

        {/* PREMIUM MOBILE UI - TOP BAR */}
        <div className={`mobile-premium-top-bar glass-panel mobile-only ${!isNavVisible ? 'nav-hidden-top' : ''}`}>
          {!isEditing ? (
            isMobileSearchActive ? (
              <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '8px' }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search in book..."
                  className="toolbar-input"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '6px 12px' }}
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    if (e.target.value.trim().length >= 3) {
                      setIsSearchModalOpen(true);
                    }
                  }}
                />
                <button className="icon-button" onClick={() => { setIsMobileSearchActive(false); setSearchQuery(''); setIsSearchModalOpen(false); }}>✕</button>
              </div>
            ) : (
              <>
                <button className="icon-button" onClick={() => setSidebarOpen(true)}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                </button>
                <div className="mobile-title truncate">{book.replace('.chm', '')}</div>
                <button className="icon-button" onClick={() => setIsMobileSearchActive(true)}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </button>
                <button className={`icon-button ${isBookmarked() ? 'primary bookmark-active' : ''}`} onClick={toggleBookmark}>
                  {isBookmarked() ? '⭐' : '☆'}
                </button>
              </>
            )
          ) : (
            <>
              <div className="mobile-title truncate" style={{color: 'var(--primary)', textAlign: 'left', paddingLeft: '4px'}}>✏️ Editing...</div>
              <div style={{display: 'flex', gap: '8px'}}>
                <button className="icon-button" onClick={cancelEditing} title="Cancel">❌</button>
                <button className="icon-button primary" onClick={saveTranslation} disabled={isSaving} title="Save">
                  {isSaving ? '⏳' : '💾 Save'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Breadcrumb (Desktop Only) */}
        {breadcrumb.length > 0 && (
          <div className="breadcrumb-bar desktop-only">
            {breadcrumb.map((seg, i) => (
              <span key={i}>
                {i > 0 && <span className="breadcrumb-sep">/</span>}
                <span className={i === breadcrumb.length - 1 ? 'breadcrumb-current' : 'breadcrumb-parent'}>{seg}</span>
              </span>
            ))}
          </div>
        )}

        {loading ? (
          <div className="loader-container full-height">
            <div className="loader"></div>
            <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Decompiling Book...</p>
          </div>
        ) : error ? (
          <div className="empty-state full-height">
            <h3>Error Loading Book</h3>
            <p>{error}</p>
            <Link href="/" className="back-link">Return to Library</Link>
          </div>
        ) : (
          <div className={`iframe-wrapper ${compareMode && compareHtml ? 'compare-active' : ''}`}>
            <div className={`iframe-pane ${compareMode && compareHtml ? 'compare-left' : ''}`} style={compareMode && compareHtml ? { flex: `0 0 ${splitPercent}%` } : {}}>
              {compareMode && compareHtml && <div className="compare-label">🇹🇷 Original</div>}
              <iframe
                ref={iframeRef}
                src={currentPage}
                className={`content-iframe ${theme === 'dark' ? 'dark-iframe-bg' : ''} ${iframeLoading ? 'iframe-loading' : ''}`}
                title="Book Content"
                onLoad={handleIframeLoad}
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              />
            </div>

            {compareMode && compareHtml && (
              <>
                <div
                  className="split-divider"
                  onMouseDown={handleSplitDrag}
                  onTouchStart={handleSplitDrag}
                  title="Drag to resize"
                />
                <div className="compare-right" style={{ flex: `0 0 ${100 - splitPercent}%` }}>
                  <div className="compare-label">
                    {activeLang === 'ru' ? '🇷🇺 Russian' : '🇰🇿 Kazakh'}
                    {isEditing && <span className="editing-badge">Editing</span>}
                  </div>

                  {/* Formatting toolbar — only visible when editing */}
                  {isEditing && (
                    <div className="editor-toolbar">
                      <button onMouseDown={e => { e.preventDefault(); execFormat('bold'); }} title="Bold"><b>B</b></button>
                      <button onMouseDown={e => { e.preventDefault(); execFormat('italic'); }} title="Italic"><i>I</i></button>
                      <button onMouseDown={e => { e.preventDefault(); execFormat('underline'); }} title="Underline"><u>U</u></button>
                      <span className="editor-sep" />
                      <button onMouseDown={e => { e.preventDefault(); execFormat('formatBlock', '<h3>'); }} title="Heading">H3</button>
                      <button onMouseDown={e => { e.preventDefault(); execFormat('formatBlock', '<p>'); }} title="Paragraph">¶</button>
                      <button onMouseDown={e => { e.preventDefault(); execFormat('insertUnorderedList'); }} title="Bullet list">• List</button>
                      <button onMouseDown={e => { e.preventDefault(); execFormat('insertOrderedList'); }} title="Numbered list">1. List</button>
                      <span className="editor-sep" />
                      <button onMouseDown={e => { e.preventDefault(); execFormat('removeFormat'); }} title="Clear formatting">✕</button>
                      <button onMouseDown={e => { e.preventDefault(); execFormat('undo'); }} title="Undo">↩</button>
                      <button onMouseDown={e => { e.preventDefault(); execFormat('redo'); }} title="Redo">↪</button>
                    </div>
                  )}

                  {/* Editable / Read-only content */}
                  <div
                    ref={el => { compareContentRef.current = el; if (isEditing) editorRef.current = el; }}
                    className={`compare-content ${theme === 'dark' ? 'compare-dark' : ''} ${isEditing ? 'editor-active' : ''}`}
                    contentEditable={isEditing}
                    suppressContentEditableWarning
                    dangerouslySetInnerHTML={{ __html: compareHtml }}
                  />
                </div>
              </>
            )}

            {/* Translation Indicator (non-blocking) */}
            {isTranslating && (
              <div className="translation-indicator">
                <div className="loader small"></div>
                <span>Translating...</span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* AI Study Hub Modal */}
      <AiStudyHub
        isOpen={showAiPanel}
        onClose={() => setShowAiPanel(false)}
        book={book.replace('.chm', '')}
        chapter={breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1] : ''}
        pageKey={(currentPage || '').replace(/^.*\/cache\//, '').replace(/[^a-zA-Z0-9]/g, '_')}
        contentHtml={(() => {
          if (!iframeRef?.current?.contentWindow?.document?.body) return '';
          return originalHtmlRef.current
            ? (() => { const temp = document.createElement('div'); temp.innerHTML = originalHtmlRef.current; return temp.innerText; })()
            : iframeRef.current.contentWindow.document.body.innerText || '';
        })()}
        targetLang={activeLang}
        apiKey={geminiApiKey}
        onRequireApiKey={() => {
          setShowAiPanel(false);
          setShowApiKeyInput(true);
        }}
      />

      {/* API Key Modal */}
      {showApiKeyInput && (
        <div className="search-modal-overlay">
          <div className="api-key-modal glass-panel">
            <div className="search-modal-header">
              <h2>🔑 Gemini API Key</h2>
              <button className="icon-button" onClick={() => setShowApiKeyInput(false)}>✕</button>
            </div>
            <div className="api-key-body">
              <p>Enter your Google Gemini API key to enable translation. You can get one free at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>Google AI Studio</a>.</p>
              <input
                type="password"
                placeholder="Paste your API key here..."
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                className="toolbar-input api-key-input"
              />
              <button
                className="save-key-btn"
                onClick={() => {
                  localStorage.setItem('gemini_api_key', geminiApiKey);
                  setShowApiKeyInput(false);
                  if (pendingLang) {
                    handleTranslate(pendingLang);
                    setPendingLang(null);
                  }
                }}
                disabled={!geminiApiKey.trim()}
              >
                Save & Translate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Search Modal */}
      {isSearchModalOpen && searchResults && (
        <div className="search-modal-overlay">
          <div className="search-modal glass-panel">
            <div className="search-modal-header">
              <h2>All Results for "{searchQuery}"</h2>
              <button className="icon-button" onClick={() => setIsSearchModalOpen(false)}>✕</button>
            </div>

            <div className="search-modal-content">
              {searchResults.slice(0, searchModalPage * RESULTS_PER_PAGE).map((res, i) => (
                <button
                  key={i}
                  className="search-result-item modal-card"
                  onClick={() => {
                    const query = searchQuery;
                    setCurrentPage(res.directUrl || res.link);
                    pendingHighlightRef.current = query;
                    setSearchQuery(''); // Close both modal and toolbar dropdown
                    setIsSearchModalOpen(false);
                    if (iframeRef.current && iframeRef.current.contentWindow) {
                      iframeRef.current.contentWindow.focus();
                    }
                  }}
                >
                  <div className="res-file">{formatHierarchy(res)}</div>
                  <div className="res-snippet" dangerouslySetInnerHTML={{ __html: res.snippet }}></div>
                </button>
              ))}

              {searchModalPage * RESULTS_PER_PAGE < searchResults.length && (
                <button
                  className="load-more-btn"
                  onClick={() => setSearchModalPage(p => p + 1)}
                >
                  Load More Results
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      {/* PREMIUM MOBILE UI - BOTTOM BAR */}
      <div className={`mobile-bottom-nav glass-panel-bottom mobile-only ${!isNavVisible ? 'nav-hidden-bottom' : ''}`}>
        <button className="nav-action-btn" onClick={navigatePrev} disabled={getCurrentIndex() <= 0}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          <span>Prev</span>
        </button>
        <button className="nav-action-btn" onClick={() => setIsMobileSettingsOpen(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          <span>Tools</span>
        </button>
        <div className="bottom-nav-center-wrap">
          <button className="nav-action-btn center-primary-btn" onClick={() => setShowAiPanel(true)}>
            <span className="ai-icon-large">🧠</span>
          </button>
        </div>
        <button className="nav-action-btn" onClick={navigateNext} disabled={getCurrentIndex() >= flattenedToc.length - 1}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          <span>Next</span>
        </button>
      </div>

      {/* PREMIUM MOBILE UI - SETTINGS SHEET */}
      {isMobileSettingsOpen && (
        <div className="search-modal-overlay mobile-only" style={{zIndex: 10001}} onClick={(e) => { if (e.target === e.currentTarget) setIsMobileSettingsOpen(false); }}>
          <div className="mobile-settings-sheet sheet-open">
             <div className="sheet-handle"></div>
             <div className="sheet-header">
               <h3 className="sheet-title">Display & Tools</h3>
               <button className="icon-button" onClick={() => setIsMobileSettingsOpen(false)}>✕</button>
             </div>
             
             <div className="sheet-section">
               <div className="sheet-row">
                 <button className="sheet-btn" onClick={() => setZoomLevel(z => Math.max(50, z - 10))}>A-</button>
                 <span className="sheet-val">{zoomLevel}%</span>
                 <button className="sheet-btn" onClick={() => setZoomLevel(z => Math.min(200, z + 10))}>A+</button>
               </div>
               <div className="sheet-row theme-toggles">
                 <button className={`sheet-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>☀️ Light</button>
                 <button className={`sheet-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>🌙 Dark</button>
                 <button className={`sheet-btn ${theme === 'system' ? 'active' : ''}`} onClick={() => setTheme('system')}>💻 Auto</button>
               </div>
             </div>

             <div className="sheet-section">
               <h4 className="sheet-subtitle">Language & Translation</h4>
               <div className="sheet-row">
                 <button className={`sheet-btn ${activeLang === 'tr' ? 'active' : ''}`} onClick={() => handleTranslate('tr')}>🇹🇷 TR</button>
                 <button className={`sheet-btn ${activeLang === 'ru' ? 'active' : ''}`} onClick={() => handleTranslate('ru')}>🇷🇺 RU</button>
                 <button className={`sheet-btn ${activeLang === 'kk' ? 'active' : ''}`} onClick={() => handleTranslate('kk')}>🇰🇿 KZ</button>
               </div>
               <div className="sheet-row">
                 <button className={`sheet-btn ${compareMode ? 'active' : ''}`} onClick={toggleCompareMode}>⚖️ Compare</button>
                 <button className={`sheet-btn ${isEditing ? 'active' : ''}`} onClick={() => { setIsMobileSettingsOpen(false); startEditing(); }}>✏️ Edit</button>
               </div>
             </div>
             
             <div className="sheet-section">
                <button className="sheet-btn full-width" onClick={() => { setIsMobileSettingsOpen(false); handleRandomSection(); }}>🎲 Random Section</button>
             </div>
          </div>
        </div>
      )}

      {/* First-visit swipe hint */}
      {showSwipeHint && (
        <div className="swipe-hint" onClick={dismissSwipeHint}>
          <span>← Swipe to Navigate →</span>
        </div>
      )}

      <style jsx global>{`
        .reader-layout {
          display: flex;
          height: 100vh;
          overflow: hidden;
          background-color: var(--background);
          position: relative;
        }

        .progress-bar-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--card-border);
          z-index: 1000;
          cursor: pointer;
        }

        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--primary), #a78bfa);
          transition: width 0.3s ease;
          border-radius: 0 2px 2px 0;
        }
        
        .sidebar {
          width: 320px;
          flex-shrink: 0;
          background-color: var(--sidebar-bg);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-right: 1px solid var(--card-border);
          display: flex;
          flex-direction: column;
          transition: transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          z-index: 30;
        }
        
        .sidebar.closed {
          transform: translateX(-100%);
          position: absolute;
          height: 100%;
          box-shadow: none;
        }

        .sidebar.open {
          box-shadow: var(--shadow-xl);
        }
        
        .sidebar-header {
          padding: 0.875rem 1.25rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          height: 56px;
          border-bottom: 1px solid var(--card-border);
        }
        
        .back-button {
          color: var(--text-muted);
          font-weight: 500;
          font-size: 0.9rem;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        
        .back-button:hover {
          color: var(--primary);
        }

        
        .book-title-sidebar {
          font-size: 1.1rem;
          font-weight: 700;
          margin-bottom: 1.5rem;
          color: var(--primary);
          word-wrap: break-word;
          line-height: 1.35;
          letter-spacing: -0.01em;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--card-border);
        }
        
        .toc-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .root-list {
          margin-left: -0.75rem;
        }
        
        .toc-item {
          margin-bottom: 2px;
        }

        .toc-item-header {
          display: flex;
          align-items: center;
          gap: 2px;
          border-radius: var(--radius-sm);
          transition: all 0.15s ease;
          position: relative;
          padding: 3px 0;
        }

        .toc-item-header:hover {
          background-color: var(--card-hover);
        }

        .toc-item-header.active-node {
          background: var(--primary-glow);
          border-left: 2.5px solid var(--primary);
        }
        
        .toc-item-header.active-node .toc-text {
          color: var(--primary);
          font-weight: 600;
        }

        .toc-toggle {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.65rem;
          padding: 4px;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-sm);
          transition: all 0.15s;
          opacity: 0.6;
        }

        .toc-toggle:hover {
          background-color: var(--card-border);
          color: var(--text-primary);
          opacity: 1;
        }

        .toc-toggle-spacer {
          width: 24px;
          height: 24px;
          flex-shrink: 0;
        }
        
        .toc-button {
          flex-grow: 1;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          text-align: left;
          background: transparent !important;
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          color: var(--text-primary);
          padding: 0.4rem 0.5rem;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-family: inherit;
          font-size: 0.88rem;
          line-height: 1.45;
          transition: color 0.15s;
        }

        .toc-button:hover {
          color: var(--primary);
        }

        .toc-folder {
          font-weight: 500;
        }
        
        .toc-icon {
          font-size: 1em;
          flex-shrink: 0;
          margin-top: 2px;
        }
        
        .main-content {
          flex-grow: 1;
          position: relative;
          display: flex;
          flex-direction: column;
          background-color: var(--background);
        }

        .reader-toolbar {
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1rem;
          flex-shrink: 0;
          z-index: 20;
          gap: 0.5rem;
        }

        .toolbar-left, .toolbar-right {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .icon-button {
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-muted);
          width: 34px;
          height: 34px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          font-weight: 600;
          font-size: 0.9rem;
        }

        .icon-button:hover {
          background: var(--card-hover);
          color: var(--text-primary);
        }

        .icon-button.primary {
          color: var(--primary);
          background: var(--primary-glow);
        }
        
        .icon-button.primary:hover {
          background: rgba(129, 140, 248, 0.2);
        }

        .search-container {
          position: relative;
        }

        .local-search-form {
          display: flex;
          align-items: center;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-sm);
          padding: 1px 4px;
          box-shadow: var(--shadow-sm);
          width: 220px;
          transition: all 0.2s;
        }

        .local-search-form:focus-within {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px var(--primary-glow);
        }

        .toolbar-input {
          background: transparent;
          border: none;
          padding: 0.4rem 0.25rem 0.4rem 0.6rem;
          color: var(--text-primary);
          font-family: var(--font-inter);
          flex-grow: 1;
          font-size: 0.85rem;
          width: 100%;
        }

        .toolbar-input:focus {
          outline: none;
        }

        .toolbar-input::placeholder {
          color: var(--text-muted);
          opacity: 0.7;
        }

        .clear-search-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0.4rem;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
          border-radius: var(--radius-sm);
        }

        .clear-search-btn:hover {
          color: var(--text-primary);
          background: var(--card-hover);
        }

        .book-search-results {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          width: 420px;
          max-height: 460px;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--card-border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-xl);
          overflow: hidden;
          z-index: 50;
          background: var(--background);
        }

        .search-results-header {
          padding: 0.6rem 1rem;
          border-bottom: 1px solid var(--card-border);
          background: var(--card-bg);
        }

        .search-results-header h4 {
          font-size: 0.82rem;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-muted);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .search-spinner-small {
          width: 14px;
          height: 14px;
          border: 2px solid var(--card-border);
          border-bottom-color: var(--primary);
          border-radius: 50%;
          display: inline-block;
          animation: rotation 0.8s linear infinite;
        }

        .search-results-list-small {
          overflow-y: auto;
          max-height: 400px;
          display: flex;
          flex-direction: column;
        }

        .no-results {
          padding: 2rem;
          text-align: center;
          color: var(--text-muted);
          font-size: 0.88rem;
        }

        .search-result-item {
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--card-border);
          padding: 0.875rem 1rem;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s;
        }

        .search-result-item:last-child {
          border-bottom: none;
        }

        .search-result-item:hover {
          background-color: var(--card-hover);
        }

        .res-file {
          font-size: 0.78rem;
          color: var(--primary);
          font-weight: 600;
          margin-bottom: 0.2rem;
          letter-spacing: -0.01em;
        }

        .res-snippet {
          font-size: 0.83rem;
          color: var(--text-muted);
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .res-snippet :global(strong) {
          background-color: var(--primary-glow);
          color: var(--primary);
          padding: 1px 4px;
          border-radius: 3px;
        }

        .zoom-controls, .nav-controls {
          display: flex;
          align-items: center;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-sm);
          padding: 2px;
          gap: 1px;
        }

        .icon-button:disabled {
          opacity: 0.25;
          cursor: not-allowed;
        }

        .icon-button:disabled:hover {
          background: transparent;
          color: var(--text-muted);
        }

        .zoom-level {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-muted);
          width: 44px;
          text-align: center;
          font-variant-numeric: tabular-nums;
        }

        .show-more-btn {
          width: 100%;
          padding: 0.875rem;
          background: var(--primary-glow);
          color: var(--primary);
          border: none;
          border-top: 1px solid var(--card-border);
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }

        .show-more-btn:hover {
          background: rgba(129, 140, 248, 0.25);
        }

        .search-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(8px) saturate(150%);
          -webkit-backdrop-filter: blur(8px) saturate(150%);
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .search-modal {
          width: 100%;
          max-width: 780px;
          height: 85vh;
          background: var(--background);
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-xl), 0 0 0 1px var(--card-border);
          border: none;
          overflow: hidden;
          animation: slideUp 0.25s ease;
        }

        .search-modal-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--card-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--card-bg);
          flex-shrink: 0;
        }

        .search-modal-header h2 {
          font-size: 1.15rem;
          margin: 0;
          color: var(--text-primary);
          font-weight: 700;
          letter-spacing: -0.01em;
        }

        .search-modal-content {
          padding: 1.25rem;
          overflow-y: auto;
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .modal-card {
          border: 1px solid var(--card-border);
          border-radius: var(--radius-md);
        }

        .load-more-btn {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          color: var(--text-muted);
          padding: 0.875rem;
          border-radius: var(--radius-md);
          font-weight: 600;
          font-size: 0.88rem;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 0.5rem;
        }

        .load-more-btn:hover {
          background: var(--card-hover);
          color: var(--text-primary);
        }

        .random-btn {
          font-size: 1rem;
          transition: all 0.2s;
        }

        .random-btn:hover:not(:disabled) {
          transform: rotate(15deg);
        }

        .translate-controls {
          display: flex;
          align-items: center;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-sm);
          padding: 2px;
          gap: 1px;
        }

        .lang-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 0.78rem;
          font-weight: 600;
          padding: 5px 9px;
          cursor: pointer;
          border-radius: calc(var(--radius-sm) - 2px);
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .lang-btn:hover:not(:disabled) {
          background: var(--card-hover);
          color: var(--text-primary);
        }

        .lang-btn.active {
          background: var(--primary);
          color: white;
          box-shadow: 0 1px 4px rgba(79, 70, 229, 0.3);
        }

        .lang-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .translation-indicator {
          position: absolute;
          bottom: 1.25rem;
          right: 1.25rem;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.6rem 1.1rem;
          background: var(--background);
          border: 1px solid var(--card-border);
          border-radius: 999px;
          box-shadow: var(--shadow-lg);
          z-index: 10;
          animation: fadeIn 0.2s ease;
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text-muted);
        }

        .translation-loading p {
          font-size: 0.9rem;
          font-weight: 500;
        }

        .api-key-modal {
          width: 100%;
          max-width: 460px;
          background: var(--background);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-xl);
          border: 1px solid var(--card-border);
          overflow: hidden;
          animation: slideUp 0.25s ease;
        }

        .api-key-body {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .api-key-body p {
          color: var(--text-muted);
          font-size: 0.88rem;
          line-height: 1.6;
        }

        .api-key-input {
          width: 100%;
          padding: 0.7rem 0.875rem;
          font-size: 0.88rem;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          transition: all 0.2s;
        }

        .api-key-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px var(--primary-glow);
          outline: none;
        }

        .save-key-btn {
          padding: 0.7rem 1.5rem;
          background: var(--primary);
          color: white;
          border: none;
          border-radius: var(--radius-sm);
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(79, 70, 229, 0.25);
        }

        .save-key-btn:hover {
          background: var(--primary-hover);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);
          transform: translateY(-1px);
        }

        .save-key-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        .theme-controls {
          display: flex;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-sm);
          padding: 2px;
          gap: 1px;
        }

        .theme-btn {
          background: transparent;
          border: none;
          border-radius: calc(var(--radius-sm) - 2px);
          padding: 0.35rem 0.4rem;
          cursor: pointer;
          opacity: 0.5;
          transition: all 0.2s;
          font-size: 1rem;
          line-height: 1;
        }

        .theme-btn:hover {
          opacity: 0.85;
        }

        .theme-btn.active {
          opacity: 1;
          background: var(--card-hover);
        }

        .iframe-wrapper {
          flex-grow: 1;
          display: flex;
          flex-direction: row;
          position: relative;
          background: var(--background);
          overflow: hidden;
        }
        
        .content-iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border: none;
          background-color: #ffffff;
          transition: background-color 0.3s;
        }

        .dark-iframe-bg {
          background-color: #141825;
        }

        .loader-container-small {
          display: flex;
          justify-content: center;
          padding: 3rem;
        }

        .loader.small {
          width: 28px;
          height: 28px;
          border-width: 3px;
        }

        .full-height {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .ai-controls {
          display: flex;
          align-items: center;
          gap: 2px;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-sm);
          padding: 2px;
        }

        .ai-btn {
          font-size: 1rem;
          transition: all 0.2s;
        }

        .ai-btn:hover:not(:disabled) {
          transform: scale(1.1);
        }

        /* AI Centered Modal */
        .ai-modal {
          width: 100%;
          max-width: 720px;
          max-height: 85vh;
          background: var(--background);
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-xl), 0 0 0 1px var(--card-border);
          border: none;
          overflow: hidden;
          animation: slideUp 0.25s ease;
        }

        .ai-modal-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--card-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--card-bg);
          flex-shrink: 0;
        }

        .ai-modal-header h2 {
          font-size: 1.15rem;
          margin: 0;
          color: var(--text-primary);
          font-weight: 700;
        }

        .ai-modal-body {
          flex-grow: 1;
          overflow-y: auto;
          padding: 2rem;
        }

        .ai-loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem 2rem;
          gap: 1.25rem;
          color: var(--text-muted);
        }

        .ai-loading-state p {
          font-size: 0.95rem;
          font-weight: 500;
        }

        .ai-result-content {
          font-size: 0.95rem;
          line-height: 1.85;
          color: var(--text-primary);
          word-wrap: break-word;
        }

        .ai-result-content h3 {
          font-size: 1.2rem;
          font-weight: 700;
          margin: 1.5rem 0 0.75rem 0;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }

        .ai-result-content h3:first-child {
          margin-top: 0;
        }

        .ai-result-content h4 {
          font-size: 1rem;
          font-weight: 600;
          margin: 1.25rem 0 0.5rem 0;
          color: var(--primary);
        }

        .ai-result-content p {
          margin: 0.6rem 0;
        }

        .ai-result-content ul, .ai-result-content ol {
          margin: 0.75rem 0;
          padding-left: 1.5rem;
        }

        .ai-result-content li {
          margin: 0.4rem 0;
          line-height: 1.7;
        }

        .ai-result-content strong {
          color: var(--text-primary);
          font-weight: 600;
        }

        .ai-result-content em {
          font-style: italic;
          color: var(--text-muted);
        }

        .ai-result-content blockquote {
          margin: 1rem 0;
          padding: 0.75rem 1.25rem;
          border-left: 3px solid var(--primary);
          background: var(--primary-glow);
          border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
          font-style: italic;
        }

        .ai-result-content hr {
          margin: 2rem 0;
          border: none;
          border-top: 1px solid var(--card-border);
        }

        /* Comparative Mode */
        .iframe-pane {
          flex: 1;
          position: relative;
          min-height: 0;
          min-width: 0;
        }

        .compare-left {
          border-right: 1px solid var(--card-border);
        }

        .compare-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          min-width: 0;
        }

        .compare-label {
          padding: 0.4rem 0.875rem;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--text-muted);
          background: var(--card-bg);
          border-bottom: 1px solid var(--card-border);
          text-transform: uppercase;
          letter-spacing: 0.03em;
          flex-shrink: 0;
        }

        .sidebar-content {
          flex-grow: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0.5rem 0;
        }

        .sidebar-tabs {
          display: flex;
          padding: 0.5rem 0.75rem;
          gap: 0.5rem;
          border-bottom: 1px solid var(--card-border);
        }

        .sidebar-tab {
          flex: 1;
          padding: 0.5rem 0.75rem;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          border-radius: var(--radius-sm);
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
        }

        .sidebar-tab:hover {
          background: var(--card-hover);
          color: var(--text-primary);
        }

        .sidebar-tab.active {
          background: var(--primary-glow);
          color: var(--primary);
        }

        .bookmark-count {
          background: var(--primary);
          color: white;
          font-size: 0.65rem;
          padding: 1px 6px;
          border-radius: 99px;
          min-width: 18px;
          text-align: center;
        }

        .bookmarks-list {
          padding: 0.5rem;
        }

        .empty-bookmarks {
          padding: 2rem 1rem;
          text-align: center;
          color: var(--text-muted);
        }

        .empty-bookmarks p:first-child {
          font-size: 0.95rem;
          font-weight: 500;
          margin-bottom: 0.5rem;
        }

        .text-small {
          font-size: 0.78rem;
          opacity: 0.7;
        }

        .bookmark-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 0.6rem 0.75rem;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--card-border);
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.15s;
          text-align: left;
          font-size: 0.82rem;
          gap: 0.5rem;
        }

        .bookmark-item:hover {
          background: var(--card-hover);
        }

        .bookmark-item.active {
          background: var(--primary-glow);
          color: var(--primary);
        }

        .bookmark-title {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }

        .bookmark-remove {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          flex-shrink: 0;
          transition: all 0.15s;
        }

        .bookmark-remove:hover {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
        }

        .bookmark-active {
          animation: bookmark-pop 0.3s ease;
        }

        @keyframes bookmark-pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        .compare-content {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
          font-size: 0.95rem;
          line-height: 1.8;
          color: var(--text-primary);
          background: var(--background);
          min-height: 0;
        }

        .compare-content.compare-dark {
          background: #1e293b;
          color: #e2e8f0;
        }

        /* ─── Translation Editor ─── */
        .editing-badge {
          margin-left: 8px;
          font-size: 0.75rem;
          color: var(--primary);
          font-weight: 600;
          letter-spacing: 0.03em;
        }

        .editor-toolbar {
          display: flex;
          align-items: center;
          gap: 3px;
          padding: 5px 10px;
          background: var(--toolbar-bg);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--card-border);
          flex-shrink: 0;
          flex-wrap: wrap;
        }

        .editor-toolbar button {
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-primary);
          cursor: pointer;
          padding: 3px 7px;
          border-radius: var(--radius-sm);
          font-size: 0.8rem;
          font-family: inherit;
          min-width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.12s;
        }

        .editor-toolbar button:hover {
          background: var(--card-hover);
          border-color: var(--card-border);
        }

        .editor-toolbar button:active {
          background: var(--primary-glow);
          color: var(--primary);
        }

        .editor-sep {
          width: 1px;
          height: 18px;
          background: var(--card-border);
          margin: 0 4px;
          flex-shrink: 0;
        }

        .compare-content.editor-active {
          cursor: text;
          outline: none;
          border: 2px solid var(--primary);
          border-radius: 0 0 var(--radius-sm) var(--radius-sm);
          padding: 1.5rem;
          min-height: 300px;
        }

        .compare-content.editor-active:focus {
          box-shadow: 0 0 0 4px var(--primary-glow);
        }

        .split-divider {
          flex-shrink: 0;
          width: 6px;
          background: var(--card-border);
          cursor: col-resize;
          transition: background 0.2s;
          position: relative;
          z-index: 5;
        }

        .split-divider:hover,
        .split-divider:active {
          background: var(--primary);
        }

        .split-divider::after {
          content: '⋮';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 14px;
          color: var(--text-muted);
          pointer-events: none;
        }

        .compare-content h3 {
          font-size: 1.15rem;
          font-weight: 700;
          margin: 1.25rem 0 0.5rem 0;
        }

        .compare-content h4 {
          font-size: 1rem;
          font-weight: 600;
          margin: 1rem 0 0.4rem 0;
        }

        .compare-content p {
          margin: 0.5rem 0;
        }

        .compare-content ul, .compare-content ol {
          margin: 0.5rem 0;
          padding-left: 1.5rem;
        }

        .compare-content li {
          margin: 0.3rem 0;
        }

        .mobile-header-title {
          display: none;
        }

        .desktop-only {
          display: flex;
        }

        /* Premium Mobile Responsive UI */
        .mobile-only {
          display: none;
        }

        @media (max-width: 1024px) {
          .desktop-only, .desktop-only-toolbar {
            display: none !important;
          }

          .mobile-only {
            display: flex;
          }

          .sidebar {
            width: 100%;
            position: absolute;
            height: 100%;
            z-index: 1005; /* Must sit above top and bottom navs (1000) */
          }

          .sidebar-content {
            padding-bottom: 90px;
          }

          .sidebar-header {
            height: 52px;
          }

          .main-content {
            padding-top: 0 !important;
            padding-bottom: 0 !important;
          }

          /* Auto-hiding transitions for full screen reading */
          .nav-hidden-top {
            transform: translateY(-110%);
          }
          .nav-hidden-bottom {
            transform: translateY(110%);
          }

          /* Top Bar */
          .mobile-premium-top-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 60px;
            z-index: 1000;
            padding: 0 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--toolbar-bg);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border-bottom: 1px solid var(--card-border);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
            transition: transform 0.3s cubic-bezier(0.3, 0, 0, 1);
          }

          .mobile-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text-primary);
            flex: 1;
            text-align: center;
            padding: 0 12px;
          }

          /* Bottom Nav */
          .mobile-bottom-nav {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 1000;
            background: var(--toolbar-bg);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border-top: 1px solid var(--card-border);
            padding: 8px 16px;
            padding-bottom: max(12px, calc(8px + env(safe-area-inset-bottom)));
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.05);
            transition: transform 0.3s cubic-bezier(0.3, 0, 0, 1);
          }

          .nav-action-btn {
            background: transparent;
            border: none;
            color: var(--text-muted);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            min-width: 60px;
          }

          .nav-action-btn:hover, .nav-action-btn:active, .nav-action-btn.active {
            color: var(--primary);
          }

          .nav-action-btn span {
            font-size: 0.65rem;
            font-weight: 600;
            letter-spacing: 0.02em;
          }

          .bottom-nav-center-wrap {
            position: relative;
            display: flex;
            justify-content: center;
            width: 70px;
          }

          .center-primary-btn {
            position: absolute;
            bottom: 4px;
            width: 56px;
            height: 56px;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            border-radius: 50%;
            color: white;
            box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2;
          }

          .center-primary-btn .ai-icon-large {
            font-size: 1.6rem;
          }

          /* Settings Sheet */
          .mobile-settings-sheet {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            background: var(--toolbar-bg);
            backdrop-filter: blur(25px) saturate(200%);
            -webkit-backdrop-filter: blur(25px) saturate(200%);
            border-radius: 24px 24px 0 0;
            padding: 24px 20px;
            padding-bottom: max(24px, env(safe-area-inset-bottom));
            box-shadow: 0 -10px 40px rgba(0,0,0,0.25);
            animation: sheetSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            border-top: 1px solid var(--card-border);
          }

          @keyframes sheetSlideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }

          .sheet-handle {
            width: 48px;
            height: 6px;
            background: var(--text-muted);
            opacity: 0.4;
            border-radius: 99px;
            margin: -10px auto 10px auto;
          }

          .sheet-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .sheet-header .icon-button {
            background: rgba(128, 128, 128, 0.15);
            border-radius: 50%;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-primary);
            margin-right: -4px;
          }

          .sheet-title {
            font-size: 1.35rem;
            font-weight: 800;
            color: var(--text-primary);
            margin: 0;
          }

          .sheet-subtitle {
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--text-muted);
            margin: 0 0 0.5rem 0;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .sheet-section {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }

          .sheet-row {
            display: flex;
            align-items: center;
            background: rgba(128, 128, 128, 0.08);
            border-radius: 16px;
            padding: 6px;
            border: 1px solid rgba(128, 128, 128, 0.1);
            gap: 6px;
          }

          .sheet-btn {
            flex: 1;
            padding: 12px 6px;
            background: transparent;
            border: none;
            border-radius: 12px;
            color: var(--text-muted);
            font-weight: 700;
            font-size: 0.95rem;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }

          .sheet-btn.active {
            background: var(--card-bg);
            color: var(--primary);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          }

          .sheet-val {
            min-width: 60px;
            text-align: center;
            font-weight: 800;
            color: var(--primary);
            font-size: 1.05rem;
          }

          .sheet-btn.full-width {
            background: rgba(128, 128, 128, 0.08);
            border: 1px solid rgba(128, 128, 128, 0.1);
            padding: 16px;
            color: var(--text-primary);
          }

          .sheet-btn.full-width:active {
            background: rgba(128, 128, 128, 0.15);
          }

          /* Modals overrides */
          .search-modal-overlay {
            padding: 0;
            align-items: flex-end;
          }

          .search-modal, .ai-modal {
            height: 92vh;
            max-height: 92vh;
            border-radius: 24px 24px 0 0;
            margin-top: auto;
          }

          .ai-modal-body {
            padding: 1rem;
          }

          .book-search-results {
            width: calc(100vw - 2rem);
            left: -1rem;
            top: 60px;
          }

          .iframe-wrapper.compare-active {
            flex-direction: column;
          }

          .compare-left {
            border-right: none;
            border-bottom: 1px solid var(--card-border);
          }

          .compare-left, .compare-right {
            flex: 1 !important;
            min-height: 0;
          }

          .split-divider {
            width: 100%;
            height: 6px;
            cursor: row-resize;
          }

          .split-divider::after {
            content: '⋯';
          }

          .translation-indicator {
            position: fixed;
            top: auto;
            bottom: 90px;
            left: 50%;
            transform: translateX(-50%);
            border-radius: 999px;
            padding: 0.8rem 1.5rem;
            z-index: 999;
            box-shadow: var(--shadow-lg);
          }
        }

        /* ─── Swipe Hint ─── */
        .swipe-hint {
          display: none;
        }

        @media (max-width: 768px) {
          .swipe-hint {
            display: flex;
            position: fixed;
            bottom: 70px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 999;
            background: rgba(0,0,0,0.75);
            color: #fff;
            padding: 10px 24px;
            border-radius: 24px;
            font-size: 0.85rem;
            cursor: pointer;
            animation: swipeHintFade 4s ease forwards;
            pointer-events: auto;
          }
        }

        @keyframes swipeHintFade {
          0%, 70% { opacity: 1; }
          100% { opacity: 0; pointer-events: none; }
        }
      `}</style>
    </div>
  );
}
