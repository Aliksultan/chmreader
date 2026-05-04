'use client';

import { useEffect, useState, use, useRef, useCallback } from 'react';
import Link from 'next/link';
import AiStudyHub from '../../components/AiStudyHub';
import ReaderSettings from '@/components/ReaderSettings';
import Highlighter from '@/components/Highlighter';
import { useReader } from '@/context/ReaderContext';

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
  
  const { settings, updateSettings, user, bookmarks, addBookmark, removeBookmark, addToHighlightsIndex, removeFromHighlightsIndex } = useReader();

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

  // Book-Wide Search
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchModalPage, setSearchModalPage] = useState(1);
  const RESULTS_PER_PAGE = 50;
  const iframeRef = useRef(null);
  const pendingHighlightRef = useRef(null);

  const [tocFilter, setTocFilter] = useState('');
  const [iframeLoading, setIframeLoading] = useState(false);
  const scrollPositionsRef = useRef({});
  const [searchQuery, setSearchQuery] = useState('');

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

  // Bookmarks (managed by ReaderContext — cloud synced)
  const [showBookmarks, setShowBookmarks] = useState(false);

  // Sidebar tab
  const [sidebarTab, setSidebarTab] = useState('toc'); // 'toc' | 'bookmarks'

  // Premium Mobile UI State
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);
  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false);
  const [isNavVisible, setIsNavVisible] = useState(true);

  // Load saved API key
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setGeminiApiKey(savedKey);
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
    const existing = bookmarks.find(b => b.pageUrl === clean);
    if (existing) {
      removeBookmark(existing.id);
    } else {
      const tocIndex = getCurrentIndex();
      const pageTitle = tocIndex !== -1
        ? (tocMap[flattenedToc[tocIndex]] || flattenedToc[tocIndex])
        : clean.split('/').pop();
      addBookmark({
        book,
        bookTitle: book.replace('.chm', ''),
        pageUrl: clean,
        pageTitle,
      });
    }
  };

  const isBookmarked = () => {
    if (!currentPage) return false;
    const clean = currentPage.split('?')[0].split('#')[0];
    return bookmarks.some(b => b.pageUrl === clean);
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


  // Read Progress Save
  useEffect(() => {
    if (currentPage && !loading && !error) {
      localStorage.setItem(`chm_progress_${book}`, currentPage);
    }
  }, [currentPage, book, loading, error]);

  useEffect(() => {
    const t = Date.now();
    Promise.all([
      fetch(`/api/read/${encodeURIComponent(book)}?t=${t}`).then(res => res.json()),
      fetch(`/api/toc/${encodeURIComponent(book)}?t=${t}`).then(res => res.json())
    ])
      .then(([readData, tocData]) => {
        if (readData.cacheUrl) {
          setCacheUrl(readData.cacheUrl);
        }
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
        let savedPage = localStorage.getItem(`chm_progress_${book}`);
        if (savedPage) {
            // Scrub old paths
            if (savedPage.includes('/cache/')) {
                savedPage = savedPage.replace(/\/cache\/[^/]+/, readData.cacheUrl);
            }
            if (savedPage.includes('/api/content/kutuphane/')) {
                savedPage = savedPage.replace('/api/content/kutuphane/', '/api/content/');
            }
            
            // Extreme failsafe to prevent looping 404s due to a completely corrupted saved path
            if (savedPage === `/api/content//index.htm` || savedPage === `/api/content/index.htm`) {
                savedPage = null; // force it to pick the first link automatically
            }
        }

        if (targetPage) {
          // If a specific page is requested via URL, load it
          setCurrentPage(`${readData.cacheUrl || `/cache/${book.replace('.chm', '')}`}/${targetPage}`);
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
              setCurrentPage(`${readData.cacheUrl || `/cache/${book.replace('.chm', '')}`}/${firstLink}`);
            } else {
              setCurrentPage(`${readData.cacheUrl}/index.htm`);
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

  // Pinch-to-zoom on mobile — scales mainFontSize via ReaderContext
  useEffect(() => {
    let initialDist = 0;
    let initialFontSize = settings.mainFontSize;
    const getDistance = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        initialDist = getDistance(e.touches);
        initialFontSize = settings.mainFontSize;
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 2) {
        const dist = getDistance(e.touches);
        const scale = dist / initialDist;
        const newSize = Math.max(12, Math.min(32, Math.round(initialFontSize * scale)));
        updateSettings({ mainFontSize: newSize });
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, [settings.mainFontSize]);

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
    // Inject CSS to fix text contrast issues and apply dynamic typography
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        const doc = iframeRef.current.contentWindow.document;
        const isDark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        const isSepia = settings.theme === 'sepia';

        if (isDark || isSepia) {
          let style = doc.getElementById('theme-override');
          if (!style) {
            style = doc.createElement('style');
            style.id = 'theme-override';
            doc.head.appendChild(style);
          }
          if (isDark) {
            style.innerHTML = `
              html, body { background-color: #1e293b !important; color: #f8fafc !important; }
              p, div, span, td, th, li, a, h1, h2, h3, h4, h5, h6, font { color: #e2e8f0 !important; background-color: transparent !important; border-color: #334155 !important; }
              table, tr, td, th { border-color: #334155 !important; }
              a { color: #818cf8 !important; }
            `;
          } else if (isSepia) {
            style.innerHTML = `
              html, body { background-color: #f4ecd8 !important; color: #5b4636 !important; }
              p, div, span, td, th, li, a, h1, h2, h3, h4, h5, h6, font { color: #5b4636 !important; background-color: transparent !important; border-color: #c0b196 !important; }
              table, tr, td, th { border-color: #c0b196 !important; }
              a { color: #d97706 !important; }
            `;
          }
        } else {
          const style = doc.getElementById('theme-override');
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
        
        const isMobileView = window.innerWidth <= 1024;
        const ff = settings.mainFontFamily;
        const fs = settings.mainFontSize;
        const lh = settings.lineHeight;
        const aff = settings.arabicFontFamily;
        const afs = settings.arabicFontSize;

        responsiveStyle.innerHTML = `
          /* ── Layout ── */
          html, body {
            max-width: 1200px !important;
            margin: 0 auto !important;
            padding: ${isMobileView ? '80px 20px 100px 20px' : '40px 60px'} !important;
          }
          img { max-width: 100% !important; height: auto !important; border-radius: 8px; }

          /* ── Main Typography — target every element so inline styles are overridden ── */
          body, p, div, span, li, ul, ol, td, th, blockquote, pre, h1, h2, h3, h4, h5, h6, font {
            font-family: ${ff}, -apple-system, sans-serif !important;
          }
          body, p, div, span, li, td, th, blockquote, pre, font {
            font-size: ${fs}px !important;
            line-height: ${lh} !important;
          }
          h1 { font-size: ${Math.round(fs * 1.8)}px !important; line-height: 1.25 !important; }
          h2 { font-size: ${Math.round(fs * 1.5)}px !important; line-height: 1.3  !important; }
          h3 { font-size: ${Math.round(fs * 1.25)}px !important; line-height: 1.35 !important; }

          /* ── Arabic / Quranic ── */
          [lang^="ar"], [dir="rtl"], .arabic-text, font[face*="Arabic"], font[face*="arabic"] {
            font-family: ${aff}, serif !important;
            font-size: ${afs}px !important;
            line-height: 2 !important;
          }
          .arabic-text {
            direction: rtl;
            display: inline-block;
            margin: 0 4px;
          }

          /* ── Highlight colours (injected here so iframe sees them) ── */
          mark[data-highlight-id] { border-radius: 3px; padding: 1px 2px; cursor: pointer; transition: filter .15s; }
          mark[data-highlight-id]:hover { filter: brightness(0.88); }
          mark.hl-yellow { background: #fde68a !important; color: #78350f !important; }
          mark.hl-green  { background: #a7f3d0 !important; color: #064e3b !important; }
          mark.hl-blue   { background: #bfdbfe !important; color: #1e3a8a !important; }
          mark.hl-pink   { background: #fbcfe8 !important; color: #831843 !important; }
          mark.hl-purple { background: #ddd6fe !important; color: #4c1d95 !important; }
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

      } catch (e) { }
    }
  };


  // Re-apply iframe styles whenever settings change (font, size, theme, line-height)
  // This effect MUST live after applyIframeTheme is defined.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { applyIframeTheme(activeLang); }, [settings]);

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
          <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
        </div>
      )}

      {/* Sidebar */}
      <aside className={`reader-sidebar ${sidebarOpen ? '' : 'sidebar-closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-title-row">
            <span className="sidebar-book-title">{book.replace('.chm', '')}</span>
            <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} title="Close">✕</button>
          </div>

          <div className="sidebar-tabs">
            <button className={`sidebar-tab ${sidebarTab === 'toc' ? 'active' : ''}`} onClick={() => setSidebarTab('toc')}>
              Contents
            </button>
            <button className={`sidebar-tab ${sidebarTab === 'bookmarks' ? 'active' : ''}`} onClick={() => setSidebarTab('bookmarks')}>
              Bookmarks {bookmarks.filter(b => b.book === book).length > 0 && `(${bookmarks.filter(b=>b.book===book).length})`}
            </button>
          </div>

          {sidebarTab === 'toc' && (
            <div className="sidebar-search">
              <span className="toc-filter-icon">⌕</span>
              <input
                className="toc-filter-input"
                type="text"
                placeholder="Filter chapters…"
                value={tocFilter}
                onChange={e => setTocFilter(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="sidebar-body">
          {sidebarTab === 'toc' ? (
            loading ? (
              <div style={{display:'flex',justifyContent:'center',padding:'24px'}}>
                <div className="loader small" />
              </div>
            ) : error ? (
              <div style={{padding:'12px',color:'var(--danger)',fontFamily:'var(--font-ui)',fontSize:'0.8rem'}}>Failed to load content</div>
            ) : (
              <ul className="toc-list">
                {filteredToc.map((item, index) => (
                  <TocNode
                    key={index}
                    item={item}
                    cacheUrl={cacheUrl}
                    setCurrentPage={(page) => { saveScrollPosition(); setIframeLoading(true); setCurrentPage(page); setSidebarOpen(window.innerWidth > 1024); }}
                    currentPage={currentPage}
                    expandedPaths={expandedPaths}
                    onToggleExpand={onToggleExpand}
                    nodePath={`/${index}`}
                  />
                ))}
              </ul>
            )
          ) : (
            <div>
              {bookmarks.length === 0 ? (
                <div style={{padding:'24px 12px',textAlign:'center',fontFamily:'var(--font-ui)'}}>
                  <div style={{fontSize:'2rem',marginBottom:'10px'}}>🔖</div>
                  <p style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>No bookmarks yet.<br/>Tap ☆ to bookmark a page.</p>
                </div>
              ) : (
                bookmarks.map(bm => (
                  <div key={bm.id} className="bookmark-item" onClick={() => { if(bm.pageUrl) setCurrentPage(`${cacheUrl}/${bm.pageUrl.split('/').pop()}`); }}>
                    <div style={{flex:1,minWidth:0}}>
                      <div className="bookmark-item-text">{bm.pageTitle || 'Untitled'}</div>
                      <div className="bookmark-item-book">{bm.bookTitle || bm.book}</div>
                    </div>
                    <button className="bookmark-delete" onClick={e => { e.stopPropagation(); removeBookmark(bm.id); }} title="Remove">×</button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <Link href="/profile" className="sidebar-profile-link">
            <div className="sidebar-profile-avatar">
              {user ? user.username[0].toUpperCase() : '?'}
            </div>
            <span>{user ? user.username : 'Sign in to sync'}</span>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="reader-main">
        {/* Top Toolbar */}
        <div className="reader-toolbar desktop-only">
          <div className="toolbar-left">
            {!sidebarOpen && (
              <button className="icon-button" onClick={() => setSidebarOpen(true)} title="Open Sidebar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
            )}
            <Link href="/" style={{display:'flex',alignItems:'center',gap:'5px',padding:'5px 10px',borderRadius:'8px',background:'var(--surface)',boxShadow:'var(--shadow-neu-sm)',textDecoration:'none',color:'var(--text-muted)',fontFamily:'var(--font-ui)',fontSize:'0.75rem',fontWeight:700}}>
              ← Library
            </Link>
          </div>

          <div className="toolbar-center">
            <div className="book-search-wrapper">
              <input
                type="text"
                placeholder="Find in book…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="toolbar-input"
              />
              {(searchQuery || isSearching) && (
                <button type="button" className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
              )}
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
                            setSearchQuery('');
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
                      <button className="show-more-btn" onClick={() => setIsSearchModalOpen(true)}>
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
              >◀</button>
              <button
                className="icon-button"
                onClick={navigateNext}
                disabled={getCurrentIndex() === -1 || getCurrentIndex() >= flattenedToc.length - 1}
                title="Next Section (→)"
              >▶</button>
            </div>

            <button className="icon-button random-btn" onClick={handleRandomSection} disabled={flattenedToc.length === 0} title="Random Section">🎲</button>

            <div className="translate-controls">
              <button className={`lang-btn ${activeLang === 'tr' ? 'active' : ''}`} onClick={() => handleTranslate('tr')} disabled={isTranslating || activeLang === 'tr'} title="Original Turkish">🇹🇷 TR</button>
              <button className={`lang-btn ${activeLang === 'ru' ? 'active' : ''}`} onClick={() => handleTranslate('ru')} disabled={isTranslating} title="Translate to Russian">
                {isTranslating && activeLang === 'ru' ? '⏳' : `🇷🇺 RU${translationCacheRef.current['ru'] ? ' ✓' : ''}`}
              </button>
              <button className={`lang-btn ${activeLang === 'kk' ? 'active' : ''}`} onClick={() => handleTranslate('kk')} disabled={isTranslating} title="Translate to Kazakh">
                {isTranslating && activeLang === 'kk' ? '⏳' : `🇰🇿 KZ${translationCacheRef.current['kk'] ? ' ✓' : ''}`}
              </button>
            </div>

            <button className={`icon-button ${isBookmarked() ? 'primary bookmark-active' : ''}`} onClick={toggleBookmark} title={isBookmarked() ? 'Remove Bookmark' : 'Bookmark this page'}>
              {isBookmarked() ? '⭐' : '☆'}
            </button>

            <button className={`icon-button ${compareMode ? 'primary' : ''}`} onClick={toggleCompareMode} disabled={activeLang === 'tr'} title="Compare Side-by-Side">⚖️</button>

            {!isEditing ? (
              <button className="icon-button" onClick={startEditing} disabled={activeLang === 'tr'} title="Edit Translation">✏️</button>
            ) : (
              <>
                <button className="icon-button primary" onClick={saveTranslation} disabled={isSaving} title="Save Translation">{isSaving ? '⏳' : '💾'}</button>
                <button className="icon-button" onClick={cancelEditing} title="Cancel Edit">❌</button>
              </>
            )}

            <button className="icon-button ai-btn" onClick={() => setShowAiPanel(true)} title="Open AI Study Hub">
              🧠 <span className="tooltip">AI Hub</span>
            </button>

            <ReaderSettings />
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
                className={`content-iframe ${settings.theme === 'dark' ? 'dark-iframe-bg' : ''} ${iframeLoading ? 'iframe-loading' : ''}`}
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
                    className={`compare-content ${settings.theme === 'dark' ? 'compare-dark' : ''} ${isEditing ? 'editor-active' : ''}`}
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
                 <button className="sheet-btn" onClick={() => updateSettings({ mainFontSize: Math.max(12, settings.mainFontSize - 2) })}>A-</button>
                 <span className="sheet-val">{settings.mainFontSize}px</span>
                 <button className="sheet-btn" onClick={() => updateSettings({ mainFontSize: Math.min(32, settings.mainFontSize + 2) })}>A+</button>
               </div>
               <div className="sheet-row theme-toggles">
                 <button className={`sheet-btn ${settings.theme === 'light' ? 'active' : ''}`} onClick={() => updateSettings({ theme: 'light' })}>☀️ Light</button>
                 <button className={`sheet-btn ${settings.theme === 'dark' ? 'active' : ''}`} onClick={() => updateSettings({ theme: 'dark' })}>🌙 Dark</button>
                 <button className={`sheet-btn ${settings.theme === 'sepia' ? 'active' : ''}`} onClick={() => updateSettings({ theme: 'sepia' })}>☕ Sepia</button>
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

      {/* Highlighter Component */}
      <Highlighter iframeRef={iframeRef} currentPage={currentPage} bookId={book.replace('.chm', '')} />

      <style jsx global>{`
        /* ── Layout ── */
        .reader-layout { display:flex; height:100vh; overflow:hidden; background:var(--surface); position:relative; font-family:var(--font-ui); }

        /* ── Progress bar ── */
        .progress-bar-container { position:fixed; top:0; left:0; right:0; height:3px; z-index:9999; background:var(--surface-down); }
        .progress-bar { height:100%; background:linear-gradient(90deg,var(--primary),#00a0a0); transition:width 0.4s ease; }

        /* ── Sidebar ── */
        .reader-sidebar {
          width:var(--sidebar-width); min-width:var(--sidebar-width);
          height:100vh; display:flex; flex-direction:column;
          background:var(--surface);
          box-shadow:4px 0 20px var(--neu-dark), -1px 0 0 var(--neu-light);
          z-index:200; transition:transform 0.28s cubic-bezier(.4,0,.2,1);
          position:relative;
        }
        .sidebar-closed { transform:translateX(-100%); position:absolute; }

        .sidebar-header {
          padding:18px 16px 12px;
          border-bottom:1px solid var(--surface-border);
          display:flex; flex-direction:column; gap:10px;
        }
        .sidebar-title-row { display:flex; align-items:center; justify-content:space-between; }
        .sidebar-book-title { font-size:0.8rem; font-weight:700; color:var(--primary); letter-spacing:0.06em; text-transform:uppercase; font-family:var(--font-ui); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .sidebar-close-btn { width:28px;height:28px;border-radius:8px;border:none;background:var(--surface);box-shadow:var(--shadow-neu-sm);color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0; }

        /* Sidebar tabs */
        .sidebar-tabs { display:flex;gap:6px;padding:4px;background:var(--surface-down);border-radius:10px; }
        .sidebar-tab { flex:1;padding:7px;border:none;border-radius:7px;font-family:var(--font-ui);font-size:0.72rem;font-weight:700;cursor:pointer;background:transparent;color:var(--text-muted);transition:all 0.15s;letter-spacing:0.04em; }
        .sidebar-tab.active { background:var(--surface);box-shadow:var(--shadow-neu-sm);color:var(--primary); }

        .sidebar-search { position:relative; }
        .toc-filter-input { width:100%;padding:8px 12px 8px 32px;border:none;border-radius:8px;background:var(--surface);box-shadow:var(--shadow-neu-in);font-family:var(--font-ui);font-size:0.8rem;color:var(--text);outline:none; }
        .toc-filter-icon { position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-faint);font-size:13px; }

        .sidebar-body { flex:1;overflow-y:auto;padding:8px 8px 20px; }

        /* TOC items */
        .toc-list { list-style:none;margin:0;padding:0; }
        .toc-item { margin:1px 0; }
        .toc-item-header { display:flex;align-items:center;gap:2px;border-radius:8px;transition:background 0.12s; }
        .toc-item-header:hover { background:var(--surface-up); }
        .toc-item-header.active-node { background:var(--primary-light);box-shadow:var(--shadow-neu-sm-in); }
        .active-node .toc-button { color:var(--primary)!important;font-weight:700; }

        .toc-toggle { width:22px;height:22px;border:none;background:none;cursor:pointer;color:var(--text-faint);font-size:11px;display:flex;align-items:center;justify-content:center;border-radius:4px;flex-shrink:0;transition:transform 0.15s; }
        .toc-toggle:hover { color:var(--primary); }
        .toc-toggle-spacer { width:22px;flex-shrink:0; }

        .toc-button { flex:1;display:flex;align-items:center;gap:6px;padding:6px 6px;border:none;background:none;cursor:pointer;color:var(--text);font-family:var(--font-ui);font-size:0.78rem;text-align:left;border-radius:7px;transition:color 0.12s;min-width:0; }
        .toc-button:hover { color:var(--primary); }
        .toc-folder { color:var(--text-muted); }
        .toc-icon { font-size:12px;flex-shrink:0; }
        .toc-text { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .sub-list { margin-left:14px;border-left:1.5px solid var(--surface-border);padding-left:4px; }

        /* Bookmarks in sidebar */
        .bookmark-item { display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:var(--surface);box-shadow:var(--shadow-neu-sm);margin-bottom:6px;cursor:pointer;transition:box-shadow 0.15s; }
        .bookmark-item:hover { box-shadow:var(--shadow-neu-out); }
        .bookmark-item-text { flex:1;font-size:0.78rem;color:var(--text);font-family:var(--font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .bookmark-item-book { font-size:0.68rem;color:var(--text-muted);margin-top:2px; }
        .bookmark-delete { width:22px;height:22px;border:none;background:none;color:var(--text-faint);cursor:pointer;font-size:14px;border-radius:4px;display:flex;align-items:center;justify-content:center; }
        .bookmark-delete:hover { color:var(--danger); }

        /* Profile link in sidebar footer */
        .sidebar-footer { padding:10px 12px;border-top:1px solid var(--surface-border); }
        .sidebar-profile-link { display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:var(--surface);box-shadow:var(--shadow-neu-sm);text-decoration:none;color:var(--text);font-family:var(--font-ui);font-size:0.78rem;font-weight:700;transition:box-shadow 0.15s; }
        .sidebar-profile-link:hover { box-shadow:var(--shadow-neu-out);color:var(--primary); }
        .sidebar-profile-avatar { width:28px;height:28px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;flex-shrink:0; }

        /* ── Main content area ── */
        .reader-main { flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative; }

        /* ── Toolbar ── */
        .reader-toolbar {
          height:52px;display:flex;align-items:center;gap:8px;padding:0 14px;
          background:var(--surface-up);
          box-shadow:0 2px 12px var(--neu-dark),0 -1px 0 var(--neu-light);
          z-index:100;flex-shrink:0;
        }
        .toolbar-left { display:flex;align-items:center;gap:6px;flex-shrink:0; }
        .toolbar-center { flex:1;display:flex;align-items:center;justify-content:center;max-width:520px;margin:0 auto; }
        .toolbar-right { display:flex;align-items:center;gap:6px;flex-shrink:0; }

        .icon-button {
          width:34px;height:34px;border-radius:9px;border:none;
          background:var(--surface);box-shadow:var(--shadow-neu-sm);
          color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;
          font-size:14px;transition:all 0.15s;flex-shrink:0;font-family:var(--font-ui);
        }
        .icon-button:hover { box-shadow:var(--shadow-neu-out);color:var(--primary); }
        .icon-button:active { box-shadow:var(--shadow-neu-in);transform:scale(0.96); }
        .icon-button:disabled { opacity:0.4;cursor:not-allowed;box-shadow:none; }
        .icon-button.primary { background:var(--primary);color:#fff;box-shadow:3px 3px 10px rgba(0,102,102,0.3); }
        .icon-button.primary:hover { background:var(--primary-hover); }
        .icon-button.bookmark-active { color:#f59e0b; }

        /* Search input */
        .book-search-wrapper { position:relative;display:flex;align-items:center;width:100%; }
        .toolbar-input {
          flex:1;padding:8px 36px 8px 14px;border:none;border-radius:9px;
          background:var(--surface);box-shadow:var(--shadow-neu-in);
          font-family:var(--font-ui);font-size:0.82rem;color:var(--text);outline:none;
          transition:box-shadow 0.15s;
        }
        .toolbar-input:focus { box-shadow:var(--shadow-neu-in),0 0 0 2px var(--primary-light); }
        .clear-search-btn { position:absolute;right:10px;top:50%;transform:translateY(-50%);border:none;background:none;color:var(--text-faint);cursor:pointer;font-size:13px; }

        /* Lang buttons */
        .translate-controls { display:flex;gap:4px; }
        .lang-btn { padding:5px 9px;border-radius:7px;border:none;background:var(--surface);box-shadow:var(--shadow-neu-sm);color:var(--text-muted);font-family:var(--font-ui);font-size:0.73rem;font-weight:700;cursor:pointer;transition:all 0.15s; }
        .lang-btn:hover { color:var(--primary); }
        .lang-btn.active { background:var(--primary);color:#fff;box-shadow:2px 2px 8px rgba(0,102,102,0.3); }
        .lang-btn:disabled { opacity:0.4;cursor:not-allowed; }

        /* Nav controls */
        .nav-controls { display:flex;gap:4px; }

        /* ── Breadcrumb ── */
        .breadcrumb-bar { padding:7px 18px;background:var(--surface-up);border-bottom:1px solid var(--surface-border);font-family:var(--font-ui);font-size:0.72rem;color:var(--text-muted);display:flex;align-items:center;flex-wrap:wrap;gap:4px; }
        .breadcrumb-sep { margin:0 4px;opacity:0.4; }
        .breadcrumb-current { color:var(--text);font-weight:700; }

        /* ── iframe area ── */
        .iframe-wrapper { flex:1;display:flex;overflow:hidden;position:relative; }
        .iframe-pane { flex:1;display:flex;flex-direction:column;overflow:hidden; }
        .content-iframe { flex:1;border:none;width:100%;background:var(--surface-up); }
        .dark-iframe-bg { background:#1a2332; }
        .iframe-loading { opacity:0.5;transition:opacity 0.3s; }

        /* Compare mode */
        .compare-active { }
        .compare-left,.compare-right { display:flex;flex-direction:column;overflow:hidden;min-width:0; }
        .compare-label { padding:6px 14px;font-family:var(--font-ui);font-size:0.72rem;font-weight:700;color:var(--text-muted);background:var(--surface-up);border-bottom:1px solid var(--surface-border); }
        .editing-badge { margin-left:8px;padding:2px 8px;border-radius:999px;background:var(--warning);color:#fff;font-size:0.68rem; }
        .split-divider { width:6px;cursor:col-resize;background:var(--surface-border);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-faint);user-select:none; }
        .compare-content { flex:1;overflow-y:auto;padding:30px 40px;font-family:var(--font-read);font-size:var(--fs,18px);line-height:var(--lh,1.8);color:var(--text); }
        .compare-dark { background:#1a2332;color:#e2eaf0; }
        .editor-active { outline:2px solid var(--primary);border-radius:4px; }

        /* Editor toolbar */
        .editor-toolbar { display:flex;gap:4px;padding:6px 12px;background:var(--surface-up);border-bottom:1px solid var(--surface-border);flex-wrap:wrap; }
        .editor-toolbar button { padding:4px 8px;border-radius:6px;border:none;background:var(--surface);box-shadow:var(--shadow-neu-sm);color:var(--text);font-size:0.78rem;cursor:pointer; }
        .editor-sep { width:1px;background:var(--surface-border);margin:2px 2px; }

        /* Translation indicator */
        .translation-indicator { position:fixed;bottom:80px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:10px 20px;background:var(--surface-up);box-shadow:var(--shadow-neu-out);border-radius:999px;font-family:var(--font-ui);font-size:0.82rem;color:var(--text);z-index:9000; }

        /* ── Modals ── */
        .search-modal-overlay { position:fixed;inset:0;background:rgba(0,0,0,0.35);backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px; }
        .search-modal { background:var(--surface);box-shadow:var(--shadow-neu-out);border-radius:20px;width:100%;max-width:700px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden; }
        .search-modal-header { display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--surface-border); }
        .search-modal-header h2 { font-family:var(--font-ui);font-size:0.95rem;font-weight:700;color:var(--text);margin:0; }
        .search-modal-content { flex:1;overflow-y:auto;padding:10px 14px; }

        .glass-panel { background:var(--surface);box-shadow:var(--shadow-neu-out);border-radius:16px; }

        .book-search-results { position:absolute;top:calc(100% + 8px);left:0;right:0;z-index:5000;border-radius:14px;overflow:hidden;animation:fadeIn 0.15s ease; }
        .search-results-header { padding:10px 14px 6px;border-bottom:1px solid var(--surface-border); }
        .search-results-header h4 { font-family:var(--font-ui);font-size:0.8rem;color:var(--text-muted);margin:0; }
        .search-results-list-small { max-height:320px;overflow-y:auto; }
        .search-result-item { width:100%;padding:10px 14px;border:none;background:none;cursor:pointer;text-align:left;border-bottom:1px solid var(--surface-border);transition:background 0.1s; }
        .search-result-item:hover { background:var(--surface-up); }
        .modal-card { border-radius:10px;margin-bottom:4px;border-bottom:none!important; }
        .res-file { font-family:var(--font-ui);font-size:0.75rem;font-weight:700;color:var(--primary);margin-bottom:3px; }
        .res-snippet { font-family:var(--font-ui);font-size:0.78rem;color:var(--text-muted);line-height:1.4; }
        .res-snippet mark { background:#fde68a;color:#78350f;border-radius:3px;padding:0 2px; }
        .no-results { padding:16px 14px;font-family:var(--font-ui);font-size:0.82rem;color:var(--text-muted); }
        .show-more-btn,.load-more-btn { width:100%;padding:10px;border:none;background:var(--primary-light);color:var(--primary);font-family:var(--font-ui);font-size:0.8rem;font-weight:700;cursor:pointer;border-radius:0 0 12px 12px; }

        /* API key modal */
        .api-key-modal { max-width:480px;width:100%;padding:28px;animation:fadeIn 0.2s ease; }
        .api-key-body p { font-family:var(--font-ui);font-size:0.85rem;color:var(--text-muted);margin-bottom:14px;line-height:1.6; }
        .api-key-input { width:100%;margin-bottom:12px; }
        .save-key-btn { width:100%;padding:11px;border-radius:10px;border:none;background:var(--primary);color:#fff;font-family:var(--font-ui);font-weight:700;font-size:0.88rem;cursor:pointer;box-shadow:3px 3px 10px rgba(0,102,102,0.3); }

        /* ── Loading ── */
        .loader-container { display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:14px; }
        .loader,.loader.small { width:36px;height:36px;border:3px solid var(--surface-border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite; }
        .loader.small { width:18px;height:18px;border-width:2px; }
        @keyframes spin { to { transform:rotate(360deg); } }

        .empty-state { display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;font-family:var(--font-ui); }
        .empty-state h3 { font-size:1.1rem;color:var(--text);margin:0; }
        .empty-state p { font-size:0.85rem;color:var(--text-muted);margin:0; }
        .back-link { padding:9px 18px;border-radius:9px;background:var(--primary);color:#fff;text-decoration:none;font-family:var(--font-ui);font-size:0.82rem;font-weight:700; }
        .full-height { height:100%; }

        /* ── Desktop only / Mobile only ── */
        .desktop-only { display:flex; }
        .mobile-only { display:none; }

        /* ── Mobile top bar ── */
        .mobile-premium-top-bar { display:none;align-items:center;justify-content:space-between;padding:0 12px;height:52px;flex-shrink:0;gap:8px;background:var(--surface-up);box-shadow:0 2px 12px var(--neu-dark);position:sticky;top:0;z-index:200; }
        .mobile-title { font-family:var(--font-ui);font-size:0.82rem;font-weight:700;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center; }

        .nav-hidden-top { transform:translateY(-100%);transition:transform 0.3s ease; }
        .nav-hidden-bottom { transform:translateY(100%);transition:transform 0.3s ease; }

        /* ── Mobile bottom nav ── */
        .mobile-bottom-nav { display:none;align-items:center;justify-content:space-around;padding:0 8px;height:60px;position:fixed;bottom:0;left:0;right:0;z-index:200;background:var(--surface-up);box-shadow:0 -2px 16px var(--neu-dark); }
        .nav-action-btn { display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 14px;border:none;background:none;color:var(--text-muted);font-family:var(--font-ui);font-size:0.65rem;cursor:pointer;border-radius:10px;transition:color 0.15s; }
        .nav-action-btn:hover,.nav-action-btn:active { color:var(--primary); }
        .nav-action-btn:disabled { opacity:0.3;cursor:not-allowed; }
        .bottom-nav-center-wrap { position:relative;display:flex;align-items:center;justify-content:center; }
        .center-primary-btn { width:46px;height:46px;border-radius:50%!important;padding:0!important;background:var(--primary)!important;box-shadow:3px 3px 12px rgba(0,102,102,0.4)!important;margin-top:-12px; }
        .ai-icon-large { font-size:20px; }

        /* Mobile settings sheet */
        .mobile-settings-sheet { position:fixed;bottom:0;left:0;right:0;background:var(--surface);border-radius:20px 20px 0 0;box-shadow:0 -8px 30px var(--neu-dark);z-index:10001;padding:0 0 32px;max-height:80vh;overflow-y:auto;transform:translateY(100%);transition:transform 0.3s cubic-bezier(.4,0,.2,1); }
        .sheet-open { transform:translateY(0)!important; }
        .sheet-handle { width:36px;height:4px;border-radius:999px;background:var(--surface-border);margin:12px auto 8px; }
        .sheet-header { display:flex;align-items:center;justify-content:space-between;padding:8px 18px 12px;border-bottom:1px solid var(--surface-border); }
        .sheet-title { font-family:var(--font-ui);font-size:0.9rem;font-weight:700;color:var(--text);margin:0; }
        .sheet-subtitle { font-family:var(--font-ui);font-size:0.72rem;color:var(--text-muted);margin:0 0 8px; }
        .sheet-section { padding:14px 16px;border-bottom:1px solid var(--surface-border); }
        .sheet-row { display:flex;align-items:center;gap:8px;margin-bottom:8px; }
        .sheet-row:last-child { margin-bottom:0; }
        .sheet-val { font-family:var(--font-ui);font-size:0.85rem;color:var(--text);min-width:48px;text-align:center; }
        .sheet-btn { flex:1;padding:9px 8px;border-radius:9px;border:none;background:var(--surface);box-shadow:var(--shadow-neu-sm);color:var(--text-muted);font-family:var(--font-ui);font-size:0.78rem;font-weight:700;cursor:pointer;transition:all 0.15s; }
        .sheet-btn.active { background:var(--primary);color:#fff;box-shadow:2px 2px 8px rgba(0,102,102,0.3); }
        .sheet-btn.full-width { width:100%; }

        /* ── Swipe hint ── */
        .swipe-hint { display:none;position:fixed;bottom:72px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.65);color:#fff;padding:9px 22px;border-radius:999px;font-family:var(--font-ui);font-size:0.82rem;z-index:999;animation:swipeHintFade 4s ease forwards;cursor:pointer; }

        /* AI btn */
        .ai-btn { min-width:34px;gap:5px;padding:0 10px;width:auto; }
        .ai-btn .tooltip { font-size:0.75rem;font-weight:700;font-family:var(--font-ui); }

        /* Search spinner */
        .search-spinner-small { display:inline-block;width:12px;height:12px;border:2px solid var(--surface-border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle;margin-left:6px; }

        /* Random btn */
        .random-btn { font-size:16px; }

        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
        @keyframes swipeHintFade { 0%,70%{opacity:1}100%{opacity:0;pointer-events:none} }

        /* ── MOBILE breakpoint ── */
        @media (max-width:1024px) {
          .desktop-only { display:none!important; }
          .mobile-only { display:flex!important; }
          .reader-sidebar { position:absolute;top:0;left:0;height:100%;z-index:500; }
          .sidebar-closed { transform:translateX(-100%); }
          .reader-main { padding-bottom:60px; }
          .mobile-bottom-nav { display:flex; }
          .mobile-premium-top-bar { display:flex; }
          .reader-toolbar { display:none; }
          .split-divider { width:100%;height:6px;cursor:row-resize; }
          .compare-left,.compare-right { flex:1!important;min-height:0; }
          .translation-indicator { bottom:72px; }
          .swipe-hint { display:flex; }
        }
      `}</style>
    </div>
  );
}