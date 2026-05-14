import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Edit2, Trash2, Search, X, Eye, Archive, Globe, Video, Upload, Download, CheckCircle,
} from 'lucide-react';
import {
  listContents, listExhibits, publishContent, archiveContent, deleteContent, batchImport,
} from '../../api/cms';
import type { Content, Exhibit } from '../../types/api';

const LANGUAGE_OPTIONS = [
  { id: '', label: '全部语言' },
  { id: 'zh-CN', label: '中文' },
  { id: 'en-US', label: 'English' },
  { id: 'child', label: '少儿版' },
  { id: 'elderly', label: '大字版' },
];

const LANGUAGE_LABEL_MAP: Record<string, string> = {
  'zh-CN': '中文',
  'en-US': 'English',
  'child': '少儿版',
  'elderly': '大字版',
};

const STATUS_OPTIONS = [
  { id: '', label: '全部状态' },
  { id: 'draft', label: '草稿' },
  { id: 'published', label: '已发布' },
  { id: 'archived', label: '已归档' },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'warning', published: 'success', archived: 'default',
  };
  const labels: Record<string, string> = {
    draft: '草稿', published: '已发布', archived: '已归档',
  };
  return <span className={`cms-badge cms-badge-${map[status] || 'default'}`}>{labels[status] || status}</span>;
}

