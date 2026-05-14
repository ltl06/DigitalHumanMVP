"""
Expression & View Control Engine
Provides natural head pose, expression, and blink animation for digital human videos.
Uses dlib face landmark detection + Delaunay triangulation warping for realistic deformation.
"""

from __future__ import annotations

import os
import cv2
import numpy as np
import logging
from typing import Literal, Callable, Optional

_logger = logging.getLogger(__name__)

EASY_WAV2LIP_ROOT: str = ""

# ── dlib face landmark detector ──────────────────────────────
_dlib_predictor_path: str = ""
_face_detector: Optional[object] = None
_shape_predictor: Optional[object] = None
_dlib_init_failed: bool = False


def _find_dlib_model(wav2lip_root: str) -> str:
    """Auto-detect dlib shape predictor model file."""
    checkpoint_dir = os.path.join(wav2lip_root, "checkpoints")
    candidates = [
        "shape_predictor_68_face_landmarks_GTX.dat",
        "shape_predictor_68_face_landmarks.dat",
        "shape_predictor_68_face_landmarks.dat.bz2",
    ]
    for name in candidates:
        path = os.path.join(checkpoint_dir, name)
        if os.path.exists(path):
            return path
    return ""

# Pre-computed facial feature point indices (68-point model)
# Left eye: 36-41, Right eye: 42-47, Nose: 27-35, Mouth: 48-67
_LEFT_EYE_IDX = list(range(36, 42))
_RIGHT_EYE_IDX = list(range(42, 48))
_LEFT_BROW_IDX = list(range(17, 22))
_RIGHT_BROW_IDX = list(range(22, 27))
_NOSE_IDX = list(range(27, 36))
_OUTER_LIPS_IDX = [48, 54, 51, 63, 48, 62, 60, 67, 59, 55, 49, 53, 50, 52]


def configure(root: str):
    global EASY_WAV2LIP_ROOT, _dlib_predictor_path
    EASY_WAV2LIP_ROOT = root
    _dlib_predictor_path = _find_dlib_model(root)
    if _dlib_predictor_path:
        _logger.info(f"[ExpressionEngine] dlib model: {_dlib_predictor_path}")
    else:
        _logger.warning(f"[ExpressionEngine] dlib model not found in {root}/checkpoints/")
    _init_dlib()
    _logger.info(f"[ExpressionEngine] Configured with root: {root}")


def _init_dlib():
    global _face_detector, _shape_predictor, _dlib_init_failed
    # Auto-detect model path if not set
    global _dlib_predictor_path
    if not _dlib_predictor_path and EASY_WAV2LIP_ROOT:
        _dlib_predictor_path = _find_dlib_model(EASY_WAV2LIP_ROOT)
    if _face_detector is not None:
        return  # Already initialized
    if _dlib_init_failed:
        return  # Previous init failed, don't retry
    try:
        import dlib
        if not _dlib_predictor_path or not os.path.exists(_dlib_predictor_path):
            _logger.warning(f"[ExpressionEngine] dlib predictor not found at {_dlib_predictor_path}")
            _dlib_init_failed = True
            return
        _face_detector = dlib.get_frontal_face_detector()
        _shape_predictor = dlib.shape_predictor(_dlib_predictor_path)
        _logger.info(f"[ExpressionEngine] dlib loaded: {_dlib_predictor_path}")
    except Exception as e:
        _logger.warning(f"[ExpressionEngine] dlib init failed: {e}")
        _dlib_init_failed = True


def _detect_face_landmarks(image: np.ndarray) -> Optional[np.ndarray]:
    """Detect 68 facial landmarks. Returns (68, 2) array or None."""
    if _dlib_init_failed or _face_detector is None:
        return None
    import dlib

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    faces = _face_detector(gray, 0)
    if len(faces) == 0:
        return None

    shape = _shape_predictor(gray, faces[0])
    landmarks = np.array([(shape.part(i).x, shape.part(i).y) for i in range(68)], dtype=np.float32)
    return landmarks


