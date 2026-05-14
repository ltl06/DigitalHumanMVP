import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Sparkles,
  Upload,
  FileVideo,
  Loader,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Download,
  Eye,
  Settings,
  Mic,
  Layers,
  Wand2,
  Clapperboard,
  Volume2,
  Play,
  Pause,
  BookOpen, Clock,
  Zap,
  Lightbulb,
  ChevronRight,
  Star,
  Video,
  Plus,
  Trash2,
  AlertCircle,} from 'lucide-react';
import {
  runPipeline,
  getPipelineStatus,
  uploadFile,
  listSpeakers,
  listLanguages,
  getHistory,
} from '../api/client';
import { listExhibits, getContent, listContents } from '../api/cms';
import type { Speaker, Language, Job, TTSMode, QualityMode, Wav2LipVersion, FileUpload, Template, ViewAnimation, CameraAngle, CameraSegment, CameraStrategy, CameraTransition } from '../types/api';
import type { Exhibit, Content, ContentsResponse } from '../types/api';
import { formatDate } from '../utils/format';

const DEFAULT_TEXT = '你好，欢迎使用境语智导！';

const QUALITY_OPTIONS = [
  { id: 'Fast', name: '快速', desc: '速度优先', icon: '⚡' },
  { id: 'Improved', name: '增强', desc: '羽化蒙版', icon: '✨' },
  { id: 'Enhanced', name: '最佳', desc: '画质最优', icon: '🌟' },
] as const;

const TTS_MODE_TABS = [
  { id: 'custom_voice' as const, label: '选择音色' },
  { id: 'voice_clone' as const, label: '声音克隆' },
  { id: 'voice_design' as const, label: '声音设计' },
];

const SPEAKER_GRADIENTS = [
  ['#00d4aa', '#00b894'],
  ['#6366f1', '#818cf8'],
  ['#f59e0b', '#fbbf24'],
  ['#10b981', '#34d399'],
  ['#ef4444', '#f87171'],
  ['#ec4899', '#f472b6'],
  ['#8b5cf6', '#a78bfa'],
  ['#06b6d4', '#22d3ee'],
];

const SPEAKER_LETTERS = ['V', 'S', 'U', 'D', 'E', 'R', 'A', 'O'];

const TEMPLATES = [
  { label: '欢迎语', text: '您好，欢迎使用数字人创作平台！很高兴为您服务。', icon: '👋', color: '#00d4aa' },
  { label: '产品介绍', text: '这是一款革命性的产品，它融合了最前沿的AI技术，为您带来前所未有的体验。', icon: '📱', color: '#6366f1' },
  { label: '教育培训', text: '同学们，今天我们来学习人工智能的基础知识。首先，什么是机器学习？', icon: '📚', color: '#f59e0b' },
  { label: '生日祝福', text: '祝您生日快乐！愿新的一岁里，所有的美好都与您不期而遇，心想事成，万事如意。', icon: '🎂', color: '#ec4899' },
  { label: '新闻播报', text: '各位观众晚上好，欢迎收看今日新闻。今天的主要内容包括科技创新、经济动态、社会热点等内容。', icon: '📰', color: '#ef4444' },
  { label: '活动推广', text: '好消息！我们的新品促销活动正式开始，全场八折优惠，还有更多精美礼品等您来拿。', icon: '🎉', color: '#8b5cf6' },
];

const TIPS = {
  custom_voice: ['选择与内容风格匹配的音色效果更佳', '中文内容建议使用中文音色'],
  voice_clone: ['参考音频建议选择5-30秒的高质量录音', '录音越清晰，克隆效果越好'],
  voice_design: ['描述越详细，生成的音色越符合预期', '例如：甜美的女声，语速稍快'],
};

function estimateDuration(text: string): string {
  const seconds = Math.ceil(text.length * 0.35);
  if (seconds < 60) return `${seconds}秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${s > 0 ? s + '秒' : ''}`;
}

function AvatarCircle({ letter, index, size = 30 }: { letter: string; index: number; size?: number }) {
  const [c1, c2] = SPEAKER_GRADIENTS[index % SPEAKER_GRADIENTS.length];
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.38, fontWeight: 700, color: '#0a1a14', flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}

function SectionCard({ children, accentLine }: { children: React.ReactNode; accentLine?: 'primary' | 'accent' }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {accentLine && (
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: accentLine === 'primary'
              ? 'linear-gradient(90deg, var(--primary), transparent)'
              : 'linear-gradient(90deg, var(--accent), transparent)',
          }}
        />
      )}
      {children}
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        fontSize: 12, fontWeight: 700, color: 'var(--text)',
      }}
    >
      <span style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center' }}>{icon}</span>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        fontSize: 11, fontWeight: 500, color: 'var(--text3)',
        display: 'block', marginBottom: 4,
      }}
    >
      {children}
    </label>
  );
}

function HintText({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginTop: 3 }}>
      {children}
    </span>
  );
}

function PillTabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  const activeIndex = tabs.findIndex((t) => t.id === value);
  return (
    <div
      style={{
        display: 'flex', background: 'var(--surface2)',
        borderRadius: 8, padding: 3, position: 'relative',
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            flex: 1, padding: '5px 8px', border: 'none', borderRadius: 6,
            fontSize: 11, fontWeight: 600, fontFamily: 'var(--font)',
            cursor: 'pointer', background: 'transparent',
            color: 'var(--text2)', position: 'relative', zIndex: 1,
          }}
        >
          {tab.label}
        </button>
      ))}
      <div
        style={{
          position: 'absolute', top: 3, left: 3,
          width: `calc(${100 / tabs.length}% - ${3 * (tabs.length - 1) / tabs.length}px)`,
          height: 'calc(100% - 6px)',
          background: 'linear-gradient(135deg, var(--primary), #00b894)',
          borderRadius: 6,
          boxShadow: '0 2px 8px rgba(0, 212, 170, 0.25)',
          transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 3}px))`,
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 0,
        }}
      />
    </div>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        background: 'var(--surface2)', border: '1px solid var(--border2)',
        borderRadius: 8, padding: '7px 10px', color: 'var(--text)',
        fontSize: 12, fontFamily: 'var(--font)', transition: 'all 0.2s',
        outline: 'none', width: '100%', ...props.style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--primary)';
        e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-dim)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--border2)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        background: 'var(--surface2)', border: '1px solid var(--border2)',
        borderRadius: 8, padding: '8px 10px', color: 'var(--text)',
        fontSize: 12, fontFamily: 'var(--font)', transition: 'all 0.2s',
        outline: 'none', width: '100%', resize: 'vertical',
        minHeight: 72, lineHeight: 1.6, ...props.style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--primary)';
        e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-dim)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--border2)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    />
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        background: 'var(--surface2)', border: '1px solid var(--border2)',
        borderRadius: 8, padding: '7px 10px', color: 'var(--text)',
        fontSize: 12, fontFamily: 'var(--font)', transition: 'all 0.2s',
        outline: 'none', width: '100%', cursor: 'pointer', ...props.style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--primary)';
        e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-dim)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--border2)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {props.children}
    </select>
  );
}

function UploadArea({
  icon, title, hint, onFile, accept, isUploading, previewSrc, previewType,
}: {
  icon: React.ReactNode; title: string; hint: string;
  onFile: (file: File) => void; accept?: string;
  isUploading?: boolean; previewSrc?: string | null; previewType?: 'video' | 'image';
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
      {previewSrc ? null : (
        <label
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 6, padding: '16px 12px',
            border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border2)'}`,
            borderRadius: 8,
            background: dragOver ? 'var(--primary-dim)' : 'var(--surface2)',
            cursor: isUploading ? 'default' : 'pointer',
            transition: 'all 0.25s', textAlign: 'center',
          }}
          onMouseEnter={() => !isUploading && setDragOver(true)}
          onMouseLeave={() => setDragOver(false)}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) onFile(file);
          }}
        >
          <input
            type="file"
            accept={accept}
            disabled={isUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = '';
            }}
            style={{
              position: 'absolute', inset: 0, opacity: 0,
              cursor: isUploading ? 'default' : 'pointer',
              width: '100%', height: '100%',
            }}
          />
          <span style={{ color: dragOver ? 'var(--primary)' : 'var(--text3)', display: 'flex', alignItems: 'center' }}>{icon}</span>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
              {isUploading ? '上传中...' : title}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text3)' }}>{isUploading ? '请稍候' : hint}</p>
          </div>
        </label>
      )}
    </div>
  );
}

