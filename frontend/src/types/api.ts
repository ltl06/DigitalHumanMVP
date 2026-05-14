export interface Speaker {
  id: string;
  name: string;
  desc: string;
}

export interface Language {
  id: string;
  name: string;
}

export interface FileInfo {
  name: string;
  size: number;
  type: string;
}

export type JobStatus = 'idle' | 'processing' | 'completed' | 'failed' | 'not_found' | string;

export interface Job {
  id: string;
  status: JobStatus;
  name?: string;
  job_type?: string;
  step?: string;
  progress?: number;
  message?: string;
  filename?: string;
  audio_filename?: string;
  video_filename?: string;
  result?: Record<string, unknown>;
  trace?: string;
  params?: Record<string, unknown>;
  created_at?: number;
  updated_at?: number;
  completed_at?: number | null;
  // Multi-camera
  timeline?: CameraSegment[];
  multi_camera?: boolean;
}

export type TTSMode = 'custom_voice' | 'voice_clone' | 'voice_design';
export type QualityMode = 'Fast' | 'Improved' | 'Enhanced';
export type Wav2LipVersion = 'Wav2Lip' | 'Wav2Lip_GAN';
export type ViewAnimation = 'static' | 'gentle_sway' | 'nodding' | 'look_around';
export type CameraStrategy = 'semantic' | 'round_robin';
export type CameraTransition = 'crossfade' | 'none';

export interface CameraAngle {
  id: string;
  name: string;
  filename: string;
}

export interface CameraSegment {
  cam_id: string;
  start_sec: number;
  end_sec: number;
  text: string;
}

export interface PipelineForm {
  name?: string;
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
  enable_view: boolean;
  view_head_rotation_x: number;
  view_head_rotation_y: number;
  view_head_rotation_z: number;
  view_blink_frequency: number;
  view_expression_strength: number;
  view_animation: ViewAnimation;
  use_multi_camera: boolean;
  camera_angles: CameraAngle[];
  camera_strategy: CameraStrategy;
  camera_transition: CameraTransition;
  xfade_duration: number;
}

export interface HealthStatus {
  status: string;
  upload_dir: string;
  output_dir: string;
  tts_ready: boolean;
  wav2lip_ready: boolean;
}

export interface HistoryResponse {
  records: Job[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface HistoryStats {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  week_count: number;
}

export interface FilesResponse {
  output: FileInfo[];
  upload: FileInfo[];
}

export interface UploadResult {
  filename: string;
  size: number;
}

export interface JobResponse {
  job_id: string;
  status: string;
  filename?: string;
}

export interface SpeakersResponse {
  speakers: Speaker[];
}

export interface LanguagesResponse {
  languages: Language[];
}

export interface JobStats {
  total: number;
  completed: number;
  failed: number;
  processing: number;
}

export interface FileUpload {
  name: string;
  size: number;
  url?: string;
}

export interface Template {
  label: string;
  text: string;
  icon: string;
  color: string;
}

export interface ModelInfo {
  name: string;
  path: string;
  exists: boolean;
  required: boolean;
}

export interface SystemModelsResponse {
  tts_root: string;
  wav2lip_root: string;
  models: ModelInfo[];
  upload_dir: string;
  output_dir: string;
}

// ─────────────────────────────────────────────────────────────────
// CMS Types
// ─────────────────────────────────────────────────────────────────

export type ContentStatus = 'draft' | 'published' | 'archived';

export interface Exhibit {
  id: string;
  name: string;
  code: string;
  description: string;
  category: string;
  digital_human_model: string;
  default_language: string;
  exhibit_video_filename: string;
  created_at: number;
  updated_at: number;
}

export interface Content {
  id: string;
  title: string;
  body: string;
  language: string;
  version: number;
  parent_id: string;
  exhibit_id: string;
  category: string;
  tags: string[];
  duration_sec: number;
  status: ContentStatus;
  video_filename: string;
  created_at: number;
  updated_at: number;
  published_at: number | null;
}

export interface ContentVersion {
  id: string;
  content_id: string;
  version: number;
  body: string;
  change_summary: string;
  created_at: number;
}

export interface Interaction {
  id: string;
  session_id: string;
  exhibit_id: string;
  content_id: string;
  event_type: string;
  duration_ms: number;
  metadata: Record<string, unknown>;
  device_id: string;
  created_at: number;
}

// ─────────────────────────────────────────────────────────────────
// Terminal Types
// ─────────────────────────────────────────────────────────────────

export type TerminalLanguage = 'zh-CN' | 'en-US' | 'child' | 'elderly';

export interface TerminalSession {
  session_id: string;
  device_id: string;
  language: TerminalLanguage;
  started_at: number;
}

export interface TerminalPlayerState {
  exhibit_id: string;
  content_id: string;
  video_url: string;
  audio_url: string;
  transcript: string;
  exhibit_name: string;
  exhibit_description: string;
  language: TerminalLanguage;
  auto_loop: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Analytics Types
// ─────────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  total_visits: number;
  popular_exhibits: { exhibit_id: string; count: number; name?: string }[];
  language_distribution: [string, number][];
  avg_watch_duration_ms: number;
}

export interface ContentPackage {
  manifest: {
    version: string;
    exported_at: number;
    exhibit_count: number;
    content_count: number;
  };
  exhibits: Exhibit[];
  contents: Content[];
  audio_files: string[];
  video_files: string[];
}

// CMS API Response shapes
export interface ExhibitsResponse {
  exhibits: Exhibit[];
  total: number;
}

export interface ContentsResponse {
  contents: Content[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface VersionsResponse {
  versions: ContentVersion[];
}

export interface SystemResources {
  cpu: { percent: number; count: number; count_logical: number };
  memory: { total_gb: number; used_gb: number; percent: number };
  disk: { total_gb: number; used_gb: number; percent: number };
  gpu: Array<{
    index: number; name: string; memory_used_mb: number;
    memory_total_mb: number; utilization_pct: number; temperature_c: number;
  }>;
}

export interface NetworkStatus {
  online: boolean;
  mode: string;
  last_check: number;
  last_online: number;
}

export interface DailyTrend {
  date: string;
  count: number;
}

export interface HourlyData {
  hour: number;
  count: number;
}
