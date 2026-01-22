# backend/app/services/shrimp_behavior_service.py
import os, json, math
from dataclasses import dataclass
from collections import defaultdict, deque
from typing import Dict, Any, List

import cv2
import numpy as np
from ultralytics import YOLO
import supervision as sv


@dataclass
class TrackPoint:
    t: float
    x: float
    y: float


class TrackStore:
    def __init__(self, maxlen: int = 300):
        self.points = defaultdict(lambda: deque(maxlen=maxlen))

    def update(self, track_ids: np.ndarray, centers: np.ndarray, t: float):
        for tid, (cx, cy) in zip(track_ids.tolist(), centers.tolist()):
            if tid is None:
                continue
            self.points[int(tid)].append(TrackPoint(t=t, x=float(cx), y=float(cy)))

    def speed_px_s(self, tid: int) -> float:
        pts = self.points.get(tid)
        if not pts or len(pts) < 2:
            return 0.0
        p1, p2 = pts[-2], pts[-1]
        dt = max(p2.t - p1.t, 1e-6)
        dist = math.hypot(p2.x - p1.x, p2.y - p1.y)
        return dist / dt


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


def process_shrimp_behavior_video(
    video_path: str,
    out_video_path: str,
    out_json_path: str,
    model_weights: str = "yolov8s.pt",
    conf: float = 0.25,
    iou: float = 0.5,
    process_fps: int = 10,
    window_sec: int = 10,
    idle_speed_px_s: float = 8.0,
    wall_margin_ratio: float = 0.08,
    baseline_windows: int = 6,
    z_clip: float = 6.0,
) -> Dict[str, Any]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # ===== ALERT CONFIG (Level 1: slow swimming) =====
    SPEED_SLOW_THRES = 1000.0   # px/s (tune theo camera)
    SLOW_CONSEC_WINDOWS = 2   # cần chậm liên tục K window (2 window nếu window_sec=10 => 20s)
    USE_IDLE_GUARD = False    # nếu True sẽ yêu cầu thêm idle_ratio
    IDLE_RATIO_THRES = 0.60
    stride = max(int(round(src_fps / process_fps)), 1)
    eff_fps = src_fps / stride

    model = YOLO(model_weights)
    tracker = sv.ByteTrack()

    box_annotator = sv.BoxAnnotator()
    label_annotator = sv.LabelAnnotator(text_position=sv.Position.TOP_LEFT)
    trace_annotator = sv.TraceAnnotator(thickness=2, trace_length=int(eff_fps * 2.0))

    out_info = sv.VideoInfo(width=W, height=H, fps=eff_fps, total_frames=math.ceil(total_frames / stride))

    store = TrackStore(maxlen=int(eff_fps * window_sec * 2))

    win_frames = 0
    win_track_speeds: List[float] = []
    win_idle_flags: List[float] = []
    win_nearwall: List[float] = []
    win_disp: List[float] = []
    win_counts: List[int] = []

    metrics = {
        "meta": {
            "video_path": video_path,
            "width": W, "height": H,
            "src_fps": float(src_fps),
            "process_stride": int(stride),
            "effective_fps": float(eff_fps),
            "window_sec": int(window_sec),
        },
        "windows": []
    }

    anomaly = SimpleAnomaly(clip=z_clip)
    baseline_X = []

    frame_idx = -1

    os.makedirs(os.path.dirname(out_video_path), exist_ok=True)
    os.makedirs(os.path.dirname(out_json_path), exist_ok=True)

    with sv.VideoSink(target_path=out_video_path, video_info=out_info) as sink:
        slow_streak = 0
        tracker_cfg = "bytetrack.yaml"
        classes=None     # nếu bạn có class shrimp sau này thì set [0]
        # Ultralytics streaming tracking (GIỐNG COLAB)
        track_kwargs = dict(
            source=video_path,
            stream=True,
            tracker=tracker_cfg,   # absolute path hoặc "bytetrack.yaml"
            conf=conf,
            iou=iou,
            verbose=False
        )

        # IMPORTANT: chỉ truyền classes khi KHÔNG phải None
        if classes is not None:
            track_kwargs["classes"] = classes  # ví dụ [0]

        results_iter = model.track(**track_kwargs)


        slow_streak = 0
        win_frames = 0

        # để tính speed theo frame_idx giống colab
        last_pos = {}  # track_id -> (cx, cy, frame_idx)

        frame_idx = -1
        for frame_idx, r in enumerate(results_iter):
            frame = r.orig_img
            t = frame_idx / src_fps  # dùng fps thực

            centers = []
            speeds = []
            idle_flags = []

            boxes = r.boxes
            if boxes is not None and boxes.xyxy is not None and len(boxes) > 0:
                xyxy = boxes.xyxy.cpu().numpy()
                ids = boxes.id.cpu().numpy().astype(int) if boxes.id is not None else None

                for i in range(len(xyxy)):
                    x1, y1, x2, y2 = xyxy[i]
                    cx = (x1 + x2) * 0.5
                    cy = (y1 + y2) * 0.5
                    centers.append((cx, cy))

                    track_id = int(ids[i]) if ids is not None else -1

                    # speed (px/s) giống Colab
                    sp = 0.0
                    if track_id != -1:
                        prev = last_pos.get(track_id)
                        if prev is not None:
                            pcx, pcy, pfi = prev
                            dt = (frame_idx - pfi) / src_fps
                            if dt > 0:
                                sp = math.hypot(cx - pcx, cy - pcy) / dt
                        last_pos[track_id] = (cx, cy, frame_idx)

                    speeds.append(sp)
                    idle_flags.append(1.0 if sp < idle_speed_px_s else 0.0)

            centers_arr = np.array(centers, dtype=np.float32) if len(centers) else np.zeros((0,2), dtype=np.float32)

            # ===== per-frame -> window buffers =====
            n_det = len(centers)
            win_track_speeds.append(float(np.median(speeds)) if n_det > 0 else 0.0)
            win_idle_flags.append(float(np.mean(idle_flags)) if n_det > 0 else 0.0)
            win_nearwall.append(near_wall_ratio(centers_arr, W, H, wall_margin_ratio))
            win_disp.append(compute_dispersion_entropy(centers_arr, W, H, bins=8))
            win_counts.append(n_det)

            win_frames += 1

            # ===== annotate video (bạn đang dùng supervision annotator => ta tự vẽ đơn giản giống colab) =====
            annotated = frame.copy()
            if boxes is not None and boxes.xyxy is not None and len(boxes) > 0:
                for i in range(len(xyxy)):
                    x1, y1, x2, y2 = xyxy[i]
                    track_id = int(ids[i]) if ids is not None else -1
                    sp = speeds[i] if i < len(speeds) else 0.0
                    cv2.rectangle(annotated, (int(x1), int(y1)), (int(x2), int(y2)), (0,255,0), 2)
                    cv2.putText(annotated, f"id:{track_id} sp:{sp:.1f}",
                                (int(x1), max(0, int(y1)-5)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,0), 1, cv2.LINE_AA)

            sink.write_frame(annotated)

            # ===== finalize window =====
            if win_frames >= int(src_fps * window_sec):
                f_med_speed = float(np.median(win_track_speeds))
                f_idle = float(np.mean(win_idle_flags))
                f_nearwall = float(np.mean(win_nearwall))
                f_disp = float(np.mean(win_disp))
                f_count = float(np.mean(win_counts))

                x = np.array([f_med_speed, f_idle, f_nearwall, f_disp, f_count], dtype=np.float32)

                if len(baseline_X) < baseline_windows:
                    baseline_X.append(x.copy())
                    if len(baseline_X) == baseline_windows:
                        anomaly.fit(np.stack(baseline_X, axis=0))
                    a_score = 0.0
                else:
                    a_score = anomaly.score(x)

                # ===== alert (slow) =====
                is_slow = f_med_speed < SPEED_SLOW_THRES
                if USE_IDLE_GUARD:
                    is_slow = is_slow and (f_idle > IDLE_RATIO_THRES)

                slow_streak = slow_streak + 1 if is_slow else 0

                alert = {
                    "level": 0,
                    "active": False,
                    "type": None,
                    "reasons": [],
                    "slow_streak": slow_streak,
                    "thresholds": {
                        "speed_slow_thres_px_s": SPEED_SLOW_THRES,
                        "slow_consec_windows": SLOW_CONSEC_WINDOWS,
                        "use_idle_guard": USE_IDLE_GUARD,
                        "idle_ratio_thres": IDLE_RATIO_THRES
                    }
                }

                if slow_streak >= SLOW_CONSEC_WINDOWS:
                    alert["level"] = 1
                    alert["active"] = True
                    alert["type"] = "SLOW_SWIMMING"
                    alert["reasons"].append(f"median_speed_px_s={f_med_speed:.2f} < {SPEED_SLOW_THRES} for {slow_streak} windows")

                metrics["windows"].append({
                    "window_index": len(metrics["windows"]),
                    "t_end_sec": float(t),
                    "features": {
                        "median_speed_px_s": f_med_speed,
                        "idle_ratio": f_idle,
                        "near_wall_ratio": f_nearwall,
                        "dispersion_entropy": f_disp,
                        "mean_count": f_count,
                    },
                    "anomaly_score": float(a_score),
                    "alert": alert
                })

                if alert["active"]:
                    print(f"[ALERT L1] t={t:.1f}s | " + " | ".join(alert["reasons"]))

                win_frames = 0
                win_track_speeds.clear()
                win_idle_flags.clear()
                win_nearwall.clear()
                win_disp.clear()
                win_counts.clear()


    cap.release()

    with open(out_json_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)

    return {
        "out_video_path": out_video_path,
        "out_json_path": out_json_path,
        "num_windows": len(metrics["windows"]),
        "meta": metrics["meta"],
    }
