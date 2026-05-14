import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Plus, Clock, CheckCircle, Loader, Video, ArrowRight, Layers, Mic, Zap, Play, FileText, Users, TrendingUp, ChevronRight, BookOpen, BarChart2, Package } from 'lucide-react';
import { getHistoryStats, getHistory } from '../api/client';
import { listExhibits, listContents, createDemo } from '../api/cms';
import { formatDate } from '../utils/format';
import type { Job } from '../types/api';
import type { Exhibit, Content } from '../types/api';

// 功能特性数据
const FEATURES = [
  { icon: Layers, title: '数字人合成', desc: '文本 + 人脸 → AI视频', color: 'var(--primary)', colorDim: 'var(--primary-dim)' },
  { icon: Mic, title: '语音合成', desc: '多音色TTS配音', color: 'var(--success)', colorDim: 'rgba(16, 185, 129, 0.12)' },
  { icon: Users, title: '声音克隆', desc: '上传音频复刻音色', color: 'var(--warning)', colorDim: 'rgba(245, 158, 11, 0.12)' },
  { icon: FileText, title: '唇形同步', desc: 'Wav2Lip精准同步', color: 'var(--accent)', colorDim: 'rgba(99, 102, 241, 0.12)' },
];

// 快速模板
const QUICK_TEMPLATES = [
  { label: '欢迎语', text: '您好，欢迎使用数字人创作平台！', icon: '👋' },
  { label: '产品介绍', text: '这是一款革命性的产品，它融合了最前沿的AI技术。', icon: '📱' },
  { label: '生日祝福', text: '祝您生日快乐！愿新的一岁里，所有的美好都与您不期而遇。', icon: '🎂' },
];

