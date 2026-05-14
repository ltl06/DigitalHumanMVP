import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RotateCcw, Clock, FileText, CheckCircle, AlertCircle,
} from 'lucide-react';
import { getContentVersions, restoreContentVersion, getContent } from '../../api/cms';
import type { ContentVersion, Content } from '../../types/api';

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function VersionHistory() {
  const navigate = useNavigate();
  const { contentId } = useParams<{ contentId: string }>();
  const [versions, setVersions] = useState<ContentVersion[]>([]);
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ContentVersion | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!contentId) return;
    setLoading(true);
    Promise.all([
      getContentVersions(contentId),
      getContent(contentId),
    ]).then(([vRes, ctRes]) => {
      setVersions(vRes.versions);
      setContent(ctRes);
      if (vRes.versions.length > 0) {
        setSelected(vRes.versions[0]);
      }
    }).catch(() => setError('加载失败'))
      .finally(() => setLoading(false));
  }, [contentId]);

  const handleRestore = async () => {
    if (!selected || !contentId) return;
    if (!confirm(`确定恢复到 v${selected.version}？当前正文将被覆盖。`)) return;
    setRestoring(true);
    setError('');
    setSuccess('');
    try {
      await restoreContentVersion(contentId, selected.version);
      setSuccess(`已恢复到 v${selected.version}`);
      const [vRes, ctRes] = await Promise.all([
        getContentVersions(contentId),
        getContent(contentId),
      ]);
      setVersions(vRes.versions);
      setContent(ctRes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="cms-page">
      <div className="cms-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={13} /> 返回
          </button>
          <div>
            <h1 className="cms-page-title">版本历史</h1>
            <p className="cms-page-subtitle">
              {content?.title || contentId?.slice(0, 8)}
            </p>
          </div>
        </div>
        {selected && (
          <button
            className="btn btn-primary btn-sm"
            onClick={handleRestore}
            disabled={restoring || selected.version === content?.version}
          >
            <RotateCcw size={13} />
            {restoring ? '恢复中...' : `恢复到 v${selected.version}`}
          </button>
        )}
      </div>

      {error && <div className="cms-error-banner"><AlertCircle size={13} /> {error}</div>}
      {success && <div className="cms-success-banner"><CheckCircle size={13} /> {success}</div>}

      {loading ? (
        <div className="cms-td-center" style={{ padding: 48 }}>加载中...</div>
      ) : versions.length === 0 ? (
        <div className="cms-td-center" style={{ padding: 48, color: 'var(--text3)' }}>暂无版本历史</div>
      ) : (
        <div className="cms-version-layout">
          {/* Version List */}
          <div className="cms-version-list">
            <div className="cms-version-list-header">版本列表 ({versions.length})</div>
            {versions.map((v) => (
              <button
                key={v.id}
                className={`cms-version-item ${selected?.id === v.id ? 'cms-version-active' : ''}`}
                onClick={() => setSelected(v)}
              >
                <div className="cms-version-top">
                  <span className="cms-version-num">v{v.version}</span>
                  <span className="cms-version-date">
                    <Clock size={10} /> {formatDate(v.created_at)}
                  </span>
                </div>
                <div className="cms-version-summary">{v.change_summary || '手动保存'}</div>
              </button>
            ))}
          </div>

          {/* Diff View */}
          <div className="cms-version-diff">
            {selected ? (
              <>
                <div className="cms-version-diff-header">
                  <span>v{selected.version}</span>
                  <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                    {formatDate(selected.created_at)} &nbsp;|&nbsp; {selected.body.length} 字
                  </span>
                </div>
                <div className="cms-version-body">
                  <pre className="cms-version-text">{selected.body}</pre>
                </div>
              </>
            ) : (
              <div className="cms-td-center" style={{ padding: 48 }}>选择一个版本查看</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
