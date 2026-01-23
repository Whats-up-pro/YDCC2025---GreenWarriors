# backend/app/services/shrimp_behavior_service.py
import os, json, math, time
from typing import Dict, Any, List, Optional, Tuple

import cv2
import numpy as np
from ultralytics import YOLO
import ultralytics
import supervision as sv
from pathlib import Path

# ---- Level 2 deps ----
import torch
import torchvision.transforms as T
from PIL import Image
from app.models.resnet_cbam import ResNetCBAM


def _get_ultralytics_bytetrack_yaml() -> str:
    """
    Return absolute path to Ultralytics default bytetrack yaml.
    Avoid 'file not found' when working directory changes.
    """
    base = Path(ultralytics.__file__).resolve().parent
    yaml_path = base / "cfg" / "trackers" / "bytetrack.yaml"
    return str(yaml_path)


def compute_dispersion_entropy(centers: np.ndarray, frame_w: int, frame_h: int, bins: int = 8) -> float:
    if centers is None or len(centers) == 0:
        return 0.0
    xs = np.clip(centers[:, 0] / frame_w, 0, 0.9999)
    ys = np.clip(centers[:, 1] / frame_h, 0, 0.9999)
    hx = np.floor(xs * bins).astype(int)
    hy = np.floor(ys * bins).astype(int)
    hist = np.zeros((bins, bins), dtype=np.float32)
    for i in range(len(hx)):
        hist[hy[i], hx[i]] += 1.0
    p = hist.flatten()
    p = p[p > 0]
    p = p / p.sum()
    ent = float(-(p * np.log(p + 1e-12)).sum())
    ent /= math.log(bins * bins)
    return ent


def near_wall_ratio(centers: np.ndarray, frame_w: int, frame_h: int, margin_ratio: float) -> float:
    if centers is None or len(centers) == 0:
        return 0.0
    mx = frame_w * margin_ratio
    my = frame_h * margin_ratio
    x = centers[:, 0]
    y = centers[:, 1]
    near = (x < mx) | (x > frame_w - mx) | (y < my) | (y > frame_h - my)
    return float(near.mean())


class SimpleAnomaly:
    def __init__(self, clip: float = 6.0):
        self.clip = clip
        self.mu = None
        self.sd = None

    def fit(self, X: np.ndarray):
        self.mu = X.mean(axis=0)
        self.sd = X.std(axis=0) + 1e-6

    def score(self, x: np.ndarray) -> float:
        if self.mu is None:
            return 0.0
        z = (x - self.mu) / self.sd
        z = np.clip(z, -self.clip, self.clip)
        return float(np.mean(np.abs(z)))


# =========================================================
# Level 2 helpers (ResNet on YOLO crops)
# =========================================================
def _build_resnet_preprocess(img_size: int = 224) -> T.Compose:
    return T.Compose([
        T.Resize((img_size, img_size)),
        T.ToTensor(),
        T.Normalize(mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225]),
    ])


def _resolve_weights_path(weights_path: str) -> str:
    """
    Make weights path robust regardless of CWD.
    If you run in backend/, then "ml_models/xxx" works.
    If you run in repo root, then "backend/ml_models/xxx" works.
    """
    p = Path(weights_path)

    if p.is_absolute() and p.exists():
        return str(p)

    here = Path(__file__).resolve().parent          # backend/app/services
    app_dir = here.parent                           # backend/app
    backend_dir = app_dir.parent                    # backend

    candidates = [
        p,
        backend_dir / p,
        app_dir / p,
        here / p,
    ]

    # if user passes "backend/..." while already in backend root
    if len(p.parts) > 0 and p.parts[0].lower() == "backend":
        p2 = Path(*p.parts[1:])
        candidates.extend([p2, backend_dir / p2, app_dir / p2, here / p2])

    for c in candidates:
        c = c.resolve()
        if c.exists():
            return str(c)

    return str(p)