export default function ContentList() {
  const navigate = useNavigate();
  const [contents, setContents] = useState<Content[]>([]);
  const [exhibits, setExhibits] = useState<Exhibit[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterLang, setFilterLang] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [filterExhibit, setFilterExhibit] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ exhibits: number; contents: number } | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      listContents({ page, size: 20, language: filterLang, status: filterStatus }),
      listExhibits(),
    ]).then(([res]) => {
      let items = res.contents;
      if (filterExhibit) items = items.filter((c) => c.exhibit_id === filterExhibit);
      if (search) items = items.filter((c) => c.title.includes(search) || c.body.includes(search));
      setContents(items);
      setTotalPages(res.pages);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, filterLang, filterStatus]);

  const handlePublish = async (id: string) => {
    setActionLoading(true);
    try {
      await publishContent(id, 'CMS 发布');
      load();
    } catch {}
    setActionLoading(false);
  };

  const handleArchive = async (id: string) => {
    setActionLoading(true);
    try { await archiveContent(id); load(); } catch {}
    setActionLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该内容？')) return;
    setActionLoading(true);
    try { await deleteContent(id); load(); } catch {}
    setActionLoading(false);
  };

  const handleBatchPublish = async () => {
    if (selected.size === 0) return;
    setActionLoading(true);
    try {
      for (const id of selected) await publishContent(id, '批量发布');
      setSelected(new Set());
      load();
    } catch {}
    setActionLoading(false);
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await batchImport(data);
      setImportResult({ exhibits: result.imported_exhibits, contents: result.imported_contents });
      load();
    } catch (e) {
      alert('导入失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setImporting(false);
    }
  };

  const toggleSelect = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };

  const toggleSelectAll = () => {
    if (selected.size === contents.length) setSelected(new Set());
    else setSelected(new Set(contents.map((c) => c.id)));
  };

  const getExhibitName = (exhibitId: string) => {
    return exhibits.find((e) => e.id === exhibitId)?.name || exhibitId.slice(0, 8) + '...';
  };

  return (
    <div className="cms-page">
      <div className="cms-page-header">
        <div>
          <h1 className="cms-page-title">内容管理</h1>
          <p className="cms-page-subtitle">管理讲解内容（多语言版本）</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/cms/contents/new')}>
          <Plus size={13} /> 新建内容
        </button>
      </div>

      {/* Toolbar */}
      <div className="cms-toolbar cms-toolbar-wrap">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="cms-select" value={filterLang} onChange={(e) => { setFilterLang(e.target.value); setPage(1); }}>
            {LANGUAGE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <select className="cms-select" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
            {STATUS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <select className="cms-select" value={filterExhibit} onChange={(e) => { setFilterExhibit(e.target.value); setPage(1); }}>
            <option value="">全部展品</option>
            {exhibits.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>
            <Upload size={13} /> 导入
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => {
            const data = { contents: contents.map(c => ({ title: c.title, body: c.body, exhibit_id: c.exhibit_id, language: c.language, category: c.category, tags: c.tags, duration_sec: c.duration_sec, status: c.status })) };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `contents_backup_${Date.now()}.json`; a.click();
            URL.revokeObjectURL(url);
          }}>
            <Download size={13} /> 导出
          </button>
        </div>
        <div className="cms-search-wrap">
          <Search size={14} />
          <input className="cms-search" placeholder="搜索标题或正文..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><X size={14} /></button>}
        </div>
      </div>

      {/* Batch Actions */}
      {selected.size > 0 && (
        <div className="cms-batch-bar">
          <span style={{ fontSize: 13 }}>已选择 {selected.size} 项</span>
          <button className="btn btn-primary btn-sm" onClick={handleBatchPublish} disabled={actionLoading}>
            <Globe size={12} /> 批量发布
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>取消</button>
        </div>
      )}

      {/* Table */}
      <div className="cms-section">
        <div className="cms-table-wrap">
          <table className="cms-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" checked={selected.size === contents.length && contents.length > 0}
                    onChange={toggleSelectAll} />
                </th>
                <th>标题</th>
                <th>展品</th>
                <th>语言</th>
                <th>版本</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="cms-td-center">加载中...</td></tr>
              ) : contents.length === 0 ? (
                <tr><td colSpan={7} className="cms-td-center">暂无内容</td></tr>
              ) : (
                contents.map((ct) => (
                  <tr key={ct.id} className={selected.has(ct.id) ? 'cms-row-selected' : ''}>
                    <td>
                      <input type="checkbox" checked={selected.has(ct.id)}
                        onChange={() => toggleSelect(ct.id)} />
                    </td>
                    <td className="cms-td-title">
                      <div>{ct.title}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                        {ct.body.length > 60 ? ct.body.slice(0, 60) + '...' : ct.body}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{getExhibitName(ct.exhibit_id)}</td>
                    <td>{LANGUAGE_LABEL_MAP[ct.language] || ct.language}</td>
                    <td>v{ct.version}</td>
                    <td><StatusBadge status={ct.status} /></td>
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
                          <button className="btn btn-ghost btn-sm" onClick={() => handlePublish(ct.id)} disabled={actionLoading}>
                            <Globe size={12} /> 发布
                          </button>
                        )}
                        {ct.status === 'published' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleArchive(ct.id)} disabled={actionLoading}>
                            <Archive size={12} /> 归档
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/cms/versions/${ct.id}`)}>
                          <Eye size={12} /> 版本
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => handleDelete(ct.id)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="cms-pagination">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
            <span className="page-info">{page} / {totalPages}</span>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
          </div>
        )}
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="cms-modal-overlay" onClick={() => { setShowImport(false); setImportResult(null); }}>
          <div className="cms-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="cms-modal-title">
              <Upload size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
              批量导入
            </div>
            {importResult ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <CheckCircle size={48} style={{ color: 'var(--success)', margin: '0 auto 16px', display: 'block' }} />
                <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>导入成功</p>
                <p style={{ fontSize: 13, color: 'var(--text2)' }}>
                  新增展品 <strong style={{ color: 'var(--primary)' }}>{importResult.exhibits}</strong> 个，
                  新增内容 <strong style={{ color: 'var(--primary)' }}>{importResult.contents}</strong> 条
                </p>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 20 }} onClick={() => { setShowImport(false); setImportResult(null); }}>
                  完成
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
                  上传 JSON 文件批量导入展品和内容。文件格式：
                </div>
                <pre style={{
                  background: 'var(--surface2)', borderRadius: 8, padding: 12,
                  fontSize: 11, color: 'var(--text3)', overflow: 'auto', maxHeight: 180,
                  fontFamily: 'monospace', marginBottom: 16,
                }}>
{`{
  "exhibits": [{ "name": "..." }],
  "contents": [{ "title": "...", "body": "..." }]
}`}
                </pre>
                <div
                  className="cms-upload-box"
                  style={{ justifyContent: 'center', padding: 24 }}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
                  onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('dragover');
                    const file = e.dataTransfer.files[0];
                    if (file) handleImport(file);
                  }}
                >
                  {importing ? (
                    <span className="cms-uploading">导入中...</span>
                  ) : (
                    <>
                      <Upload size={24} />
                      <span style={{ fontSize: 14 }}>拖拽 JSON 文件或</span>
                      <label className="cms-upload-btn" style={{ cursor: 'pointer' }}>
                        点击选择
                        <input
                          type="file"
                          accept=".json,application/json"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImport(file);
                          }}
                        />
                      </label>
                    </>
                  )}
                </div>
                <div className="cms-modal-actions">
                  <button className="btn btn-ghost" onClick={() => setShowImport(false)}>取消</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
