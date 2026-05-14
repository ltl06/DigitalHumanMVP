import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Plus, Package, FileText, Globe, Archive,
  Eye, Trash2, CheckCircle, AlertCircle, Video,
} from 'lucide-react';
import { getExhibit, listExhibits, listContents, publishContent, archiveContent } from '../../api/cms';
import type { Exhibit, Content } from '../../types/api';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'warning', published: 'success', archived: 'default',
  };
  const labels: Record<string, string> = {
    draft: '草稿', published: '已发布', archived: '已归档',
  };
  return <span className={`cms-badge cms-badge-${map[status] || 'default'}`}>{labels[status] || status}</span>;
}

function formatDate(ts: number) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ExhibitDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [exhibit, setExhibit] = useState<Exhibit | null>(null);
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = () => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getExhibit(id),
      listContents({ exhibit_id: id }),
    ]).then(([exRes, ctRes]) => {
      setExhibit(exRes);
      setContents(ctRes.contents);
    }).catch(() => navigate('/cms/exhibits'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const handlePublish = async (contentId: string) => {
    setActionLoading(contentId);
    try {
      await publishContent(contentId, '从展品详情页发布');
      load();
    } catch {}
    setActionLoading(null);
  };

  const handleArchive = async (contentId: string) => {
    setActionLoading(contentId);
    try {
      await archiveContent(contentId);
      load();
    } catch {}
    setActionLoading(null);
  };

  if (loading) {
    return (
      <div className="cms-page">
        <div className="cms-td-center" style={{ padding: 80 }}>加载中...</div>
      </div>
    );
  }

  if (!exhibit) {
    return (
      <div className="cms-page">
        <div className="cms-td-center" style={{ padding: 80, color: 'var(--error)' }}>展品不存在</div>
      </div>
    );
  }

  const published = contents.filter((c) => c.status === 'published').length;

  return (
    <div className="cms-page">
      <div className="cms-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/cms/exhibits')}>
            <ArrowLeft size={13} /> 返回
          </button>
          <div>
            <h1 className="cms-page-title">{exhibit.name}</h1>
            <p className="cms-page-subtitle">
              {exhibit.category && <span>{exhibit.category} &bull; </span>}
              {exhibit.code && <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{exhibit.code}</span>}
            </p>
          </div>
        </div>
        <div className="cms-header-actions">
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/cms/contents/new?exhibit_id=${exhibit.id}`)}>
            <Plus size={13} /> 新建内容
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/cms/exhibits')}>
            <Edit2 size={13} /> 编辑展品
          </button>
        </div>
      </div>

      {/* Exhibit Info Card */}
      <div className="cms-section">
        <div className="cms-section-header">
          <h2><Package size={15} /> 展品信息</h2>
        </div>
        <div style={{ padding: 20 }}>
          <div className="cms-info-grid">
            <div className="cms-info-item">
              <span className="cms-info-label">名称</span>
              <span className="cms-info-value">{exhibit.name}</span>
            </div>
            {exhibit.code && (
              <div className="cms-info-item">
                <span className="cms-info-label">编号</span>
                <span className="cms-info-value" style={{ fontFamily: 'monospace' }}>{exhibit.code}</span>
              </div>
            )}
            {exhibit.category && (
              <div className="cms-info-item">
                <span className="cms-info-label">分类</span>
                <span className="cms-info-value">{exhibit.category}</span>
              </div>
            )}
            <div className="cms-info-item">
              <span className="cms-info-label">默认语言</span>
              <span className="cms-info-value">{exhibit.default_language}</span>
            </div>
            <div className="cms-info-item">
              <span className="cms-info-label">创建时间</span>
              <span className="cms-info-value">{formatDate(exhibit.created_at)}</span>
            </div>
            <div className="cms-info-item">
              <span className="cms-info-label">更新时间</span>
              <span className="cms-info-value">{formatDate(exhibit.updated_at)}</span>
            </div>
            <div className="cms-info-item" style={{ gridColumn: '1 / -1' }}>
              <span className="cms-info-label">简介</span>
              <span className="cms-info-value" style={{ color: 'var(--text2)' }}>
                {exhibit.description || '暂无简介'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="cms-stats-grid" style={{ marginBottom: 20 }}>
        <div className="cms-stat-card" style={{ borderTop: '3px solid #00d4aa' }}>
          <div className="cms-stat-icon" style={{ background: 'rgba(0,212,170,0.12)', color: '#00d4aa' }}>
            <FileText size={20} />
          </div>
          <div className="cms-stat-value">{contents.length}</div>
          <div className="cms-stat-label">总内容数</div>
        </div>
        <div className="cms-stat-card" style={{ borderTop: '3px solid #10b981' }}>
          <div className="cms-stat-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
            <Globe size={20} />
          </div>
          <div className="cms-stat-value">{published}</div>
          <div className="cms-stat-label">已发布</div>
        </div>
        <div className="cms-stat-card" style={{ borderTop: '3px solid #f59e0b' }}>
          <div className="cms-stat-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
            <Archive size={20} />
          </div>
          <div className="cms-stat-value">{contents.filter(c => c.status === 'draft').length}</div>
          <div className="cms-stat-label">草稿</div>
        </div>
      </div>

      {/* Contents Table */}
      <div className="cms-section">
        <div className="cms-section-header">
          <h2><FileText size={15} /> 讲解内容 ({contents.length})</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/cms/contents/new?exhibit_id=${exhibit.id}`)}>
            <Plus size={13} /> 新建内容
          </button>
        </div>
        <div className="cms-table-wrap">
          <table className="cms-table">
            <thead>
              <tr>
                <th>标题</th>
                <th>语言</th>
                <th>版本</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {contents.length === 0 ? (
                <tr><td colSpan={6} className="cms-td-center">
                  暂无内容
                  <div style={{ marginTop: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate(`/cms/contents/new?exhibit_id=${exhibit.id}`)}>
                      <Plus size={13} /> 新建第一条内容
                    </button>
                  </div>
                </td></tr>
              ) : (
                contents.map((ct) => (
                  <tr key={ct.id}>
                    <td className="cms-td-title">{ct.title}</td>
                    <td>{ct.language}</td>
                    <td>v{ct.version}</td>
                    <td><StatusBadge status={ct.status} /></td>
                    <td className="cms-td-date">{formatDate(ct.updated_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--primary)', borderColor: 'rgba(0,212,170,0.3)' }}
                          onClick={() => navigate(`/create?contentId=${ct.id}`)}>
                          <Video size={12} /> 制作视频
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/cms/contents/${ct.id}/edit`)}>
                          <Edit2 size={12} /> 编辑
                        </button>
                        {ct.status !== 'published' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handlePublish(ct.id)} disabled={actionLoading === ct.id}>
                            <Globe size={12} /> 发布
                          </button>
                        )}
                        {ct.status === 'published' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleArchive(ct.id)} disabled={actionLoading === ct.id}>
                            <Archive size={12} /> 归档
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/cms/versions/${ct.id}`)}>
                          <Eye size={12} /> 版本
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .cms-info-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        .cms-info-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .cms-info-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text3);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .cms-info-value {
          font-size: 14px;
          color: var(--text);
          font-weight: 500;
        }
        @media (max-width: 768px) {
          .cms-info-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </div>
  );
}
