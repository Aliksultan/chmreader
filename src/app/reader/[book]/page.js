'use client';

import { useEffect, useState, use, useRef, useCallback } from 'react';
import Link from 'next/link';

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
  const [zoomLevel, setZoomLevel] = useState(100);
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

  // Bookmarks
  const [bookmarks, setBookmarks] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // Sidebar tab
  const [sidebarTab, setSidebarTab] = useState('toc'); // 'toc' | 'bookmarks'

  // Load saved API key and bookmarks
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setGeminiApiKey(savedKey);
    const savedBookmarks = localStorage.getItem(`bookmarks_${book}`);
    if (savedBookmarks) {
      try { setBookmarks(JSON.parse(savedBookmarks)); } catch (e) { }
    }
  }, []);

  // Navigation helpers
  const getCurrentIndex = () => {
    if (!flattenedToc.length || !currentPage) return -1;
    const clean = currentPage.split('?')[0].split('#')[0];
    return flattenedToc.findIndex(local => clean.endsWith('/' + local.split('?')[0].split('#')[0]));
  };

  const navigatePrev = () => {
    const idx = getCurrentIndex();
    if (idx > 0) {
      setCurrentPage(`${cacheUrl || `/cache/${book.replace('.chm', '')}`}/${flattenedToc[idx - 1]}`);
    }
  };

  const navigateNext = () => {
    const idx = getCurrentIndex();
    if (idx !== -1 && idx < flattenedToc.length - 1) {
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

  const handleTranslate = async (targetLang) => {
    if (!geminiApiKey) {
      setPendingLang(targetLang);
      setShowApiKeyInput(true);
      return;
    }
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;
    const doc = iframeRef.current.contentWindow.document;
    if (!doc.body) return;

    // Save original HTML if not already saved
    if (!originalHtmlRef.current) {
      originalHtmlRef.current = doc.body.innerHTML;
    }

    // If switching back to Turkish, restore original
    if (targetLang === 'tr') {
      doc.body.innerHTML = originalHtmlRef.current;
      setActiveLang('tr');
      applyIframeTheme();
      return;
    }

    // Build a cache key from the page path
    const pageKey = (currentPage || '').replace(/^.*\/cache\//, '').replace(/[^a-zA-Z0-9]/g, '_');
    const cacheKey = `tr_${pageKey}_${targetLang}`;

    // Check in-memory cache first, then localStorage
    if (translationCacheRef.current[targetLang]) {
      if (compareMode) {
        setCompareHtml(translationCacheRef.current[targetLang]);
        doc.body.innerHTML = originalHtmlRef.current;
      } else {
        doc.body.innerHTML = translationCacheRef.current[targetLang];
      }
      setActiveLang(targetLang);
      applyIframeTheme();
      return;
    }

    try {
      const stored = localStorage.getItem(cacheKey);
      if (stored) {
        translationCacheRef.current[targetLang] = stored;
        if (compareMode) {
          setCompareHtml(stored);
          doc.body.innerHTML = originalHtmlRef.current;
        } else {
          doc.body.innerHTML = stored;
        }
        setActiveLang(targetLang);
        applyIframeTheme();
        return;
      }
    } catch (e) { /* localStorage unavailable */ }

    // Otherwise, translate via API
    try {
      // Extract text from original (without replacing iframe content)
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = originalHtmlRef.current;
      const bodyText = tempDiv.innerText || '';
      if (!bodyText.trim()) return;

      setIsTranslating(true);
      // Keep showing Turkish original while translating — DON'T set activeLang yet

      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: bodyText,
          targetLang: targetLang,
          apiKey: geminiApiKey,
          pageKey: pageKey
        })
      });

      const data = await res.json();
      if (data.error) {
        alert(`Translation error: ${data.error}`);
      } else {
        const translatedHtml = data.translation;
        // Cache in memory and localStorage
        translationCacheRef.current[targetLang] = translatedHtml;
        try { localStorage.setItem(cacheKey, translatedHtml); } catch (e) { /* quota exceeded */ }

        // NOW swap the content
        setActiveLang(targetLang);
        if (compareMode) {
          setCompareHtml(translatedHtml);
        } else {
          doc.body.innerHTML = translatedHtml;
        }
        applyIframeTheme();
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
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, book]);

  // Keyboard shortcuts (Escape + ← →)
  useEffect(() => {
    const handleKeydown = (e) => {
      // Don't trigger if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
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

  const handleIframeLoad = () => {
    applyZoom();
    applyIframeTheme();
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

  const applyIframeTheme = () => {
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
      } catch (e) { }
    }
  };

  useEffect(() => {
    applyZoom();
  }, [zoomLevel]);

  useEffect(() => {
    applyIframeTheme();
  }, [theme]);

  // If there's an active result search string, inject it into the iframe after load
  // (Optional feature, omitting for now to keep things stable)

  // Progress calculation
  const currentIndex = getCurrentIndex();
  const progressPercent = flattenedToc.length > 0 ? ((currentIndex + 1) / flattenedToc.length) * 100 : 0;

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
            className="icon-button"
            onClick={() => setSidebarOpen(false)}
            title="Close Sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
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
              {loading ? (
                <div className="loader-container-small">
                  <div className="loader small"></div>
                </div>
              ) : error ? (
                <div className="error-text">Failed to load content</div>
              ) : (
                <ul className="toc-list root-list">
                  {toc.map((item, index) => (
                    <TocNode
                      key={index}
                      item={item}
                      cacheUrl={cacheUrl}
                      setCurrentPage={setCurrentPage}
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
        <div className="reader-toolbar glass-panel">
          <div className="toolbar-left">
            {!sidebarOpen && (
              <button
                className="icon-button primary"
                onClick={() => setSidebarOpen(true)}
                title="Open Sidebar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
            )}

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
              onClick={() => {
                const next = !compareMode;
                setCompareMode(next);
                if (next && activeLang !== 'tr' && translationCacheRef.current[activeLang]) {
                  setCompareHtml(translationCacheRef.current[activeLang]);
                  if (originalHtmlRef.current && iframeRef.current?.contentWindow?.document?.body) {
                    iframeRef.current.contentWindow.document.body.innerHTML = originalHtmlRef.current;
                    applyIframeTheme();
                  }
                } else if (!next && activeLang !== 'tr' && translationCacheRef.current[activeLang]) {
                  if (iframeRef.current?.contentWindow?.document?.body) {
                    iframeRef.current.contentWindow.document.body.innerHTML = translationCacheRef.current[activeLang];
                    applyIframeTheme();
                  }
                  setCompareHtml('');
                }
              }}
              disabled={activeLang === 'tr'}
              title="Compare Side-by-Side"
            >
              ⚖️
            </button>

            <div className="ai-controls">
              <button
                className="icon-button ai-btn"
                onClick={() => handleAi('summarize')}
                disabled={isAiLoading}
                title="Summarize Page"
              >
                {isAiLoading && aiMode === 'summarize' ? '⏳' : '📝'}
              </button>
              <button
                className="icon-button ai-btn"
                onClick={() => handleAi('explain')}
                disabled={isAiLoading}
                title="Explain Passages"
              >
                {isAiLoading && aiMode === 'explain' ? '⏳' : '💡'}
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
                className={`content-iframe ${theme === 'dark' ? 'dark-iframe-bg' : ''}`}
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
                  <div className="compare-label">{activeLang === 'ru' ? '🇷🇺 Russian' : '🇰🇿 Kazakh'}</div>
                  <div ref={compareContentRef} className={`compare-content ${theme === 'dark' ? 'compare-dark' : ''}`} dangerouslySetInnerHTML={{ __html: compareHtml }} />
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

      {/* AI Results Modal */}
      {showAiPanel && (
        <div className="search-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAiPanel(false); }}>
          <div className="ai-modal">
            <div className="ai-modal-header">
              <h2>{aiMode === 'summarize' ? '📝 Summary' : '💡 Explanation'}</h2>
              <button className="icon-button" onClick={() => setShowAiPanel(false)}>✕</button>
            </div>
            <div className="ai-modal-body">
              {isAiLoading ? (
                <div className="ai-loading-state">
                  <div className="loader"></div>
                  <p>{aiMode === 'summarize' ? 'Summarizing the text...' : 'Analyzing passages...'}</p>
                </div>
              ) : (
                <div className="ai-result-content" dangerouslySetInnerHTML={{ __html: aiResult }} />
              )}
            </div>
          </div>
        </div>
      )}

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
                  if (pendingAiMode) {
                    handleAi(pendingAiMode);
                    setPendingAiMode(null);
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

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .sidebar {
            width: 100%;
            position: absolute;
            height: 100%;
          }

          .sidebar-header {
            height: 52px;
          }

          .reader-toolbar {
            height: auto;
            min-height: 48px;
            padding: 0.4rem 0.6rem;
            flex-wrap: wrap;
            gap: 0.35rem;
          }

          .toolbar-left, .toolbar-right {
            gap: 0.3rem;
          }

          .toolbar-right {
            flex-wrap: wrap;
            justify-content: flex-end;
          }

          .local-search-form {
            width: 160px;
          }

          .icon-button {
            width: 36px;
            height: 36px;
            min-width: 36px;
            font-size: 0.85rem;
          }

          .zoom-controls {
            display: none;
          }

          .lang-btn {
            padding: 4px 7px;
            font-size: 0.75rem;
          }

          .search-modal, .ai-modal {
            height: 95vh;
            max-height: 95vh;
            border-radius: var(--radius-md);
          }

          .ai-modal-body {
            padding: 1.25rem;
          }

          .ai-result-content {
            font-size: 0.92rem;
          }

          .search-modal-overlay {
            padding: 0.5rem;
          }

          .book-search-results {
            width: calc(100vw - 2rem);
            left: -1rem;
          }

          /* Comparative stacks vertically on mobile */
          .iframe-wrapper.compare-active {
            flex-direction: column;
          }

          .compare-left {
            border-right: none;
            border-bottom: 1px solid var(--card-border);
          }

          .compare-left,
          .compare-right {
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

          /* Full-width translation indicator for mobile */
          .translation-indicator {
            position: fixed;
            top: auto;
            bottom: 0;
            left: 0;
            right: 0;
            border-radius: 0;
            padding: 1rem;
            font-size: 1rem;
            z-index: 999;
            justify-content: center;
          }
        }

        @media (max-width: 480px) {
          .toolbar-left {
            width: 100%;
            justify-content: space-between;
          }

          .toolbar-right {
            width: 100%;
          }

          .local-search-form {
            width: 100%;
            flex: 1;
          }

          .nav-controls {
            display: flex;
          }

          .theme-controls {
            display: flex;
          }

          .theme-btn {
            width: 30px;
            height: 30px;
            font-size: 0.75rem;
          }

          .ai-controls {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