def _warp_face_region(
    frame: np.ndarray,
    src_landmarks: np.ndarray,
    tgt_landmarks: np.ndarray,
) -> np.ndarray:
    """Warp face region from src_landmarks to tgt_landmarks using thin-plate spline."""
    h, w = frame.shape[:2]

    x_min, y_min = int(src_landmarks[:, 0].min()), int(src_landmarks[:, 1].min())
    x_max, y_max = int(src_landmarks[:, 0].max()), int(src_landmarks[:, 1].max())
    margin = 5
    x_min = max(0, x_min - margin)
    y_min = max(0, y_min - margin)
    x_max = min(w - 1, x_max + margin)
    y_max = min(h - 1, y_max + margin)
    face_w = x_max - x_min + 1
    face_h = y_max - y_min + 1
    face_roi = frame[y_min:y_max + 1, x_min:x_max + 1].copy()

    src_norm = src_landmarks.copy()
    src_norm[:, 0] -= x_min
    src_norm[:, 1] -= y_min
    tgt_norm = tgt_landmarks.copy()
    tgt_norm[:, 0] -= x_min
    tgt_norm[:, 1] -= y_min

    src_norm_safe = np.clip(src_norm, [0, 0], [face_w - 1, face_h - 1]).astype(np.float64)
    tgt_norm_safe = np.clip(tgt_norm, [0, 0], [face_w - 1, face_h - 1]).astype(np.float64)

    try:
        tps = cv2.createThinPlateSplineShapeTransformer()
        src_hm = src_norm_safe.reshape(1, -1, 2).astype(np.float32)
        tgt_hm = tgt_norm_safe.reshape(1, -1, 2).astype(np.float32)
        tps.estimateTransformation(src_hm, tgt_hm, [])
        warped_face = tps.warpImage(face_roi.astype(np.float32), borderMode=cv2.BORDER_REFLECT)
        warped_face = np.clip(warped_face, 0, 255).astype(np.uint8)
    except Exception:
        # Fallback: simple crop without warping
        warped_face = face_roi

    result = frame.copy()
    result[y_min:y_max + 1, x_min:x_max + 1] = warped_face
    return result


def _apply_natural_blink(
    frame: np.ndarray,
    landmarks: np.ndarray,
    strength: float,
) -> np.ndarray:
    """Apply natural eye blink by morphing eyelid landmarks."""
    if strength < 0.01:
        return frame

    result = frame.copy()

    # Left eye: corners (36,39) + top/bottom (37,38,40,41)
    left_eye_pts = landmarks[_LEFT_EYE_IDX]
    right_eye_pts = landmarks[_RIGHT_EYE_IDX]

    for eye_pts in [left_eye_pts, right_eye_pts]:
        eye_left = eye_pts[0].astype(int)
        eye_right = eye_pts[3].astype(int)
        eye_top = eye_pts[1].astype(int)
        eye_bottom = eye_pts[4].astype(int)

        eye_w = np.linalg.norm(eye_right.astype(float) - eye_left.astype(float))
        eye_h = np.linalg.norm(eye_bottom.astype(float) - eye_top.astype(float))
        if eye_w < 3 or eye_h < 3:
            continue

        mid_top = ((eye_pts[0] + eye_pts[1]) / 2 + (eye_pts[2] + eye_pts[1]) / 2) / 2
        mid_bottom = ((eye_pts[3] + eye_pts[4]) / 2 + (eye_pts[5] + eye_pts[4]) / 2) / 2

        top_y_new = mid_top[1] + (eye_bottom[1] - mid_top[1]) * strength
        bottom_y_new = mid_bottom[1] - (mid_bottom[1] - eye_top[1]) * strength

        pts = np.array([
            eye_left, eye_right,
            [eye_right[0], top_y_new],
            [eye_left[0], top_y_new],
        ], dtype=np.int32)

        overlay = result.copy()
        cv2.fillConvexPoly(overlay, pts, (0, 0, 0))
        cv2.addWeighted(overlay, 0.85, result, 0.15, 0, result)

    return result


