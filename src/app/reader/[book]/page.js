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
            {expanded ? '▼' : '▶'}
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

  // Load saved API key
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setGeminiApiKey(savedKey);
  }, []);

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

    // If we already have a cached translation for this language, use it
    if (translationCacheRef.current[targetLang]) {
      doc.body.innerHTML = translationCacheRef.current[targetLang];
      setActiveLang(targetLang);
      applyIframeTheme();
      return;
    }

    // Otherwise, translate via API
    try {
      // Restore original first to get clean text
      doc.body.innerHTML = originalHtmlRef.current;

      const bodyText = doc.body.innerText || '';
      if (!bodyText.trim()) return;

      setIsTranslating(true);
      setActiveLang(targetLang);

      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: bodyText,
          targetLang: targetLang,
          apiKey: geminiApiKey
        })
      });

      const data = await res.json();
      if (data.error) {
        alert(`Translation error: ${data.error}`);
        doc.body.innerHTML = originalHtmlRef.current;
        setActiveLang('tr');
      } else {
        const translatedHtml = data.translation
          .split('\n')
          .map(line => line.trim() ? `<p style="margin: 0.5em 0; line-height: 1.8;">${line}</p>` : '')
          .join('');
        // Cache the translated HTML
        translationCacheRef.current[targetLang] = translatedHtml;
        doc.body.innerHTML = translatedHtml;
        applyIframeTheme();
      }
    } catch (err) {
      alert(`Translation error: ${err.message}`);
      doc.body.innerHTML = originalHtmlRef.current;
      setActiveLang('tr');
    } finally {
      setIsTranslating(false);
    }
  };

  // Reset original HTML when page changes
  useEffect(() => {
    originalHtmlRef.current = null;
    translationCacheRef.current = {};
    setActiveLang('tr');
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

  // Escape to close search panel
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') setSearchQuery('');
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleIframeLoad = () => {
    applyZoom();
    applyIframeTheme(); // Inject basic dark mode to iframe if needed
  };

  const applyZoom = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.document.body.style.zoom = `${zoomLevel}%`;
      } catch (e) {
        console.warn('Cannot apply zoom to iframe (cross-origin or sandboxed)', e);
      }
    }
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

  return (
    <div className="reader-layout">
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
                            setCurrentPage(res.directUrl || res.link);
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
                onClick={() => {
                  const cleanCurrentPage = currentPage ? currentPage.split('?')[0].split('#')[0] : '';
                  const currentIndex = flattenedToc.findIndex(local => {
                    return cleanCurrentPage.endsWith('/' + local.split('?')[0].split('#')[0]);
                  });
                  if (currentIndex > 0) {
                    setCurrentPage(`${cacheUrl || `/cache/${book.replace('.chm', '')}`}/${flattenedToc[currentIndex - 1]}`);
                  }
                }}
                disabled={(() => {
                  if (!flattenedToc.length || !currentPage) return true;
                  const cleanCurrentPage = currentPage.split('?')[0].split('#')[0];
                  return flattenedToc.findIndex(local => cleanCurrentPage.endsWith('/' + local.split('?')[0].split('#')[0])) <= 0;
                })()}
                title="Previous Section"
              >
                ◀
              </button>
              <button
                className="icon-button"
                onClick={() => {
                  const cleanCurrentPage = currentPage ? currentPage.split('?')[0].split('#')[0] : '';
                  const currentIndex = flattenedToc.findIndex(local => {
                    return cleanCurrentPage.endsWith('/' + local.split('?')[0].split('#')[0]);
                  });
                  if (currentIndex !== -1 && currentIndex < flattenedToc.length - 1) {
                    setCurrentPage(`${cacheUrl || `/cache/${book.replace('.chm', '')}`}/${flattenedToc[currentIndex + 1]}`);
                  }
                }}
                disabled={(() => {
                  if (!flattenedToc.length || !currentPage) return true;
                  const cleanCurrentPage = currentPage.split('?')[0].split('#')[0];
                  const currentIndex = flattenedToc.findIndex(local => cleanCurrentPage.endsWith('/' + local.split('?')[0].split('#')[0]));
                  return currentIndex === -1 || currentIndex >= flattenedToc.length - 1;
                })()}
                title="Next Section"
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
                {isTranslating && activeLang === 'ru' ? '⏳' : '🇷🇺 RU'}
              </button>
              <button
                className={`lang-btn ${activeLang === 'kk' ? 'active' : ''}`}
                onClick={() => handleTranslate('kk')}
                disabled={isTranslating}
                title="Translate to Kazakh"
              >
                {isTranslating && activeLang === 'kk' ? '⏳' : '🇰🇿 KZ'}
              </button>
            </div>

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
          <div className="iframe-wrapper">
            <iframe
              ref={iframeRef}
              src={currentPage}
              className={`content-iframe ${theme === 'dark' ? 'dark-iframe-bg' : ''}`}
              title="Book Content"
              onLoad={handleIframeLoad}
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />

            {/* Translation Loading Overlay */}
            {isTranslating && (
              <div className="translation-overlay">
                <div className="translation-loading">
                  <div className="loader"></div>
                  <p>Translating to {activeLang === 'ru' ? 'Russian' : 'Kazakh'}...</p>
                </div>
              </div>
            )}

            {/* AI Results Panel */}
            {showAiPanel && (
              <div className="ai-panel">
                <div className="ai-panel-header">
                  <h3>{aiMode === 'summarize' ? '📝 Summary' : '💡 Explanation'}</h3>
                  <button className="icon-button" onClick={() => setShowAiPanel(false)}>✕</button>
                </div>
                <div className="ai-panel-body">
                  {isAiLoading ? (
                    <div className="translation-loading" style={{ boxShadow: 'none', border: 'none', background: 'transparent' }}>
                      <div className="loader"></div>
                      <p>{aiMode === 'summarize' ? 'Summarizing...' : 'Analyzing passages...'}</p>
                    </div>
                  ) : (
                    <div className="ai-result-text">{aiResult}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

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
                    setCurrentPage(res.directUrl || res.link);
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

      <style jsx>{`
        .reader-layout {
          display: flex;
          height: 100vh;
          overflow: hidden;
          background-color: var(--background);
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
        
        .sidebar-content {
          padding: 1.25rem;
          overflow-y: auto;
          flex-grow: 1;
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
          background: none;
          border: none;
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

        .translation-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
          animation: fadeIn 0.2s ease;
        }

        .translation-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2.5rem 3.5rem;
          gap: 1rem;
          color: var(--text-muted);
          background: var(--background);
          border-radius: var(--radius-lg);
          border: 1px solid var(--card-border);
          box-shadow: var(--shadow-xl);
          animation: slideUp 0.25s ease;
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
          position: relative;
          background: var(--background);
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

        .ai-panel {
          position: absolute;
          top: 0;
          right: 0;
          width: 420px;
          max-width: 50%;
          height: 100%;
          background: var(--sidebar-bg);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-left: 1px solid var(--card-border);
          box-shadow: var(--shadow-xl);
          z-index: 15;
          display: flex;
          flex-direction: column;
          animation: slideInRight 0.3s ease;
        }

        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        .ai-panel-header {
          padding: 0.875rem 1.25rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--card-border);
          flex-shrink: 0;
        }

        .ai-panel-header h3 {
          font-size: 1rem;
          font-weight: 700;
          margin: 0;
          color: var(--text-primary);
        }

        .ai-panel-body {
          flex-grow: 1;
          overflow-y: auto;
          padding: 1.25rem;
        }

        .ai-result-text {
          font-size: 0.9rem;
          line-height: 1.75;
          color: var(--text-primary);
          white-space: pre-wrap;
          word-wrap: break-word;
        }
      `}</style>
    </div>
  );
}
