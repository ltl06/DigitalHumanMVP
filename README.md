# 境语智导 - Digital Human MVP

**境语智导** 是一个 AI 数字人视频生成平台，基于 Qwen3-TTS 语音合成 + Easy-Wav2Lip 唇形同步 + 视角表情引擎，实现文本驱动的数字人视频一键合成。支持单机位和多机位两种合成模式，适用于展厅导览、教育培训、活动推广等场景。

---

## 系统架构

```
DigitalHumanMVP/
├── backend/                  # FastAPI 后端服务
│   ├── main.py              # 主应用入口
│   ├── core/config.py       # 配置加载与校验
│   ├── db.py                # SQLite 任务持久化
│   ├── cms.py               # CMS 内容管理 API
│   ├── sync.py              # 离线数据同步 API
│   ├── network.py           # 网络状态监控
│   ├── ws_manager.py        # WebSocket 连接管理
│   ├── engines/             # AI 引擎封装
│   │   └── __init__.py
│   ├── gfpgan/              # 人脸增强模型
│   ├── uploads/             # 上传文件目录
│   └── outputs/             # 生成文件目录
└── frontend/                # React + Vite 前端
    └── src/
        ├── pages/
        │   ├── DashboardPage.tsx    # 首页仪表盘
        │   ├── PipelinePage.tsx     # 数字人创作页
        │   ├── HistoryPage.tsx      # 历史记录页
        │   ├── TerminalPage.tsx     # 终端展示页（二维码导览）
        │   ├── TerminalSettings.tsx # 终端设置页
        │   ├── CMS/                 # CMS 内容管理模块
        │   │   ├── CmsDashboard.tsx
        │   │   ├── ExhibitList.tsx
        │   │   ├── ExhibitDetail.tsx
        │   │   ├── ContentList.tsx
        │   │   ├── ContentEditor.tsx
        │   │   └── VersionHistory.tsx
        │   └── analytics/          # 数据分析模块
        │       ├── AnalyticsPage.tsx
        │       └── InteractionLog.tsx
        └── api/
            ├── client.ts    # 核心 API 客户端
            └── cms.ts       # CMS API 客户端
```

---

## 快速启动

### 环境要求

- **Python**: 3.10+
- **Node.js**: 18+
- **GPU**: NVIDIA GPU（推荐 RTX 3060 以上，Wav2Lip 需要 CUDA）
- **系统**: Windows / Linux
- **依赖**: ffmpeg（需加入 PATH）

### 1. 配置模型路径

在 `backend/` 同级目录创建 `config.yaml`：

```yaml
QWEN_TTS_ROOT: "D:/hecheng/QwenTTS_Fn2"       # Qwen3-TTS 模型根目录
QWEN_MODEL_CUSTOM_VOICE: ""                   # 自定义音色模型路径（可选）
QWEN_MODEL_BASE: ""                           # 基础模型路径（可选）
QWEN_MODEL_VOICE_DESIGN: ""                   # 声音设计模型路径（可选）

WAV2LIP_ROOT: "D:/hecheng/Easy-Wav2Lip"      # Easy-Wav2Lip 根目录

API_HOST: "0.0.0.0"
API_PORT: 8000
```

> **Qwen3-TTS 目录结构要求**：需包含 `WPy64-312101/python/python.exe` 可执行文件。
>
> **Easy-Wav2Lip 目录结构要求**：需包含 `checkpoints/Wav2Lip_GAN.pth`、`checkpoints/mobilenet.pth`、`checkpoints/shape_predictor_68_face_landmarks.dat`。

### 1.1 模型文件下载

本项目依赖以下模型，首次运行前需下载：

#### Wav2Lip 模型

