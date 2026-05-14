import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Upload, FileAudio, FileVideo, Loader, CheckCircle, XCircle, HelpCircle, BookOpen, Mic, Layers, Wand2 } from 'lucide-react';
import {
  runPipeline,
  getPipelineStatus,
  uploadFile,
  listSpeakers,
  listLanguages,
} from '../api/client';
import type { Speaker, Language, Job, PipelineForm } from '../types/api';

// 预设文案模板
const TEXT_TEMPLATES = [
  { id: 'greeting', label: '欢迎语', icon: '👋', texts: ['您好，欢迎来到我们的产品发布会。今天我将为大家介绍我们最新的产品特性。', '大家好，欢迎观看本次直播。我是您的主持人，今天我们将一起探索科技的无限可能。'] },
  { id: 'product', label: '产品介绍', icon: '📱', texts: ['这款产品采用最先进的AI技术，能够实现毫秒级响应，为您带来前所未有的体验。', '让我们来看看这款革命性的产品。它不仅功能强大，而且设计精美，是科技与艺术的完美结合。'] },
  { id: 'education', label: '教育培训', icon: '📚', texts: ['今天我们来学习一个新概念。首先，让我们理解它的基本原理。', '各位同学好，欢迎来到今天的课程。我们将深入探讨这个重要的主题。'] },
  { id: 'birthday', label: '生日祝福', icon: '🎂', texts: ['祝您生日快乐！愿新的一岁里，所有的美好都与您不期而遇。', '在这个特别的日子里，愿您被幸福包围，被快乐环绕，生日快乐！'] },
  { id: 'news', label: '新闻播报', icon: '📰', texts: ['各位观众晚上好，欢迎收看今天的新闻节目。今天的主要内容有：', '大家好，这里是每日资讯。今日要闻：科技创新持续推动社会发展。'] },
  { id: 'custom', label: '自定义', icon: '✏️', texts: [] },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

const QUALITY_OPTIONS = [
  { id: 'Fast', name: '快速', desc: 'Wav2Lip 直接输出' },
  { id: 'Improved', name: '增强', desc: '羽化蒙版混合' },
  { id: 'Enhanced', name: '最佳', desc: 'GFPGAN 人脸增强' },
] as const;

const WAV2LIP_OPTIONS = [
  { id: 'Wav2Lip_GAN', name: 'Wav2Lip_GAN', desc: 'GAN 版本（推荐）' },
  { id: 'Wav2Lip', name: 'Wav2Lip', desc: '标准版本' },
] as const;

export default function PipelinePage() {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [showGuide, setShowGuide] = useState(true); // 默认显示引导

  const [form, setForm] = useState<PipelineForm>({
    text: '',
    tts_mode: 'custom_voice',
    speaker: 'Vivian',
    language: 'Auto',
    instruct: '',
    ref_audio_filename: '',
    ref_text: '',
    face_filename: '',
    quality: 'Enhanced',
    out_height: 480,
    pads_top: 0,
    pads_bottom: 10,
    pads_left: 0,
    pads_right: 0,
    mask_dilation: 2.5,
    mask_feathering: 2.0,
    nosmooth: true,
    wav2lip_version: 'Wav2Lip_GAN',
    speed: 1.0,
    pitch: 0.0,
    volume: 1.0,
    use_multi_camera: false,
    camera_angles: [],
    camera_strategy: 'semantic',
  });

  const [faceFile, setFaceFile] = useState<{ name: string; size: number } | null>(null);
  const [refAudioFile, setRefAudioFile] = useState<{ name: string; size: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载音色列表
  useEffect(() => {
    listSpeakers()
      .then(r => setSpeakers(r.speakers))
      .catch(() => {
        // API 不可用时使用默认音色
        setSpeakers([
          { id: 'Vivian', name: 'Vivian', desc: '甜美女声' },
          { id: 'Scott', name: 'Scott', desc: '磁性男声' },
        ]);
      });
    listLanguages()
      .then(r => setLanguages(r.languages))
      .catch(() => {
        setLanguages([
          { id: 'Auto', name: '自动检测' },
          { id: 'zh-CN', name: '中文' },
          { id: 'en-US', name: '英文' },
        ]);
      });
  }, []);

  // 应用模板
  const applyTemplate = (template: typeof TEXT_TEMPLATES[0], textIndex: number = 0) => {
    if (template.texts.length > textIndex) {
      setForm(f => ({ ...f, text: template.texts[textIndex] }));
    }
  };

  const handleFaceUpload = useCallback(async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const result = await uploadFile('face', file);
      setFaceFile({ name: result.filename, size: result.size });
      setForm(f => ({ ...f, face_filename: result.filename }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }, []);

  const handleRefAudioUpload = useCallback(async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const result = await uploadFile('clone-ref', file);
      setRefAudioFile({ name: result.filename, size: result.size });
      setForm(f => ({ ...f, ref_audio_filename: result.filename }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }, []);

  const startPipeline = useCallback(async () => {
    if (!form.use_multi_camera && !form.face_filename) { setError('请先上传人脸视频'); return; }
    if (form.use_multi_camera && form.camera_angles.length === 0) { setError('请先添加至少一个机位视频'); return; }
    if (!form.text.trim()) { setError('请输入合成文本'); return; }
    try {
      const res = await runPipeline(form as unknown as Record<string, unknown>);
      setError(null);
      setJob({ id: res.job_id, status: 'processing', progress: 0, step: 'tts' });
      setPolling(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [form]);

  // Poll job status
  useEffect(() => {
    if (!polling || !job?.id) return;
    const interval = setInterval(async () => {
      try {
        const status = await getPipelineStatus(job.id);
        setJob(status);
        if (status.status === 'completed' || status.status === 'failed') {
          setPolling(false);
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [polling, job?.id]);

  const stepLabels: Record<string, string> = {
    tts: '语音合成',
    planning: '分析文本',
    tts_lipsync: 'TTS+唇形',
    compose: '合成视频',
    lipsync: '唇形同步',
    view: '视角处理',
    done: '完成',
  };

  return (
    <div>
      {/* 引导提示 */}
      {showGuide && !job && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(0, 212, 170, 0.1))',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: 'var(--radius)',
          padding: '20px 24px',
          marginBottom: 24,
          position: 'relative',
        }}>
          <button
            onClick={() => setShowGuide(false)}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              background: 'none',
              border: 'none',
              color: 'var(--text3)',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'linear-gradient(135deg, var(--accent), var(--primary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <BookOpen size={22} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
                快速开始创作数字人视频
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 14 }}>1</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>上传人脸</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>上传一段包含正脸的视频或图片</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 14 }}>2</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>输入文本</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>输入要播报的文案或选择模板</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 14 }}>3</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>开始生成</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>AI自动合成语音和唇形同步</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="page-title">
        <h1>一键数字人合成</h1>
        <p>输入文本 + 上传人脸视频，一键生成带同步唇形的数字人视频</p>
      </div>

      {/* 模板选择区 */}
      {!job && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>
            <Wand2 size={16} />
            快速模板
            <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 400, marginLeft: 8 }}>
              点击即可使用模板文案
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {TEXT_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => applyTemplate(template)}
                disabled={template.id === 'custom'}
                style={{
                  padding: '12px 8px',
                  borderRadius: 'var(--radius2)',
                  border: '1px solid var(--border2)',
                  background: template.id === 'custom' ? 'var(--surface2)' : 'var(--surface3)',
                  cursor: template.id === 'custom' ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'center',
                  fontFamily: 'var(--font)',
                  opacity: template.id === 'custom' ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (template.id !== 'custom') {
                    e.currentTarget.style.borderColor = 'var(--primary)';
                    e.currentTarget.style.background = 'var(--primary-dim)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border2)';
                  e.currentTarget.style.background = 'var(--surface3)';
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 4 }}>{template.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{template.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Flow */}
      <div className="pipeline-flow">
        {(job?.id && form.use_multi_camera
          ? ['planning', 'tts_lipsync', 'compose', 'done']
          : ['tts', 'lipsync', 'done']
        ).map((step, i) => {
          const active = job?.step === step || (step === 'done' && job?.status === 'completed');
          const done = step === 'done' && job?.status === 'completed';
          return (
            <div key={step} className={`pipeline-step ${active ? 'active' : ''} ${done ? 'done' : ''}`} style={{ flex: 1 }}>
              <div className="step-icon">
                {done ? <CheckCircle size={20} color="var(--success)" /> :
                 active ? <Loader size={20} className="spin" color="var(--accent)" /> :
                 <span style={{ fontSize: 20 }}>{i + 1}</span>}
              </div>
              <div className="step-name">{stepLabels[step]}</div>
              <div className="step-status">
                {job?.status === 'failed' ? '失败' :
                 active ? (job?.message || '处理中...') :
                 done ? '完成' : '等待'}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        {/* TTS Mode Tabs */}
        <div className="card-title">
          <Sparkles size={16} />
          语音合成设置
        </div>
        <div className="tabs" style={{ marginBottom: 16 }}>
          {[
            { id: 'custom_voice', label: '预设音色' },
            { id: 'voice_clone', label: '语音克隆' },
            { id: 'voice_design', label: '声音设计' },
          ].map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${form.tts_mode === tab.id ? 'active' : ''}`}
              onClick={() => setForm(f => ({ ...f, tts_mode: tab.id as typeof form.tts_mode }))}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Text Input */}
        <div className="form-group full" style={{ marginBottom: 16 }}>
          <label>合成文本</label>
          <textarea
            value={form.text}
            onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
            placeholder="输入要合成的文本..."
            rows={3}
          />
        </div>

        {form.tts_mode === 'custom_voice' && (
          <>
            <div className="form-grid">
              <div className="form-group">
                <label>语言</label>
                <select value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
                  {languages.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>风格指令（可选）</label>
                <input
                  value={form.instruct}
                  onChange={e => setForm(f => ({ ...f, instruct: e.target.value }))}
                  placeholder="如：用开心的语气"
                />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>选择音色</label>
              {speakers.length > 0 ? (
                <div className="speaker-grid">
                  {speakers.map(s => (
                    <button
                      key={s.id}
                      className={`speaker-chip ${form.speaker === s.id ? 'selected' : ''}`}
                      onClick={() => setForm(f => ({ ...f, speaker: s.id }))}
                      type="button"
                    >
                      {s.name}
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>{s.desc}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  background: 'var(--surface2)',
                  borderRadius: 'var(--radius2)',
                  border: '1px dashed var(--border2)',
                }}>
                  <Mic size={24} style={{ color: 'var(--text3)', marginBottom: 8 }} />
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>正在加载音色列表...</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>请确保后端服务已启动</div>
                </div>
              )}
            </div>
          </>
        )}

        {form.tts_mode === 'voice_clone' && (
          <>
            <div className="form-grid">
              <div className="form-group">
                <label>语言</label>
                <select value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
                  {languages.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>参考文本（可选）</label>
                <input
                  value={form.ref_text}
                  onChange={e => setForm(f => ({ ...f, ref_text: e.target.value }))}
                  placeholder="参考音频中的文本，填写则用 ICL 模式"
                />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>上传参考音频（克隆音色）</label>
              {refAudioFile ? (
                <div className="file-badge">
                  <FileAudio size={14} />
                  {refAudioFile.name} ({formatSize(refAudioFile.size)})
                  <span className="remove" onClick={() => { setRefAudioFile(null); setForm(f => ({ ...f, ref_audio_filename: '' })); }}>×</span>
                </div>
              ) : (
                <div className="upload-area" style={{ padding: '32px 20px' }}>
                  <input type="file" accept="audio/*" onChange={e => e.target.files?.[0] && handleRefAudioUpload(e.target.files[0])} />
                  <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, var(--primary-dim), rgba(99, 102, 241, 0.12))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}>
                    <Mic size={22} style={{ color: 'var(--primary)' }} />
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>点击上传参考音频</p>
                  <p className="hint">支持 WAV、MP3，建议 5-30 秒</p>
                </div>
              )}
            </div>
          </>
        )}

        {form.tts_mode === 'voice_design' && (
          <div className="form-group" style={{ marginTop: 0 }}>
            <label>音色描述</label>
            <input
              value={form.instruct}
              onChange={e => setForm(f => ({ ...f, instruct: e.target.value }))}
              placeholder="如：甜美的萝莉音，或低沉的磁性嗓音"
            />
            <div className="info-box" style={{ marginTop: 8 }}>
              通过自然语言描述想要的音色，AI 会自动创建定制化音色。
            </div>
          </div>
        )}
      </div>

      <div className="section-divider" />

      {/* Video Settings */}
      <div className="card">
        <div className="card-title">
          <Upload size={16} />
          人脸视频 &amp; 唇形设置
        </div>

        <div className="form-group">
          <label>上传人脸视频</label>
          {faceFile ? (
              <div className="file-badge">
                <FileVideo size={14} />
                {faceFile.name} ({formatSize(faceFile.size)})
                <span className="remove" onClick={() => { setFaceFile(null); setForm(f => ({ ...f, face_filename: '' })); }}>×</span>
              </div>
          ) : (
            <div className="upload-area" style={{ padding: '40px 20px' }}>
              <input type="file" accept="video/*,image/*" onChange={e => e.target.files?.[0] && handleFaceUpload(e.target.files[0])} />
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: 'var(--surface3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5">
                  <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>点击上传人脸视频</p>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>支持 MP4/AVI/MOV，建议 720p</p>
              <div style={{
                display: 'inline-flex',
                gap: 8,
                fontSize: 11,
                color: 'var(--text3)',
                background: 'var(--surface2)',
                padding: '6px 12px',
                borderRadius: 20,
              }}>
                <span>视频时长 5-30秒</span>
                <span>|</span>
                <span>正脸效果最佳</span>
              </div>
            </div>
          )}
        </div>

        <div className="form-group" style={{ marginTop: 16 }}>
          <label>质量模式</label>
          <div className="quality-grid">
            {QUALITY_OPTIONS.map(q => (
              <button
                key={q.id}
                type="button"
                className={`quality-option ${form.quality === q.id ? 'selected' : ''}`}
                onClick={() => setForm(f => ({ ...f, quality: q.id }))}
              >
                <div className="name">{q.name}</div>
                <div className="desc">{q.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label>Wav2Lip 版本</label>
            <select value={form.wav2lip_version} onChange={e => setForm(f => ({ ...f, wav2lip_version: e.target.value as typeof form.wav2lip_version }))}>
              {WAV2LIP_OPTIONS.map(w => <option key={w.id} value={w.id}>{w.name} — {w.desc}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>输出高度 (px)</label>
            <input type="number" value={form.out_height} onChange={e => setForm(f => ({ ...f, out_height: Number(e.target.value) }))} min={240} max={1080} />
          </div>
        </div>

        <div className="settings-grid">
          <div className="setting-item">
            <label>蒙版膨胀</label>
            <input type="number" value={form.mask_dilation} step="0.1" min={0.5} max={10}
              onChange={e => setForm(f => ({ ...f, mask_dilation: Number(e.target.value) }))} />
          </div>
          <div className="setting-item">
            <label>蒙版羽化</label>
            <input type="number" value={form.mask_feathering} step="0.1" min={0} max={10}
              onChange={e => setForm(f => ({ ...f, mask_feathering: Number(e.target.value) }))} />
          </div>
          <div className="setting-item">
            <label>上边距</label>
            <input type="number" value={form.pads_top} min={0} max={100}
              onChange={e => setForm(f => ({ ...f, pads_top: Number(e.target.value) }))} />
          </div>
          <div className="setting-item">
            <label>下边距</label>
            <input type="number" value={form.pads_bottom} min={0} max={100}
              onChange={e => setForm(f => ({ ...f, pads_bottom: Number(e.target.value) }))} />
          </div>
        </div>
      </div>

      {/* 多机位设置 */}
      <div className="card" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            <Layers size={16} />
            多机位设置
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>启用多机位</span>
            <div
              onClick={() => {
                setForm(f => {
                  const newVal = !f.use_multi_camera;
                  return { ...f, use_multi_camera: newVal, face_filename: newVal ? '' : f.face_filename };
                });
              }}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: form.use_multi_camera ? 'var(--primary)' : 'var(--border)',
                position: 'relative',
                transition: 'background 0.2s',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#fff',
                position: 'absolute',
                top: 2,
                left: form.use_multi_camera ? 22 : 2,
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
          </label>
        </div>

        {form.use_multi_camera ? (
          <>
            <div style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              marginBottom: 16,
              padding: '12px 16px',
              background: 'var(--surface2)',
              borderRadius: 'var(--radius2)',
              border: '1px solid var(--border2)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>机位分配策略</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { id: 'semantic', label: '语义感知', desc: '重点句→特写，其他→全景' },
                    { id: 'round_robin', label: '均匀轮换', desc: '所有机位循环切换' },
                  ].map(s => (
                    <button
                      key={s.id}
                      onClick={() => setForm(f => ({ ...f, camera_strategy: s.id as typeof form.camera_strategy }))}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 'var(--radius2)',
                        border: `1px solid ${form.camera_strategy === s.id ? 'var(--primary)' : 'var(--border2)'}`,
                        background: form.camera_strategy === s.id ? 'var(--primary-dim)' : 'var(--surface)',
                        color: form.camera_strategy === s.id ? 'var(--primary)' : 'var(--text2)',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 500,
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{s.label}</div>
                      <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.8 }}>{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>已添加 {form.camera_angles.length} 个机位</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                {form.camera_angles.length === 0 ? '（至少需要添加 1 个机位）' : form.camera_angles.length === 1 ? '（建议至少添加 2 个机位）' : '（已启用多机位模式）'}
              </span>
            </div>

            {form.camera_angles.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
                {form.camera_angles.map((cam, idx) => (
                  <div key={cam.id} style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius2)',
                    border: '1px solid var(--border2)',
                    background: 'var(--surface2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cam.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cam.filename}
                      </div>
                    </div>
                    <button
                      onClick={() => setForm(f => ({ ...f, camera_angles: f.camera_angles.filter((_, i) => i !== idx) }))}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border: 'none',
                        background: 'rgba(239,68,68,0.1)',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 添加机位 */}
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="机位名称（如：正面特写）"
                  id="cam-name-input"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius2)',
                    border: '1px solid var(--border2)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 13,
                    boxSizing: 'border-box',
                    outline: 'none',
                    fontFamily: 'var(--font)',
                  }}
                />
              </label>
              <label style={{ position: 'relative', cursor: 'pointer' }}>
                <input
                  type="file"
                  accept="video/*,image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const nameInput = document.getElementById('cam-name-input') as HTMLInputElement;
                    const camName = nameInput?.value?.trim() || `机位${form.camera_angles.length + 1}`;
                    setError(null);
                    setUploading(true);
                    try {
                      const result = await uploadFile('face', file);
                      setForm(f => ({
                        ...f,
                        camera_angles: [...f.camera_angles, {
                          id: `cam_${Date.now()}`,
                          name: camName,
                          filename: result.filename,
                        }],
                      }));
                      if (nameInput) nameInput.value = '';
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : String(err));
                    } finally {
                      setUploading(false);
                      e.target.value = '';
                    }
                  }}
                />
                <div style={{
                  padding: '10px 20px',
                  borderRadius: 'var(--radius2)',
                  background: 'var(--primary)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}>
                  <Upload size={14} />
                  添加机位视频
                </div>
              </label>
            </div>

            {form.camera_angles.length > 0 && (
              <div style={{
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: 'var(--radius2)',
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.2)',
                fontSize: 12,
                color: 'var(--text2)',
                lineHeight: 1.6,
              }}>
                <strong style={{ color: 'var(--primary)' }}>多机位工作原理：</strong>
                系统会自动将文本按句子拆分，重要句子（长句）分配到特写机位，
                普通句子分配到全景机位。也可以选择"均匀轮换"让所有机位均匀切换。
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>
            关闭多机位，使用单一机位模式
          </div>
        )}
      </div>

      {/* Progress & Output */}
      {job && (
        <div className="output-section" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>
              {job.status === 'completed' ? '合成完成！' : job.status === 'failed' ? '合成失败' : '处理中...'}
            </h3>
            <span className={`status-badge ${job.status}`}>
              {job.status === 'processing' ? <Loader size={12} className="spin" /> :
               job.status === 'completed' ? <CheckCircle size={12} /> :
               job.status === 'failed' ? <XCircle size={12} /> : null}
              {job.message || job.status}
            </span>
          </div>

          {job.status === 'processing' && (
            <div className="progress-wrap">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${job.progress || 0}%` }} />
              </div>
              <div className="progress-label">
                <span>{stepLabels[job.step || 'tts']}</span>
                <span>{job.progress || 0}%</span>
              </div>
            </div>
          )}

          {job.status === 'failed' && job.trace && (
            <pre style={{ fontSize: 11, color: 'var(--error)', background: 'var(--surface2)', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 120, marginTop: 8 }}>
              {job.trace}
            </pre>
          )}

          {job.status === 'completed' && job.video_filename && (
            <div style={{ marginTop: 16 }}>
              <div className="video-container">
                <video controls src={`/api/files/${job.video_filename}`} style={{ maxHeight: 480 }} />
              </div>
              {job.audio_filename && (
                <div style={{ marginTop: 12 }}>
                  <audio controls src={`/api/files/${job.audio_filename}`} style={{ width: '100%' }} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="card" style={{ borderLeft: '3px solid var(--error)', marginTop: 16 }}>
          <div style={{ color: 'var(--error)', fontSize: 13 }}>{error}</div>
        </div>
      )}

      <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={() => { setJob(null); setError(null); }}>
          重置
        </button>
        <button
          className="btn btn-primary btn-lg"
          onClick={startPipeline}
          disabled={(!form.use_multi_camera && !form.face_filename) || (form.use_multi_camera && form.camera_angles.length === 0) || !form.text.trim() || job?.status === 'processing' || uploading}
        >
          {uploading || job?.status === 'processing' ? (
            <><Loader size={18} className="spin" /> 处理中...</>
          ) : (
            <><Sparkles size={18} /> 开始合成</>
          )}
        </button>
      </div>
    </div>
  );
}