const JOB_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pipeline: { label: '数字人', color: 'var(--primary)', bg: 'var(--primary-dim)' },
  tts: { label: '语音合成', color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.12)' },
  lipsync: { label: '唇形同步', color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.12)' },
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<{
    total: number;
    completed: number;
    failed: number;
    processing: number;
    week_count: number;
  } | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // CMS data
  const [exhibits, setExhibits] = useState<Exhibit[]>([]);
  const [cmsContents, setCmsContents] = useState<Content[]>([]);
  const [loadingDemo, setLoadingDemo] = useState(false);

  useEffect(() => {
    Promise.all([
      getHistoryStats(),
      getHistory({ page: 1, size: 6 }),
      listExhibits(),
      listContents({ status: 'published', size: 9 }),
    ]).then(([s, h, exRes, ctRes]) => {
      setStats(s);
      setRecentJobs(h.records);
      setExhibits(exRes.exhibits);
      setCmsContents(ctRes.contents);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Hero Title */}
      <div className="page-hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative' }}>
        <div>
          <h1>
            欢迎使用 <span style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>境语智导</span>
          </h1>
          <p>AI 数字人创作平台，一键生成智能数字分身</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => navigate('/create')}>
          <Sparkles size={17} />
          创建作品
        </button>
      </div>

      {/* 功能特性 */}
      <div style={{ marginBottom: 32 }}>
        <div className="section-header" style={{ marginBottom: 16 }}>
          <h2>核心功能</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/create')}>
            立即体验 <ChevronRight size={14} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="card"
                style={{ padding: 24, cursor: 'pointer', transition: 'all 0.25s' }}
                onClick={() => navigate('/create')}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = feature.color;
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = `0 8px 30px ${feature.colorDim.replace('0.12', '0.2')}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'var(--shadow)';
                }}
              >
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: feature.colorDim,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}>
                  <Icon size={24} style={{ color: feature.color }} />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{feature.title}</h3>
                <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>{feature.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 空状态：没有任何内容时，引导用户创建示例数据 */}
      {!loading && cmsContents.length === 0 && exhibits.length === 0 && (
        <div style={{
          marginBottom: 32,
          padding: '40px 32px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          textAlign: 'center',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'var(--primary-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Sparkles size={28} style={{ color: 'var(--primary)' }} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>开始体验</h3>
          <p style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
            还没有添加任何展品和内容。点击下方按钮，一键加载博物馆示例数据，立即体验完整功能。
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary btn-lg"
              disabled={loadingDemo}
              onClick={async () => {
                setLoadingDemo(true);
                try {
                  const result = await createDemo();
                  // Reload data
                  const [exRes, ctRes] = await Promise.all([
                    listExhibits(),
                    listContents({ status: 'published', size: 9 }),
                  ]);
                  setExhibits(exRes.exhibits);
                  setCmsContents(ctRes.contents);
                } catch (e) {
                  console.error('Failed to create demo:', e);
                } finally {
                  setLoadingDemo(false);
                }
              }}
            >
              {loadingDemo ? (
                <><Loader size={16} className="spin" /> 加载中...</>
              ) : (
                <><Sparkles size={16} /> 体验示例数据</>
              )}
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => navigate('/cms/exhibits')}>
              <Plus size={16} /> 手动添加展品
            </button>
          </div>
        </div>
      )}

      {/* 内容库 - Real CMS content instead of hardcoded templates */}
      {!loading && (cmsContents.length > 0 || exhibits.length > 0) && (
        <div style={{ marginBottom: 32 }}>
          <div className="section-header" style={{ marginBottom: 16 }}>
            <h2>内容库</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/cms')}>
                <BookOpen size={13} /> 内容管理
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/create')}>
                <Plus size={13} /> 创建作品
              </button>
            </div>
          </div>

          {/* Published contents as quick-start cards */}
          {cmsContents.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={12} /> 已发布的讲解内容 — 点击内容直接进入创作
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {cmsContents.slice(0, 6).map((ct) => {
                  const exhibit = exhibits.find((e) => e.id === ct.exhibit_id);
                  return (
                    <div
                      key={ct.id}
                      style={{
                        padding: 16,
                        background: 'var(--surface2)',
                        borderRadius: 'var(--radius2)',
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => navigate(`/create?contentId=${ct.id}&text=${encodeURIComponent(ct.body.slice(0, 200))}&title=${encodeURIComponent(ct.title)}`)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.background = 'var(--primary-dim)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.background = 'var(--surface2)';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span className="cms-badge cms-badge-success" style={{ fontSize: 10 }}>已发布</span>
                        {exhibit && (
                          <span style={{ fontSize: 10, color: 'var(--text3)', background: 'var(--surface3)', padding: '2px 6px', borderRadius: 10 }}>
                            {exhibit.name}
                          </span>
                        )}
                      </div>
                      <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4, lineHeight: 1.3 }}>
                        {ct.title}
                      </h4>
                      <p style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {ct.body}
                      </p>
                      {ct.duration_sec > 0 && (
                        <p style={{ fontSize: 10, color: 'var(--primary)', marginTop: 6 }}>
                          <Clock size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                          ~{ct.duration_sec}秒
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Exhibits grid */}
          {exhibits.length > 0 && (
            <div>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Package size={12} /> 展品 — 关联讲解内容
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {exhibits.slice(0, 12).map((ex) => {
                  const relatedCount = cmsContents.filter((c) => c.exhibit_id === ex.id).length;
                  return (
                    <button
                      key={ex.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 14px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'var(--text)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontFamily: 'var(--font)',
                      }}
                      onClick={() => navigate(`/cms/exhibits`)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.color = 'var(--primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.color = 'var(--text)';
                      }}
                    >
                      {ex.name}
                      {relatedCount > 0 && (
                        <span style={{
                          fontSize: 10,
                          background: 'var(--primary)',
                          color: '#0a1a14',
                          borderRadius: 10,
                          padding: '1px 5px',
                          fontWeight: 700,
                        }}>
                          {relatedCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Analytics entry */}
          <div
            style={{
              marginTop: 16,
              padding: '14px 18px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => navigate('/analytics')}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(99,102,241,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent)',
              }}>
                <BarChart2 size={18} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>数据分析</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>查看访问热度、内容偏好与终端使用情况</div>
              </div>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--text3)' }} />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Layers size={22} />
          </div>
          <div className="stat-value primary">{loading ? '-' : (stats?.total ?? 0)}</div>
          <div className="stat-label">总作品数</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <CheckCircle size={22} />
          </div>
          <div className="stat-value success">{loading ? '-' : (stats?.completed ?? 0)}</div>
          <div className="stat-label">成功作品</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <Zap size={22} />
          </div>
          <div className="stat-value warning">{loading ? '-' : (stats?.week_count ?? 0)}</div>
          <div className="stat-label">本周新增</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <Loader size={22} />
          </div>
          <div className="stat-value accent">{loading ? '-' : (stats?.processing ?? 0)}</div>
          <div className="stat-label">处理中</div>
        </div>
      </div>

      {/* Recent Works */}
      <div>
        <div className="section-header">
          <h2>最近作品</h2>
          {recentJobs.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/history')}>
              查看全部 <ArrowRight size={13} />
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="card" style={{ padding: 20 }}>
                <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 12, width: '40%' }} />
              </div>
            ))}
          </div>
        ) : recentJobs.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '60px 40px' }}>
            <div style={{
              width: 72, height: 72, borderRadius: 18,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', fontSize: 32, color: 'var(--text3)'
            }}>
              <Video size={32} style={{ opacity: 0.4 }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text2)' }}>
              还没有任何作品
            </h3>
            <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 24 }}>
              点击下方按钮，创建您的第一个数字人视频
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => navigate('/create')}>
              <Plus size={17} /> 立即创建
            </button>
          </div>
        ) : (
          <div className="job-grid">
            {recentJobs.map((job) => (
              <RecentJobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecentJobCard({ job }: { job: Job }) {
  const [preview, setPreview] = useState(false);

  const typeKey = (job.job_type ?? 'pipeline') as keyof typeof JOB_TYPE_CONFIG;
  const typeConfig = JOB_TYPE_CONFIG[typeKey] || {
    label: job.job_type ?? 'pipeline',
    color: 'var(--accent)',
    bg: 'rgba(99, 102, 241, 0.12)',
  };

  return (
    <div className={`job-card ${job.job_type ?? 'pipeline'}`} style={{ padding: 20 }}>
      <div className="job-card-header">
        <div className="job-card-meta">
          <span className="job-type-tag" style={{
            background: typeConfig.bg,
            color: typeConfig.color,
          }}>
            {typeConfig.label}
          </span>
          <span className={`status-badge ${job.status}`}>
            {job.status === 'processing' && <Loader size={10} className="spin" />}
            {job.status === 'completed' && <CheckCircle size={10} />}
            {job.status === 'processing' ? '处理中' : job.status === 'completed' ? '已完成' : job.status === 'failed' ? '失败' : job.status}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <Clock size={10} /> {formatDate(job.created_at ?? 0)}
        </span>
      </div>

      <div className="job-card-body">
        <h3 className="job-card-title">{job.name || '未命名作品'}</h3>

        {job.status === 'processing' && (
          <div>
            <div className="progress-bar" style={{ height: 6 }}>
              <div className="progress-fill" style={{ width: `${job.progress || 0}%` }} />
            </div>
            <div className="progress-label" style={{ marginTop: 6 }}>
              <span>{job.message || '处理中'}</span>
              <span>{job.progress || 0}%</span>
            </div>
          </div>
        )}

        {job.status === 'completed' && job.video_filename && (
          <>
            <button className="preview-toggle" onClick={() => setPreview(!preview)}>
              {preview ? '收起预览' : '预览视频'}
            </button>
            {preview && (
              <div className="video-container" style={{ marginTop: 10 }}>
                <video controls src={`/api/files/${job.video_filename}`} style={{ maxHeight: 200, width: '100%' }} />
              </div>
            )}
          </>
        )}

        {job.status === 'failed' && (
          <div style={{ fontSize: 12, color: 'var(--error)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>
            {job.message?.slice(0, 80) || '生成失败'}
          </div>
        )}
      </div>
    </div>
  );
}
