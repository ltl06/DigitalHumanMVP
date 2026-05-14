import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Globe, Volume2, VolumeX, ChevronLeft, ChevronRight,
  Home, QrCode, X, Maximize2, Minimize2, RefreshCw, Search,
} from 'lucide-react';
import {
  listExhibits, listContents,
} from '../api/cms';
import { useTouchGesture, useVolumeControl } from '../hooks/useTouchGesture';
import { getExhibitQRCode } from '../api/analytics';
import type { Exhibit, Content, TerminalLanguage } from '../types/api';

const LANGUAGE_LABELS: Record<TerminalLanguage, string> = {
  'zh-CN': '中文',
  'en-US': 'English',
  'child': '少儿版',
  'elderly': '大字版',
};

const LANGUAGES: TerminalLanguage[] = ['zh-CN', 'en-US', 'child', 'elderly'];

const LANGUAGE_COLORS: Record<TerminalLanguage, string> = {
  'zh-CN': '#00d4aa',
  'en-US': '#6366f1',
  'child': '#f59e0b',
  'elderly': '#ef4444',
};

const AUTO_LOOP_DELAY = 60000;
const WATCH_INTERVAL_MS = 5000;

export default function TerminalPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [exhibits, setExhibits] = useState<Exhibit[]>([]);
  const [selectedExhibit, setSelectedExhibit] = useState<Exhibit | null>(null);
  const [contents, setContents] = useState<Content[]>([]);
  const [selectedContent, setSelectedContent] = useState<Content | null>(null);
  const [language, setLanguage] = useState<TerminalLanguage>('zh-CN');
  const [showGrid, setShowGrid] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).slice(2));
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [qrFallbackUrl, setQrFallbackUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [watchStartTime, setWatchStartTime] = useState<number | null>(null);
  const [showAllExhibits, setShowAllExhibits] = useState(false); // true = show all, false = filter by exhibit.default_language

  const videoRef = useRef<HTMLVideoElement>(null);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { volume, setVolume, muted, toggleMute } = useVolumeControl(0.85);

  // Load exhibits and check for ?exhibit= query param
  useEffect(() => {
    listExhibits().then((r) => {
      setExhibits(r.exhibits);
      const paramExhibit = searchParams.get('exhibit');
      if (paramExhibit && r.exhibits.length > 0) {
        const found = r.exhibits.find((e) => e.id === paramExhibit);
        if (found) setSelectedExhibit(found);
        else if (r.exhibits.length > 0) setSelectedExhibit(r.exhibits[0]);
      }
    }).catch(() => {});
  }, []);

  // Load contents for selected exhibit (re-fetch when language changes)
  useEffect(() => {
    if (!selectedExhibit) return;
    listContents({ exhibit_id: selectedExhibit.id, language, status: 'published' })
      .then((r) => {
        setContents(r.contents);
        // Pick content matching the current language, fallback chain: exact match → zh-CN → first
        const langContent = r.contents.find((c) => c.language === language)
          || r.contents.find((c) => c.language === 'zh-CN')
          || r.contents[0];
        setSelectedContent(langContent || null);
      })
      .catch(() => {});
  }, [selectedExhibit, language]);

  // Video volume sync
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = muted ? 0 : volume;
    }
  }, [volume, muted]);

  // Watch tracking: send periodic duration updates
  useEffect(() => {
    if (watchStartTime && selectedExhibit && selectedContent) {
      watchIntervalRef.current = setInterval(() => {
        const elapsed = Math.round(Date.now() - watchStartTime);
        trackEvent('watch', selectedExhibit.id, selectedContent?.id, elapsed);
      }, WATCH_INTERVAL_MS);
    }
    return () => {
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current);
    };
  }, [watchStartTime, selectedExhibit, selectedContent]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!selectedExhibit) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const next = e.key === 'ArrowRight' ? getNextExhibit() : getPrevExhibit();
        if (next) selectExhibit(next);
      } else if (e.key === 'Escape') {
        if (showQR) setShowQR(false);
        else if (!showGrid) setShowGrid(true);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        setVolume((v: number) => Math.max(0, Math.min(1, v + (e.key === 'ArrowUp' ? 0.1 : -0.1))));
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedExhibit, showQR, showGrid, exhibits]);

  // Auto-loop on idle
  const resetIdleTimer = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => {
      if (!showGrid && selectedExhibit) {
        const next = getNextExhibit();
        if (next) selectExhibit(next);
      }
    }, AUTO_LOOP_DELAY);
  }, [showGrid, selectedExhibit, exhibits]);

  useEffect(() => {
    const events = ['touchstart', 'touchmove', 'touchend', 'mousemove'];
    events.forEach((ev) => window.addEventListener(ev, resetIdleTimer, { passive: true }));
    resetIdleTimer();
    return () => {
      if (idleRef.current) clearTimeout(idleRef.current);
      events.forEach((ev) => window.removeEventListener(ev, resetIdleTimer));
    };
  }, [resetIdleTimer]);

  const selectExhibit = (ex: Exhibit) => {
    setSelectedExhibit(ex);
    setShowGrid(false);
    setWatchStartTime(Date.now());
    resetIdleTimer();
    setQrImageUrl(null);
    setQrFallbackUrl(null);
    trackEvent('view', ex.id);
    trackEvent('select', ex.id);
  };

  const trackEvent = (eventType: string, exhibitId?: string, contentId?: string, durationMs = 0) => {
    fetch('/api/cms/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        event_type: eventType,
        exhibit_id: exhibitId || selectedExhibit?.id || '',
        content_id: contentId || selectedContent?.id || '',
        duration_ms: durationMs,
        metadata: { language },
        device_id: '',
      }),
    }).catch(() => {});
  };

  const getNextExhibit = () => {
    if (!selectedExhibit || exhibits.length === 0) return exhibits[0] || null;
    const idx = exhibits.findIndex((e) => e.id === selectedExhibit.id);
    return exhibits[(idx + 1) % exhibits.length];
  };

  const getPrevExhibit = () => {
    if (!selectedExhibit || exhibits.length === 0) return exhibits[exhibits.length - 1] || null;
    const idx = exhibits.findIndex((e) => e.id === selectedExhibit.id);
    return exhibits[(idx - 1 + exhibits.length) % exhibits.length];
  };

  // Touch gestures for player
  const { onTouchStart, onTouchEnd } = useTouchGesture(
    () => selectExhibit(getNextExhibit()),
    () => selectExhibit(getPrevExhibit()),
    () => {
      if (videoRef.current) {
        if (videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        } else {
          videoRef.current.pause();
        }
      }
    },
  );

  // Language switch with track
  const handleLanguageChange = (lang: TerminalLanguage) => {
    setLanguage(lang);
    setShowAllExhibits(false); // switch language → show only exhibits with this lang content
    trackEvent('language_change');
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
  };

  // Load QR code when exhibit changes
  useEffect(() => {
    if (!selectedExhibit) return;
    getExhibitQRCode(selectedExhibit.id)
      .then((data) => {
        if (data.image) setQrImageUrl(data.image);
        else if (data.fallback) setQrFallbackUrl(data.fallback);
      })
      .catch(() => {});
  }, [selectedExhibit]);

  // Video event handlers for tracking
  const handleVideoPlay = () => {
    setWatchStartTime(Date.now());
    trackEvent('play', selectedExhibit?.id, selectedContent?.id);
  };

  const handleVideoEnded = () => {
    const elapsed = watchStartTime ? Date.now() - watchStartTime : 0;
    trackEvent('ended', selectedExhibit?.id, selectedContent?.id, elapsed);
    setWatchStartTime(null);
    // Auto advance to next exhibit
    const next = getNextExhibit();
    if (next) {
      setTimeout(() => selectExhibit(next), 1500);
    }
  };

  const handleVideoPause = () => {
    const elapsed = watchStartTime ? Date.now() - watchStartTime : 0;
    trackEvent('pause', selectedExhibit?.id, selectedContent?.id, elapsed);
    setWatchStartTime(null);
  };

  // Filtered exhibits for search + language (filter by exhibit's default_language)
  const filteredExhibits = exhibits.filter((ex) => {
    // Language filter: only show exhibits whose default_language matches current selection
    if (!showAllExhibits && ex.default_language !== language) return false;
    // Search filter
    if (searchQuery) {
      return (
        ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ex.category || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ex.code || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return true;
  });

  // ── Grid View ────────────────────────────────────────────────
  if (showGrid) {
    return (
      <div className="terminal-root terminal-grid-mode">
        {/* Header */}
        <div className="terminal-header">
          <div className="terminal-logo">境语智导</div>
          <div className="terminal-lang-switch">
            <button
              className={`terminal-lang-btn ${showAllExhibits ? 'active' : ''}`}
              onClick={() => setShowAllExhibits(true)}
            >
              全部
            </button>
            {LANGUAGES.map((lang) => (
              <button
                key={lang}
                className={`terminal-lang-btn ${language === lang && !showAllExhibits ? 'active' : ''}`}
                onClick={() => handleLanguageChange(lang)}
              >
                {LANGUAGE_LABELS[lang]}
              </button>
            ))}
          </div>
          <div className="terminal-volume">
            <button className="terminal-icon-btn" onClick={toggleMute} title={muted ? '取消静音' : '静音'}>
              {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <input
              type="range" min={0} max={1} step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="terminal-volume-slider"
            />
          </div>
        </div>

        {/* Search Bar */}
        <div className="terminal-search-bar">
          <Search size={18} className="terminal-search-icon" />
          <input
            type="text"
            className="terminal-search-input"
            placeholder="搜索展品..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button
              className="terminal-search-clear"
              onClick={() => setSearchQuery('')}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Exhibit Grid */}
        <div className="terminal-exhibit-grid">
          {exhibits.length === 0 ? (
            <div className="terminal-empty">
              <div className="terminal-empty-icon">📦</div>
              <p>暂无展品</p>
              <p style={{ fontSize: 14, marginTop: 8, opacity: 0.6 }}>
                请在 CMS 管理后台添加展品
              </p>
            </div>
          ) : filteredExhibits.length === 0 && searchQuery ? (
            <div className="terminal-empty">
              <div className="terminal-empty-icon">🔍</div>
              <p>未找到匹配的展品</p>
              <p style={{ fontSize: 14, marginTop: 8, opacity: 0.6 }}>
                试试其他关键词
              </p>
            </div>
          ) : filteredExhibits.length === 0 && !showAllExhibits ? (
            <div className="terminal-empty">
              <div className="terminal-empty-icon">🌐</div>
              <p>该语言暂无展品</p>
              <p style={{ fontSize: 14, marginTop: 8, opacity: 0.6 }}>
                试试切换到其他语言或点击「全部」查看所有展品
              </p>
            </div>
          ) : (
            filteredExhibits.map((ex) => (
              <button
                key={ex.id}
                className="terminal-exhibit-card"
                onClick={() => selectExhibit(ex)}
              >
                <div className="terminal-exhibit-thumb">
                  {ex.digital_human_model ? (
                    <img
                      src={`/api/files/${ex.digital_human_model}`}
                      alt={ex.name}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="terminal-exhibit-placeholder">🎭</div>
                  )}
                </div>
                <div className="terminal-exhibit-info">
                  <div className="terminal-exhibit-name">{ex.name}</div>
                  {ex.category && <div className="terminal-exhibit-cat">{ex.category}</div>}
                </div>
              </button>
            ))
          )}
        </div>

        <style>{`
          .terminal-root {
            position: fixed; inset: 0;
            background: #060a12;
            display: flex; flex-direction: column;
            overflow: hidden; z-index: 9999;
            font-family: 'Inter', 'Noto Sans SC', system-ui, sans-serif;
          }
          .terminal-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 16px 32px;
            background: rgba(6,10,18,0.9);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid rgba(255,255,255,0.06);
            flex-shrink: 0;
          }
          .terminal-logo {
            font-size: 22px; font-weight: 800;
            color: #f1f5f9;
            background: linear-gradient(135deg, #00d4aa, #6366f1);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          }
          .terminal-lang-switch {
            display: flex; gap: 4px;
            background: rgba(255,255,255,0.05);
            border-radius: 12px; padding: 4px;
          }
          .terminal-lang-btn {
            padding: 8px 18px; border: none; border-radius: 10px;
            background: transparent; color: #94a3b8;
            font-size: 14px; font-weight: 600; cursor: pointer;
            font-family: inherit; transition: all 0.2s;
          }
          .terminal-lang-btn.active {
            background: linear-gradient(135deg, #00d4aa, #00b894);
            color: #0a1a14;
          }
          .terminal-lang-btn:hover:not(.active) {
            background: rgba(255,255,255,0.08); color: #f1f5f9;
          }
          .terminal-volume {
            display: flex; align-items: center; gap: 10px;
          }
          .terminal-icon-btn {
            width: 40px; height: 40px; border-radius: 50%;
            background: rgba(255,255,255,0.08); border: none;
            color: #f1f5f9; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: background 0.2s;
          }
          .terminal-icon-btn:hover { background: rgba(255,255,255,0.15); }
          .terminal-volume-slider {
            width: 100px; height: 4px; accent-color: #00d4aa;
            cursor: pointer;
          }
          .terminal-search-bar {
            display: flex; align-items: center; gap: 10px;
            margin: 12px 32px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px; padding: 10px 16px;
            flex-shrink: 0;
          }
          .terminal-search-icon { color: #64748b; flex-shrink: 0; }
          .terminal-search-input {
            flex: 1; background: none; border: none; outline: none;
            color: #f1f5f9; font-size: 15px; font-family: inherit;
          }
          .terminal-search-input::placeholder { color: #475569; }
          .terminal-search-clear {
            background: none; border: none; color: #64748b; cursor: pointer;
            display: flex; align-items: center; padding: 0;
          }
          .terminal-exhibit-grid {
            flex: 1; display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 16px; padding: 0 32px 24px;
            overflow-y: auto; align-content: start;
          }
          .terminal-exhibit-card {
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 16px; overflow: hidden;
            cursor: pointer; text-align: left;
            transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
            font-family: inherit;
          }
          .terminal-exhibit-card:hover {
            border-color: rgba(0,212,170,0.4);
            background: rgba(0,212,170,0.06);
            transform: translateY(-2px);
          }
          .terminal-exhibit-card:active {
            transform: scale(0.98);
          }
          .terminal-exhibit-thumb {
            width: 100%; aspect-ratio: 16/9;
            background: rgba(0,212,170,0.08);
            display: flex; align-items: center; justify-content: center;
            overflow: hidden;
          }
          .terminal-exhibit-thumb img {
            width: 100%; height: 100%; object-fit: cover;
          }
          .terminal-exhibit-placeholder {
            font-size: 48px; opacity: 0.3;
          }
          .terminal-exhibit-info { padding: 12px 14px; }
          .terminal-exhibit-name {
            font-size: 15px; font-weight: 700;
            color: #f1f5f9; margin-bottom: 4px;
          }
          .terminal-exhibit-cat {
            font-size: 12px; color: #94a3b8;
          }
          .terminal-empty {
            grid-column: 1/-1; text-align: center;
            padding: 80px 20px; color: #94a3b8;
          }
          .terminal-empty-icon { font-size: 64px; margin-bottom: 16px; opacity: 0.3; }
        `}</style>
      </div>
    );
  }

  // ── Player View ───────────────────────────────────────────────
  return (
    <div
      className="terminal-root terminal-player-mode"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top Bar */}
      <div className="terminal-player-header">
        <button className="terminal-icon-btn" onClick={() => setShowGrid(true)} title="返回目录">
          <Home size={20} />
        </button>

        {selectedExhibit && (
          <div className="terminal-player-title">
            <span className="terminal-exhibit-label">{selectedExhibit.name}</span>
            {selectedContent && selectedContent.language !== language && (
              <span
                className="terminal-lang-mismatch"
                title={`该展品未配置"${LANGUAGE_LABELS[language as TerminalLanguage] || language}"版本，正在显示"${LANGUAGE_LABELS[selectedContent.language as TerminalLanguage] || selectedContent.language}"版本。请在 CMS 后台为该展品添加"${LANGUAGE_LABELS[language as TerminalLanguage] || language}"版本的内容。`}
              >
                <span className="terminal-lang-mismatch-dot" style={{ background: LANGUAGE_COLORS[selectedContent.language as TerminalLanguage] || '#94a3b8' }} />
                {LANGUAGE_LABELS[selectedContent.language as TerminalLanguage] || selectedContent.language}
              </span>
            )}
          </div>
        )}

        <div className="terminal-player-actions">
          <button
            className="terminal-icon-btn"
            onClick={() => setShowQR(!showQR)}
            title="显示二维码"
          >
            <QrCode size={20} />
          </button>
          <button className="terminal-icon-btn" onClick={toggleFullscreen} title="全屏">
            {fullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          <button
            className="terminal-icon-btn"
            onClick={() => selectExhibit(getNextExhibit())}
            title="下一个展品"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="terminal-player-body">
        {/* Left: Video */}
        <div className="terminal-video-area">
          {selectedContent?.body ? (
            <div
              className={`terminal-video-wrapper ${showTranscript ? '' : 'terminal-full-video'}`}
            >
              {/* Real video player — video changes with language/content */}
              {selectedContent.video_filename || selectedExhibit?.exhibit_video_filename ? (
                <video
                  key={selectedContent.id + (selectedContent.video_filename || selectedExhibit!.exhibit_video_filename || '')}
                  ref={videoRef}
                  src={`/api/files/${selectedContent.video_filename || selectedExhibit!.exhibit_video_filename}`}
                  className="terminal-real-video"
                  autoPlay
                  muted={muted}
                  playsInline
                  onPlay={handleVideoPlay}
                  onEnded={handleVideoEnded}
                  onPause={handleVideoPause}
                  onError={(e) => {
                    (e.target as HTMLVideoElement).style.display = 'none';
                  }}
                />
              ) : (
                /* No video uploaded */
                <div className="terminal-video-placeholder">
                  <div className="terminal-video-inner">
                    <div className="terminal-digital-human">
                      {selectedExhibit?.digital_human_model ? (
                        <img
                          src={`/api/files/${selectedExhibit.digital_human_model}`}
                          alt={selectedExhibit.name}
                          className="terminal-dh-img"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="terminal-dh-avatar">🎭</div>
                      )}
                      <div className="terminal-dh-label">{selectedExhibit?.name || ''}</div>
                    </div>
                    <div className="terminal-video-text-overlay">
                      <p>{selectedContent.body.slice(0, 200)}{selectedContent.body.length > 200 ? '…' : ''}</p>
                    </div>
                  </div>
                  <div className="terminal-video-hint">
                    暂无视频 — 请在展品管理中上传讲解视频
                  </div>
                </div>
              )}
            </div>
          ) : selectedExhibit ? (
            <div className="terminal-nav-container">
              <button
                className="terminal-nav-arrow terminal-nav-prev"
                onClick={() => selectExhibit(getPrevExhibit())}
              >
                <ChevronLeft size={28} />
              </button>
              <button
                className="terminal-nav-arrow terminal-nav-next"
                onClick={() => selectExhibit(getNextExhibit())}
              >
                <ChevronRight size={28} />
              </button>
            </div>
          ) : (
            <div className="terminal-no-content">
              <p>暂无讲解内容</p>
              <p style={{ fontSize: 14, opacity: 0.5, marginTop: 8 }}>
                请在 CMS 后台为该展品添加讲解内容
              </p>
            </div>
          )}
        </div>

        {/* Right: Transcript Panel */}
        {showTranscript && selectedContent?.body && (
          <div className="terminal-transcript-panel">
            <div className="terminal-transcript-header">
              <span>讲解文字</span>
              <button
                className="terminal-icon-btn"
                style={{ width: 28, height: 28, opacity: 0.6 }}
                onClick={() => setShowTranscript(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="terminal-transcript-body">
              {selectedContent.body}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="terminal-player-footer">
        <div className="terminal-lang-switch">
          <button
            className={`terminal-lang-btn ${showAllExhibits ? 'active' : ''}`}
            onClick={() => setShowAllExhibits(true)}
          >
            全部
          </button>
          {LANGUAGES.map((lang) => (
            <button
              key={lang}
              className={`terminal-lang-btn ${language === lang && !showAllExhibits ? 'active' : ''}`}
              onClick={() => handleLanguageChange(lang)}
            >
              {LANGUAGE_LABELS[lang]}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="terminal-icon-btn" onClick={toggleMute}>
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <input
            type="range" min={0} max={1} step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="terminal-volume-slider"
          />
        </div>

        <button
          className="terminal-icon-btn"
          onClick={() => setShowQR(!showQR)}
        >
          <QrCode size={20} />
        </button>
      </div>

      {/* QR Code Modal */}
      {showQR && (
        <div className="terminal-qr-overlay" onClick={() => setShowQR(false)}>
          <div className="terminal-qr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="terminal-qr-title">
              扫码体验 — {selectedExhibit?.name}
            </div>
            <div className="terminal-qr-code">
              {qrImageUrl ? (
                <img src={qrImageUrl} alt="QR Code" style={{ width: 200, height: 200 }} />
              ) : qrFallbackUrl ? (
                <img src={qrFallbackUrl} alt="QR Code" style={{ width: 200, height: 200 }} />
              ) : (
                <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>
                  加载中...
                </div>
              )}
            </div>
            <div className="terminal-qr-url">
              {qrImageUrl ? `${window.location.origin}/terminal?exhibit=${selectedExhibit?.id}` : '生成中...'}
            </div>
            <button className="terminal-qr-close" onClick={() => setShowQR(false)}>
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        .terminal-root {
          position: fixed; inset: 0;
          background: #060a12;
          display: flex; flex-direction: column;
          overflow: hidden; z-index: 9999;
          font-family: 'Inter', 'Noto Sans SC', system-ui, sans-serif;
        }
        .terminal-player-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 24px;
          background: rgba(6,10,18,0.9);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0; gap: 16px;
        }
        .terminal-player-title {
          flex: 1; text-align: center;
          display: flex; flex-direction: column; align-items: center; gap: 4px;
        }
        .terminal-exhibit-label {
          font-size: 18px; font-weight: 700; color: #f1f5f9;
        }
        .terminal-lang-mismatch {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 600; color: #94a3b8;
          background: rgba(255,255,255,0.06);
          padding: 2px 10px; border-radius: 20px;
          cursor: help;
          transition: all 0.2s;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .terminal-lang-mismatch:hover { background: rgba(255,255,255,0.1); }
        .terminal-lang-mismatch-dot {
          width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
        }
        .terminal-player-actions {
          display: flex; gap: 8px;
        }
        .terminal-icon-btn {
          width: 40px; height: 40px; border-radius: 50%;
          background: rgba(255,255,255,0.08); border: none;
          color: #f1f5f9; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.2s;
        }
        .terminal-icon-btn:hover { background: rgba(255,255,255,0.15); }
        .terminal-volume-slider {
          width: 100px; height: 4px; accent-color: #00d4aa; cursor: pointer;
        }
        .terminal-lang-switch {
          display: flex; gap: 4px;
          background: rgba(255,255,255,0.05);
          border-radius: 12px; padding: 4px;
        }
        .terminal-lang-btn {
          padding: 8px 18px; border: none; border-radius: 10px;
          background: transparent; color: #94a3b8;
          font-size: 14px; font-weight: 600; cursor: pointer;
          font-family: inherit; transition: all 0.2s;
        }
        .terminal-lang-btn.active {
          background: linear-gradient(135deg, #00d4aa, #00b894);
          color: #0a1a14;
        }
        .terminal-lang-btn:hover:not(.active) {
          background: rgba(255,255,255,0.08); color: #f1f5f9;
        }
        .terminal-player-body {
          flex: 1; display: flex; overflow: hidden;
        }
        .terminal-video-area {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: 24px;
        }
        .terminal-video-wrapper {
          width: 100%; height: 100%; max-width: 900px;
          border-radius: 20px; overflow: hidden;
          background: #0c1220;
          border: 1px solid rgba(255,255,255,0.08);
          position: relative;
          transition: all 0.3s;
        }
        .terminal-video-wrapper.terminal-full-video {
          max-width: 100%;
        }
        .terminal-video-placeholder {
          width: 100%; height: 100%;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
        }
        .terminal-video-inner {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 24px; padding: 32px;
        }
        .terminal-digital-human {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
        }
        .terminal-dh-img {
          width: 200px; height: 200px; border-radius: 50%;
          object-fit: cover;
          border: 3px solid rgba(0,212,170,0.3);
          box-shadow: 0 0 40px rgba(0,212,170,0.15);
        }
        .terminal-dh-avatar {
          width: 200px; height: 200px; border-radius: 50%;
          background: rgba(0,212,170,0.1);
          border: 3px solid rgba(0,212,170,0.3);
          display: flex; align-items: center; justify-content: center;
          font-size: 80px;
        }
        .terminal-dh-label {
          font-size: 20px; font-weight: 700; color: #f1f5f9;
        }
        .terminal-video-text-overlay {
          max-width: 600px; text-align: center;
          padding: 16px 24px;
          background: rgba(255,255,255,0.04);
          border-radius: 12px;
          font-size: 16px; line-height: 1.8; color: #94a3b8;
        }
        .terminal-video-hint {
          font-size: 12px; color: #475569; margin-top: 16px; line-height: 1.6;
        }
        .terminal-gen-btn {
          margin-top: 10px;
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 18px;
          background: linear-gradient(135deg, #00d4aa, #00b894);
          color: #0a1a14;
          border: none; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
        }
        .terminal-gen-btn:hover {
          box-shadow: 0 4px 20px rgba(0,212,170,0.35);
          transform: translateY(-1px);
        }
        .terminal-nav-arrow {
          position: absolute; top: 50%; transform: translateY(-50%);
          width: 56px; height: 56px; border-radius: 50%;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.1);
          color: #f1f5f9; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s; z-index: 10;
        }
        .terminal-nav-arrow:hover {
          background: rgba(0,212,170,0.2);
          border-color: rgba(0,212,170,0.4);
        }
        .terminal-nav-prev { left: 16px; }
        .terminal-nav-next { right: 16px; }
        .terminal-no-content {
          text-align: center; color: #94a3b8; padding: 48px;
        }
        .terminal-transcript-panel {
          width: 320px; flex-shrink: 0;
          background: rgba(255,255,255,0.03);
          border-left: 1px solid rgba(255,255,255,0.06);
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .terminal-transcript-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          font-size: 13px; font-weight: 700; color: #94a3b8;
        }
        .terminal-transcript-body {
          flex: 1; overflow-y: auto;
          padding: 20px;
          font-size: 15px; line-height: 2; color: #cbd5e1;
          white-space: pre-wrap;
        }
        .terminal-player-footer {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 24px;
          background: rgba(6,10,18,0.9);
          backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .terminal-qr-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          z-index: 10000;
        }
        .terminal-qr-modal {
          background: #0c1220; border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.1);
          padding: 32px; text-align: center;
          position: relative; min-width: 320px;
        }
        .terminal-qr-title {
          font-size: 18px; font-weight: 700; color: #f1f5f9; margin-bottom: 20px;
        }
        .terminal-qr-code {
          margin: 0 auto 16px;
          background: white; border-radius: 12px;
          display: inline-block; padding: 16px;
        }
        .terminal-qr-url {
          font-size: 11px; color: #475569; word-break: break-all;
          max-width: 280px; margin: 0 auto;
        }
        .terminal-qr-close {
          position: absolute; top: 12px; right: 12px;
          width: 32px; height: 32px; border-radius: 50%;
          background: rgba(255,255,255,0.08); border: none;
          color: #f1f5f9; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .terminal-real-video {
          width: 100%; height: 100%; object-fit: cover;
          border-radius: 20px; background: #0c1220;
        }
      `}</style>
    </div>
  );
}