def _load_resnet_cbam_classifier(weights_path: str, device: str, num_classes: int = 2) -> torch.nn.Module:
    resolved = _resolve_weights_path(weights_path)
    if not Path(resolved).exists():
        raise FileNotFoundError(f"ResNet weights not found: {weights_path} (resolved: {resolved}, cwd: {os.getcwd()})")

    model = ResNetCBAM(num_classes=num_classes, weights=None)
    ckpt = torch.load(resolved, map_location=device)

    state_dict = None
    if isinstance(ckpt, dict):
        for k in ("state_dict", "model_state_dict", "model"):
            if k in ckpt and isinstance(ckpt[k], dict):
                state_dict = ckpt[k]
                break
    if state_dict is None:
        state_dict = ckpt

    cleaned = {k.replace("module.", ""): v for k, v in state_dict.items()}
    model.load_state_dict(cleaned, strict=True)
    model.to(device)
    model.eval()
    return model


def _safe_crop_xyxy(frame: np.ndarray, x1, y1, x2, y2, pad: float = 0.05, min_side: int = 16) -> Optional[np.ndarray]:
    H, W = frame.shape[:2]
    x1, y1, x2, y2 = float(x1), float(y1), float(x2), float(y2)
    bw = max(1.0, x2 - x1)
    bh = max(1.0, y2 - y1)
    px = bw * pad
    py = bh * pad

    xx1 = int(max(0, math.floor(x1 - px)))
    yy1 = int(max(0, math.floor(y1 - py)))
    xx2 = int(min(W - 1, math.ceil(x2 + px)))
    yy2 = int(min(H - 1, math.ceil(y2 + py)))

    if xx2 <= xx1 or yy2 <= yy1:
        return None

    crop = frame[yy1:yy2, xx1:xx2]
    if crop.size == 0:
        return None

    ch, cw = crop.shape[:2]
    if min(ch, cw) < min_side:
        return None

    return crop


@torch.no_grad()
def _classify_crop_resnet(model: torch.nn.Module, preprocess: T.Compose, crop_bgr: np.ndarray, device: str) -> np.ndarray:
    crop_rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(crop_rgb)
    x = preprocess(pil).unsqueeze(0).to(device)
    logits = model(x)  # yêu cầu ResNetCBAM.forward return logits
    probs = torch.softmax(logits, dim=1).squeeze(0).detach().cpu().numpy()
    return probs


