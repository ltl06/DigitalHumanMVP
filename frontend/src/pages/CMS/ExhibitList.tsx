import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Edit2, Trash2, Search, X, CheckCircle, AlertCircle, Upload, Image, Eye, Play,
} from 'lucide-react';
import {
  listExhibits, createExhibit, updateExhibit, deleteExhibit,
  uploadDigitalHuman, uploadExhibitVideo,
} from '../../api/cms';
import type { Exhibit } from '../../types/api';

const LANGUAGE_LABEL_MAP: Record<string, string> = {
  'zh-CN': '中文',
  'en-US': 'English',
  'child': '少儿版',
  'elderly': '大字版',
};

export default function ExhibitList() {
  const navigate = useNavigate();
  const [exhibits, setExhibits] = useState<Exhibit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Exhibit | null>(null);
  const [form, setForm] = useState({
    name: '', code: '', description: '', category: '',
    digital_human_model: '', default_language: 'zh-CN',
    exhibit_video_filename: '',
  });
  const [uploading, setUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [exhibitVideoFile, setExhibitVideoFile] = useState<{ name: string; size: number; url?: string } | null>(null);

  const load = () => {
    setLoading(true);
    listExhibits()
      .then((r) => setExhibits(r.exhibits))
      .catch(() => setError('加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ name: '', code: '', description: '', category: '', digital_human_model: '', default_language: 'zh-CN', exhibit_video_filename: '' });
    setExhibitVideoFile(null);
    setError('');
    setShowModal(true);
  };

  const openEdit = (ex: Exhibit) => {
    setEditTarget(ex);
    setForm({
      name: ex.name,
      code: ex.code || '',
      description: ex.description || '',
      category: ex.category || '',
      digital_human_model: ex.digital_human_model || '',
      default_language: ex.default_language || 'zh-CN',
      exhibit_video_filename: ex.exhibit_video_filename || '',
    });
    setExhibitVideoFile(ex.exhibit_video_filename ? { name: ex.exhibit_video_filename, size: 0 } : null);
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('名称不能为空'); return; }
    setSaving(true);
    setError('');
    try {
      if (editTarget) {
        await updateExhibit(editTarget.id, form);
      } else {
        await createExhibit(form);
      }
      setShowModal(false);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDhUpload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const result = await uploadDigitalHuman(file);
      setForm((f) => ({ ...f, digital_human_model: result.filename }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const handleExhibitVideoUpload = async (file: File) => {
    setVideoUploading(true);
    setError('');
    try {
      const result = await uploadExhibitVideo(file);
      const url = URL.createObjectURL(file);
      setExhibitVideoFile({ name: result.filename, size: result.size, url });
      setForm((f) => ({ ...f, exhibit_video_filename: result.filename }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVideoUploading(false);
    }
  };

  const removeExhibitVideo = () => {
    setExhibitVideoFile(null);
    setForm((f) => ({ ...f, exhibit_video_filename: '' }));
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteExhibit(id);
      setDeleteConfirm(null);
      load();
    } catch { setError('删除失败'); }
  };

  const filtered = exhibits.filter((ex) =>
    !filter || ex.name.includes(filter) || (ex.code || '').includes(filter) || (ex.category || '').includes(filter)
  );

  return (
    <div className="cms-page">
      <div className="cms-page-header">
        <div>
          <h1 className="cms-page-title">展品管理</h1>
          <p className="cms-page-subtitle">管理展览馆展品信息</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <Plus size={13} /> 添加展品
        </button>
      </div>

      {/* Toolbar */}
      <div className="cms-toolbar">
        <div className="cms-search-wrap">
          <Search size={14} />
          <input
            className="cms-search"
            placeholder="搜索展品名称、编号、分类..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && <button onClick={() => setFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><X size={14} /></button>}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{filtered.length} 个展品</span>
      </div>

      {/* Table */}
      <div className="cms-section">
        <div className="cms-table-wrap">
          <table className="cms-table">
            <thead>
              <tr>
                <th>展品名称</th>
                <th>编号</th>
                <th>分类</th>
                <th>默认语言</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="cms-td-center">加载中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="cms-td-center">暂无展品</td></tr>
              ) : (
                filtered.map((ex) => (
                  <tr key={ex.id}>
                    <td className="cms-td-title">
                      <a
                        href={`/cms/exhibits/${ex.id}`}
                        className="cms-exhibit-name-link"
                        onClick={(e) => { e.preventDefault(); navigate(`/cms/exhibits/${ex.id}`); }}
                      >
                        {ex.name}
                      </a>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{ex.code || '—'}</td>
                    <td>{ex.category || '—'}</td>
                    <td>{LANGUAGE_LABEL_MAP[ex.default_language] || ex.default_language}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(ex)}>
                          <Edit2 size={12} /> 编辑
                        </button>
                        {deleteConfirm === ex.id ? (
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(ex.id)}>
                            <CheckCircle size={12} /> 确认删除
                          </button>
                        ) : (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => setDeleteConfirm(ex.id)}>
                            <Trash2 size={12} /> 删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="cms-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="cms-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cms-modal-title">{editTarget ? '编辑展品' : '添加展品'}</div>
            {error && <div className="cms-error-banner"><AlertCircle size={13} /> {error}</div>}
            <div className="cms-form-grid">
              {[
                { label: '展品名称 *', key: 'name', type: 'text', placeholder: '例如：青铜方鼎' },
                { label: '展品编号', key: 'code', type: 'text', placeholder: '用于二维码等' },
                { label: '分类', key: 'category', type: 'text', placeholder: '例如：青铜器' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key} className="cms-form-group">
                  <label>{label}</label>
                  <input
                    type={type}
                    value={(form as any)[key]}
                    placeholder={placeholder}
                    onChange={(e) => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              {/* Digital Human Model Upload */}
              <div className="cms-form-group" style={{ gridColumn: '1 / -1' }}>
                <label>数字人模型</label>
                <div className="cms-upload-row">
                  {form.digital_human_model ? (
                    <div className="cms-dh-preview">
                      <Image size={16} style={{ color: 'var(--primary)' }} />
                      <span className="cms-dh-filename">{form.digital_human_model}</span>
                      <button
                        className="cms-dh-remove"
                        onClick={() => setForm((f) => ({ ...f, digital_human_model: '' }))}
                        title="移除"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="cms-upload-box"
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
                      onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('dragover');
                        const file = e.dataTransfer.files[0];
                        if (file) handleDhUpload(file);
                      }}
                    >
                      <Upload size={18} />
                      <span>拖拽上传或</span>
                      <label className="cms-upload-btn" style={{ cursor: 'pointer' }}>
                        点击选择
                        <input
                          type="file"
                          accept="image/*,video/mp4,video/webm"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleDhUpload(file);
                          }}
                        />
                      </label>
                      {uploading && <span className="cms-uploading">上传中...</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Exhibit Video Upload */}
              <div className="cms-form-group" style={{ gridColumn: '1 / -1' }}>
                <label><Play size={12} /> 讲解视频</label>
                <div className="cms-upload-row">
                  {exhibitVideoFile ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                      <div className="cms-dh-preview">
                        <Play size={14} style={{ color: 'var(--primary)' }} />
                        <span className="cms-dh-filename">{exhibitVideoFile.name}</span>
                        {exhibitVideoFile.size > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--text3)' }}>{(exhibitVideoFile.size / 1024 / 1024).toFixed(1)} MB</span>
                        )}
                        <button
                          className="cms-dh-remove"
                          onClick={removeExhibitVideo}
                          title="移除"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      {exhibitVideoFile.url && (
                        <video
                          src={exhibitVideoFile.url}
                          controls
                          style={{ width: '100%', maxHeight: 180, borderRadius: 8, background: 'var(--surface2)' }}
                        />
                      )}
                    </div>
                  ) : (
                    <div
                      className="cms-upload-box"
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
                      onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('dragover');
                        const file = e.dataTransfer.files[0];
                        if (file) handleExhibitVideoUpload(file);
                      }}
                    >
                      <Play size={18} />
                      <span>拖拽上传讲解视频或</span>
                      <label className="cms-upload-btn" style={{ cursor: 'pointer' }}>
                        点击选择
                        <input
                          type="file"
                          accept="video/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleExhibitVideoUpload(file);
                          }}
                        />
                      </label>
                      {videoUploading && <span className="cms-uploading">上传中...</span>}
                      <span style={{ fontSize: 10, color: 'var(--text3)' }}>MP4 / WebM，建议 720p</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="cms-form-group" style={{ gridColumn: '1 / -1' }}>
                <label>简介</label>
                <textarea
                  value={form.description}
                  placeholder="展品简介..."
                  rows={3}
                  onChange={(e) => setForm((f: any) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="cms-form-group">
                <label>默认语言</label>
                <select value={form.default_language} onChange={(e) => setForm((f: any) => ({ ...f, default_language: e.target.value }))}>
                  <option value="zh-CN">中文</option>
                  <option value="en-US">English</option>
                  <option value="child">少儿版</option>
                  <option value="elderly">大字版</option>
                </select>
              </div>
            </div>
            <div className="cms-modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : (editTarget ? '保存' : '创建')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