function FileBadge({ name, size, icon, onRemove }: { name: string; size: number; icon: React.ReactNode; onRemove: () => void }) {
  const fmt = (b: number) => b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'var(--primary-dim)', border: '1px solid rgba(0, 212, 170, 0.3)',
        borderRadius: 20, padding: '5px 10px 5px 8px',
        fontSize: 11, color: 'var(--primary)', fontWeight: 500,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{name}</span>
      <span style={{ opacity: 0.55, fontSize: 10, flexShrink: 0 }}>({fmt(size)})</span>
      <button
        onClick={onRemove}
        style={{
          cursor: 'pointer', color: 'var(--error)', opacity: 0.7, fontSize: 14,
          lineHeight: 1, background: 'none', border: 'none', padding: 0,
          fontFamily: 'inherit', flexShrink: 0, display: 'flex', alignItems: 'center',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'; }}
      >
        ×
      </button>
    </div>
  );
}

// ── Multi-Camera Player ───────────────────────────────────────
const CAMERA_COLORS = ['#00d4aa', '#6366f1', '#f59e0b', '#ef4444'];

function MultiCameraPlayer({ job }: { job: Job }) {
  const timeline = job.timeline || [];
  const [activeCamId, setActiveCamId] = useState<string>('');
  const [videoSrc, setVideoSrc] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const totalDuration = timeline.length > 0
    ? timeline[timeline.length - 1].end_sec
    : 0;

  // Build camera color map
  const camColorMap: Record<string, string> = {};
  const uniqueCams = [...new Set(timeline.map((s) => s.cam_id))];
  uniqueCams.forEach((cam, i) => {
    camColorMap[cam] = CAMERA_COLORS[i % CAMERA_COLORS.length];
  });

  // Initialize video with first segment's camera
  useEffect(() => {
    if (timeline.length === 0 || !job.video_filename) return;
    const firstSeg = timeline[0];
    setActiveCamId(firstSeg.cam_id);
    setVideoSrc(`/api/files/${job.video_filename}`);
  }, [timeline, job.video_filename]);

  // Seek to the start of the current camera segment
  useEffect(() => {
    if (!videoRef.current || !activeCamId) return;
    const seg = timeline.find(
      (s) => s.cam_id === activeCamId && currentTime >= s.start_sec && currentTime < s.end_sec
    );
    if (!seg) {
      // Find where this camera starts next
      const nextSeg = timeline.find((s) => s.cam_id === activeCamId && s.start_sec > currentTime);
      if (nextSeg && videoRef.current) {
        videoRef.current.currentTime = nextSeg.start_sec;
      }
    }
  }, [activeCamId, timeline, currentTime]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);
    const seg = timeline.find((s) => t >= s.start_sec && t < s.end_sec);
    if (seg && seg.cam_id !== activeCamId) {
      setActiveCamId(seg.cam_id);
    }
  };

  const activeCamColor = camColorMap[activeCamId] || CAMERA_COLORS[0];

  return (
    <div>
      <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#000', marginBottom: 8 }}>
        <video
          ref={videoRef}
          src={videoSrc}
          controls
          style={{ width: '100%', maxHeight: 360 }}
          onTimeUpdate={handleTimeUpdate}
        />
        {activeCamId && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            padding: '3px 10px', borderRadius: 20,
            background: `${activeCamColor}22`, border: `1px solid ${activeCamColor}`,
            color: activeCamColor, fontSize: 11, fontWeight: 600,
          }}>
            {activeCamId}
          </div>
        )}
      </div>

      {/* Camera timeline visualization */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 6 }}>
          机位时间轴 · 共 {uniqueCams.length} 个机位
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {uniqueCams.map((camId) => {
            const color = camColorMap[camId];
            const camSegments = timeline.filter((s) => s.cam_id === camId);
            return (
              <div key={camId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color, width: 40, flexShrink: 0 }}>
                  {camId}
                </div>
                <div style={{ flex: 1, height: 20, background: 'var(--surface2)', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                  {camSegments.map((seg, i) => {
                    const left = (seg.start_sec / totalDuration) * 100;
                    const width = ((seg.end_sec - seg.start_sec) / totalDuration) * 100;
                    return (
                      <div
                        key={i}
                        onClick={() => {
                          setActiveCamId(camId);
                          if (videoRef.current) videoRef.current.currentTime = seg.start_sec;
                        }}
                        style={{
                          position: 'absolute', left: `${left}%`, width: `${width}%`,
                          top: 0, bottom: 0, background: color,
                          opacity: activeCamId === camId ? 0.9 : 0.4,
                          cursor: 'pointer',
                          borderRadius: 2,
                        }}
                        title={seg.text}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [playingSpeaker, setPlayingSpeaker] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [activeTip, setActiveTip] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tipIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // CMS integration: show content browser
  const [showContentBrowser, setShowContentBrowser] = useState(false);
  const [cmsExhibits, setCmsExhibits] = useState<Exhibit[]>([]);
  const [cmsContents, setCmsContents] = useState<Content[]>([]);
  const [cmsFilter, setCmsFilter] = useState('');
  const [cmsSelectedExhibit, setCmsSelectedExhibit] = useState('');
  const [cmsLoading, setCmsLoading] = useState(false);

  type FormShape = {
    name: string;
    text: string;
    tts_mode: TTSMode;
    speaker: string;
    language: string;
    instruct: string;
    ref_audio_filename: string;
    ref_text: string;
    face_filename: string;
    quality: QualityMode;
    out_height: number;
    pads_top: number;
    pads_bottom: number;
    pads_left: number;
    pads_right: number;
    mask_dilation: number;
    mask_feathering: number;
    nosmooth: boolean;
    wav2lip_version: Wav2LipVersion;
    speed: number;
    pitch: number;
    volume: number;
    contentId: string;
    enable_view: boolean;
    view_head_rotation_x: number;
    view_head_rotation_y: number;
    view_head_rotation_z: number;
    view_blink_frequency: number;
    view_expression_strength: number;
    view_animation: ViewAnimation;
    camera_transition: CameraTransition;
    xfade_duration: number;
  };

  const [form, setForm] = useState<FormShape>({
    name: '',
    text: DEFAULT_TEXT,
    tts_mode: 'custom_voice' as TTSMode,
    speaker: 'Vivian',
    language: 'Auto',
    instruct: '',
    ref_audio_filename: '',
    ref_text: '',
    face_filename: '',
    quality: 'Enhanced' as QualityMode,
    out_height: 480,
    pads_top: 0,
    pads_bottom: 10,
    pads_left: 0,
    pads_right: 0,
    mask_dilation: 2.5,
    mask_feathering: 2.0,
    nosmooth: true,
    wav2lip_version: 'Wav2Lip_GAN' as Wav2LipVersion,
    speed: 1.0,
    pitch: 0.0,
    volume: 1.0,
    contentId: '',
    enable_view: false,
    view_head_rotation_x: 0.0,
    view_head_rotation_y: 0.0,
    view_head_rotation_z: 0.0,
    view_blink_frequency: 0.5,
    view_expression_strength: 0.5,
    view_animation: 'static' as ViewAnimation,
    camera_transition: 'crossfade' as CameraTransition,
    xfade_duration: 0.5,
  });

  const [faceFile, setFaceFile] = useState<FileUpload | null>(null);
  const [refAudioFile, setRefAudioFile] = useState<FileUpload | null>(null);
  const [uploading, setUploading] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Multi-camera state
  const [cameraAngles, setCameraAngles] = useState<CameraAngle[]>([]);
  const [cameraStrategy, setCameraStrategy] = useState<CameraStrategy>('semantic');
  const [useMultiCamera, setUseMultiCamera] = useState(false);
  const [cameraUploading, setCameraUploading] = useState(false);
  const [timeline, setTimeline] = useState<CameraSegment[]>([]);
  const [currentCamera, setCurrentCamera] = useState<string>('');
  const [multiVideoRef, setMultiVideoRef] = useState<HTMLVideoElement | null>(null);
  const [segmentVideos, setSegmentVideos] = useState<Record<string, string>>({});

  // Load CMS content from URL params (from CMS content selection)
  useEffect(() => {
    const textParam = searchParams.get('text');
    const titleParam = searchParams.get('title');
    const contentIdParam = searchParams.get('contentId');
    if (textParam) {
      setForm((f) => ({ ...f, text: decodeURIComponent(textParam) }));
      if (titleParam) setForm((f) => ({ ...f, name: decodeURIComponent(titleParam) }));
      setShowTemplates(false);
      // Clear URL params after applying
      setSearchParams({}, { replace: true });
    } else if (contentIdParam) {
      // Fetch content from CMS by ID
      getContent(contentIdParam).then((ct) => {
        setForm((f) => ({
          ...f,
          text: ct.body,
          name: ct.title,
          contentId: ct.id,
        }));
        setShowTemplates(false);
      }).catch(() => {}).finally(() => {
        setSearchParams({}, { replace: true });
      });
    }
  }, []);

  // Load CMS content when browser modal opens
  useEffect(() => {
    if (showContentBrowser) {
      setCmsLoading(true);
      Promise.all([
        listExhibits(),
        listContents({ size: 50 }),
      ]).then(([exRes, ctRes]) => {
        setCmsExhibits(exRes.exhibits);
        setCmsContents(ctRes.contents);
      }).catch(() => {}).finally(() => setCmsLoading(false));
    }
  }, [showContentBrowser]);

  // Filter CMS contents when filter changes
  useEffect(() => {
    if (!showContentBrowser) return;
    setCmsLoading(true);
    const params: { size: number; exhibit_id?: string } = { size: 50 };
    if (cmsSelectedExhibit) params.exhibit_id = cmsSelectedExhibit;
    listContents(params).then((res: ContentsResponse) => {
      const filtered = cmsFilter
        ? res.contents.filter((c: Content) => c.title.toLowerCase().includes(cmsFilter.toLowerCase()) || c.body.toLowerCase().includes(cmsFilter.toLowerCase()))
        : res.contents;
      setCmsContents(filtered);
    }).catch(() => {}).finally(() => setCmsLoading(false));
  }, [cmsFilter, cmsSelectedExhibit, showContentBrowser]);

  useEffect(() => {
    listSpeakers().then((r) => setSpeakers(r.speakers)).catch(() => {});
    listLanguages().then((r) => setLanguages(r.languages)).catch(() => {});
    getHistory({ page: 1, size: 3 })
      .then((r) => setRecentJobs(r.records.filter((j) => j.status === 'completed')))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const tips = TIPS[form.tts_mode];
    setActiveTip(0);
    if (tipIntervalRef.current) clearInterval(tipIntervalRef.current);
    tipIntervalRef.current = setInterval(() => {
      setActiveTip((prev) => (prev + 1) % tips.length);
    }, 4000);
    return () => { if (tipIntervalRef.current) clearInterval(tipIntervalRef.current); };
  }, [form.tts_mode]);

  useEffect(() => {
    if (!polling || !currentJobId) return;
    pollingRef.current = setInterval(async () => {
      try {
        const status = await getPipelineStatus(currentJobId);
        setJob(status);
        if (status.status === 'completed' || status.status === 'failed') {
          setPolling(false);
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setPolling(false);
      }
    }, 2000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [polling, currentJobId]);

  const handleSpeakerPreview = useCallback((speakerId: string) => {
    if (playingSpeaker === speakerId) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setPlayingSpeaker(null);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const audio = new Audio(`/api/files/preview_${speakerId}.wav`);
    audioRef.current = audio;
    audio.onerror = () => { setPlayingSpeaker(null); audioRef.current = null; };
    audio.onended = () => { setPlayingSpeaker(null); audioRef.current = null; };
    audio.play().then(() => setPlayingSpeaker(speakerId)).catch(() => {});
  }, [playingSpeaker]);

  const handleFaceUpload = useCallback(async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const result = await uploadFile('face', file);
      const url = URL.createObjectURL(file);
      setFaceFile({ name: result.filename, size: result.size, url });
      setForm((f) => ({ ...f, face_filename: result.filename }));
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
      setForm((f) => ({ ...f, ref_audio_filename: result.filename }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }, []);

  const handleCameraUpload = useCallback(async (file: File) => {
    setError(null);
    setCameraUploading(true);
    try {
      const result = await uploadFile('face', file);
      const camId = `cam_${Date.now()}`;
      const url = URL.createObjectURL(file);
      setCameraAngles((prev) => {
        if (prev.length >= 4) return prev;
        return [...prev, { id: camId, name: `机位${prev.length + 1}`, filename: result.filename }];
      });
      setSegmentVideos((prev) => ({ ...prev, [camId]: url }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCameraUploading(false);
    }
  }, []);

  const removeCamera = useCallback((camId: string) => {
    setCameraAngles((prev) => prev.filter((c) => c.id !== camId));
    const url = segmentVideos[camId];
    if (url) URL.revokeObjectURL(url);
    setSegmentVideos((prev) => {
      const next = { ...prev };
      delete next[camId];
      return next;
    });
  }, [segmentVideos]);

  const applyTemplate = (template: typeof TEMPLATES[0]) => {
    setForm((f) => ({ ...f, text: template.text }));
    setShowTemplates(false);
  };

  const startPipeline = useCallback(async () => {
    if (useMultiCamera) {
      if (cameraAngles.length < 2) { setError('多机位模式至少需要 2 个机位视频'); return; }
    } else {
      if (!form.face_filename) { setError('请先上传人脸视频'); return; }
    }
    if (!form.text.trim()) { setError('请输入合成文本'); return; }
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        use_multi_camera: useMultiCamera,
        camera_angles: useMultiCamera ? cameraAngles : [],
        camera_strategy: useMultiCamera ? cameraStrategy : 'semantic',
      };
      const res = await runPipeline(payload);
      setJob({ id: res.job_id, status: 'processing', progress: 0, step: 'tts' });
      setCurrentJobId(res.job_id);
      setPolling(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [form, useMultiCamera, cameraAngles, cameraStrategy]);

  const handleRetry = () => {
    setJob(null);
    setError(null);
    setPolling(false);
    setCurrentJobId(null);
  };

  const isProcessing = job?.status === 'processing';
  const isDone = job?.status === 'completed';
  const isFailed = job?.status === 'failed';

  const charCount = form.text.length;
  const duration = estimateDuration(form.text);

  // ── Result view ─────────────────────────────────────────────────────────────
  if (isDone || isFailed) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>创建数字人作品</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)' }}>境语智导 — 一键生成 AI 数字人视频</p>
        </div>
        {isDone ? (
          <SectionCard>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={16} color="var(--success)" />
                <span style={{ fontWeight: 600, fontSize: 13 }}>视频生成完成</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={handleRetry}><RotateCcw size={12} /> 再做一个</button>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/history')}><Eye size={12} /> 历史记录</button>
              </div>
            </div>
            <div style={{ padding: '12px 16px' }}>
              {job.multi_camera && job.timeline && job.timeline.length > 0 ? (
                <>
                  <MultiCameraPlayer job={job} />
                </>
              ) : (
                <video controls src={`/api/files/${job.video_filename}`} style={{ width: '100%', maxHeight: 380, borderRadius: 8 }} />
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary" onClick={() => window.open(`/api/files/${job.video_filename}`, '_blank')}>
                  <Download size={13} /> 下载视频
                </button>
                {job.audio_filename && (
                  <button className="btn btn-secondary" onClick={() => window.open(`/api/files/${job.audio_filename}`, '_blank')}>
                    下载音频
                  </button>
                )}
              </div>
            </div>
          </SectionCard>
        ) : (
          <SectionCard>
            <div style={{ padding: 32, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <XCircle size={36} color="var(--error)" />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--error)' }}>生成失败</h3>
              {job.message && <p style={{ fontSize: 12, color: 'var(--text2)', maxWidth: 400 }}>{job.message}</p>}
              <button className="btn btn-secondary" onClick={handleRetry}><RotateCcw size={13} /> 重试</button>
            </div>
          </SectionCard>
        )}
      </div>
    );
  }

  // ── Processing view ─────────────────────────────────────────────────────────
  if (isProcessing) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>创建数字人作品</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)' }}>境语智导 — 一键生成 AI 数字人视频</p>
        </div>
        {/* Pipeline Steps */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 12, boxShadow: 'var(--shadow)' }}>
          {(useMultiCamera
            ? ['planning', 'tts_lipsync', 'compose', 'done'] as const
            : ['tts', 'view', 'lipsync', 'done'] as const
          ).map((step, i) => {
            const allSteps = useMultiCamera
              ? { planning: ['分析文本', Mic], tts_lipsync: ['TTS+唇形', Sparkles], compose: ['合成视频', Layers], done: ['完成', CheckCircle] }
              : { tts: ['语音合成', Mic], view: ['视角动画', Eye], lipsync: ['唇形同步', Layers], done: ['完成', CheckCircle] };
            const [label, Icon] = allSteps[step] as [string, React.ElementType];
            const stepDone = job.step !== undefined && (
              useMultiCamera
                ? (step === 'planning' && ['tts_lipsync','compose','done'].includes(job.step)) ||
                  (step === 'tts_lipsync' && ['compose','done'].includes(job.step)) ||
                  (step === 'compose' && job.step === 'done')
                : (step === 'tts' && ['view','lipsync','done'].includes(job.step)) ||
                  (step === 'view' && ['lipsync','done'].includes(job.step)) ||
                  (step === 'lipsync' && job.step === 'done')
            );
            const stepActive = job.step === step || (step === 'compose' && job.step?.startsWith('compose')) ||
              (step === 'tts_lipsync' && job.step?.startsWith('tts_lipsync'));
            const labels = Object.values(useMultiCamera
              ? { planning: ['分析文本', Mic], tts_lipsync: ['TTS+唇形', Sparkles], compose: ['合成视频', Layers], done: ['完成', CheckCircle] }
              : { tts: ['语音合成', Mic], view: ['视角动画', Eye], lipsync: ['唇形同步', Layers], done: ['完成', CheckCircle] }
            ).map(([l, I]) => l);
            const icons = Object.values(useMultiCamera
              ? { planning: ['分析文本', Mic], tts_lipsync: ['TTS+唇形', Sparkles], compose: ['合成视频', Layers], done: ['完成', CheckCircle] }
              : { tts: ['语音合成', Mic], view: ['视角动画', Eye], lipsync: ['唇形同步', Layers], done: ['完成', CheckCircle] }
            ).map(([, I]) => I);
            const totalSteps = labels.length;
            return (
              <>
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: stepDone ? 'rgba(16,185,129,0.15)' : stepActive ? 'var(--primary-dim)' : 'var(--surface3)', color: stepDone ? 'var(--success)' : stepActive ? 'var(--primary)' : 'var(--text3)', border: `2px solid ${stepDone ? 'var(--success)' : stepActive ? 'var(--primary)' : 'var(--border2)'}`, transition: 'all 0.3s' }}>
                    <Icon size={14} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: stepDone ? 'var(--success)' : stepActive ? 'var(--primary)' : 'var(--text3)' }}>{label}</span>
                </div>
                {i < totalSteps - 1 && <div style={{ flex: 1, height: 2, background: stepDone ? 'var(--primary)' : 'var(--border2)', margin: '0 10px', borderRadius: 1, transition: 'background 0.3s' }} />}
              </>
            );
          })}
        </div>
        <SectionCard>
          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}>
                <Loader size={13} className="spin" style={{ color: 'var(--primary)' }} />
                {job.message || 'AI 正在生成中...'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>{job.progress || 0}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--surface3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${job.progress || 0}%`, background: 'linear-gradient(90deg, var(--primary), #00e6b8)', borderRadius: 3, transition: 'width 0.4s', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', animation: 'shimmer 1.5s infinite' }} />
              </div>
            </div>
          </div>
        </SectionCard>
        <style>{`@keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }`}</style>
      </div>
    );
  }

  // ── Form view ──────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>创建数字人作品</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)' }}>境语智导 — 一键生成 AI 数字人视频</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {recentJobs.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/history')} style={{ gap: 4 }}>
              <Clock size={12} /> 最近 {recentJobs.length} 个作品 <ChevronRight size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Quick Templates ── */}
      <SectionCard>
        <SectionTitle icon={<Zap size={13} />}>快速模板</SectionTitle>
        <div style={{ padding: '8px 12px' }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => applyTemplate(t)}
                style={{
                  flexShrink: 0, padding: '8px 12px',
                  borderRadius: 8, border: `1px solid var(--border2)`,
                  background: 'var(--surface2)', cursor: 'pointer',
                  transition: 'all 0.2s', fontFamily: 'var(--font)',
                  display: 'flex', flexDirection: 'column', gap: 4,
                  minWidth: 110, outline: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = t.color;
                  e.currentTarget.style.background = `${t.color}18`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border2)';
                  e.currentTarget.style.background = 'var(--surface2)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 14 }}>{t.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.color }}>{t.label}</span>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {t.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* ── Main 3-column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 280px', gap: 12, marginTop: 12 }}>

        {/* ── COL 1: Text Input ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionCard accentLine="primary">
            <SectionTitle icon={<FileVideo size={13} />}>合成文本</SectionTitle>
            <div style={{ padding: 10 }}>
              <TextArea
                value={form.text}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                placeholder="输入要合成的文本内容..."
                rows={3}
                style={{ minHeight: 76 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                  <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{charCount}</span> 字
                </span>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                  预计 <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{duration}</span>
                </span>
                {charCount > 500 && (
                  <span style={{ fontSize: 10, color: charCount > 1000 ? 'var(--warning)' : 'var(--text3)' }}>
                    {charCount > 1000 ? '⚠ 文本较长，生成时间会增加' : ''}
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 10, padding: '3px 8px', marginLeft: 'auto' }}
                  onClick={() => setShowContentBrowser(true)}
                >
                  <BookOpen size={11} /> 从内容库选择
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <div>
                  <FieldLabel>语言</FieldLabel>
                  <SelectInput value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
                    {languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </SelectInput>
                </div>
                <div>
                  <FieldLabel>风格提示</FieldLabel>
                  <TextInput value={form.instruct} onChange={(e) => setForm((f) => ({ ...f, instruct: e.target.value }))} placeholder="如：开心的语气" />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Face Video */}
          <SectionCard accentLine="accent">
            <SectionTitle icon={<Clapperboard size={13} />}>
              人脸视频
              <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--error)', fontWeight: 500 }}>*</span>
            </SectionTitle>
            <div style={{ padding: 10 }}>
              <div style={{ marginBottom: 8 }}>
                <FieldLabel>作品名称（可选）</FieldLabel>
                <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="如：生日祝福视频" />
              </div>
              <FieldLabel>上传人脸视频 *</FieldLabel>
              {faceFile ? (
                <div>
                  <FileBadge
                    name={faceFile.name}
                    size={faceFile.size}
                    icon={<FileVideo size={11} />}
                    onRemove={() => { setFaceFile(null); setForm((f) => ({ ...f, face_filename: '' })); }}
                  />
                  <video
                    src={faceFile.url}
                    style={{ width: '100%', maxHeight: 100, display: 'block', objectFit: 'cover', borderRadius: 6, marginTop: 6, background: 'var(--surface2)' }}
                    muted playsInline
                    onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
                    onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                  />
                </div>
              ) : (
                <UploadArea
                  icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text3)' }}><path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>}
                  title="点击上传人脸视频"
                  hint="MP4 / MOV，建议 720p"
                  onFile={handleFaceUpload}
                  accept="video/*,image/*"
                  isUploading={uploading}
                />
              )}
            </div>
          </SectionCard>

          {/* ── Multi-Camera ── */}
          <SectionCard accentLine="accent">
            <SectionTitle icon={<Video size={13} />}>多机位视角</SectionTitle>
            <div style={{ padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={useMultiCamera}
                    onChange={(e) => {
                      setUseMultiCamera(e.target.checked);
                      if (!e.target.checked) {
                        cameraAngles.forEach((c) => {
                          const url = segmentVideos[c.id];
                          if (url) URL.revokeObjectURL(url);
                        });
                        setCameraAngles([]);
                        setSegmentVideos({});
                      }
                    }}
                    style={{ accentColor: 'var(--primary)', width: 14, height: 14 }}
                  />
                  <span style={{ fontWeight: 500 }}>启用多机位模式</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>(最多 4 个机位)</span>
                </label>
              </div>

              {useMultiCamera ? (
                <>
                  {cameraAngles.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {cameraAngles.map((cam) => (
                        <div key={cam.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          marginBottom: 6, padding: '6px 8px',
                          background: 'var(--surface2)', borderRadius: 6,
                        }}>
                          <Video size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cam.name}</div>
                            {segmentVideos[cam.id] && (
                              <video
                                src={segmentVideos[cam.id]}
                                style={{ height: 36, borderRadius: 4, objectFit: 'cover', marginTop: 2 }}
                                muted playsInline
                                onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
                                onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                              />
                            )}
                          </div>
                          <button
                            onClick={() => removeCamera(cam.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', padding: 4, display: 'flex', alignItems: 'center' }}
                            title="移除"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {cameraAngles.length === 0 && (
                    <label style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      padding: '16px 12px', background: 'var(--surface2)', borderRadius: 8,
                      border: '2px dashed var(--primary)', cursor: 'pointer',
                      fontSize: 12, color: 'var(--primary)', fontWeight: 500,
                    }}>
                      <input
                        type="file"
                        accept="video/*"
                        style={{ display: 'none' }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCameraUpload(f); e.target.value = ''; }}
                        disabled={cameraUploading}
                      />
                      {cameraUploading ? (
                        <Loader size={18} className="spin" />
                      ) : (
                        <>
                          <Video size={20} />
                          <span>点击上传第 1 个机位视频</span>
                          <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>MP4 / MOV，建议同一人不同角度</span>
                        </>
                      )}
                    </label>
                  )}

                  {cameraAngles.length > 0 && cameraAngles.length < 4 && (
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8,
                      border: '1px dashed var(--primary)', cursor: 'pointer',
                      fontSize: 12, color: 'var(--primary)', fontWeight: 500,
                    }}>
                      <input
                        type="file"
                        accept="video/*"
                        style={{ display: 'none' }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCameraUpload(f); e.target.value = ''; }}
                        disabled={cameraUploading}
                      />
                      <Plus size={13} />
                      {cameraUploading ? '上传中...' : `添加机位 ${cameraAngles.length + 1}（可选）`}
                    </label>
                  )}

                  {cameraAngles.length >= 2 && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)', marginBottom: 6 }}>机位分配策略</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(['semantic', 'round_robin'] as CameraStrategy[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => setCameraStrategy(s)}
                            style={{
                              flex: 1, padding: '5px 8px', borderRadius: 6, border: `1px solid ${cameraStrategy === s ? 'var(--primary)' : 'var(--border2)'}`,
                              background: cameraStrategy === s ? 'var(--primary-dim)' : 'transparent',
                              color: cameraStrategy === s ? 'var(--primary)' : 'var(--text2)',
                              fontSize: 11, fontWeight: 500, cursor: 'pointer',
                            }}
                          >
                            {s === 'semantic' ? '语义感知' : '均匀轮换'}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                        {cameraStrategy === 'semantic'
                          ? '长句自动分配特写机位，短句分配全景机位'
                          : '各机位均匀分配'}
                      </div>

                      {/* 机位衔接模式 */}
                      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)' }}>机位衔接模式</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {([['crossfade', '淡入淡出'], ['none', '直接切换']] as const).map(([v, label]) => (
                            <button
                              key={v}
                              onClick={() => setForm((f) => ({ ...f, camera_transition: v as CameraTransition }))}
                              style={{
                                flex: 1, padding: '5px 8px', borderRadius: 6,
                                border: `1px solid ${form.camera_transition === v ? 'var(--primary)' : 'var(--border2)'}`,
                                background: form.camera_transition === v ? 'var(--primary-dim)' : 'transparent',
                                color: form.camera_transition === v ? 'var(--primary)' : 'var(--text2)',
                                fontSize: 11, fontWeight: 500, cursor: 'pointer',
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                          {form.camera_transition === 'crossfade'
                            ? '相邻片段使用 0.5s 淡入淡出过渡，画面更自然'
                            : '片段直接切换，速度更快'}
                        </div>
                        {form.camera_transition === 'crossfade' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>过渡时长：{form.xfade_duration.toFixed(1)}s</span>
                            <input
                              type="range" min={0.1} max={2.0} step={0.1}
                              value={form.xfade_duration}
                              onChange={(e) => setForm((f) => ({ ...f, xfade_duration: Number(e.target.value) }))}
                              style={{ flex: 1, height: 4, accentColor: 'var(--primary)', cursor: 'pointer' }}
                            />
                          </div>
                        )}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '4px 0' }}>
                  关闭多机位模式，使用单机位合成
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        {/* ── COL 2: Voice Config ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionCard accentLine="primary">
            <SectionTitle icon={<Wand2 size={13} />}>语音配置</SectionTitle>
            <div style={{ padding: 10 }}>
              <div style={{ marginBottom: 8 }}>
                <PillTabs tabs={TTS_MODE_TABS} value={form.tts_mode} onChange={(id) => setForm((f) => ({ ...f, tts_mode: id as typeof f.tts_mode }))} />
              </div>

              {/* Speaker Grid */}
              {form.tts_mode === 'custom_voice' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)', display: 'block' }}>选择音色</span>
                    <span style={{ fontSize: 10, color: 'var(--text3)' }}>点击选中，▶ 试听</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {speakers.map((s, i) => {
                      const selected = form.speaker === s.id;
                      const isPlaying = playingSpeaker === s.id;
                      return (
                        <div key={s.id} style={{ position: 'relative' }}>
                          <button
                            onClick={() => setForm((f) => ({ ...f, speaker: s.id }))}
                            style={{
                              width: '100%', padding: '8px 4px',
                              borderRadius: 8, border: `1px solid ${selected ? 'var(--primary)' : 'var(--border2)'}`,
                              background: selected ? 'var(--primary-dim)' : 'var(--surface2)',
                              cursor: 'pointer', transition: 'all 0.15s',
                              fontFamily: 'var(--font)', textAlign: 'center',
                              outline: 'none', boxShadow: selected ? '0 0 0 2px var(--primary-dim)' : 'none',
                            }}
                            onMouseEnter={(e) => { if (!selected) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-dim)'; } }}
                            onMouseLeave={(e) => { if (!selected) { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface2)'; } }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                              <AvatarCircle letter={SPEAKER_LETTERS[i % 8]} index={i} size={30} />
                            </div>
                            <div style={{ fontSize: 10, fontWeight: selected ? 700 : 500, color: selected ? 'var(--primary)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSpeakerPreview(s.id); }}
                            style={{
                              position: 'absolute', top: 4, right: 4,
                              width: 20, height: 20, borderRadius: '50%',
                              background: isPlaying ? 'var(--primary)' : 'rgba(0,0,0,0.5)',
                              backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.2)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: isPlaying ? '#0a1a14' : '#fff', fontSize: 0, transition: 'all 0.2s', zIndex: 2,
                            }}
                          >
                            {isPlaying ? <Pause size={9} /> : <Play size={9} fill="#fff" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Voice Clone */}
              {form.tts_mode === 'voice_clone' && (
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <FieldLabel>参考文本（可选）</FieldLabel>
                    <TextInput value={form.ref_text} onChange={(e) => setForm((f) => ({ ...f, ref_text: e.target.value }))} placeholder="填写则使用 ICL 模式" />
                    <HintText>填写参考文本后，模型会参考该文本生成对应音频风格</HintText>
                  </div>
                  <FieldLabel>参考音频</FieldLabel>
                  {refAudioFile ? (
                    <FileBadge
                      name={refAudioFile.name} size={refAudioFile.size} icon={<Mic size={11} />}
                      onRemove={() => { setRefAudioFile(null); setForm((f) => ({ ...f, ref_audio_filename: '' })); }}
                    />
                  ) : (
                    <UploadArea
                      icon={<Volume2 size={22} />}
                      title="点击上传参考音频"
                      hint="WAV / MP3，建议 5-30 秒"
                      onFile={handleRefAudioUpload}
                      accept="audio/*"
                      isUploading={uploading}
                    />
                  )}
                </div>
              )}

              {/* Voice Design */}
              {form.tts_mode === 'voice_design' && (
                <div>
                  <FieldLabel>音色描述</FieldLabel>
                  <TextInput value={form.instruct} onChange={(e) => setForm((f) => ({ ...f, instruct: e.target.value }))} placeholder="如：甜美的萝莉音，语速稍快" />
                  <HintText>通过自然语言描述想要的音色，AI 自动生成定制音色</HintText>
                </div>
              )}

              {/* Voice Parameters */}
              <div style={{ marginTop: 10, padding: '10px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Volume2 size={11} /> 语音参数调节
                </div>
                {[
                  { key: 'speed' as const, label: '语速', min: 0.5, max: 2.0, step: 0.05, fmt: (v: number) => `${v.toFixed(2)}x`, default: 1.0 },
                  { key: 'pitch' as const, label: '音调', min: -12, max: 12, step: 1, fmt: (v: number) => v > 0 ? `+${v}半音` : v < 0 ? `${v}半音` : '标准', default: 0 },
                  { key: 'volume' as const, label: '音量', min: 0.0, max: 2.0, step: 0.05, fmt: (v: number) => `${Math.round(v * 100)}%`, default: 1.0 },
                ].map((param) => {
                  const key = param.key as keyof FormShape;
                  const val = form[key] as number;
                  const isModified = Math.abs(val - param.default) > 0.001;
                  return (
                    <div key={key} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontSize: 10, color: 'var(--text3)' }}>{param.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: isModified ? 'var(--primary)' : 'var(--text3)' }}>{param.fmt(val)}</span>
                      </div>
                      <input
                        type="range"
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        value={val}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
                        onDoubleClick={() => setForm((f) => ({ ...f, [key]: param.default }))}
                        style={{ width: '100%', height: 4, accentColor: 'var(--primary)', cursor: 'pointer' }}
                        title="双击恢复默认"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Tip */}
              <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(99, 102, 241, 0.06)', border: '1px solid rgba(99, 102, 241, 0.15)', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <Lightbulb size={12} style={{ color: '#6366f1', flexShrink: 0, marginTop: 1 }} />
                <p key={activeTip} style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.4, margin: 0, animation: 'fadeInTip 0.4s ease' }}>
                  {TIPS[form.tts_mode][activeTip]}
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Output Settings */}
          <SectionCard>
            <SectionTitle icon={<Layers size={13} />}>输出设置</SectionTitle>
            <div style={{ padding: 10 }}>
              <FieldLabel>输出质量</FieldLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
                {QUALITY_OPTIONS.map((q) => {
                  const selected = form.quality === q.id;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setForm((f) => ({ ...f, quality: q.id }))}
                      style={{
                        padding: '8px 6px', borderRadius: 8,
                        border: `1px solid ${selected ? 'var(--primary)' : 'var(--border2)'}`,
                        background: selected ? 'var(--primary-dim)' : 'var(--surface2)',
                        cursor: 'pointer', transition: 'all 0.2s',
                        fontFamily: 'var(--font)', textAlign: 'center', outline: 'none',
                        boxShadow: selected ? '0 0 0 2px var(--primary-dim)' : 'none',
                      }}
                      onMouseEnter={(e) => { if (!selected) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-dim)'; } }}
                      onMouseLeave={(e) => { if (!selected) { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface2)'; } }}
                    >
                      <div style={{ fontSize: 16, marginBottom: 2 }}>{q.icon}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: selected ? 'var(--primary)' : 'var(--text)', marginBottom: 1 }}>{q.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{q.desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* Time estimate */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 8, border: '1px solid var(--border)' }}>
                <Clock size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>
                  预计耗时：<strong style={{ color: 'var(--primary)' }}>
                    {form.quality === 'Fast' ? '1-2分钟' : form.quality === 'Improved' ? '3-5分钟' : '5-10分钟'}
                  </strong>
                </span>
              </div>

              {/* Advanced Toggle */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{
                  background: 'none', border: 'none', color: 'var(--text3)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 0', transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text3)'; }}
              >
                <Settings size={11} />
                {showAdvanced ? '收起' : '展开'}高级设置
                {showAdvanced ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>

              {showAdvanced && (
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 10, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div>
                    <FieldLabel>Wav2Lip</FieldLabel>
                    <SelectInput value={form.wav2lip_version} onChange={(e) => setForm((f) => ({ ...f, wav2lip_version: e.target.value as Wav2LipVersion }))}>
                      <option value="Wav2Lip_GAN">Wav2Lip_GAN</option>
                      <option value="Wav2Lip">Wav2Lip</option>
                    </SelectInput>
                  </div>
                  <div>
                    <FieldLabel>输出高度 px</FieldLabel>
                    <TextInput type="number" value={form.out_height} onChange={(e) => setForm((f) => ({ ...f, out_height: Number(e.target.value) }))} min={240} max={1080} />
                  </div>
                  {([['蒙版膨胀', 'mask_dilation' as const], ['蒙版羽化', 'mask_feathering' as const], ['上边距', 'pads_top' as const], ['下边距', 'pads_bottom' as const]] as const).map(([label, key]) => (
                    <div key={key}>
                      <FieldLabel>{label}</FieldLabel>
                      <TextInput type="number" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))} />
                    </div>
                  ))}

                  {/* View/Expression Controls */}
                  <div style={{ gridColumn: '1 / -1', marginTop: 4, padding: '8px', background: 'rgba(99,102,241,0.06)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.15)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M2 12h2M20 12h2M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41M12 2v2M12 20v2"/></svg>
                        视角与表情
                      </span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <span style={{ fontSize: 10, color: 'var(--text3)' }}>启用</span>
                        <div
                          onClick={() => setForm((f) => ({ ...f, enable_view: !f.enable_view }))}
                          style={{
                            width: 32, height: 18, borderRadius: 9,
                            background: form.enable_view ? 'linear-gradient(135deg, #6366f1, #818cf8)' : 'var(--surface3)',
                            border: `1px solid ${form.enable_view ? '#6366f1' : 'var(--border2)'}`,
                            position: 'relative', transition: 'all 0.2s', cursor: 'pointer',
                            boxShadow: form.enable_view ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
                          }}
                        >
                          <div style={{
                            width: 12, height: 12, borderRadius: '50%',
                            background: '#fff',
                            position: 'absolute', top: 2, left: form.enable_view ? 16 : 2,
                            transition: 'left 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          }} />
                        </div>
                      </label>
                    </div>

                    {form.enable_view && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <FieldLabel>视角动画</FieldLabel>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                            {([
                              { id: 'static', label: '静止' },
                              { id: 'gentle_sway', label: '摇摆' },
                              { id: 'nodding', label: '点头' },
                              { id: 'look_around', label: '环顾' },
                            ] as const).map((opt) => {
                              const sel = form.view_animation === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  onClick={() => setForm((f) => ({ ...f, view_animation: opt.id as ViewAnimation }))}
                                  style={{
                                    padding: '5px 4px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                    border: `1px solid ${sel ? '#6366f1' : 'var(--border2)'}`,
                                    background: sel ? 'rgba(99,102,241,0.15)' : 'var(--surface3)',
                                    color: sel ? '#6366f1' : 'var(--text2)',
                                    cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                                  }}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Head rotation sliders */}
                        {([
                          { key: 'view_head_rotation_y' as const, label: '左右摇头', min: -1, max: 1, step: 0.05, fmt: (v: number) => v === 0 ? '居中' : (v > 0 ? `右${Math.abs(Math.round(v * 100))}%` : `左${Math.abs(Math.round(v * 100))}%`) },
                          { key: 'view_head_rotation_x' as const, label: '上下点头', min: -1, max: 1, step: 0.05, fmt: (v: number) => v === 0 ? '居中' : (v > 0 ? `下${Math.abs(Math.round(v * 100))}%` : `上${Math.abs(Math.round(v * 100))}%`) },
                          { key: 'view_head_rotation_z' as const, label: '侧头倾斜', min: -1, max: 1, step: 0.05, fmt: (v: number) => v === 0 ? '正中' : (v > 0 ? `右倾${Math.abs(Math.round(v * 100))}%` : `左倾${Math.abs(Math.round(v * 100))}%`) },
                        ] as const).map((param) => {
                          const val = form[param.key];
                          const isModified = Math.abs(val) > 0.001;
                          return (
                            <div key={param.key}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ fontSize: 10, color: 'var(--text3)' }}>{param.label}</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: isModified ? '#6366f1' : 'var(--text3)' }}>{param.fmt(val)}</span>
                              </div>
                              <input
                                type="range" min={param.min} max={param.max} step={param.step}
                                value={val}
                                onChange={(e) => setForm((f) => ({ ...f, [param.key]: Number(e.target.value) }))}
                                onDoubleClick={() => setForm((f) => ({ ...f, [param.key]: 0 }))}
                                style={{ width: '100%', height: 4, accentColor: '#6366f1', cursor: 'pointer' }}
                                title="双击归零"
                              />
                            </div>
                          );
                        })}

                        {/* Blink & Expression */}
                        {([
                          { key: 'view_blink_frequency' as const, label: '眨眼频率', min: 0, max: 1, step: 0.05, fmt: (v: number) => v === 0 ? '关闭' : `${Math.round(v * 100)}%` },
                          { key: 'view_expression_strength' as const, label: '表情强度', min: 0, max: 1, step: 0.05, fmt: (v: number) => `${Math.round(v * 100)}%` },
                        ] as const).map((param) => {
                          const val = form[param.key];
                          const isModified = Math.abs(val - 0.5) > 0.001;
                          return (
                            <div key={param.key}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ fontSize: 10, color: 'var(--text3)' }}>{param.label}</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: isModified ? '#6366f1' : 'var(--text3)' }}>{param.fmt(val)}</span>
                              </div>
                              <input
                                type="range" min={param.min} max={param.max} step={param.step}
                                value={val}
                                onChange={(e) => setForm((f) => ({ ...f, [param.key]: Number(e.target.value) }))}
                                onDoubleClick={() => setForm((f) => ({ ...f, [param.key]: 0.5 }))}
                                style={{ width: '100%', height: 4, accentColor: '#6366f1', cursor: 'pointer' }}
                                title="双击恢复50%"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        {/* ── COL 3: Sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Current Config */}
          <SectionCard accentLine="accent">
            <SectionTitle icon={<Star size={13} />}>当前配置</SectionTitle>
            <div style={{ padding: 10 }}>
              {[
                { label: '合成模式', value: form.tts_mode === 'custom_voice' ? '选择音色' : form.tts_mode === 'voice_clone' ? '声音克隆' : '声音设计' },
                { label: '输出质量', value: QUALITY_OPTIONS.find(q => q.id === form.quality)?.name || form.quality },
                { label: '预计时长', value: duration },
                { label: '文本字数', value: `${charCount} 字` },
                { label: '人脸视频', value: faceFile ? '已上传' : '未上传', status: faceFile ? 'ok' : 'warn' },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text3)' }}>{item.label}</span>
                  <span style={{ fontWeight: 600, color: item.status === 'ok' ? 'var(--success)' : item.status === 'warn' ? 'var(--warning)' : 'var(--text)' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Recent Works */}
          {recentJobs.length > 0 && (
            <SectionCard>
              <SectionTitle icon={<Clock size={13} />}>最近作品</SectionTitle>
              <div style={{ padding: 8 }}>
                {recentJobs.slice(0, 3).map((job) => (
                  <div
                    key={job.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                      background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)',
                      cursor: 'pointer', transition: 'all 0.2s', marginBottom: 6,
                    }}
                    onClick={() => navigate('/history')}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-dim)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface2)'; }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--surface3)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {job.video_filename ? (
                        <img src={`/api/files/${job.video_filename}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <FileVideo size={14} style={{ color: 'var(--text3)' }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name || '未命名作品'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{formatDate(job.created_at ?? 0)}</div>
                    </div>
                    <CheckCircle size={11} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Tips */}
          <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 'var(--radius)', padding: '10px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Lightbulb size={12} style={{ color: '#6366f1' }} /> 创作技巧
            </div>
            {['建议使用正面人脸视频', '音频建议控制在30秒内', '背景简洁效果更佳'].map((tip, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 10, color: 'var(--text2)', lineHeight: 1.4, marginBottom: 4 }}>
                <span style={{ color: 'var(--primary)', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                {tip}
              </div>
            ))}
          </div>

          {/* Shortcut hint */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 10, color: 'var(--text3)' }}>
            <kbd style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontFamily: 'monospace', color: 'var(--text2)' }}>Ctrl</kbd>
            +
            <kbd style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontFamily: 'monospace', color: 'var(--text2)' }}>Enter</kbd>
            <span style={{ marginLeft: 2 }}>快速生成</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--error)', borderRadius: 8, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--error)', boxShadow: 'var(--shadow)' }}>
          <XCircle size={13} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* Generate Button */}
      <div style={{ position: 'sticky', bottom: 16, display: 'flex', justifyContent: 'flex-end', marginTop: 10, pointerEvents: 'auto' }}>
        <button
          className="btn btn-primary"
          onClick={startPipeline}
          disabled={!form.text.trim() || polling || uploading || (useMultiCamera ? cameraAngles.length < 2 : !form.face_filename)}
          style={{
            padding: '11px 24px', fontSize: 13, fontWeight: 700,
            borderRadius: 10, boxShadow: '0 4px 20px rgba(0, 212, 170, 0.3), 0 0 0 1px rgba(0, 212, 170, 0.1)',
            gap: 6,
          }}
          onMouseEnter={(e) => {
            if (!(!(form.face_filename || form.text.trim()) || polling || uploading)) {
              e.currentTarget.style.boxShadow = '0 6px 28px rgba(0, 212, 170, 0.45)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 212, 170, 0.3)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) startPipeline();
          }}
        >
          {uploading || polling ? (
            <><Loader size={14} className="spin" />{polling ? '生成中...' : '上传中...'}</>
          ) : (
            <><Sparkles size={14} />开始生成</>
          )}
        </button>
      </div>

      {/* Content Library Browser Modal */}
      {showContentBrowser && (
        <div className="cms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowContentBrowser(false); }}>
          <div className="cms-modal" style={{ maxWidth: 680 }}>
            <div className="cms-modal-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>选择讲解内容</span>
              <button
                onClick={() => setShowContentBrowser(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
              >×</button>
            </div>

            {/* Filter bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <input
                className="cms-search"
                style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '7px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', minWidth: 160 }}
                placeholder="搜索内容标题..."
                value={cmsFilter}
                onChange={(e) => setCmsFilter(e.target.value)}
              />
              <select
                className="cms-select"
                style={{ minWidth: 120 }}
                value={cmsSelectedExhibit}
                onChange={(e) => setCmsSelectedExhibit(e.target.value)}
              >
                <option value="">全部展品</option>
                {cmsExhibits.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
              </select>
            </div>

            {/* Content list */}
            <div style={{ maxHeight: 400, overflowY: 'auto', marginBottom: 16 }}>
              {cmsContents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)', fontSize: 13 }}>
                  {cmsLoading ? '加载中...' : '暂无内容，请先在内容管理中添加'}
                </div>
              ) : (
                cmsContents.map((ct) => {
                  const exhibit = cmsExhibits.find((e) => e.id === ct.exhibit_id);
                  return (
                    <div
                      key={ct.id}
                      onClick={() => {
                        setForm((f) => ({ ...f, text: ct.body, name: ct.title, contentId: ct.id }));
                        setShowTemplates(false);
                        setShowContentBrowser(false);
                      }}
                      style={{
                        padding: '12px 14px',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface2)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{ct.title}</span>
                        <span className={`cms-badge cms-badge-${ct.status}`}>{ct.status === 'published' ? '已发布' : ct.status}</span>
                        {exhibit && (
                          <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--surface3)', padding: '2px 6px', borderRadius: 8 }}>
                            {exhibit.name}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {ct.body}
                      </p>
                    </div>
                  );
                })
              )}
            </div>

            <div className="cms-modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowContentBrowser(false)}>关闭</button>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/cms/contents/new')}>
                + 新建内容
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes fadeInTip { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
