import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Users, Clock, Download, BarChart2, RefreshCw,
  Calendar, Activity, Zap, List, Eye, ArrowUp, ArrowDown,
  TrendingDown, Globe, Sparkles, ChevronRight,
} from 'lucide-react';
import {
  getAnalyticsSummary, exportAnalyticsReport,
  getLiveVisitors, getDailyTrends, getHourlyDistribution,
} from '../../api/analytics';
import type { AnalyticsSummary, DailyTrend, HourlyData } from '../../types/api';

// ─── 消费者友好的语言名称映射 ───────────────────────────────
const LANGUAGE_LABELS: Record<string, string> = {
  auto: '自动检测',
  chinese: '中文', zh: '中文', zh_cn: '简体中文', zh_tw: '繁体中文',
  english: '英语', en: '英语', en_us: '英语(美国)', en_gb: '英语(英国)',
  japanese: '日语', ja: '日语', jp: '日语',
  korean: '韩语', ko: '韩语', kr: '韩语',
  german: '德语', de: '德语',
  french: '法语', fr: '法语',
  russian: '俄语', ru: '俄语',
  portuguese: '葡萄牙语', pt: '葡萄牙语',
  spanish: '西班牙语', es: '西班牙语',
  italian: '意大利语', it: '意大利语',
  arabic: '阿拉伯语', ar: '阿拉伯语',
  hindi: '印地语', hi: '印地语',
  thai: '泰语', th: '泰语',
  vietnamese: '越南语', vi: '越南语',
  indonesian: '印尼语', id: '印尼语',
  turkish: '土耳其语', tr: '土耳其语',
  polish: '波兰语', pl: '波兰语',
  dutch: '荷兰语', nl: '荷兰语',
  unknown: '未知', '': '未知', null: '未知',
};

function getLangLabel(raw: string): string {
  return LANGUAGE_LABELS[raw?.toLowerCase()] ?? raw ?? '未知';
}

// ─── 统计卡片 ───────────────────────────────────────────────
interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  sub?: string;
  delta?: number; // 百分比变化，正=上升
  accentColor: string;
  loading?: boolean;
}

function StatCard({ icon, value, label, sub, delta, accentColor, loading }: StatCardProps) {
  if (loading) {
    return (
      <div className="analytics-card analytics-card-loading">
        <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 12, marginBottom: 12 }} />
        <div className="skeleton" style={{ width: '60%', height: 32, borderRadius: 6, marginBottom: 8 }} />
        <div className="skeleton" style={{ width: '80%', height: 14, borderRadius: 4 }} />
      </div>
    );
  }

  return (
    <div className="analytics-card">
      <div className="analytics-card-icon" style={{ background: accentColor + '1a', color: accentColor }}>
        {icon}
      </div>
      <div className="analytics-card-body">
        <div className="analytics-card-value">{value}</div>
        <div className="analytics-card-label">{label}</div>
        {sub && <div className="analytics-card-sub">{sub}</div>}
      </div>
      {delta !== undefined && (
        <div className={`analytics-card-delta ${delta >= 0 ? 'up' : 'down'}`}>
          {delta >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
          {Math.abs(delta).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

// ─── 加载骨架 ───────────────────────────────────────────────
function SkeletonChart({ height = 120 }: { height?: number }) {
  return (
    <div style={{ padding: '12px 20px' }}>
      <div className="skeleton" style={{ width: '100%', height, borderRadius: 8 }} />
    </div>
  );
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ padding: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 40, borderRadius: 6, marginBottom: 8 }} />
      ))}
    </div>
  );
}

