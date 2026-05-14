import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Save, Globe, Archive, Eye, Loader, CheckCircle, AlertCircle, Plus, Tag, Upload, X, Play,
} from 'lucide-react';
import {
  createContent, updateContent, publishContent, archiveContent,
  getContent, listExhibits, getContentVersions, uploadContentVideo,
} from '../../api/cms';
import type { Content, Exhibit, ContentVersion } from '../../types/api';

const LANGUAGE_OPTIONS = [
  { id: 'zh-CN', label: '中文' },
  { id: 'en-US', label: 'English' },
  { id: 'child', label: '少儿版' },
  { id: 'elderly', label: '大字版' },
];

const CATEGORY_OPTIONS = [
  { id: 'exhibit', label: '展品讲解' },
  { id: 'venue', label: '场馆介绍' },
  { id: 'event', label: '活动推广' },
  { id: 'general', label: '通用内容' },
];

export default function ContentEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === 'new';
  const [exhibits, setExhibits] = useState<Exhibit[]>([]);
  const [form, setForm] = useState({
    title: '',
    body: '',
    exhibit_id: '',
    language: 'zh-CN',
    category: 'exhibit',
    tags: [] as string[],
    duration_sec: 0,
    status: 'draft' as 'draft' | 'published' | 'archived',
    video_filename: '',
  });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [autoSaveDone, setAutoSaveDone] = useState(false);
  const [preview, setPreview] = useState(false);
  const [versions, setVersions] = useState<ContentVersion[]>([]);
  const [videoFile, setVideoFile] = useState<{ name: string; size: number; url?: string } | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoError, setVideoError] = useState('');

  useEffect(() => {
    listExhibits().then((r) => setExhibits(r.exhibits)).catch(() => {});
    if (!isNew && id) {
      getContent(id).then((ct) => {
        setForm({
          title: ct.title,
          body: ct.body,
          exhibit_id: ct.exhibit_id || '',
          language: ct.language || 'zh-CN',
          category: ct.category || 'exhibit',
          tags: ct.tags || [],
          duration_sec: ct.duration_sec || 0,
          status: ct.status,
        });
        if (ct.video_filename) {
          setVideoFile({ name: ct.video_filename, size: 0 });
        }
      }).catch(() => {});
      getContentVersions(id).then((r) => setVersions(r.versions)).catch(() => {});
    } else {
      // Pre-fill exhibit_id from query param
      const preFillExhibit = searchParams.get('exhibit_id');
      if (preFillExhibit) {
        setForm((f) => ({ ...f, exhibit_id: preFillExhibit }));
      }
    }
  }, [isNew, id]);

  // Auto-save every 60 seconds for existing content
  useEffect(() => {
    if (isNew || !id) return;
    const timer = setInterval(async () => {
      if (!form.title.trim() && !form.body.trim()) return;
      try {
        await updateContent(id, form);
        setAutoSaveDone(true);
        setTimeout(() => setAutoSaveDone(false), 3000);
      } catch { /* silent */ }
    }, 60000);
    return () => clearInterval(timer);
  }, [id, form, isNew]);

  const estimateDuration = (text: string) => {
    const sec = Math.ceil(text.length * 0.35);
    return sec < 60 ? `${sec}秒` : `${Math.floor(sec / 60)}分${sec % 60 > 0 ? sec % 60 + '秒' : ''}`;
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setError('标题不能为空'); return; }
    if (!form.body.trim()) { setError('正文不能为空'); return; }
    setSaving(true);
    setError('');
    try {
      if (isNew) {
        const res = await createContent(form);
        navigate(`/cms/contents/${res.content.id}/edit`, { replace: true });
      } else if (id) {
        await updateContent(id, form);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (isNew) { setError('请先保存内容'); return; }
    setPublishing(true);
    setError('');
    try {
      await handleSave();
      if (id) await publishContent(id, '发布');
      setForm((f) => ({ ...f, status: 'published' }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  };

  const handleArchive = async () => {
    if (isNew || !id) return;
    setError('');
    try {
      await archiveContent(id);
      setForm((f) => ({ ...f, status: 'archived' }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) {
      setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  };

  const handleVideoUpload = async (file: File) => {
    setVideoError('');
    setVideoUploading(true);
    try {
      const result = await uploadContentVideo(file);
      const url = URL.createObjectURL(file);
      setVideoFile({ name: result.filename, size: result.size, url });
      setForm((f) => ({ ...f, video_filename: result.filename }));
    } catch (e: unknown) {
      setVideoError(e instanceof Error ? e.message : String(e));
    } finally {
      setVideoUploading(false);
    }
  };

  const removeVideo = () => {
    setVideoFile(null);
    setForm((f) => ({ ...f, video_filename: '' }));
  };

  const currentVersion = isNew ? 1 : versions[0]?.version || 1;

  return (
    <div className="cms-page">
      <div className="cms-page-header">
        <div>
          <h1 className="cms-page-title">{isNew ? '新建内容' : '编辑内容'}</h1>
          <p className="cms-page-subtitle">
            v{currentVersion} &nbsp;&bull;&nbsp;
            预计讲解时长: <strong>{estimateDuration(form.body)}</strong>
          </p>
        </div>
        <div className="cms-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setPreview(!preview)}>
            <Eye size={13} /> {preview ? '关闭预览' : '预览'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleArchive}
            disabled={isNew || form.status === 'archived'}
          >
            <Archive size={13} /> 归档
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="spin" /> : <Save size={13} />}
            {saved ? <><CheckCircle size={13} /> 已保存</> : '保存'}
          </button>
          {!isNew && autoSaveDone && (
            <span style={{ fontSize: 12, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle size={12} /> 自动保存
            </span>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={handlePublish}
            disabled={publishing || form.status === 'published'}
          >
            {publishing ? <Loader size={13} className="spin" /> : <Globe size={13} />}
            {form.status === 'published' ? '已发布' : '发布'}
          </button>
        </div>
      </div>

      {error && (
        <div className="cms-error-banner">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      <div className={`cms-editor-layout ${preview ? 'cms-editor-preview-open' : ''}`}>
        {/* Editor Panel */}
        <div className="cms-editor-main">
          {/* Title */}
          <div className="cms-editor-title-wrap">
            <input
              className="cms-editor-title"
              placeholder="输入内容标题..."
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          {/* Body Editor */}
          <div className="cms-editor-body-wrap">
            <textarea
              className="cms-editor-body"
              placeholder="输入讲解正文内容..."
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const ta = e.currentTarget as HTMLTextAreaElement;
                  const start = ta.selectionStart;
                  const end = ta.selectionEnd;
                  const val = ta.value;
                  const newVal = val.slice(0, start) + '  ' + val.slice(end);
                  setForm((f) => ({ ...f, body: newVal }));
                  setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2; }, 0);
                }
              }}
            />
            <div className="cms-editor-footer">
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                {form.body.length} 字 &nbsp;|&nbsp; 预计 {estimateDuration(form.body)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                Tab 缩进 &nbsp;|&nbsp; 支持多语言版本
              </span>
            </div>
          </div>

          {/* Metadata */}
          <div className="cms-editor-meta">
            <div className="cms-form-grid cms-form-grid-4">
              <div className="cms-form-group">
                <label>展品</label>
                <select value={form.exhibit_id} onChange={(e) => setForm((f) => ({ ...f, exhibit_id: e.target.value }))}>
                  <option value="">— 无关联 —</option>
                  {exhibits.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>
              </div>
              <div className="cms-form-group">
                <label>语言版本</label>
                <select value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
                  {LANGUAGE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div className="cms-form-group">
                <label>分类</label>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  {CATEGORY_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div className="cms-form-group">
                <label>预估时长 (秒)</label>
                <input
                  type="number"
                  min={0}
                  value={form.duration_sec}
                  onChange={(e) => setForm((f) => ({ ...f, duration_sec: Number(e.target.value) }))}
                  placeholder="自动计算"
                />
              </div>
            </div>

            {/* Tags */}
            <div className="cms-form-group" style={{ marginTop: 12 }}>
              <label><Tag size={12} /> 标签</label>
              <div className="cms-tags-row">
                {form.tags.map((tag) => (
                  <span key={tag} className="cms-tag">
                    {tag}
                    <button onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 0 0 4px', fontSize: 12, lineHeight: 1 }}>×</button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder="添加标签后回车"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  style={{ flex: 1, minWidth: 120, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text)', fontSize: 12 }}
                />
              </div>
            </div>

            {/* Video Upload */}
            <div className="cms-form-group" style={{ marginTop: 16 }}>
              <label><Play size={12} /> 讲解视频</label>
              {videoError && (
                <div style={{ fontSize: 11, color: 'var(--error)', marginBottom: 6 }}>{videoError}</div>
              )}
              {videoFile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <Play size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{videoFile.name}</div>
                      {videoFile.size > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{(videoFile.size / 1024 / 1024).toFixed(1)} MB</div>
                      )}
                    </div>
                    <button
                      onClick={removeVideo}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', opacity: 0.7, fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'; }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {videoFile.url && (
                    <video
                      src={videoFile.url}
                      controls
                      style={{ width: '100%', maxHeight: 200, borderRadius: 8, background: 'var(--surface2)' }}
                    />
                  )}
                </div>
              ) : (
                <label
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 8, padding: '20px 12px',
                    border: `2px dashed var(--border2)`,
                    borderRadius: 8,
                    background: 'var(--surface2)',
                    cursor: videoUploading ? 'default' : 'pointer',
                    transition: 'all 0.2s', textAlign: 'center',
                  }}
                >
                  <input
                    type="file"
                    accept="video/*"
                    disabled={videoUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleVideoUpload(file);
                      e.target.value = '';
                    }}
                    style={{
                      position: 'absolute', inset: 0, opacity: 0,
                      cursor: videoUploading ? 'default' : 'pointer',
                      width: '100%', height: '100%',
                    }}
                  />
                  {videoUploading ? (
                    <><Loader size={18} className="spin" style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>上传中...</span></>
                  ) : (
                    <><Upload size={18} style={{ color: 'var(--text3)' }} />
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>点击上传讲解视频</p>
                      <p style={{ fontSize: 11, color: 'var(--text3)' }}>MP4 / WebM，建议 720p</p>
                    </div></>
                  )}
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Preview Panel */}
        {preview && (
          <div className="cms-editor-preview">
            <div className="cms-preview-header">
              <Eye size={13} /> 终端预览
            </div>
            <div className="cms-preview-body">
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>{form.title || '无标题'}</h2>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>
                {form.body || '暂无正文'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