# =========================================================
# Finalize window (GIỮ NGUYÊN LOGIC LEVEL-1 CỦA BẠN)
# + add level2 result as extra field, KHÔNG ảnh hưởng alert L1
# =========================================================
def _finalize_window(
    metrics: Dict[str, Any],
    baseline_X: List[np.ndarray],
    anomaly: SimpleAnomaly,
    baseline_windows: int,
    slow_streak: int,
    t_end: float,
    win_nearwall: List[float],
    win_disp: List[float],
    win_counts: List[int],
    win_speed_sum: Dict[int, float],
    win_speed_cnt: Dict[int, int],
    SPEED_SLOW_THRES: float,
    SLOW_CONSEC_WINDOWS: int,
    # ---- Level 2 extras (optional) ----
    enable_level2: bool,
    wssv_streak: int,
    win_wssv_max: List[float],
    win_wssv_mean: List[float],
    WSSV_PROB_THRES: float,
    WSSV_CONSEC_WINDOWS: int,
) -> Tuple[int, int]:
    """
    Level-1 part: giữ y nguyên code cũ của bạn.
    Level-2: append thêm field "level2" trong window record, KHÔNG override alert L1.
    """

    # --- aggregate mean speed per id --- (GIỮ NGUYÊN)
    per_id_avg: List[float] = []
    for tid, s in win_speed_sum.items():
        c = win_speed_cnt.get(tid, 0)
        if c > 0:
            per_id_avg.append(s / c)

    mean_speed = float(np.mean(per_id_avg)) if len(per_id_avg) > 0 else 0.0

    # idle_ratio here = fraction of ids slower than threshold (GIỮ NGUYÊN)
    if len(per_id_avg) > 0:
        idle_ratio = float(np.mean([1.0 if v < SPEED_SLOW_THRES else 0.0 for v in per_id_avg]))
    else:
        idle_ratio = 0.0

    f_nearwall = float(np.mean(win_nearwall)) if win_nearwall else 0.0
    f_disp = float(np.mean(win_disp)) if win_disp else 0.0
    f_count = float(np.mean(win_counts)) if win_counts else 0.0

    x = np.array([mean_speed, idle_ratio, f_nearwall, f_disp, f_count], dtype=np.float32)

    if len(baseline_X) < baseline_windows:
        baseline_X.append(x.copy())
        if len(baseline_X) == baseline_windows:
            anomaly.fit(np.stack(baseline_X, axis=0))
        a_score = 0.0
    else:
        a_score = anomaly.score(x)

    # --- Alert Level 1: slow swimming --- (GIỮ NGUYÊN)
    is_slow = mean_speed < SPEED_SLOW_THRES
    slow_streak = slow_streak + 1 if is_slow else 0

    alert = {
        "level": 0,
        "active": False,
        "type": None,
        "reasons": [],
        "slow_streak": slow_streak,
        "thresholds": {
            "speed_slow_thres_px_s": SPEED_SLOW_THRES,
            "slow_consec_windows": SLOW_CONSEC_WINDOWS
        }
    }

    if slow_streak >= SLOW_CONSEC_WINDOWS:
        alert["level"] = 1
        alert["active"] = True
        alert["type"] = "SLOW_SWIMMING"
        alert["reasons"].append(
            f"mean_speed_px_s={mean_speed:.2f} < {SPEED_SLOW_THRES} for {slow_streak} windows"
        )

    # ---- Level 2 window summary (NEW, but NOT affecting alert L1) ----
    if enable_level2:
        wssv_max = float(np.max(win_wssv_max)) if win_wssv_max else 0.0
        wssv_mean = float(np.mean(win_wssv_mean)) if win_wssv_mean else 0.0

        is_wssv = wssv_max >= WSSV_PROB_THRES
        wssv_streak = wssv_streak + 1 if is_wssv else 0

        level2 = {
            "active": bool(wssv_streak >= WSSV_CONSEC_WINDOWS),
            "type": "WHITE_SPOT",
            "wssv_streak": int(wssv_streak),
            "thresholds": {
                "wssv_prob_thres": float(WSSV_PROB_THRES),
                "wssv_consec_windows": int(WSSV_CONSEC_WINDOWS),
            },
            "features": {
                "wssv_prob_max": wssv_max,
                "wssv_prob_mean": wssv_mean,
            },
            "reasons": [
                f"wssv_prob_max={wssv_max:.3f} >= {WSSV_PROB_THRES} for {wssv_streak} windows"
            ] if (wssv_streak >= WSSV_CONSEC_WINDOWS) else []
        }
    else:
        level2 = {
            "active": False,
            "type": "WHITE_SPOT",
            "wssv_streak": 0,
            "thresholds": {},
            "features": {"wssv_prob_max": 0.0, "wssv_prob_mean": 0.0},
            "reasons": []
        }
        wssv_streak = 0

    metrics["windows"].append({
        "window_index": len(metrics["windows"]),
        "t_end_sec": float(t_end),
        "features": {
            "mean_speed_px_s": mean_speed,
            "idle_ratio": idle_ratio,
            "near_wall_ratio": f_nearwall,
            "dispersion_entropy": f_disp,
            "mean_count": f_count,
        },
        "anomaly_score": float(a_score),
        "alert": alert,      # <= giữ nguyên L1
        "level2": level2     # <= thêm mới, không ảnh hưởng L1
    })

    if alert["active"]:
        print(f"[ALERT L1] t={t_end:.1f}s | " + " | ".join(alert["reasons"]))
    if enable_level2 and level2["active"]:
        print(f"[ALERT L2] t={t_end:.1f}s | " + " | ".join(level2["reasons"]))

    return slow_streak, wssv_streak


