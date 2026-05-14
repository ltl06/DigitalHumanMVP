import { useState } from 'react';
import { Play, Download, Trash2, Edit2, Check, X, Loader, Eye, EyeOff } from 'lucide-react';
import { renameHistory, deleteHistory } from '../api/client';
import { formatDate } from '../utils/format';
import type { Job } from '../types/api';

interface JobCardProps {
  job: Job;
  onDeleted?: () => void;
  onRenamed?: () => void;
}

const JOB_TYPE_CONFIG = {
  pipeline: { label: '数字人合成', color: 'var(--primary)', bg: 'var(--primary-dim)' },
  tts: { label: '语音合成', color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.12)' },
  lipsync: { label: '唇形同步', color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.12)' },
};

export default function JobCard({ job, onDeleted, onRenamed }: JobCardProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(job.name ?? '');
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const typeConfig = JOB_TYPE_CONFIG[job.job_type as keyof typeof JOB_TYPE_CONFIG] || {
    label: job.job_type,
    color: 'var(--accent)',
    bg: 'rgba(99, 102, 241, 0.12)',
  };

  const handleRename = async () => {
    if (!editName.trim() || editName === (job.name ?? '')) {
      setEditing(false);
      return;
    }
    await renameHistory(job.id, editName.trim());
    setEditing(false);
    onRenamed?.();
  };

  const handleDelete = async () => {
    if (!confirm('确定删除这条记录？')) return;
    setDeleting(true);
    await deleteHistory(job.id);
    setDeleting(false);
    onDeleted?.();
  };

  const handleDownload = (filename: string) => {
    window.open(`/api/files/${filename}`, '_blank');
  };

  const hasVideo = job.video_filename && job.status === 'completed';
  const hasAudio = job.audio_filename && job.status === 'completed';

  return (
    <div className={`job-card ${job.job_type}`}>
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
            {job.status === 'completed' && <Check size={10} />}
            {job.status === 'failed' && <X size={10} />}
            {job.status === 'processing' ? '处理中' : job.status === 'completed' ? '已完成' : job.status === 'failed' ? '失败' : job.status}
          </span>
        </div>

        <div className="job-card-actions">
          {editing ? (
            <>
              <input
                className="job-name-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                autoFocus
              />
              <button className="btn btn-icon btn-ghost" onClick={handleRename}><Check size={14} /></button>
              <button className="btn btn-icon btn-ghost" onClick={() => { setEditing(false); setEditName(job.name ?? ''); }}><X size={14} /></button>
            </>
          ) : (
            <>
              <button className="btn btn-icon btn-ghost" onClick={() => setEditing(true)} title="重命名">
                <Edit2 size={14} />
              </button>
              <button className="btn btn-icon btn-ghost" onClick={handleDelete} disabled={deleting} title="删除">
                {deleting ? <Loader size={14} className="spin" /> : <Trash2 size={14} />}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="job-card-body">
        {editing ? null : (
          <h3 className="job-card-title">
            {job.name || '未命名作品'}
          </h3>
        )}

        {job.status === 'processing' && (
          <div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${job.progress || 0}%` }} />
            </div>
            <div className="progress-label">
              <span>{job.message || '处理中...'}</span>
              <span>{job.progress || 0}%</span>
            </div>
          </div>
        )}

        {job.status === 'failed' && job.message && (
          <div className="job-error">
            <X size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              {job.message.length > 80 && !expanded
                ? job.message.slice(0, 80) + '...'
                : job.message}
              {job.message.length > 80 && (
                <button className="job-expand-btn" onClick={() => setExpanded(!expanded)}>
                  {expanded ? ' 收起' : ' 展开'}
                </button>
              )}
            </div>
          </div>
        )}

        {job.status === 'completed' && hasVideo && (
          <div>
            <button className="preview-toggle" onClick={() => setPreview(!preview)}>
              {preview ? <EyeOff size={13} /> : <Eye size={13} />}
              {preview ? '收起预览' : '预览视频'}
            </button>
            {preview && (
              <div className="video-container" style={{ marginTop: 12 }}>
                <video controls src={`/api/files/${job.video_filename}`} style={{ maxHeight: 280, width: '100%' }} />
              </div>
            )}
          </div>
        )}

        {job.status === 'completed' && (
          <div className="job-download-row">
            {hasVideo && (
              <button className="btn btn-secondary btn-sm" onClick={() => handleDownload(job.video_filename!)}>
                <Download size={12} /> 视频
              </button>
            )}
            {hasAudio && (
              <button className="btn btn-secondary btn-sm" onClick={() => handleDownload(job.audio_filename!)}>
                <Play size={12} /> 音频
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
