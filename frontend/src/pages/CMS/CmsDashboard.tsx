import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, Package, TrendingUp, Clock,
  ChevronRight, Plus, FileText, Archive,
} from 'lucide-react';
import {
  listExhibits, listContents, exportContentPackage,
} from '../../api/cms';
import { getHistoryStats } from '../../api/client';
import type { Exhibit, Content } from '../../types/api';
import Breadcrumb from '../../components/Breadcrumb';

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className="cms-stat-card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="cms-stat-icon" style={{ background: `${color}18`, color }}>{icon}</div>
      <div className="cms-stat-value">{value}</div>
      <div className="cms-stat-label">{label}</div>
    </div>
  );
}

function formatDate(ts: number) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CmsDashboard() {
  const navigate = useNavigate();
  const [exhibits, setExhibits] = useState<Exhibit[]>([]);
  const [contents, setContents] = useState<Content[]>([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, failed: 0, processing: 0, week_count: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listExhibits(),
      listContents({ size: 5 }),
      getHistoryStats(),
    ]).then(([exRes, ctRes, stRes]) => {
      setExhibits(exRes.exhibits);
      setContents(ctRes.contents);
      setStats(stRes);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const published = contents.filter((c) => c.status === 'published').length;
  const draft = contents.filter((c) => c.status === 'draft').length;

  const handleExport = async () => {
    try {
      const pkg = await exportContentPackage();
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `content_package_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  return (
    <div className="cms-page">
      <Breadcrumb />
      <div className="cms-page-header">
        <div>
          <h1 className="cms-page-title">内容管理</h1>
          <p className="cms-page-subtitle">管理展品、讲解内容与发布状态</p>
        </div>
        <div className="cms-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>
            <Package size={13} /> 导出内容包
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/cms/exhibits')}>
            <Plus size={13} /> 添加展品
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="cms-stats-grid">
        <StatCard label="展品总数" value={exhibits.length} icon={<Package size={18} />} color="#00d4aa" />
        <StatCard label="内容总数" value={contents.length} icon={<FileText size={18} />} color="#6366f1" />
        <StatCard label="已发布" value={published} icon={<TrendingUp size={18} />} color="#10b981" />
        <StatCard label="草稿" value={draft} icon={<Archive size={18} />} color="#f59e0b" />
      </div>

      {/* Recent Content */}
      <div className="cms-section">
        <div className="cms-section-header">
          <h2><FileText size={16} /> 最近内容</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/cms/contents')}>
            查看全部 <ChevronRight size={13} />
          </button>
        </div>
        <div className="cms-table-wrap">
          <table className="cms-table">
            <thead>
              <tr>
                <th>标题</th>
                <th>展品</th>
                <th>语言</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="cms-td-center">加载中...</td></tr>
              ) : contents.length === 0 ? (
                <tr><td colSpan={6} className="cms-td-center">暂无内容</td></tr>
              ) : (
                contents.map((ct) => (
                  <tr key={ct.id}>
                    <td className="cms-td-title">{ct.title}</td>
                    <td>
                      {exhibits.find((e) => e.id === ct.exhibit_id)?.name || '—'}
                    </td>
                    <td>{ct.language}</td>
                    <td>
                      <span className={`cms-badge cms-badge-${ct.status}`}>{ct.status}</span>
                    </td>
                    <td className="cms-td-date">{formatDate(ct.updated_at)}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/cms/contents/${ct.id}/edit`)}
                      >
                        编辑
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Exhibits */}
      <div className="cms-section">
        <div className="cms-section-header">
          <h2><Package size={16} /> 展品</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/cms/exhibits')}>
            管理展品 <ChevronRight size={13} />
          </button>
        </div>
        <div className="cms-exhibit-chips">
          {loading ? (
            <span style={{ color: 'var(--text3)' }}>加载中...</span>
          ) : exhibits.length === 0 ? (
            <span style={{ color: 'var(--text3)' }}>暂无展品</span>
          ) : (
            exhibits.slice(0, 12).map((ex) => (
              <button
                key={ex.id}
                className="cms-exhibit-chip"
                onClick={() => navigate(`/cms/exhibits`)}
              >
                <span>{ex.name}</span>
                {ex.category && <span className="cms-chip-cat">{ex.category}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