// ─── 每日趋势图 ─────────────────────────────────────────────
function TrendChart({ data }: { data: DailyTrend[] }) {
  if (!data.length) return <div className="analytics-empty">暂无趋势数据</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  const w = 500, height = 130, pad = 24;
  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2);
    const y = height - pad - ((d.count / max) * (height - pad * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const areaPoints = `${pad},${height - pad} ${points.join(' ')} ${w - pad},${height - pad}`;

  // 计算趋势（最后两天 vs 前面）
  const last = data.slice(-3).reduce((s, d) => s + d.count, 0);
  const prev = data.slice(0, -3).reduce((s, d) => s + d.count, 0) / Math.max(data.length - 3, 1);
  const trend = prev > 0 ? ((last / 3 - prev) / prev * 100) : 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <span className={`analytics-trend-badge ${trend >= 0 ? 'up' : 'down'}`}>
          {trend >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
          近3日 {Math.abs(trend).toFixed(1)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height }}>
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
          <line key={i} x1={pad} y1={height - pad - pct * (height - pad * 2)} x2={w - pad} y2={height - pad - pct * (height - pad * 2)} stroke="var(--border)" strokeWidth="1" strokeDasharray="4,4" />
        ))}
        <polygon points={areaPoints} fill="url(#trendGrad)" opacity="0.3" />
        <polyline points={points.join(' ')} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => {
          const x = pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2);
          const y = height - pad - ((d.count / max) * (height - pad * 2));
          return <circle key={i} cx={x} cy={y} r="3.5" fill="var(--primary)" stroke="var(--surface)" strokeWidth="2" />;
        })}
        {data.filter((_, i) => data.length <= 7 || i % Math.ceil(data.length / 7) === 0).map((d, i) => {
          const allIdx = data.findIndex(dd => dd === d);
          const x = pad + (allIdx / Math.max(data.length - 1, 1)) * (w - pad * 2);
          return <text key={i} x={x} y={height - 3} textAnchor="middle" fontSize="9" fill="var(--text3)">{d.date.slice(5)}</text>;
        })}
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

