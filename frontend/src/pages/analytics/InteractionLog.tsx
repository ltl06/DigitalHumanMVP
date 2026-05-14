import { useState, useEffect } from 'react';
import { ArrowLeft, Download, Filter, RefreshCw, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { listExhibits } from '../../api/cms';
import { listInteractions } from '../../api/analytics';
import type { Interaction, Exhibit } from '../../types/api';

const EVENT_LABELS: Record<string, string> = {
  page_view: '页面浏览',
  view: '展品浏览',
  content_start: '开始播放',
  content_complete: '播放完成',
  play: '播放',
  ended: '播放结束',
  language_switch: '切换语言',
  exhibit_select: '选择展品',
  qr_scan: '扫码访问',
  share: '分享',
};

function formatDate(ts: number) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function InteractionLog() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<Interaction[]>([]);
  const [exhibits, setExhibits] = useState<Exhibit[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterExhibit, setFilterExhibit] = useState('');
  const [filterEvent, setFilterEvent] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const load = () => {
    setLoading(true);
    const sinceTs = filterDateFrom ? new Date(filterDateFrom).getTime() / 1000 : 0;
    const untilTs = filterDateTo ? (new Date(filterDateTo).getTime() / 1000) + 86400 : 0;
    listInteractions({ page, exhibit_id: filterExhibit || undefined, event_type: filterEvent || undefined, since: sinceTs, until: untilTs }).then((r) => {
      setRecords(r.interactions);
      setTotalPages(r.total_pages || 1);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    listExhibits().then((r) => setExhibits(r.exhibits)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [page, filterExhibit, filterEvent, filterDateFrom, filterDateTo]);

  const handleExport = () => {
    const rows = [
      ['时间', '展品', '事件类型', '会话ID', '设备ID', '时长(秒)'],
      ...records.map((r) => [
        formatDate(r.created_at),
        exhibits.find((e) => e.id === r.exhibit_id)?.name || r.exhibit_id || '—',
        EVENT_LABELS[r.event_type] || r.event_type,
        r.session_id || '—',
        r.device_id || '—',
        r.duration_ms ? (r.duration_ms / 1000).toFixed(1) : '—',
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `interactions_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="cms-page">
      <div className="cms-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/analytics')}>
            <ArrowLeft size={13} /> 返回
          </button>
          <div>
            <h1 className="cms-page-title">交互记录</h1>
            <p className="cms-page-subtitle">查看所有访客互动明细</p>
          </div>
        </div>
        <div className="cms-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={load}>
            <RefreshCw size={13} /> 刷新
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleExport}>
            <Download size={13} /> 导出 CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="cms-section" style={{ marginBottom: 16 }}>
        <div style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={15} style={{ color: 'var(--text3)', flexShrink: 0 }} />
          <select className="cms-select" value={filterExhibit} onChange={(e) => { setFilterExhibit(e.target.value); setPage(1); }}>
            <option value="">全部展品</option>
            {exhibits.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select className="cms-select" value={filterEvent} onChange={(e) => { setFilterEvent(e.target.value); setPage(1); }}>
            <option value="">全部事件</option>
            {Object.entries(EVENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="date"
              className="cms-select"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              style={{ minWidth: 140 }}
            />
            <span style={{ color: 'var(--text3)', fontSize: 13 }}>至</span>
            <input
              type="date"
              className="cms-select"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              style={{ minWidth: 140 }}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="cms-section">
        <div className="cms-table-wrap">
          <table className="cms-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>展品</th>
                <th>事件类型</th>
                <th>会话ID</th>
                <th>设备ID</th>
                <th>停留时长</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="cms-td-center">加载中...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={6} className="cms-td-center">
                  <FileText size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
                  <div>暂无交互记录</div>
                </td></tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id}>
                    <td className="cms-td-date">{formatDate(r.created_at)}</td>
                    <td>
                      {r.exhibit_id ? (
                        <a
                          href={`/cms/exhibits/${r.exhibit_id}`}
                          className="cms-exhibit-name-link"
                          onClick={(e) => { e.preventDefault(); navigate(`/cms/exhibits/${r.exhibit_id}`); }}
                        >
                          {exhibits.find((e) => e.id === r.exhibit_id)?.name || r.exhibit_id}
                        </a>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`cms-badge cms-badge-${r.event_type === 'content_complete' ? 'success' : r.event_type === 'page_view' ? 'default' : 'warning'}`}>
                        {EVENT_LABELS[r.event_type] || r.event_type}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text3)' }}>
                      {r.session_id ? r.session_id.slice(0, 8) + '...' : '—'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text3)' }}>
                      {r.device_id ? r.device_id.slice(0, 8) + '...' : '—'}
                    </td>
                    <td>{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
            <span className="page-info">{page} / {totalPages}</span>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
          </div>
        )}
      </div>
    </div>
  );
}
