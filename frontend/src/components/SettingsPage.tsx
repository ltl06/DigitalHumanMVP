import { useState } from 'react';
import {
  HardDrive, Cpu, Info, RefreshCw, CheckCircle, XCircle,
  ExternalLink, Play, FileText, Terminal, Loader, Trash2,
  Wifi, WifiOff, Monitor, Activity,
} from 'lucide-react';
import { healthCheck, listFiles, getSystemModels, getSystemResources, deleteFile, getNetworkStatus } from '../api/client';
import type { HealthStatus, FileInfo, SystemModelsResponse, SystemResources, NetworkStatus } from '../types/api';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

function formatPercent(pct: number) {
  return `${pct.toFixed(1)}%`;
}

// Mini progress bar for resource usage
function UsageBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ width: 80, height: 6, background: 'var(--surface3)', borderRadius: 3, overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.min(pct, 100)}%`,
          height: '100%',
          background: color,
          borderRadius: 3,
          transition: 'width 0.5s',
        }}
      />
    </div>
  );
}

// Model information config
const MODEL_CONFIG = [
  { name: 'Qwen3-TTS CustomVoice', path: 'models/Qwen3-TTS-12Hz-1.7B-CustomVoice', desc: '自定义音色模型', required: true },
  { name: 'Qwen3-TTS Base', path: 'models/Qwen3-TTS-12Hz-1.7B-Base', desc: '克隆音色模型', required: true },
  { name: 'Qwen3-TTS VoiceDesign', path: 'models/Qwen3-TTS-12Hz-1.7B-VoiceDesign', desc: '声音设计模型', required: false },
  { name: 'Wav2Lip_GAN', path: 'checkpoints/Wav2Lip_GAN.pth', desc: '唇形同步（推荐）', required: true },
  { name: 'GFPGAN', path: 'checkpoints/GFPGANv1.4.pth', desc: '人脸增强', required: false },
  { name: 'RetinaFace', path: 'checkpoints/mobilenet.pth', desc: '人脸检测', required: true },
  { name: 'dlib 68-landmarks', path: 'checkpoints/shape_predictor_68_face_landmarks.dat', desc: '面部关键点', required: true },
];

const QUICK_STEPS = [
  { num: 1, title: '修改配置', desc: '编辑 config.yaml，填写模型路径', icon: FileText },
  { num: 2, title: '启动后端', desc: 'cd backend && python main.py', icon: Terminal },
  { num: 3, title: '启动前端', desc: 'cd frontend && npm install && npm run dev', icon: Play },
  { num: 4, title: '开始创作', desc: '访问 http://localhost:3000', icon: ExternalLink },
];

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [files, setFiles] = useState<{ output: FileInfo[]; upload: FileInfo[] } | null>(null);
  const [systemModels, setSystemModels] = useState<SystemModelsResponse | null>(null);
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [network, setNetwork] = useState<NetworkStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [h, f, m, r, n] = await Promise.all([
        healthCheck().catch(() => null),
        listFiles().catch(() => null),
        getSystemModels().catch(() => null),
        getSystemResources().catch(() => null),
        getNetworkStatus().catch(() => null),
      ]);
      setHealth(h);
      setFiles(f);
      setSystemModels(m);
      setResources(r);
      setNetwork(n);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFile = async (filename: string, type: string) => {
    if (!confirm(`确定删除文件 "${filename}"？`)) return;
    setDeletingFile(filename);
    try {
      await deleteFile(filename);
      setFiles((prev) => {
        if (!prev) return prev;
        if (type === 'output') {
          return { ...prev, output: prev.output.filter((f) => f.name !== filename) };
        } else {
          return { ...prev, upload: prev.upload.filter((f) => f.name !== filename) };
        }
      });
    } catch {
      alert('删除失败');
    } finally {
      setDeletingFile(null);
    }
  };

  const totalOutputSize = files?.output.reduce((s, f) => s + f.size, 0) || 0;
  const totalUploadSize = files?.upload.reduce((s, f) => s + f.size, 0) || 0;
  const totalSize = totalOutputSize + totalUploadSize;

  const getUsageColor = (pct: number) => {
    if (pct >= 90) return 'var(--error)';
    if (pct >= 70) return 'var(--warning)';
    return 'var(--success)';
  };

  return (
    <div>
      <div className="page-title">
        <h1>系统设置</h1>
        <p>查看系统状态、已生成文件和模型配置信息</p>
      </div>

      {/* Network Status Banner */}
      {network && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            background: network.online
              ? 'rgba(16,185,129,0.08)'
              : 'rgba(245,158,11,0.08)',
            border: `1px solid ${network.online ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
            borderRadius: 'var(--radius2)',
            marginBottom: 24,
            fontSize: 13,
          }}
        >
          {network.online ? (
            <Wifi size={16} style={{ color: 'var(--success)' }} />
          ) : (
            <WifiOff size={16} style={{ color: 'var(--warning)' }} />
          )}
          <span style={{ color: network.online ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
            {network.online ? '在线模式' : '离线模式'}
          </span>
          <span style={{ color: 'var(--text3)' }}>
            {network.online
              ? `最近检测: ${new Date(network.last_check * 1000).toLocaleTimeString()}`
              : `离线中，当前无法同步`}
          </span>
        </div>
      )}

      {/* Quick Start */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>快速开始</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {QUICK_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.num} style={{
                padding: 20,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                position: 'relative',
              }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>{step.num}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{step.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.4 }}>{step.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* System Status & Resources Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* System Health */}
        <div className="card">
          <div className="card-title">
            <Cpu size={16} />
            系统状态
            <button className="btn btn-ghost btn-sm" onClick={loadAll} disabled={loading} style={{ marginLeft: 'auto' }}>
              {loading ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />}
              {loading ? '刷新中...' : '刷新'}
            </button>
          </div>

          {health ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* TTS */}
              <div style={{
                padding: 14,
                background: health.tts_ready ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                borderRadius: 8,
                border: `1px solid ${health.tts_ready ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: health.tts_ready ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {health.tts_ready ? <CheckCircle size={16} style={{ color: 'var(--success)' }} /> : <XCircle size={16} style={{ color: 'var(--error)' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Qwen3-TTS</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>语音合成引擎</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: health.tts_ready ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: health.tts_ready ? 'var(--success)' : 'var(--error)' }}>
                    {health.tts_ready ? '已就绪' : '未就绪'}
                  </span>
                </div>
              </div>

              {/* Wav2Lip */}
              <div style={{
                padding: 14,
                background: health.wav2lip_ready ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                borderRadius: 8,
                border: `1px solid ${health.wav2lip_ready ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: health.wav2lip_ready ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {health.wav2lip_ready ? <CheckCircle size={16} style={{ color: 'var(--success)' }} /> : <XCircle size={16} style={{ color: 'var(--error)' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Easy-Wav2Lip</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>唇形同步引擎</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: health.wav2lip_ready ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: health.wav2lip_ready ? 'var(--success)' : 'var(--error)' }}>
                    {health.wav2lip_ready ? '已就绪' : '未就绪'}
                  </span>
                </div>
              </div>

              {/* Terminal Launch */}
              <a href="/terminal" target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px',
                  background: 'var(--surface2)',
                  borderRadius: 8,
                  textDecoration: 'none',
                  color: 'var(--text)',
                  fontSize: 13,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--primary-dim)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
              >
                <Monitor size={15} style={{ color: 'var(--primary)' }} />
                <span>打开终端预览</span>
                <ExternalLink size={12} style={{ marginLeft: 'auto', color: 'var(--text3)' }} />
              </a>

              {/* Directory info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>上传目录</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all' }}>{health.upload_dir as string}</div>
                </div>
                <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>输出目录</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all' }}>{health.output_dir as string}</div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--surface2)', borderRadius: 'var(--radius2)', border: '1px dashed var(--border2)' }}>
              <Cpu size={32} style={{ color: 'var(--text3)', marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 6 }}>点击刷新查看系统状态</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>确保后端服务已启动</div>
            </div>
          )}
        </div>

        {/* System Resources */}
        <div className="card">
          <div className="card-title">
            <Activity size={16} />
            系统资源
            <button className="btn btn-ghost btn-sm" onClick={loadAll} disabled={loading} style={{ marginLeft: 'auto' }}>
              {loading ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />}
            </button>
          </div>

          {resources ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* CPU */}
              <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                    CPU
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400, marginLeft: 8 }}>
                      {resources.cpu.count}核 / {resources.cpu.count_logical}线程
                    </span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: getUsageColor(resources.cpu.percent) }}>
                    {formatPercent(resources.cpu.percent)}
                  </span>
                </div>
                <UsageBar pct={resources.cpu.percent} color={getUsageColor(resources.cpu.percent)} />
              </div>

              {/* Memory */}
              <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                    内存
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400, marginLeft: 8 }}>
                      {resources.memory.used_gb}GB / {resources.memory.total_gb}GB
                    </span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: getUsageColor(resources.memory.percent) }}>
                    {formatPercent(resources.memory.percent)}
                  </span>
                </div>
                <UsageBar pct={resources.memory.percent} color={getUsageColor(resources.memory.percent)} />
              </div>

              {/* Disk */}
              <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                    磁盘
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400, marginLeft: 8 }}>
                      {resources.disk.used_gb}GB / {resources.disk.total_gb}GB
                    </span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: getUsageColor(resources.disk.percent) }}>
                    {formatPercent(resources.disk.percent)}
                  </span>
                </div>
                <UsageBar pct={resources.disk.percent} color={getUsageColor(resources.disk.percent)} />
              </div>

              {/* GPU */}
              {resources.gpu.length > 0 ? resources.gpu.map((gpu) => (
                <div key={gpu.index} style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                      GPU {gpu.index} — {gpu.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {gpu.memory_used_mb}MB / {gpu.memory_total_mb}MB
                      {gpu.temperature_c > 0 && ` · ${gpu.temperature_c}°C`}
                    </span>
                  </div>
                  <UsageBar pct={(gpu.memory_used_mb / gpu.memory_total_mb) * 100} color={getUsageColor((gpu.memory_used_mb / gpu.memory_total_mb) * 100)} />
                </div>
              )) : (
                <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
                  未检测到 NVIDIA GPU（nvidia-smi 不可用）
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--surface2)', borderRadius: 'var(--radius2)', border: '1px dashed var(--border2)' }}>
              <Activity size={32} style={{ color: 'var(--text3)', marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 6 }}>点击刷新获取资源数据</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>包含 CPU / 内存 / 磁盘 / GPU 使用率</div>
            </div>
          )}
        </div>
      </div>

      {/* Model Info */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">
          <HardDrive size={16} />
          模型信息
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {systemModels ? systemModels.models.map((m) => (
            <div key={m.name} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: 'var(--surface2)',
              borderRadius: 6,
              gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</span>
                  {m.required && (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)', fontWeight: 600 }}>
                      必填
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{m.path || '(未配置)'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {m.exists ? (
                  <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                ) : m.path ? (
                  <XCircle size={14} style={{ color: 'var(--error)' }} />
                ) : null}
                <span style={{ fontSize: 10, fontWeight: 600, color: m.exists ? 'var(--success)' : m.path ? 'var(--error)' : 'var(--text3)' }}>
                  {m.exists ? '就绪' : m.path ? '缺失' : '未配置'}
                </span>
              </div>
            </div>
          )) : MODEL_CONFIG.map((m) => (
            <div key={m.name} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: 'var(--surface2)',
              borderRadius: 6,
              gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</span>
                  {m.required && (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)', fontWeight: 600 }}>
                      必填
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{m.desc}</div>
              </div>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace', maxWidth: '50%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {m.path}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Config Instructions */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">
          <Info size={16} />
          配置说明
        </div>
        <div style={{ padding: '4px 0', fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 12 }}>
            修改 <code style={{ background: 'var(--surface2)', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace' }}>config.yaml</code> 文件中的模型路径，指向你的 <strong>QwenTTS</strong> 和 <strong>Easy-Wav2Lip</strong> 目录。
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: 14, background: 'var(--surface2)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--primary)' }}>后端服务</div>
              <div style={{ fontSize: 12, fontFamily: 'monospace' }}>默认端口: <strong>8000</strong></div>
            </div>
            <div style={{ padding: 14, background: 'var(--surface2)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--accent)' }}>前端服务</div>
              <div style={{ fontSize: 12, fontFamily: 'monospace' }}>默认端口: <strong>3000</strong></div>
            </div>
          </div>
        </div>
      </div>

      {/* File Management */}
      {files && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title">
            <Info size={16} />
            文件管理
            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text3)', fontWeight: 400 }}>
              共 {files.output.length + files.upload.length} 个文件（{formatSize(totalSize)}）
            </span>
            <button className="btn btn-ghost btn-sm" onClick={loadAll} disabled={loading} style={{ marginLeft: 'auto' }}>
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
            </button>
          </div>

          {files.output.length === 0 && files.upload.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
              <FileText size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
              <div style={{ fontSize: 14 }}>暂无文件</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>开始创作后，文件将显示在这里</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Output files */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>
                    输出文件 ({files.output.length}) — {formatSize(totalOutputSize)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {files.output.map((f) => (
                    <div key={f.name} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      background: 'var(--surface2)',
                      borderRadius: 6,
                      gap: 8,
                      fontSize: 12,
                    }}>
                      <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: 'var(--text)' }}>
                        {f.name}
                      </span>
                      <span style={{ color: 'var(--text3)', flexShrink: 0 }}>{formatSize(f.size)}</span>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 6px', color: 'var(--error)', fontSize: 11 }}
                        onClick={() => handleDeleteFile(f.name, 'output')}
                        disabled={deletingFile === f.name}
                        title="删除文件"
                      >
                        {deletingFile === f.name ? <Loader size={11} className="spin" /> : <Trash2 size={11} />}
                      </button>
                    </div>
                  ))}
                  {files.output.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '16px' }}>暂无输出文件</div>
                  )}
                </div>
              </div>

              {/* Upload files */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>
                    上传文件 ({files.upload.length}) — {formatSize(totalUploadSize)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {files.upload.map((f) => (
                    <div key={f.name} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      background: 'var(--surface2)',
                      borderRadius: 6,
                      gap: 8,
                      fontSize: 12,
                    }}>
                      <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: 'var(--text)' }}>
                        {f.name}
                      </span>
                      <span style={{ color: 'var(--text3)', flexShrink: 0 }}>{formatSize(f.size)}</span>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 6px', color: 'var(--error)', fontSize: 11 }}
                        onClick={() => handleDeleteFile(f.name, 'upload')}
                        disabled={deletingFile === f.name}
                        title="删除文件"
                      >
                        {deletingFile === f.name ? <Loader size={11} className="spin" /> : <Trash2 size={11} />}
                      </button>
                    </div>
                  ))}
                  {files.upload.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '16px' }}>暂无上传文件</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