def _apply_natural_head_rotation(
    frame: np.ndarray,
    landmarks: np.ndarray,
    yaw: float,
    pitch: float,
    roll: float,
) -> np.ndarray:
    """Apply natural head rotation using thin-plate spline on face landmarks."""
    center = landmarks.mean(axis=0)

    tgt_landmarks = landmarks.copy()
    # Yaw: left side moves opposite to right side (face turns)
    left_face = landmarks[:, 0] < center[0]
    right_face = landmarks[:, 0] >= center[0]
    tgt_landmarks[left_face, 0] += yaw * 10.0
    tgt_landmarks[right_face, 0] -= yaw * 10.0
    # Pitch: upper points move opposite to lower points (face nods)
    upper_face = landmarks[:, 1] < center[1]
    lower_face = landmarks[:, 1] >= center[1]
    tgt_landmarks[upper_face, 1] -= pitch * 8.0
    tgt_landmarks[lower_face, 1] += pitch * 8.0
    # Roll: diagonal shift based on position relative to center
    tgt_landmarks[:, 0] += roll * (landmarks[:, 1] - center[1]) * 0.06
    tgt_landmarks[:, 1] -= roll * (landmarks[:, 0] - center[0]) * 0.04

    return _warp_face_region(frame, landmarks, tgt_landmarks)


# ── Public API ───────────────────────────────────────────────

