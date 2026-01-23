import { useRef, useState, useEffect } from "react";
import { useAI } from "../hooks/useAI";
import { dbHelpers } from "../db/database";
import { aiService } from "../services/aiService";


type ResultState = {
  label: string;
  confidence: number;
  source?: "local" | "server";
} | null;

export const CameraScanner = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Preview dùng chung cho ảnh/video bằng Object URL (nhẹ RAM hơn DataURL)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"image" | "video" | null>(null);

  const [result, setResult] = useState<ResultState>(null);
  const [savedToHistory, setSavedToHistory] = useState(false);

  const { detectDisease, loading, error } = useAI();
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [videoAlert, setVideoAlert] = useState<{
    level: 1 | 2;
    reasons: string[];
    wssvProbMax?: number;
  } | null>(null);

  // Online/offline listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Cleanup objectURL tránh leak bộ nhớ
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetFileInputs = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewType(null);
    setResult(null);
    setSavedToHistory(false);
    resetFileInputs();
    setVideoAlert(null);
  };

  const getLabelVietnamese = (label: string) => {
    // Bạn đang dùng WSSV ở chỗ khác; phần UI cũ check WSD/WSD -> giữ logic gọn:
    if (label === "WSSV" || label === "WSD") return "Bệnh đốm trắng";
    if (label === "Unknown") return "Chưa xác định";
    return "Khỏe mạnh";
  };

  // =========================
  // IMAGE FLOW (giữ offline-first cũ)
  // =========================
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResult(null);
    setSavedToHistory(false);

    // Preview ảnh
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPreviewType("image");

    try {
      // OFFLINE-FIRST: Save to IndexedDB IMMEDIATELY
      const thumbnailBlob = await aiService.createThumbnail(file);
      const tempId = await dbHelpers.saveDetection(
        file, // Full image Blob
        thumbnailBlob, // Thumbnail Blob
        "Unknown", // Temporary label
        0, // Temporary confidence
        false, // Local inference = false (pending)
        0 // No processing time yet
      );
      setSavedToHistory(true);

      // Pending UI
      setResult({
        label: "Đang phân tích...",
        confidence: 0,
        source: "local",
      });

      // Try server detection (không block UI)
      if (isOnline) {
        try {
          const detectionResult = await detectDisease(file);

          // Update IndexedDB synced
          await dbHelpers.markSynced(tempId);
          // TODO: update label/confidence in db nếu bạn có hàm updateDetection

          setResult({
            label: detectionResult.label,
            confidence: detectionResult.confidence,
            source: "server",
          });
        } catch (serverErr) {
          console.warn("Server detection failed, queued for sync:", serverErr);
          setResult({
            label: "Chờ đồng bộ",
            confidence: 0,
            source: "local",
          });
        }
      } else {
        setResult({
          label: "Đã lưu - Chờ đồng bộ",
          confidence: 0,
          source: "local",
        });
      }
    } catch (err) {
      console.error("Lỗi lưu ảnh:", err);
      setResult({
        label: "Lỗi",
        confidence: 0,
        source: "local",
      });
    }
  };

  // =========================
  // VIDEO FLOW (upload video)
  // =========================
  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResult(null);
    setVideoAlert(null);
    setSavedToHistory(false);

    // Preview video
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPreviewType("video");

    try {
      // Trạng thái pending
      setResult({
        label: "Đang tải video...",
        confidence: 0,
        source: "local",
      });

      // Offline: hiện trạng thái chờ
      if (!isOnline) {
        setResult({
          label: "Đã chọn video - Chờ mạng để upload",
          confidence: 0,
          source: "local",
        });
        return;
      }

      // Upload lên server
      // YÊU CẦU: aiService.uploadVideo(file) phải tồn tại và dùng FormData field "video"
      const { upload, job, metrics, alerts } = await aiService.uploadVideoAndWaitAlert(file);

      console.log("Uploaded video URL:", upload?.url);
      console.log("Metrics JSON:", job?.metrics_json_url || upload?.processed?.metrics_json_url);
      console.log("Alerts:", alerts);

      if (alerts.highestLevel === 2) {
        // Level 2: WSSV detected
        setVideoAlert({
          level: 2,
          reasons: alerts.reasons,
          wssvProbMax: metrics?.windows?.slice(-1)?.[0]?.level2?.features?.wssv_prob_max,
        });

        setResult({
          label: "WSSV",
          confidence: Math.max(
            0,
            Math.min(1, metrics?.windows?.slice(-1)?.[0]?.level2?.features?.wssv_prob_max ?? 0.95)
          ),
          source: "server",
        });
      } else if (alerts.highestLevel === 1) {
        // Level 1: slow swimming
        setVideoAlert({
          level: 1,
          reasons: alerts.reasons,
        });

        // UI bạn đang dùng label=WSSV để đỏ -> mình giữ theo logic cũ
        setResult({
          label: "WSSV",
          confidence: 0.9,
          source: "server",
        });
      } else {
        setVideoAlert(null);
        setResult({
          label: "Healthy",
          confidence: 1,
          source: "server",
        });
      }

      setSavedToHistory(true);

      // (tuỳ chọn) log url để test
      // console.log("Uploaded video URL:", uploadRes?.url);
    } catch (err: any) {
      console.error("Upload video lỗi:", err);
      setResult({
        label: err?.message || "Lỗi upload video",
        confidence: 0,
        source: "local",
      });
    }
  };

  return (
    <div className="p-4 safe-bottom">
      {/* Offline Banner */}
      {!isOnline && (
        <div
          className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm"
          style={{ borderRadius: "12px" }}
          role="status"
          aria-live="polite"
        >
          Đang ngoại tuyến — Kết quả sẽ được lưu và đồng bộ sau
        </div>
      )}

      {/* INPUT: IMAGE */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageSelect}
        className="hidden"
      />

      {/* INPUT: VIDEO */}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={handleVideoSelect}
        className="hidden"
      />

      {/* Empty State */}
      {!previewUrl && (
        <div className="py-12 lg:py-20 text-center">
          <div className="mb-6 lg:mb-8">
            <div
              className="w-20 h-20 lg:w-32 lg:h-32 mx-auto mb-4 lg:mb-6 flex items-center justify-center bg-orange-50 text-[var(--color-shrimp)]"
              style={{ borderRadius: "20px" }}
              role="img"
              aria-label="Biểu tượng máy ảnh"
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
                className="lg:w-16 lg:h-16"
              >
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <h2 className="text-lg lg:text-2xl font-semibold text-[var(--color-text)] mb-1 lg:mb-2">
              Chụp ảnh / Upload video để chẩn đoán
            </h2>
            <p className="text-sm lg:text-base text-[var(--color-text-secondary)]">
              Ảnh: chụp rõ nét vùng nghi ngờ. Video: chọn file video từ máy.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="btn btn-primary btn-lg w-full sm:w-auto sm:min-w-[200px] lg:min-w-[280px] lg:text-lg"
              aria-label="Mở camera để chụp ảnh tôm"
              aria-busy={loading}
            >
              {loading ? "Đang xử lý..." : "Chụp ảnh tôm"}
            </button>

            <button
              onClick={() => videoInputRef.current?.click()}
              disabled={loading}
              className="btn btn-ghost btn-lg w-full sm:w-auto sm:min-w-[200px] lg:min-w-[280px] lg:text-lg"
              aria-label="Chọn video để upload"
              aria-busy={loading}
            >
              Upload video
            </button>
          </div>
        </div>
      )}

      {/* Preview and Results */}
      {previewUrl && (
        <div className="space-y-4 lg:space-y-6">
          {/* Preview */}
          <div className="relative lg:max-w-2xl lg:mx-auto">
            {previewType === "image" ? (
              <img
                src={previewUrl}
                alt="Ảnh tôm đã chụp để phân tích"
                className="w-full border border-[var(--color-border)]"
                style={{ borderRadius: "16px" }}
              />
            ) : (
              <video
                src={previewUrl}
                controls
                className="w-full border border-[var(--color-border)]"
                style={{ borderRadius: "16px" }}
              />
            )}

            {loading && previewType === "image" && (
              <div
                className="absolute inset-0 bg-black/50 flex items-center justify-center"
                style={{ borderRadius: "16px" }}
                role="status"
                aria-live="polite"
                aria-label="Đang phân tích ảnh"
              >
                <div className="text-white text-center">
                  <div className="text-4xl lg:text-6xl mb-2 animate-pulse">⏳</div>
                  <p className="text-sm lg:text-base font-medium">Đang phân tích...</p>
                </div>
              </div>
            )}
          </div>

          {/* Result */}
          {videoAlert && previewType === "video" && (
            <div
              className={`p-4 border text-sm ${
                videoAlert.level === 2
                  ? "bg-red-50 border-red-200 text-red-900"
                  : "bg-amber-50 border-amber-200 text-amber-900"
              }`}
              style={{ borderRadius: "12px" }}
              role="alert"
              aria-live="assertive"
            >
              <p className="font-semibold">
                {videoAlert.level === 2
                  ? "🚨 Cảnh báo cấp 2 (đốm trắng)"
                  : "⚠️ Cảnh báo cấp 1 (tôm lờ đờ)"}
              </p>

              {videoAlert.level === 2 && typeof (videoAlert as any).wssvProbMax === "number" && (
                <p className="mt-1">
                  Xác suất WSSV tối đa: {(((videoAlert as any).wssvProbMax as number) * 100).toFixed(1)}%
                </p>
              )}

              <ul className="mt-2 list-disc pl-5">
                {videoAlert.reasons.map((r, idx) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </div>
          )}


          {result && (
            <div
              className={`p-4 border-l-4 ${
                result.label === "WSD" || result.label === "WSSV"
                  ? "bg-red-50 border-red-500"
                  : "bg-green-50 border-green-500"
              }`}
              style={{ borderRadius: "12px" }}
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p
                    className={`text-lg font-semibold ${
                      result.label === "WSD" || result.label === "WSSV"
                        ? "text-red-700"
                        : "text-green-700"
                    }`}
                  >
                    {getLabelVietnamese(result.label)}
                  </p>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Độ tin cậy: {(result.confidence * 100).toFixed(1)}%
                  </p>
                </div>

                <span
                  className={`badge ${
                    result.label === "WSD" || result.label === "WSSV"
                      ? "badge-danger"
                      : "badge-success"
                  }`}
                >
                  {result.label}
                </span>
              </div>

              {/* Confidence bar */}
              <div className="w-full h-1.5 bg-gray-200 mt-3" style={{ borderRadius: "2px" }}>
                <div
                  className={`h-1.5 ${
                    result.label === "WSD" || result.label === "WSSV" ? "bg-red-500" : "bg-green-500"
                  }`}
                  style={{
                    width: `${Math.max(0, Math.min(1, result.confidence)) * 100}%`,
                    borderRadius: "2px",
                  }}
                />
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 mt-3 text-xs text-[var(--color-text-muted)]">
                {result.source === "server" && <span className="badge badge-info">Server</span>}
                {savedToHistory && <span className="badge badge-success">Đã lưu</span>}
                {previewType === "video" && <span className="badge badge-warning">Video</span>}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm"
              style={{ borderRadius: "12px" }}
              role="alert"
              aria-live="assertive"
            >
              <p className="font-medium">Lỗi</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={handleReset} className="btn btn-ghost flex-1" aria-label="Reset">
              Làm lại
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="btn btn-primary flex-1"
              aria-label="Chụp/Chọn ảnh mới"
              aria-busy={loading}
            >
              Ảnh mới
            </button>

            <button
              onClick={() => videoInputRef.current?.click()}
              disabled={loading}
              className="btn btn-ghost flex-1"
              aria-label="Chọn video mới"
              aria-busy={loading}
            >
              Video mới
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