| 文件 | 说明 | 下载地址 |
|------|------|---------|
| `Wav2Lip_GAN.pth` | GAN 版权重（推荐） | [百度网盘](https://github.com/Rudrabha/Wav2Lip#usage) / [Google Drive](https://drive.google.com/file/d/1L0JbiVLFHw5ZqFXL3/A/view) |
| `Wav2Lip.pth` | 原始版权重 | [百度网盘](https://github.com/Rudrabha/Wav2Lip#usage) / [Google Drive](https://drive.google.com/file/d/1L0JbiVLFHw5ZqFXL3/A/view) |
| `mobilenet.pth` | 人脸检测器 | 同上网盘链接 |
| `shape_predictor_68_face_landmarks.dat` | 68 点人脸关键点 | [dlib-models](https://github.com/AKSHAYUBHAT/dlib-models/raw/master/shape_predictor_68_face_landmarks.dat) |

将上述文件放入 `Easy-Wav2Lip/checkpoints/` 目录。

#### GFPGAN 人脸增强模型

| 文件 | 说明 | 下载地址 |
|------|------|---------|
| `GFPGANv1.4.pth` | GFPGAN 人脸修复权重 | [TencentARC/GFPGAN](https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth) |

将 `GFPGANv1.4.pth` 放入 `Easy-Wav2Lip/gfpgan/` 目录。

#### Qwen3-TTS 模型

| 模型 | 说明 | 大小 | 下载地址 |
|------|------|------|---------|
| Qwen3-TTS-12Hz-0.6B-CustomVoice | 自定义音色模型（默认） | ~2GB | HuggingFace: `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice` |
| Qwen3-TTS-12Hz-0.6B-Base | 基础模型 | ~2GB | HuggingFace: `Qwen/Qwen3-TTS-12Hz-0.6B-Base` |
| Qwen3-TTS-12Hz-1.7B-CustomVoice | 大尺寸自定义音色 | ~6GB | [ModelScope](https://www.modelscope.cn/models) |

将下载的模型放入 `QwenTTS_Fn2/models/` 目录，目录结构如下：

```
QwenTTS_Fn2/
└── models/
    ├── Qwen3-TTS-12Hz-0.6B-CustomVoice/
    ├── Qwen3-TTS-12Hz-0.6B-Base/
    └── ...
```

### 2. 启动后端服务

```bash
cd DigitalHumanMVP/backend
pip install -r requirements.txt
python main.py
# 或使用 uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

后端启动后自动：
- 初始化 SQLite 数据库（`history.db`）
- 校验模型文件完整性
- 预生成 9 种音色预览音频（后台异步）
- 启动网络监控线程

### 3. 启动前端开发服务器

```bash
cd DigitalHumanMVP/frontend
npm install
npm run dev
# 访问 http://localhost:3000
```

### 4. 生产环境构建

```bash
# 前端构建
cd frontend
npm run build    # 输出到 dist/

# 使用 Nginx 托管前端，代理 /api/* 到后端
```

---

## 功能模块详解

### 一、数字人合成（Pipeline）

**单次合成流程**：

```
文本输入 → TTS语音合成 → 视角表情处理(可选) → Wav2Lip唇形同步 → 视频输出
```

| 参数类别 | 参数名 | 说明 | 默认值 |
|---------|--------|------|--------|
| 文本 | `text` | 合成文本，最大 10000 字 | 必填 |
| | `language` | 语言（Auto / Chinese / English / Japanese 等 11 种） | Auto |
| | `instruct` | 风格提示，如"开心的语气" | "" |
| 语音 | `tts_mode` | 合成模式：`custom_voice` / `voice_clone` / `voice_design` | custom_voice |
| | `speaker` | 音色选择（Vivian/Serena/Uncle_Fu/Dylan/Eric/Ryan/Aiden/Ono_Anna/Sohee） | Vivian |
| | `ref_audio_filename` | 克隆参考音频（voice_clone 模式） | "" |
| | `speed` | 语速 0.5x ~ 2.0x | 1.0 |
| | `pitch` | 音调 -12 ~ +12 半音 | 0 |
| | `volume` | 音量 0% ~ 200% | 100% |
| 人脸 | `face_filename` | 上传的人脸视频文件名 | 必填 |
| | `quality` | 输出质量：Fast / Improved / Enhanced | Enhanced |
| | `out_height` | 输出高度 px（240~3840） | 480 |
| | `pads_top/bottom/left/right` | 人脸位置微调边距 | 0/10/0/0 |
| | `mask_dilation` | 蒙版膨胀 0~20 | 2.5 |
| | `mask_feathering` | 蒙版羽化 0~20 | 2.0 |
| | `wav2lip_version` | Wav2Lip / Wav2Lip_GAN | Wav2Lip_GAN |
| 视角表情 | `enable_view` | 是否启用视角表情 | false |
| | `view_animation` | 动画类型：static / gentle_sway / nodding / look_around | static |
| | `view_head_rotation_x/y/z` | 头部旋转（-1.0 ~ 1.0） | 0 |
| | `view_blink_frequency` | 眨眼频率 0~1 | 0.5 |
| | `view_expression_strength` | 表情强度 0~1 | 0.5 |

**多机位合成流程**：

```
文本分句 → 语义/轮询机位分配 → 并行 TTS + Wav2Lip → ffmpeg 合并
```

- 支持最多 4 个机位视频
- 分配策略：`semantic`（长句→特写，短句→全景）或 `round_robin`（均匀轮换）
- 长句阈值：>15 字自动标记为重要

### 二、TTS 语音合成

三种模式：

| 模式 | 说明 | 输入 |
|------|------|------|
| `custom_voice` | 从 9 种预置音色中选择 | speaker_id |
| `voice_clone` | 上传 5~30 秒参考音频克隆音色 | ref_audio_filename |
| `voice_design` | 自然语言描述音色特征 | instruct 文本描述 |

**预置音色列表**：

| ID | 名称 | 描述 | 预览文本 |
|----|------|------|----------|
| Vivian | Vivian | 甜美女声 | 您好，很高兴为您服务。 |
| Serena | Serena | 知性女声 | 欢迎了解我们的产品。 |
| Uncle_Fu | Uncle_Fu | 福叔声线 | 老少爷们儿，今儿给您说段儿。 |
| Dylan | Dylan | 京片子男生 | 嘿，哥们儿，这事儿真逗。 |
| Eric | Eric | 四川方言 | 安逸得很，巴适得板。 |
| Ryan | Ryan | 磁性男声 | Hello, welcome to our platform. |
| Aiden | Aiden | 英文男声 | Welcome to the digital world. |
| Ono_Anna | Ono_Anna | 日文女声 | こんにちは、ようこそ。 |
| Sohee | Sohee | 韩文女声 | 안녕하세요, 환영합니다. |

### 三、唇形同步（Wav2Lip）

基于 Easy-Wav2Lip 实现人脸视频 + 音频的唇形精准同步。

- **GAN 版本**：Wav2Lip_GAN（默认，推荐，画质更好）
- **原始版本**：Wav2Lip（速度更快）

### 四、CMS 内容管理

完整的展品-内容管理模块：

- **展品管理**（Exhibit）：名称、编号、分类、数字人模型、讲解视频
- **内容管理**（Content）：标题、正文、多语言版本、状态（草稿/已发布/归档）
- **版本历史**：内容修改记录，支持版本回退
- **二维码导览**：每个展品生成独立二维码，扫码进入终端展示页
- **数据分析**：访问热度、语言分布、观看时长统计

### 五、终端展示页（Terminal）

扫码进入的全屏展示页面：

- 播放对应展品的讲解视频
- 支持多语言切换（成人/儿童/老年模式）
- 自动循环播放
- 互动数据上报（开始/暂停/完成）

### 六、实时推送

任务状态通过 **WebSocket** 和 **SSE** 两种方式实时推送：

```
/api/ws/{job_id}          # WebSocket
/api/sse/{job_id}         # SSE fallback（跨域友好）
```

推送消息格式：

```json
{
  "type": "job_update",
  "job_id": "abc123",
  "status": "processing",
  "step": "lipsync",
  "progress": 50,
  "message": "正在进行唇形同步..."
}
```

---

## API 参考

### 核心接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 系统健康状态 |
| GET | `/api/system/resources` | CPU/内存/磁盘/GPU 使用情况 |
| GET | `/api/system/models` | 模型配置状态 |
| GET | `/api/system/network-status` | 网络在线状态 |
| POST | `/api/files/upload/face` | 上传人脸视频/图片 |
| POST | `/api/files/upload/audio` | 上传音频文件 |
| POST | `/api/files/upload/clone-ref` | 上传克隆参考音频 |

### TTS 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tts/speakers` | 获取音色列表 |
| GET | `/api/tts/languages` | 获取支持的语言 |
| GET | `/api/tts/preview/{speaker_id}` | 生成音色预览音频 |
| POST | `/api/tts/custom-voice` | TTS 合成（音色模式） |
| POST | `/api/tts/voice-clone` | TTS 合成（克隆模式） |
| POST | `/api/tts/voice-design` | TTS 合成（设计模式） |
| GET | `/api/tts/status/{job_id}` | 查询 TTS 任务状态 |

### Pipeline 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/pipeline/run` | **一键合成**（核心接口） |
| GET | `/api/pipeline/status/{job_id}` | 查询合成任务状态 |
| POST | `/api/lipsync/process` | 唇形同步（独立调用） |
| GET | `/api/lipsync/status/{job_id}` | 查询唇形同步状态 |

### 历史记录接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/history` | 分页查询历史记录 |
| GET | `/api/history/stats` | 统计数据 |
| GET | `/api/history/{job_id}` | 任务详情 |
| PATCH | `/api/history/{job_id}` | 重命名任务 |
| DELETE | `/api/history/{job_id}` | 删除任务 |
| DELETE | `/api/history` | 清空历史 |

### CMS 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/cms/exhibits` | 展品列表 |
| POST | `/api/cms/exhibits` | 创建展品 |
| GET | `/api/cms/exhibits/{id}` | 展品详情 |
| PUT | `/api/cms/exhibits/{id}` | 更新展品 |
| DELETE | `/api/cms/exhibits/{id}` | 删除展品 |
| GET | `/api/cms/exhibits/{id}/qr-url` | 展品二维码 URL |
| GET | `/api/cms/contents` | 内容列表 |
| POST | `/api/cms/contents` | 创建内容 |
| GET | `/api/cms/contents/{id}` | 内容详情 |
| PUT | `/api/cms/contents/{id}` | 更新内容 |
| DELETE | `/api/cms/contents/{id}` | 删除内容 |
| GET | `/api/cms/contents/{id}/versions` | 版本历史 |
| POST | `/api/cms/contents/{id}/versions` | 保存内容版本 |
| GET | `/api/cms/analytics/summary` | 分析摘要 |
| GET | `/api/cms/analytics/trends` | 趋势数据 |
| GET | `/api/cms/analytics/hourly` | 分时数据 |
| POST | `/api/cms/analytics/track` | 上报互动事件 |
| POST | `/api/cms/sync/export` | 导出数据包 |
| POST | `/api/cms/sync/import` | 导入数据包 |
| POST | `/api/cms/demo` | 加载示例数据 |

### 文件服务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/files/{filename}` | 下载文件 |
| GET | `/api/files` | 列出所有文件 |
| GET | `/api/files/preview/{filename}` | 预览图片/音频 |
| DELETE | `/api/files/{filename}` | 删除文件 |

---

## 任务生命周期

```
idle → processing → completed
                   ↘ failed
```

**进度汇报阶段**（单机位）：

| 阶段 | progress 范围 | message 示例 |
|------|---------------|-------------|
| tts | 0% ~ 5% | 正在合成语音... |
| view | 25% ~ 45% | 正在处理视角与表情... |
| lipsync | 50% ~ 100% | 正在进行唇形同步... |
| done | 100% | 合成完成！ |

**多机位阶段**：

| 阶段 | progress 范围 | 说明 |
|------|---------------|------|
| planning | 0% ~ 2% | 分析文本结构与机位分配 |
| tts_lipsync | 5% ~ 85% | 并行处理片段 |
| compose | 90% ~ 95% | 合成多机位视频 |
| done | 100% | 合成完成 |

---

## 性能与限制

| 项目 | 限制 |
|------|------|
| 最大上传文件 | 500 MB |
| 最大文本长度 | 10,000 字 |
| 最大机位数 | 4 |
| 参考音频建议时长 | 5~30 秒 |
| 建议人脸视频分辨率 | 720p 以上 |
| 建议音频时长 | 30 秒以内 |

**生成时间估算**（RTX 3060 参考）：

| 质量模式 | 预计耗时 |
|---------|---------|
| Fast | 1~2 分钟 |
| Improved | 3~5 分钟 |
| Enhanced | 5~10 分钟 |

---

## 常见问题

### Q: 后端启动报错 "QWEN_TTS_ROOT 未配置"

检查 `config.yaml` 中 `QWEN_TTS_ROOT` 是否指向包含 `WPy64-312101/python/python.exe` 的目录。

### Q: TTS 预览音频不播放

预览音频在服务首次启动时异步生成，需等待 1~2 分钟。也可以手动调用 `/api/tts/preview/{speaker_id}` 触发生成。

### Q: Wav2Lip 报 "人脸检测失败"

确保上传的是正面人脸视频，避免侧脸、遮挡或多人画面。可调整 `pads_top/bottom/left/right` 参数覆盖人脸区域。

### Q: 显存不足（OOM）

- 降低 `out_height`（如设为 480）
- 使用 Fast 质量模式
- 减少视频时长
- 关闭其他占用 GPU 的程序

### Q: 多机位合成失败

- 确保所有机位视频都能正常播放
- 检查 `ffmpeg` 是否已安装并加入 PATH
- 确认机位视频不为空文件

---

## 目录结构

```
backend/
├── main.py                  # FastAPI 主入口
├── config.py                # 配置加载
├── db.py                    # SQLite 数据库
├── cms.py                   # CMS API 路由
├── sync.py                  # 离线同步 API
├── network.py               # 网络监控
├── ws_manager.py            # WebSocket 管理
├── lip_sync_adv.py          # 唇形同步高级封装
├── requirements.txt         # Python 依赖
├── core/
│   └── config.py            # 配置加载与校验
├── engines/                 # AI 引擎封装
├── gfpgan/                  # GFPGAN 人脸增强
├── uploads/                 # 上传文件
├── outputs/                 # 生成输出
│   ├── pipeline_audio_*.wav  # TTS 音频
│   ├── pipeline_video_*.mp4  # 最终视频
│   ├── pipeline_view_*.mp4  # 视角处理后视频
│   └── preview_*.wav        # 音色预览音频
└── history.db               # SQLite 任务数据库
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 前端路由 | React Router DOM v6 |
| 状态管理 | Zustand |
| UI 组件 | Lucide React 图标库 |
| 图表 | Recharts |
| 构建工具 | Vite 6 |
| 后端框架 | FastAPI |
| 异步任务 | BackgroundTasks |
| 实时通信 | WebSocket + SSE |
| 数据库 | SQLite |
| TTS 引擎 | Qwen3-TTS |
| 唇形同步 | Easy-Wav2Lip |
| 人脸增强 | GFPGAN |
| 视频处理 | FFmpeg |