def process_video(
    face_path: str,
    output_path: str,
    head_rotation_x: float = 0.0,
    head_rotation_y: float = 0.0,
    head_rotation_z: float = 0.0,
    blink_frequency: float = 0.5,
    expression_strength: float = 0.5,
    view_animation: Literal["static", "gentle_sway", "nodding", "look_around"] = "static",
    progress_callback: Callable[[int, str], None] | None = None,
) -> dict:
    """Apply natural view/expression effects to a face video."""
    cap = cv2.VideoCapture(face_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()

    if total_frames == 0:
        raise ValueError("Video has no frames")

    if progress_callback:
        progress_callback(5, "Reading frames...")

    frames = _read_frames(face_path)
    n = len(frames)

    if progress_callback:
        progress_callback(15, f"Processing {n} frames with dlib landmarks...")

    processed = _apply_view_effects(
        frames,
        head_rotation_x, head_rotation_y, head_rotation_z,
        blink_frequency, expression_strength,
        view_animation,
        progress_callback=lambda p, m: progress_callback(15 + int(p * 0.7), m) if progress_callback else None,
    )

    if progress_callback:
        progress_callback(85, "Encoding output video...")

    _write_video(processed, output_path, fps, width, height)

    if progress_callback:
        progress_callback(100, "Done")

    return {
        "path": output_path,
        "size_bytes": os.path.getsize(output_path),
        "frame_count": n,
        "fps": fps,
    }


def _read_frames(video_path: str) -> list:
    cap = cv2.VideoCapture(video_path)
    frames = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frames.append(frame)
    cap.release()
    return frames


def _write_video(frames: list, output_path: str, fps: float, width: int, height: int):
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    for f in frames:
        out.write(f)
    out.release()


def _gauss(x: float, mu: float, sigma: float) -> float:
    """Gaussian PDF, peak=1 at x=mu."""
    if sigma <= 0:
        return 0.0
    return np.exp(-0.5 * ((x - mu) / sigma) ** 2)


def _blend_smile(
    frame: np.ndarray,
    landmarks: np.ndarray,
    strength: float,
) -> np.ndarray:
    """Subtly lift mouth corners for a natural smile via landmark warping."""
    if strength < 0.01:
        return frame

    # Mouth corners: 48 (left), 54 (right)
    # Outer upper lip: 51, 62, 63
    smile_landmarks = landmarks.copy()
    smile_landmarks[48] += np.array([-strength * 2.0, -strength * 1.5])
    smile_landmarks[54] += np.array([strength * 2.0, -strength * 1.5])
    smile_landmarks[51] += np.array([0.0, -strength * 0.8])
    smile_landmarks[62] += np.array([0.0, -strength * 0.8])
    smile_landmarks[63] += np.array([0.0, -strength * 0.5])

    return _warp_face_region(frame, landmarks, smile_landmarks)


def _apply_view_effects(
    frames: list,
    head_rotation_x: float,
    head_rotation_y: float,
    head_rotation_z: float,
    blink_frequency: float,
    expression_strength: float,
    view_animation: str,
    progress_callback: Callable[[int, str], None] | None = None,
) -> list:
    """Apply natural view/expression effects: subtle idle micro-movements + stochastic blinks.

    Design philosophy:
      - Idle micro-movements: independent slow oscillations (breathing, sway, drift)
        always present at low amplitude, scaled by expression_strength.
      - view_animation: directional bias that orients the head's resting direction,
        NOT a forced looping animation.
      - blink_frequency: Poisson-like stochastic blink rate.
      - expression_strength: master intensity knob for ALL motion effects.
    """
    n = len(frames)
    if n == 0:
        return frames

    output: list = []
    # ── Stochastic blink scheduler ─────────────────────────────
    # Expected blink interval in frames (blink_frequency 0→1 maps to 15→300 frames)
    mean_interval = int(300 - blink_frequency * 285)
    blink_interval_remaining = mean_interval // 2  # start blinking soon

    # Current blink state
    blink_current = 0.0          # current blink strength [0, expression_strength]
    blink_phase = 0             # 0=idle, 1=closing, 2=closed, 3=opening
    blink_closed_frames = 0     # hold-closed duration
    blink_start_frame = -999     # starting frame of current blink (for gauss offset)

    # Landmark cache: reuse detection results across nearby frames
    landmark_cache: dict[int, np.ndarray] = {}
    LANDMARK_CACHE_SIZE = 8

    # Progress reporting interval
    report_every = max(1, n // 20)

    for i, frame in enumerate(frames):
        if i % report_every == 0 and progress_callback:
            progress_callback(int(i / n * 100), f"Frame {i}/{n}")

        # ── Landmark detection (cached) ──────────────────────
        cache_key = i % LANDMARK_CACHE_SIZE
        if cache_key in landmark_cache:
            landmarks = landmark_cache[cache_key]
        else:
            lm = _detect_face_landmarks(frame)
            if lm is not None:
                landmarks = lm
                landmark_cache[cache_key] = lm
                if len(landmark_cache) > LANDMARK_CACHE_SIZE:
                    landmark_cache.pop(next(iter(landmark_cache)))
            else:
                landmarks = None

        # ── Head micro-movement ───────────────────────────────
        t_norm = i / max(n - 1, 1)
        sway_amp = expression_strength * 0.06
        breath_amp = expression_strength * 0.035
        drift_amp = expression_strength * 0.02
        micro_roll_amp = expression_strength * 0.025

        # Independent oscillators with incommensurable frequencies → never repeats
        sway = sway_amp * np.sin(t_norm * np.pi * 5.3)
        breath_y = breath_amp * np.sin(t_norm * np.pi * 2.7)
        drift_yaw = drift_amp * np.sin(t_norm * np.pi * 1.7 + 1.2)
        micro_roll = micro_roll_amp * np.sin(t_norm * np.pi * 3.9)

        # Directional bias from view_animation (gentle, not forced)
        if view_animation == "gentle_sway":
            bias_yaw = 0.03 + sway_amp * 0.3 * np.sin(t_norm * np.pi * 2)
            bias_pitch = 0.01 + breath_amp * 0.3 * np.sin(t_norm * np.pi * 1.5 + 0.7)
            bias_roll = 0.01
        elif view_animation == "nodding":
            bias_yaw = 0.0
            bias_pitch = 0.04 + breath_amp * 0.4 * np.sin(t_norm * np.pi * 2)
            bias_roll = 0.0
        elif view_animation == "look_around":
            bias_yaw = 0.05 * np.sin(t_norm * np.pi * 1.5)
            bias_pitch = 0.02 * np.cos(t_norm * np.pi * 1.2)
            bias_roll = 0.015 * np.sin(t_norm * np.pi)
        else:  # static
            bias_yaw = 0.0
            bias_pitch = 0.0
            bias_roll = 0.0

        final_yaw = head_rotation_y + sway + drift_yaw + bias_yaw
        final_pitch = head_rotation_x + breath_y + bias_pitch
        final_roll = head_rotation_z + micro_roll + bias_roll

        warped = frame.copy()
        if landmarks is not None and (
            abs(final_yaw) > 0.002 or abs(final_pitch) > 0.002 or abs(final_roll) > 0.002
        ):
            warped = _apply_natural_head_rotation(
                frame, landmarks, final_yaw, final_pitch, final_roll
            )
        elif landmarks is None and (
            abs(final_yaw) > 0.002 or abs(final_pitch) > 0.002 or abs(final_roll) > 0.002
        ):
            warped = _apply_fallback_perspective(warped, final_yaw, final_pitch, final_roll)

        # ── Natural blinking (stochastic + Gaussian envelope) ──
        if blink_frequency > 0.05:
            # Bernoulli trial each frame to decide next blink
            blink_rate = 1.0 / max(mean_interval, 1)
            blink_prob = min(blink_rate, 0.3)
            if blink_phase == 0 and blink_interval_remaining <= 0:
                if np.random.random() < blink_prob or blink_interval_remaining <= -5:
                    blink_phase = 1
                    blink_current = 0.0
                    blink_closed_frames = 0
                    blink_start_frame = i
                    blink_interval_remaining = mean_interval
            if blink_phase == 0:
                blink_interval_remaining -= 1

            BLINK_CLOSED_HOLD = 3  # frames to hold eyelid fully closed

            if blink_phase == 1:
                blink_current = expression_strength * _gauss(i - blink_start_frame, 0, 0.18)
                blink_current = min(blink_current, expression_strength)
                if blink_current >= expression_strength * 0.95:
                    blink_phase = 2
                    blink_current = expression_strength
            elif blink_phase == 2:
                blink_current = expression_strength
                blink_closed_frames += 1
                if blink_closed_frames >= BLINK_CLOSED_HOLD:
                    blink_phase = 3
            elif blink_phase == 3:
                # Open eyelids with smooth curve (mirror of phase 1)
                blink_current = expression_strength * _gauss(i - blink_start_frame, blink_closed_frames + BLINK_CLOSED_HOLD + 1, 0.18)
                if blink_current <= 0.02:
                    blink_current = 0.0
                    blink_phase = 0

            if blink_current > 0.02:
                lm_blink = _detect_face_landmarks(warped)
                if lm_blink is not None:
                    warped = _apply_natural_blink(warped, lm_blink, blink_current)

        # ── Subtle smile expression ───────────────────────────
        if expression_strength > 0.1:
            smile_amt = expression_strength * 0.35
            lm_smile = landmarks if landmarks is not None else _detect_face_landmarks(warped)
            if lm_smile is not None:
                warped = _blend_smile(warped, lm_smile, smile_amt)

        output.append(warped)

    return output


def _apply_fallback_perspective(
    image: np.ndarray,
    yaw: float,
    pitch: float,
    roll: float,
) -> np.ndarray:
    """Fallback perspective warp when face landmarks unavailable."""
    h, w = image.shape[:2]
    yaw_factor = np.sin(yaw * 0.5) * 0.15
    pitch_factor = np.sin(pitch * 0.3) * 0.1
    src = np.float32([[0, 0], [w, 0], [0, h], [w, h]])
    dst = np.float32([
        [yaw_factor * w * 0.5, pitch_factor * h * 0.3],
        [w - yaw_factor * w * 0.5, pitch_factor * h * 0.2],
        [yaw_factor * w * 0.3, h - pitch_factor * h * 0.3],
        [w - yaw_factor * w * 0.3, h - pitch_factor * h * 0.2],
    ])
    M = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(image, M, (w, h), borderMode=cv2.BORDER_REFLECT)


def unload_model():
    global _face_detector, _shape_predictor, _dlib_init_failed
    _face_detector = None
    _shape_predictor = None
    _dlib_init_failed = False
