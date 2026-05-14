import { useState } from 'react';
import { Save, RotateCcw, Monitor, Globe, Clock, Eye, Info } from 'lucide-react';

interface TerminalSettings {
  displayName: string;
  defaultLanguage: string;
  autoLoopInterval: number;
  showTranscript: boolean;
  autoAdvance: boolean;
}

const DEFAULT_SETTINGS: TerminalSettings = {
  displayName: '境语智导',
  defaultLanguage: 'zh-CN',
  autoLoopInterval: 60,
  showTranscript: true,
  autoAdvance: true,
};

const STORAGE_KEY = 'terminal_settings';

const LANG_OPTIONS = [
  { id: 'zh-CN', label: '中文' },
  { id: 'en-US', label: 'English' },
  { id: 'child', label: '少儿版' },
  { id: 'elderly', label: '大字版' },
];

export default function TerminalSettings() {
  const [settings, setSettings] = useState<TerminalSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
  };

  const update = (key: keyof TerminalSettings, value: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="cms-page">
      <div className="cms-page-header">
        <div>
          <h1 className="cms-page-title">终端设置</h1>
          <p className="cms-page-subtitle">配置导览终端的显示和行为</p>
        </div>
        <div className="cms-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={handleReset}>
            <RotateCcw size={13} /> 重置
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave}>
            <Save size={13} />
            {saved ? '已保存' : '保存设置'}
          </button>
        </div>
      </div>

      <div className="cms-section">
        <div className="cms-section-header">
          <h2><Monitor size={15} /> 基本设置</h2>
        </div>
        <div style={{ padding: 20 }}>
          <div className="cms-form-grid">
            <div className="cms-form-group">
              <label>终端显示名称</label>
              <input
                type="text"
                value={settings.displayName}
                onChange={(e) => update('displayName', e.target.value)}
                placeholder="例如：博物馆导览终端"
              />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>终端顶部显示的名称</span>
            </div>
            <div className="cms-form-group">
              <label>默认语言</label>
              <select
                value={settings.defaultLanguage}
                onChange={(e) => update('defaultLanguage', e.target.value)}
              >
                {LANG_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>首次打开终端时的语言</span>
            </div>
          </div>
        </div>
      </div>

      <div className="cms-section">
        <div className="cms-section-header">
          <h2><Clock size={15} /> 播放设置</h2>
        </div>
        <div style={{ padding: 20 }}>
          <div className="cms-form-grid">
            <div className="cms-form-group">
              <label>自动轮播间隔（秒）</label>
              <input
                type="number"
                min={15}
                max={300}
                value={settings.autoLoopInterval}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  update('autoLoopInterval', Math.max(15, Math.min(300, v)));
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>无操作后自动切换展品（15-300秒）</span>
            </div>
            <div className="cms-form-group">
              <label>&nbsp;</label>
              <div style={{ paddingTop: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    checked={settings.autoAdvance}
                    onChange={(e) => update('autoAdvance', e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  播完后自动切换
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="cms-section">
        <div className="cms-section-header">
          <h2><Eye size={15} /> 显示设置</h2>
        </div>
        <div style={{ padding: 20 }}>
          <div className="cms-form-group" style={{ maxWidth: 400 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
              <input
                type="checkbox"
                checked={settings.showTranscript}
                onChange={(e) => update('showTranscript', e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              显示讲解文字面板
            </label>
            <span style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginTop: 6 }}>
              关闭后可扩大视频画面占用的空间
            </span>
          </div>
        </div>
      </div>

      <div className="cms-section">
        <div className="cms-section-header">
          <h2><Info size={15} /> 二维码使用说明</h2>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8, maxWidth: 560 }}>
            <p>在终端页面点击右上角的 <strong style={{ color: 'var(--primary)' }}>二维码图标</strong> 即可生成当前展品的二维码。用手机扫码即可直接体验该展品的讲解内容。</p>
            <p style={{ marginTop: 12 }}>二维码 URL 会根据当前访问地址自动生成，确保在同一网络环境下可用。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