def process_shrimp_behavior_video(
    video_path: str,
    out_video_path: str,
    out_json_path: str,
    model_weights: str = "yolov8s.pt",
    conf: float = 0.25,
    iou: float = 0.5,
    process_fps: int = 10,              # kept for compatibility (not used in stream-track mode)
    window_sec: int = 10,
    wall_margin_ratio: float = 0.08,
    baseline_windows: int = 6,
    z_clip: float = 6.0,
    classes: Optional[List[int]] = None,
    imgsz: int = 960,

    # ---- Level 2 configs (optional) ----
    enable_level2: bool = True,
    resnet_weights_path: str = "ml_models/best_cbam_resnet101.pth",  # nếu bạn chạy trong backend/
    resnet_num_classes: int = 2,
    wssv_class_index: int = 1,
    wssv_prob_thres: float = 0.85,
    wssv_consec_windows: int = 1,
    crop_pad: float = 0.05,
    crop_min_side: int = 16,
) -> Dict[str, Any]:

    # Probe video meta (GIỮ NGUYÊN)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")
    src_fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.release()

    # ===== ALERT CONFIG (Level 1: slow swimming) (GIỮ NGUYÊN) =====
    SPEED_SLOW_THRES = 1000.0
    SLOW_CONSEC_WINDOWS = 1

    # ---- Load YOLO (GIỮ NGUYÊN) ----
    model = YOLO(model_weights)
    tracker_cfg = _get_ultralytics_bytetrack_yaml()

    out_info = sv.VideoInfo(
        width=W, height=H,
        fps=src_fps,
        total_frames=total_frames if total_frames > 0 else 0
    )

    # ---- Level 2 init (NEW, but safe) ----
    device_t = "cuda" if torch.cuda.is_available() else "cpu"
    resnet_model = None
    resnet_preprocess = None

    if enable_level2:
        try:
            resnet_model = _load_resnet_cbam_classifier(
                weights_path=resnet_weights_path,
                device=device_t,
                num_classes=int(resnet_num_classes),
            )
            resnet_preprocess = _build_resnet_preprocess(img_size=224)
        except Exception as e:
            # quan trọng: đừng làm hỏng level1
            print(f"[WARN] Disable Level2 because load ResNet failed: {e}")
            enable_level2 = False
            resnet_model = None
            resnet_preprocess = None

    metrics: Dict[str, Any] = {
        "meta": {
            "video_path": video_path,
            "width": W, "height": H,
            "src_fps": float(src_fps),
            "process_fps_param": int(process_fps),
            "window_sec": int(window_sec),
            "tracker": "ultralytics_bytetrack",
            "tracker_cfg": tracker_cfg,
            "model_weights": model_weights,
            "conf": float(conf),
            "iou": float(iou),
            "imgsz": int(imgsz),

            "level2": {
                "enabled": bool(enable_level2),
                "device": device_t,
                "weights_path": resnet_weights_path,
                "num_classes": int(resnet_num_classes),
                "wssv_class_index": int(wssv_class_index),
                "wssv_prob_thres": float(wssv_prob_thres),
                "wssv_consec_windows": int(wssv_consec_windows),
                "crop_pad": float(crop_pad),
                "crop_min_side": int(crop_min_side),
            }
        },
        "windows": []
    }

    anomaly = SimpleAnomaly(clip=z_clip)
    baseline_X: List[np.ndarray] = []

    # Buffers for current window (GIỮ NGUYÊN)
    win_nearwall: List[float] = []
    win_disp: List[float] = []
    win_counts: List[int] = []

    # Level 2 window buffers (NEW)
    win_wssv_max: List[float] = []
    win_wssv_mean: List[float] = []
    wssv_streak = 0

    # per-window accumulators: speed sum/count by track id (GIỮ NGUYÊN)
    win_speed_sum: Dict[int, float] = {}
    win_speed_cnt: Dict[int, int] = {}

    # speed estimation state (last position per id) (GIỮ NGUYÊN)
    last_pos: Dict[int, Tuple[float, float, int]] = {}

    current_win_id = -1
    slow_streak = 0
    last_t = 0.0

    # Create output dirs (GIỮ NGUYÊN)
    os.makedirs(os.path.dirname(out_video_path), exist_ok=True)
    os.makedirs(os.path.dirname(out_json_path), exist_ok=True)

    # Build track kwargs (GIỮ NGUYÊN)
    track_kwargs = dict(
        source=video_path,
        stream=True,
        persist=True,
        vid_stride=1,
        tracker=tracker_cfg,
        conf=conf,
        iou=iou,
        imgsz=imgsz,
        verbose=False
    )
    if classes is not None:
        track_kwargs["classes"] = classes

    results_iter = model.track(**track_kwargs)

    with sv.VideoSink(target_path=out_video_path, video_info=out_info) as sink:
        for frame_idx, r in enumerate(results_iter):
            frame = r.orig_img
            t = frame_idx / max(src_fps, 1e-6)
            last_t = t

            win_id = int(t // window_sec)
            if current_win_id == -1:
                current_win_id = win_id

            # finalize when stepping into new window
            if win_id != current_win_id:
                slow_streak, wssv_streak = _finalize_window(
                    metrics=metrics,
                    baseline_X=baseline_X,
                    anomaly=anomaly,
                    baseline_windows=baseline_windows,
                    slow_streak=slow_streak,
                    t_end=t,
                    win_nearwall=win_nearwall,
                    win_disp=win_disp,
                    win_counts=win_counts,
                    win_speed_sum=win_speed_sum,
                    win_speed_cnt=win_speed_cnt,
                    SPEED_SLOW_THRES=SPEED_SLOW_THRES,
                    SLOW_CONSEC_WINDOWS=SLOW_CONSEC_WINDOWS,

                    enable_level2=enable_level2,
                    wssv_streak=wssv_streak,
                    win_wssv_max=win_wssv_max,
                    win_wssv_mean=win_wssv_mean,
                    WSSV_PROB_THRES=float(wssv_prob_thres),
                    WSSV_CONSEC_WINDOWS=int(wssv_consec_windows),
                )

                # reset window buffers (GIỮ NGUYÊN + thêm reset L2)
                win_nearwall.clear()
                win_disp.clear()
                win_counts.clear()
                win_speed_sum.clear()
                win_speed_cnt.clear()

                win_wssv_max.clear()
                win_wssv_mean.clear()

                current_win_id = win_id

            # -------- Parse detections + update per-id speeds (GIỮ NGUYÊN) --------
            centers = []
            curr_speed_by_id: Dict[int, float] = {}

            boxes = getattr(r, "boxes", None)
            ids = None
            xyxy = None

            # Level 2: store wssv probs per box for overlay and per-frame aggregation
            per_box_wssv: List[float] = []

            if boxes is not None and boxes.xyxy is not None and len(boxes) > 0:
                xyxy = boxes.xyxy.cpu().numpy()
                ids = boxes.id.cpu().numpy().astype(int) if boxes.id is not None else None

                # ---- Level 2: classify crops (NEW, but does not change L1) ----
                if enable_level2 and resnet_model is not None and resnet_preprocess is not None:
                    for i in range(len(xyxy)):
                        x1, y1, x2, y2 = xyxy[i]
                        crop = _safe_crop_xyxy(frame, x1, y1, x2, y2, pad=crop_pad, min_side=crop_min_side)
                        if crop is None:
                            per_box_wssv.append(0.0)
                            continue
                        probs = _classify_crop_resnet(resnet_model, resnet_preprocess, crop, device_t)
                        per_box_wssv.append(float(probs[int(wssv_class_index)]))
                else:
                    per_box_wssv = [0.0] * len(xyxy)

                # ---- L1 speed logic (GIỮ NGUYÊN) ----
                for i in range(len(xyxy)):
                    x1, y1, x2, y2 = xyxy[i]
                    cx = (x1 + x2) * 0.5
                    cy = (y1 + y2) * 0.5
                    centers.append((cx, cy))

                    track_id = int(ids[i]) if ids is not None else -1
                    if track_id == -1:
                        continue

                    sp = None
                    prev = last_pos.get(track_id)
                    if prev is not None:
                        pcx, pcy, pfi = prev
                        dt = (frame_idx - pfi) / max(src_fps, 1e-6)
                        if dt > 0:
                            sp = math.hypot(cx - pcx, cy - pcy) / dt

                    last_pos[track_id] = (cx, cy, frame_idx)

                    if sp is not None:
                        win_speed_sum[track_id] = win_speed_sum.get(track_id, 0.0) + float(sp)
                        win_speed_cnt[track_id] = win_speed_cnt.get(track_id, 0) + 1
                        curr_speed_by_id[track_id] = float(sp)

            centers_arr = np.array(centers, dtype=np.float32) if centers else np.zeros((0, 2), dtype=np.float32)
            n_det = len(centers)

            win_nearwall.append(near_wall_ratio(centers_arr, W, H, wall_margin_ratio))
            win_disp.append(compute_dispersion_entropy(centers_arr, W, H, bins=8))
            win_counts.append(n_det)

            # ---- accumulate Level 2 per-frame stats into window (NEW) ----
            if enable_level2 and per_box_wssv:
                win_wssv_max.append(float(np.max(per_box_wssv)))
                win_wssv_mean.append(float(np.mean(per_box_wssv)))
            else:
                win_wssv_max.append(0.0)
                win_wssv_mean.append(0.0)

            # -------- Annotate (GIỮ NGUYÊN, chỉ thêm text wssv nếu có) --------
            annotated = frame.copy()
            if xyxy is not None and ids is not None and len(xyxy) > 0:
                for i in range(len(xyxy)):
                    x1, y1, x2, y2 = xyxy[i]
                    tid = int(ids[i]) if ids is not None else -1
                    sp_show = curr_speed_by_id.get(tid, 0.0)

                    if enable_level2 and i < len(per_box_wssv):
                        label = f"id:{tid} sp:{sp_show:.1f} wssv:{per_box_wssv[i]:.2f}"
                    else:
                        label = f"id:{tid} sp:{sp_show:.1f}"

                    cv2.rectangle(annotated, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
                    cv2.putText(
                        annotated, label,
                        (int(x1), max(0, int(y1) - 5)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA
                    )

            sink.write_frame(annotated)

        # finalize last window
        if len(win_counts) > 0:
            slow_streak, wssv_streak = _finalize_window(
                metrics=metrics,
                baseline_X=baseline_X,
                anomaly=anomaly,
                baseline_windows=baseline_windows,
                slow_streak=slow_streak,
                t_end=float(last_t),
                win_nearwall=win_nearwall,
                win_disp=win_disp,
                win_counts=win_counts,
                win_speed_sum=win_speed_sum,
                win_speed_cnt=win_speed_cnt,
                SPEED_SLOW_THRES=SPEED_SLOW_THRES,
                SLOW_CONSEC_WINDOWS=SLOW_CONSEC_WINDOWS,

                enable_level2=enable_level2,
                wssv_streak=wssv_streak,
                win_wssv_max=win_wssv_max,
                win_wssv_mean=win_wssv_mean,
                WSSV_PROB_THRES=float(wssv_prob_thres),
                WSSV_CONSEC_WINDOWS=int(wssv_consec_windows),
            )

    with open(out_json_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)

    return {
        "out_video_path": out_video_path,
        "out_json_path": out_json_path,
        "num_windows": len(metrics["windows"]),
        "meta": metrics["meta"],
    }
