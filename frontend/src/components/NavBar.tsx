import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Sparkles, History, Settings, BookOpen, Monitor, LayoutDashboard, BarChart2, Sun, Moon, Search, ChevronDown, Package, FileText, MonitorDown } from 'lucide-react';
import { healthCheck } from '../api/client';

const ROUTE_LABELS: Record<string, { label: string; parent?: string }> = {
  '/': { label: '首页' },
  '/create': { label: '创建作品' },
  '/history': { label: '历史记录' },
  '/settings': { label: '系统设置' },
  '/cms': { label: '内容管理' },
  '/cms/exhibits': { label: '展品管理', parent: '/cms' },
  '/cms/contents': { label: '内容列表', parent: '/cms' },
  '/cms/contents/new': { label: '新建内容', parent: '/cms/contents' },
  '/analytics': { label: '数据分析' },
};

export default function NavBar() {
  const [health, setHealth] = useState<{
    tts_ready: boolean;
    wav2lip_ready: boolean;
  } | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });
  const [showSearch, setShowSearch] = useState(false);
  const [cmsOpen, setCmsOpen] = useState(false);
  const cmsRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    healthCheck().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Close CMS dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cmsRef.current && !cmsRef.current.contains(e.target as Node)) {
        setCmsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch((v) => !v);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSearch]);

  const pathParts = location.pathname.split('/').filter(Boolean);

  return (
    <>
      <header className="app-header">
        <NavLink to="/" className="logo" style={{ textDecoration: 'none' }}>
          <div className="logo-mark">
            <div className="logo-mark-bg" />
            <div className="logo-mark-inner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
                <path d="M19 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M5 21v-2a4 4 0 0 1 3-3.87" />
                <circle cx="12" cy="8" r="1" />
                <path d="M12 9v2" />
              </svg>
            </div>
          </div>
          <div className="logo-text">
            <span className="logo-name">境语智导</span>
            <span className="logo-tagline">AI Digital Human</span>
          </div>
        </NavLink>

        <nav className="header-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
            <Home size={15} />
            <span>首页</span>
          </NavLink>
          <NavLink to="/create" className={({ isActive }) => isActive ? 'active' : ''}>
            <Sparkles size={15} />
            <span>创建作品</span>
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => isActive ? 'active' : ''}>
            <History size={15} />
            <span>历史记录</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>
            <Settings size={15} />
            <span>设置</span>
          </NavLink>
          {/* CMS Dropdown */}
          <div ref={cmsRef} className="nav-dropdown-wrap">
            <button
              className={`nav-dropdown-trigger ${location.pathname.startsWith('/cms') ? 'active' : ''}`}
              onClick={() => setCmsOpen((v) => !v)}
              onMouseEnter={() => setCmsOpen(true)}
            >
              <LayoutDashboard size={15} />
              <span>内容管理</span>
              <ChevronDown size={12} className={`nav-dropdown-chevron ${cmsOpen ? 'open' : ''}`} />
            </button>
            {cmsOpen && (
              <div className="nav-dropdown">
                <NavLink
                  to="/cms"
                  end
                  className="nav-dropdown-item"
                  onClick={() => setCmsOpen(false)}
                >
                  <LayoutDashboard size={14} />
                  <span>概览</span>
                </NavLink>
                <NavLink
                  to="/cms/exhibits"
                  className="nav-dropdown-item"
                  onClick={() => setCmsOpen(false)}
                >
                  <Package size={14} />
                  <span>展品管理</span>
                </NavLink>
                <NavLink
                  to="/cms/contents"
                  className="nav-dropdown-item"
                  onClick={() => setCmsOpen(false)}
                >
                  <FileText size={14} />
                  <span>内容列表</span>
                </NavLink>
              </div>
            )}
          </div>
          <NavLink to="/analytics" className={({ isActive }) => isActive ? 'active' : ''}>
            <BarChart2 size={15} />
            <span>数据分析</span>
          </NavLink>
          <NavLink to="/terminal-settings" className={({ isActive }) => isActive ? 'active' : ''}>
            <MonitorDown size={15} />
            <span>终端设置</span>
          </NavLink>
          <a href="/terminal" target="_blank" rel="noopener noreferrer" className="header-nav-link">
            <Monitor size={15} />
            <span>终端</span>
          </a>
        </nav>

        <div className="header-right">
          {/* Search shortcut hint */}
          <button
            className="header-icon-btn"
            onClick={() => setShowSearch((v) => !v)}
            title="搜索 (Ctrl+K)"
          >
            <Search size={15} />
          </button>

          {/* Theme toggle */}
          <button
            className="header-icon-btn"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? '浅色模式' : '深色模式'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <div className="engine-status">
            {health && (
              <>
                <div className={`engine-dot ${health.tts_ready ? 'ready' : ''}`}>
                  <div className="dot" />
                  <span>TTS</span>
                </div>
                <div className={`engine-dot ${health.wav2lip_ready ? 'ready' : ''}`}>
                  <div className="dot" />
                  <span>Wav2Lip</span>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Global Search Overlay */}
      {showSearch && (
        <div
          className="global-search-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSearch(false); }}
        >
          <div className="global-search-modal">
            <div className="global-search-header">
              <Search size={16} />
              <input
                autoFocus
                className="global-search-input"
                placeholder="搜索展品、内容..."
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowSearch(false);
                  if (e.key === 'Enter') {
                    window.location.href = '/cms/contents';
                    setShowSearch(false);
                  }
                }}
              />
              <button className="global-search-shortcut" onClick={() => setShowSearch(false)}>
                <kbd>ESC</kbd>
              </button>
            </div>
            <div className="global-search-hints">
              <p>输入关键词搜索展品和内容</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {[
                  { label: '内容管理', href: '/cms' },
                  { label: '创建作品', href: '/create' },
                  { label: '数据分析', href: '/analytics' },
                  { label: '历史记录', href: '/history' },
                  { label: '系统设置', href: '/settings' },
                ].map((item) => (
                  <button
                    key={item.href}
                    className="global-search-hint-btn"
                    onClick={() => {
                      window.location.href = item.href;
                      setShowSearch(false);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .header-icon-btn {
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 8px;
          background: transparent; border: none;
          color: var(--text2); cursor: pointer;
          transition: all 0.2s;
        }
        .header-icon-btn:hover {
          background: var(--surface2); color: var(--text);
        }
        .global-search-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(8px);
          display: flex; align-items: flex-start; justify-content: center;
          padding-top: 120px; z-index: 99999;
        }
        .global-search-modal {
          width: 560px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.4);
          overflow: hidden;
        }
        .global-search-header {
          display: flex; align-items: center; gap: 12px;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
        }
        .global-search-input {
          flex: 1; background: none; border: none; outline: none;
          font-size: 16px; color: var(--text);
          font-family: var(--font);
        }
        .global-search-input::placeholder { color: var(--text3); }
        .global-search-shortcut {
          background: var(--surface2); border: 1px solid var(--border);
          border-radius: 6px; padding: 2px 8px;
          font-size: 11px; color: var(--text3); cursor: pointer;
          display: flex; align-items: center;
        }
        .global-search-shortcut kbd {
          font-family: monospace;
        }
        .global-search-hints {
          padding: 16px 20px;
        }
        .global-search-hints p {
          font-size: 13px; color: var(--text3); margin: 0;
        }
        .global-search-hint-btn {
          padding: 6px 14px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 20px;
          font-size: 12px; font-weight: 500;
          color: var(--text2); cursor: pointer;
          font-family: var(--font);
          transition: all 0.2s;
        }
        .global-search-hint-btn:hover {
          background: var(--primary-dim);
          border-color: var(--primary);
          color: var(--primary);
        }
        /* CMS Dropdown */
        .nav-dropdown-wrap {
          position: relative;
        }
        .nav-dropdown-trigger {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 8px 18px;
          border-radius: var(--radius2);
          color: var(--text2);
          background: transparent;
          border: none;
          font-size: 14px;
          font-weight: 500;
          font-family: var(--font);
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
        }
        .nav-dropdown-trigger:hover,
        .nav-dropdown-trigger.active {
          background: var(--primary-dim);
          color: var(--primary);
        }
        .nav-dropdown-chevron {
          transition: transform 0.2s;
        }
        .nav-dropdown-chevron.open {
          transform: rotate(180deg);
        }
        .nav-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow-lg);
          min-width: 160px;
          overflow: hidden;
          z-index: 200;
          animation: dropdownIn 0.15s ease-out;
        }
        @keyframes dropdownIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .nav-dropdown-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          color: var(--text2);
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.15s;
          border: none;
          background: none;
          width: 100%;
          cursor: pointer;
          font-family: var(--font);
          border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .nav-dropdown-item:last-child {
          border-bottom: none;
        }
        .nav-dropdown-item:hover {
          background: var(--primary-dim);
          color: var(--primary);
        }
        .nav-dropdown-item.active {
          background: var(--primary-dim);
          color: var(--primary);
        }
      `}</style>
    </>
  );
}
