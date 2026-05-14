import { useState, useEffect, useCallback } from 'react';
import { Search, Trash2, Video, Plus, Loader, RefreshCw } from 'lucide-react';
import { getHistory, deleteHistory, clearHistory } from '../api/client';
import JobCard from '../components/JobCard';
import { useNavigate } from 'react-router-dom';
import type { Job } from '../types/api';

const STATUS_FILTERS = [
  { value: '', label: '全部' },
  { value: 'processing', label: '处理中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
];

const TYPE_FILTERS = [
  { value: '', label: '全部类型' },
  { value: 'pipeline', label: '数字人合成' },
  { value: 'tts', label: '语音合成' },
  { value: 'lipsync', label: '唇形同步' },
];

export default function HistoryPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const size = 12;

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getHistory({
        page,
        size,
        status: statusFilter || undefined,
        job_type: typeFilter || undefined,
        search: search || undefined,
      });
      setRecords(res.records);
      setTotal(res.total);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter, search]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleDelete = (jobId: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== jobId));
    setTotal((t) => t - 1);
  };

  const handleClearAll = async () => {
    if (!confirm('确定清空所有历史记录？此操作不可恢复。')) return;
    setClearing(true);
    await clearHistory();
    setClearing(false);
    setRecords([]);
    setTotal(0);
  };

  const pages = Math.ceil(total / size) || 1;

  // 统计数据
  const stats = {
    total,
    completed: records.filter(r => r.status === 'completed').length,
    processing: records.filter(r => r.status === 'processing').length,
    failed: records.filter(r => r.status === 'failed').length,
  };

  return (
    <div>
      <div className="page-title">
        <h1>历史记录</h1>
        <p>管理您的所有创作记录</p>
      </div>

      {/* 统计摘要 */}
      {total > 0 && !loading && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 24,
        }}>
          {[
            { label: '全部作品', value: stats.total, color: 'var(--text)', bg: 'var(--surface2)' },
            { label: '已完成', value: stats.completed, color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.1)' },
            { label: '处理中', value: stats.processing, color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.1)' },
            { label: '失败', value: stats.failed, color: 'var(--error)', bg: 'rgba(239, 68, 68, 0.1)' },
          ].map((stat) => (
            <div key={stat.label} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              background: stat.bg,
              borderRadius: 'var(--radius2)',
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="history-toolbar">
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text3)',
              pointerEvents: 'none',
            }}
          />
          <input
            className="history-search"
            style={{ paddingLeft: 36 }}
            placeholder="搜索名称或内容..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <div className="filter-tabs">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`filter-tab ${statusFilter === f.value ? 'active' : ''}`}
              onClick={() => { setStatusFilter(f.value); setPage(1); }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius2)',
            padding: '8px 12px',
            color: 'var(--text)',
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
            cursor: 'pointer',
          }}
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
        >
          {TYPE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        {total > 0 && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchRecords()}
            style={{ gap: 6 }}
          >
            <RefreshCw size={13} />
            刷新
          </button>
        )}

        {total > 0 && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleClearAll}
            disabled={clearing}
            style={{ color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
          >
            <Trash2 size={13} />
            {clearing ? '清空中...' : '清空全部'}
          </button>
        )}
      </div>

      {/* Results info */}
      {total > 0 && (
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>
          共找到 <span style={{ color: 'var(--text)', fontWeight: 600 }}>{total}</span> 条记录，第 {page}/{pages} 页
        </p>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text3)' }}>
          <Loader size={32} className="spin" style={{ marginBottom: 12 }} />
          <p>加载中...</p>
        </div>
      ) : records.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Video size={48} style={{ opacity: 0.3 }} />
          </div>
          <h3>{search || statusFilter || typeFilter ? '没有找到匹配的结果' : '还没有任何记录'}</h3>
          <p>{search || statusFilter || typeFilter ? '试试调整筛选条件' : '创建您的第一个数字人作品吧'}</p>
          <button className="btn btn-primary" onClick={() => navigate('/create')}>
            <Plus size={16} /> 立即创建
          </button>
        </div>
      ) : (
        <>
          <div className="job-grid">
            {records.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onDeleted={() => handleDelete(job.id)}
                onRenamed={fetchRecords}
              />
            ))}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </button>
              <span className="page-info">
                第 {page} / {pages} 页，共 {total} 条
              </span>
              <button
                className="page-btn"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