// ─── 24小时分布图 ───────────────────────────────────────────
function HourlyChart({ data }: { data: HourlyData[] }) {
  if (!data.length) return <div className="analytics-empty">暂无时段数据</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  const w = 500, chartHeight = 110;
  const padLeft = 20, padRight = 10, padTop = 10, padBottom = 24;
  const chartW = w - padLeft - padRight;
  const chartH = chartHeight - padTop - padBottom;
  const peak = Math.max(...data.map(d => d.count));

  return (
    <svg viewBox={`0 0 ${w} ${chartHeight}`} style={{ width: '100%', height: chartHeight }}>
      {[0, 0.5, 1].map((pct, i) => (
        <line key={i} x1={padLeft} y1={padTop + pct * chartH} x2={w - padRight} y2={padTop + pct * chartH} stroke="var(--border)" strokeWidth="1" strokeDasharray="4,4" />
      ))}
      {data.map((d, i) => {
        const barH = d.count > 0 ? (d.count / max) * chartH : 2;
        const x = padLeft + i * (chartW / 24);
        const y = padTop + chartH - barH;
        const isPeak = d.count === peak && d.count > 0;
        return (
          <g key={i}>
            <rect x={x + 1} y={y} width={Math.max(3, Math.min(14, chartW / 24 - 3))} height={barH} rx="2" fill={isPeak ? 'var(--primary)' : 'rgba(99,102,241,0.45)'} />
            {i % 6 === 0 && <text x={x + 4} y={chartHeight - 4} fontSize="9" fill="var(--text3)">{String(d.hour).padStart(2, '0')}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ─── 热门展品条形图 ─────────────────────────────────────────
function BarChart({ data }: { data: { label: string; value: number }[] }) {
  if (!data.length) return <div className="analytics-empty">暂无数据</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="analytics-bar-chart">
      {data.slice(0, 8).map((item, i) => (
        <div key={i} className="analytics-bar-row">
          <div className="analytics-bar-rank">#{i + 1}</div>
          <div className="analytics-bar-label" title={item.label}>
            {item.label.length > 14 ? item.label.slice(0, 14) + '…' : item.label}
          </div>
          <div className="analytics-bar-track">
            <div
              className="analytics-bar-fill"
              style={{
                width: `${(item.value / max) * 100}%`,
                background: i === 0 ? '#00d4aa' : i === 1 ? '#6366f1' : i === 2 ? '#f59e0b' : '#475569',
              }}
            />
          </div>
          <div className="analytics-bar-value">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── 语言分布饼图（消费者友好版）─────────────────────────────
function PieChart({ data }: { data: { label: string; value: number }[] }) {
  if (!data.length) return <div className="analytics-empty">暂无数据</div>;
  const total = data.reduce((s, d) => s + d.value, 0);
  const colors = ['#00d4aa', '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4'];
  let cumulative = 0;
  const slices = data.slice(0, 8).map((item, i) => {
    const pct = item.value / total;
    const startAngle = cumulative * 360;
    cumulative += pct;
    const endAngle = cumulative * 360;
    const cx = 85, cy = 85, r = 72;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(startAngle - 90));
    const y1 = cy + r * Math.sin(toRad(startAngle - 90));
    const x2 = cx + r * Math.cos(toRad(endAngle - 90));
    const y2 = cy + r * Math.sin(toRad(endAngle - 90));
    const large = endAngle - startAngle > 180 ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
    return { path, color: colors[i % colors.length], label: getLangLabel(item.label), value: item.value, pct: Math.round(pct * 100) };
  });

  return (
    <div className="analytics-pie-wrap">
      <svg width="170" height="170" viewBox="0 0 170 170">
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} className="analytics-pie-slice" />
        ))}
        <circle cx="85" cy="85" r="30" fill="var(--surface)" />
        <text x="85" y="80" textAnchor="middle" fontSize="11" fill="var(--text3)">总计</text>
        <text x="85" y="97" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--text)">{total.toLocaleString()}</text>
      </svg>
      <div className="analytics-pie-legend">
        {slices.map((s, i) => (
          <div key={i} className="analytics-legend-row">
            <div className="analytics-legend-dot" style={{ background: s.color }} />
            <span className="analytics-legend-label">{s.label}</span>
            <span className="analytics-legend-value">{s.value.toLocaleString()}</span>
            <span className="analytics-legend-pct">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 智能洞察卡片 ───────────────────────────────────────────
function InsightCard({ insights }: { insights: string[] }) {
  if (!insights.length) return null;
  return (
    <div className="analytics-insights">
      <div className="analytics-insights-header">
        <Sparkles size={14} />
        智能洞察
      </div>
      <ul className="analytics-insights-list">
        {insights.map((insight, i) => (
          <li key={i} className="analytics-insight-item">
            <ChevronRight size={12} />
            {insight}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── 主组件 ─────────────────────────────────────────────────
export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState(7);
  const [customRange, setCustomRange] = useState<{ since: number; until: number } | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [liveVisitors, setLiveVisitors] = useState(0);
  const [trends, setTrends] = useState<DailyTrend[]>([]);
  const [hourly, setHourly] = useState<HourlyData[]>([]);
  const since = customRange ? customRange.since : (preset > 0 ? Date.now() / 1000 - preset * 86400 : 0);
  const until = customRange ? customRange.until : 0;

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getAnalyticsSummary({ since, until: until || undefined }),
      getLiveVisitors(5),
      getDailyTrends(preset > 0 ? preset : 30),
      getHourlyDistribution(since),
    ])
      .then(([summary, live, trendData, hourlyData]) => {
        setData(summary);
        setLiveVisitors(live.live_visitors);
        setTrends(trendData.trends);
        setHourly(hourlyData.hourly);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [preset, since, until]);

  // 首次挂载时加载一次
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      getLiveVisitors(5).then((r) => setLiveVisitors(r.live_visitors)).catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleExport = async (fmt: 'json' | 'csv') => {
    setExporting(true);
    try {
      const res = await exportAnalyticsReport({ since, fmt });
      const blob = new Blob([res.data], { type: fmt === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics_${Date.now()}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
    } finally {
      setExporting(false);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}秒`;
    return `${Math.floor(s / 60)}分${s % 60 > 0 ? (s % 60) + '秒' : ''}`;
  };

  const formatDurationLong = (ms: number) => {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}秒`;
    if (s < 3600) return `${Math.floor(s / 60)}分${s % 60 > 0 ? (s % 60) + '秒' : ''}`;
    return `${Math.floor(s / 3600)}小时${Math.floor((s % 3600) / 60)}分`;
  };

  // 展品数据（优先用后端返回的可读名称）
  const popularData = (data?.popular_exhibits || []).map(e => {
    const name = e.name || e.exhibit_id;
    return {
      label: name.length > 16 ? name.slice(0, 16) + '…' : name,
      value: e.count,
      id: e.exhibit_id,
      name,
    };
  });

  // 简单趋势（用最近几天 vs 前面几天）
  const getTrend = (arr: number[]) => {
    if (arr.length < 4) return 0;
    const half = Math.floor(arr.length / 2);
    const last = arr.slice(half).reduce((s, v) => s + v, 0) / half;
    const prev = arr.slice(0, half).reduce((s, v) => s + v, 0) / half;
    return prev > 0 ? ((last - prev) / prev * 100) : 0;
  };
  const visitTrend = getTrend(trends.map(t => t.count));

  // 智能洞察
  const insights: string[] = [];
  if (data) {
    if (visitTrend > 10) insights.push(`本周访客量较上周增长 ${visitTrend.toFixed(1)}%，表现强劲`);
    if (visitTrend < -10) insights.push(`本周访客量较上周下降 ${Math.abs(visitTrend).toFixed(1)}%，建议关注`);
    if (data.language_distribution.length > 0) {
      const topLang = data.language_distribution[0];
      insights.push(`"${getLangLabel(topLang[0])}" 是最受欢迎的语言，占比 ${Math.round(topLang[1] / data.total_visits * 100)}%`);
    }
    if (popularData.length > 0) insights.push(`"${popularData[0].label}" 是访问量最高的展品`);
    if (data.avg_watch_duration_ms > 60000) insights.push(`观众平均观看时长 ${formatDurationLong(data.avg_watch_duration_ms)}，参与度较高`);
    if (liveVisitors > 10) insights.push(`当前有 ${liveVisitors} 位访客正在使用终端`);
  }

  const totalChartCount = data?.popular_exhibits.reduce((s, e) => s + e.count, 0) || 0;

  return (
    <div className="cms-page">
      {/* ── 页头 ── */}
      <div className="cms-page-header">
        <div>
          <h1 className="cms-page-title">数据分析</h1>
          <p className="cms-page-subtitle">访客互动数据统计 · 实时监控 · 智能洞察</p>
        </div>
        <div className="cms-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> 刷新
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleExport('csv')} disabled={exporting || !data}>
            <Download size={13} /> 导出CSV
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => handleExport('json')} disabled={exporting || !data}>
            <Download size={13} /> 导出JSON
          </button>
        </div>
      </div>

      {/* ── 时间筛选 ── */}
      <div className="cms-toolbar" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { label: '今日', days: 0 },
            { label: '最近7天', days: 7 },
            { label: '最近30天', days: 30 },
            { label: '最近90天', days: 90 },
          ].map(p => (
            <button
              key={p.days}
              className={`filter-tab ${!showCustom && preset === p.days ? 'active' : ''}`}
              onClick={() => { setPreset(p.days); setShowCustom(false); setCustomRange(null); }}
            >
              {p.label}
            </button>
          ))}
          <button
            className={`filter-tab ${showCustom ? 'active' : ''}`}
            onClick={() => setShowCustom(v => !v)}
          >
            <Calendar size={12} /> 自定义
          </button>
          {showCustom && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="date"
                className="cms-select"
                style={{ minWidth: 140 }}
                onChange={e => {
                  const d = new Date(e.target.value);
                  if (!isNaN(d.getTime())) {
                    setCustomRange(r => ({ since: d.getTime() / 1000, until: r?.until || (Date.now() / 1000) }));
                  }
                }}
              />
              <span style={{ color: 'var(--text3)', fontSize: 13 }}>至</span>
              <input
                type="date"
                className="cms-select"
                style={{ minWidth: 140 }}
                onChange={e => {
                  const d = new Date(e.target.value);
                  if (!isNaN(d.getTime())) {
                    const end = d.getTime() / 1000 + 86400;
                    setCustomRange(r => ({ since: r?.since || (Date.now() / 1000 - 7 * 86400), until: end }));
                  }
                }}
              />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/analytics/interactions')}>
            <List size={13} /> 交互记录
          </button>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            共 <strong style={{ color: 'var(--text2)' }}>{data?.total_visits?.toLocaleString() ?? 0}</strong> 条互动记录
          </span>
        </div>
      </div>

      {/* ── 智能洞察 ── */}
      {insights.length > 0 && (
        <InsightCard insights={insights} />
      )}

      {/* ── 统计卡片 ── */}
      <div className="analytics-stats-grid">
        <StatCard
          icon={<Users size={20} />}
          value={(data?.total_visits ?? 0).toLocaleString()}
          label="总访客互动"
          sub="累计所有终端交互"
          delta={visitTrend}
          accentColor="#00d4aa"
          loading={loading}
        />
        <StatCard
          icon={<Zap size={20} />}
          value={liveVisitors}
          label="当前在线"
          sub="5分钟内活跃"
          accentColor="#6366f1"
          loading={loading}
        />
        <StatCard
          icon={<Clock size={20} />}
          value={data ? formatDuration(data.avg_watch_duration_ms) : '—'}
          label="平均观看时长"
          sub={data ? formatDurationLong(data.avg_watch_duration_ms) : ''}
          accentColor="#f59e0b"
          loading={loading}
        />
        <StatCard
          icon={<Eye size={20} />}
          value={popularData.length > 0 ? popularData[0].value : 0}
          label="最热展品访问"
          sub={popularData.length > 0 ? popularData[0].label : ''}
          accentColor="#10b981"
          loading={loading}
        />
      </div>

      {/* ── 趋势图 + 时段分布 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="cms-section">
          <div className="cms-section-header">
            <h2><TrendingUp size={15} /> 每日访问趋势</h2>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>近{preset > 0 ? preset : 30}天</span>
          </div>
          {loading ? <SkeletonChart height={130} /> : <TrendChart data={trends} />}
        </div>
        <div className="cms-section">
          <div className="cms-section-header">
            <h2><Activity size={15} /> 24小时时段分布</h2>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>各时段活跃度</span>
          </div>
          {loading ? <SkeletonChart height={110} /> : <HourlyChart data={hourly} />}
        </div>
      </div>

      {/* ── 热门展品 + 语言分布 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="cms-section">
          <div className="cms-section-header">
            <h2><TrendingUp size={15} /> 热门展品排行</h2>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>TOP 8</span>
          </div>
          <div style={{ padding: '4px 20px 20px' }}>
            {loading ? <SkeletonChart height={240} /> : <BarChart data={popularData} />}
          </div>
        </div>
        <div className="cms-section">
          <div className="cms-section-header">
            <h2><Globe size={15} /> 语言使用分布</h2>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>按语言分组</span>
          </div>
          <div style={{ padding: '4px 20px 20px' }}>
            {loading ? <SkeletonChart height={180} /> : (
              <PieChart
                data={(data?.language_distribution || []).map(([label, value]) => ({
                  label: label || 'unknown',
                  value,
                }))}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── 展品访问明细表 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <div className="cms-section">
          <div className="cms-section-header">
            <h2><BarChart2 size={15} /> 展品访问明细</h2>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{popularData.length} 个展品</span>
          </div>
          <div className="cms-table-wrap">
            {loading ? <SkeletonTable rows={6} /> : (
              <table className="cms-table">
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>展品名称</th>
                    <th>访问次数</th>
                    <th>占比</th>
                    <th>趋势</th>
                  </tr>
                </thead>
                <tbody>
                  {popularData.length === 0 ? (
                    <tr><td colSpan={5} className="cms-td-center">暂无数据</td></tr>
                  ) : (
                    popularData.map((item, i) => (
                      <tr key={i} className="analytics-table-row">
                        <td>
                          <span className={`analytics-rank-badge rank-${i + 1}`}>#{i + 1}</span>
                        </td>
                        <td className="analytics-td-name">{item.name}</td>
                        <td><strong style={{ color: 'var(--primary)' }}>{item.value.toLocaleString()}</strong></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="analytics-mini-bar">
                              <div
                                className="analytics-mini-fill"
                                style={{ width: `${totalChartCount > 0 ? (item.value / totalChartCount * 100) : 0}%` }}
                              />
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--text3)', minWidth: 40 }}>
                              {totalChartCount > 0 ? ((item.value / totalChartCount) * 100).toFixed(1) + '%' : '0%'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`analytics-trend-badge ${visitTrend >= 0 ? 'up' : 'down'}`}>
                            {visitTrend >= 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                            {Math.abs(visitTrend).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── 快速统计 ── */}
        <div className="cms-section">
          <div className="cms-section-header">
            <h2><Clock size={15} /> 观看时长统计</h2>
          </div>
          <div style={{ padding: 20 }}>
            {[
              { label: '平均时长', value: data ? formatDurationLong(data.avg_watch_duration_ms) : '—' },
              { label: '总访问量', value: (data?.total_visits ?? 0).toLocaleString() + ' 次' },
              { label: '展品覆盖', value: `${popularData.length} 个` },
              { label: '当前在线', value: `${liveVisitors} 人` },
              { label: '数据周期', value: preset > 0 ? `${preset} 天` : '全部' },
            ].map(({ label, value }) => (
              <div key={label} className="analytics-stat-row">
                <span className="analytics-stat-label">{label}</span>
                <span className="analytics-stat-value">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
