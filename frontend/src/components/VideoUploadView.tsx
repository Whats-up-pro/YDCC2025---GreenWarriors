import { useRef, useState, useEffect } from 'react';
import { aiService } from '../services/aiService';
import { getApiBaseUrl } from '../services/api';

type UploadVideoResponse = {
  status: string;
  file_id?: string;
  filename?: string;
  original_filename?: string;
  content_type?: string;
  size_bytes?: number;
  url?: string;
  processed?: {
    status?: "queued" | "running" | "done" | "failed";
    job_status_url?: string;
    annotated_video_url?: string;
    metrics_json_url?: string;
    error?: string;
    result?: any;
  };
};

type VideoJobResponse = {
  status: string;
  job: {
    status: "queued" | "running" | "done" | "failed";
    started_at?: number | null;
    finished_at?: number | null;
    error?: string | null;
    annotated_video_url?: string;
    metrics_json_url?: string;
    result?: any;
  };
};

type MetricsJSON = {
  meta?: any;
  windows?: Array<{
    window_index: number;
    t_end_sec: number;
    features: {
      mean_speed_px_s?: number;
      idle_ratio?: number;
      near_wall_ratio?: number;
      dispersion_entropy?: number;
      mean_count?: number;
    };
    anomaly_score?: number;
    alert?: {
      level: number;
      active: boolean;
      type?: string | null;
      reasons?: string[];
      slow_streak?: number;
      thresholds?: Record<string, any>;
    };
    level2?: {
      active: boolean;
      type?: string;
      reasons?: string[];
      wssv_streak?: number;
      thresholds?: Record<string, any>;
      features?: {
        wssv_prob_max?: number;
        wssv_prob_mean?: number;
      };
    };
  }>;
};

type VideoAlerts = {
  level1: {
    level: number;
    active: boolean;
    type?: string | null;
    reasons?: string[];
    slow_streak?: number;
    thresholds?: Record<string, any>;
  } | null;
  level2: {
    active: boolean;
    type?: string;
    reasons?: string[];
    wssv_streak?: number;
    thresholds?: Record<string, any>;
    features?: {
      wssv_prob_max?: number;
      wssv_prob_mean?: number;
    };
  } | null;
  highestLevel: 0 | 1 | 2;
  reasons: string[];
};

export const VideoUploadView = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [jobStatus, setJobStatus] = useState<'queued' | 'running' | 'done' | 'failed' | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<{
    upload: UploadVideoResponse;
    job: VideoJobResponse['job'];
    metrics: MetricsJSON;
    alerts: VideoAlerts;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const pollJobStatus = async (jobUrl: string, fileId: string) => {
    const startTime = Date.now();
    const timeout = 120000; // 120 seconds
    const apiBaseUrl = getApiBaseUrl();

    while (true) {
      try {
        const url = jobUrl.startsWith('http') ? jobUrl : `${apiBaseUrl}${jobUrl.startsWith('/') ? jobUrl : `/${jobUrl}`}`;
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) {
          throw new Error(`Failed to fetch job status: ${res.status}`);
        }

        const data: VideoJobResponse = await res.json();
        const job = data?.job;

        if (!job) {
          throw new Error('Job response missing job field');
        }

        setJobStatus(job.status);

        if (job.status === 'done') {
          setProcessing(false);
          setProgressMessage('Hoàn thành');
          return job;
        }

        if (job.status === 'failed') {
          setProcessing(false);
          setError(job.error || 'Video processing failed');
          throw new Error(job.error || 'Video processing failed');
        }

        if (job.status === 'queued') {
          setProgressMessage('Đang xếp hàng...');
        } else if (job.status === 'running') {
          setProgressMessage('Đang xử lý video...');
        }

        if (Date.now() - startTime > timeout) {
          setProcessing(false);
          setError('Timeout waiting for video processing');
          throw new Error('Timeout waiting for video processing');
        }

        await new Promise((resolve) => setTimeout(resolve, 1000)); // Poll every 1 second
      } catch (err: any) {
        setProcessing(false);
        setError(err.message || 'Failed to poll job status');
        throw err;
      }
    }
  };

  const fetchMetrics = async (metricsUrl: string): Promise<MetricsJSON> => {
    const apiBaseUrl = getApiBaseUrl();
    const url = metricsUrl.startsWith('http') ? metricsUrl : `${apiBaseUrl}${metricsUrl.startsWith('/') ? metricsUrl : `/${metricsUrl}`}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`Failed to fetch metrics: ${res.status}`);
    }
    return res.json();
  };

  const extractLatestAlerts = (metrics: MetricsJSON): VideoAlerts => {
    const windows = metrics?.windows || [];
    if (windows.length === 0) {
      return { level1: null, level2: null, highestLevel: 0, reasons: [] };
    }

    const last = windows[windows.length - 1];
    const level1 = last?.alert || null;
    const level2 = last?.level2 || null;

    const l2Active = !!(level2 && level2.active);
    const l1Active = !!(level1 && level1.active);

    if (l2Active) {
      return {
        level1,
        level2,
        highestLevel: 2,
        reasons: level2?.reasons || ['Phát hiện dấu hiệu đốm trắng (Level 2)'],
      };
    }

    if (l1Active) {
      return {
        level1,
        level2,
        highestLevel: 1,
        reasons: level1?.reasons || ['Phát hiện bơi chậm dưới ngưỡng (Level 1)'],
      };
    }

    return { level1, level2, highestLevel: 0, reasons: [] };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (200MB max)
    const maxSize = 200 * 1024 * 1024; // 200MB
    if (file.size > maxSize) {
      setError(`File quá lớn. Kích thước tối đa: 200MB`);
      return;
    }

    setError(null);
    setResult(null);
    setJobStatus(null);
    setProgressMessage('');

    // Create preview
    const videoUrl = URL.createObjectURL(file);
    setPreview(videoUrl);

    if (!isOnline) {
      setError('Không có kết nối mạng. Vui lòng kết nối để upload video.');
      return;
    }

    try {
      setUploading(true);
      setProgressMessage('Đang upload video...');

      // Upload video
      const upload = await aiService.uploadVideo(file);
      setUploading(false);

      if (!upload.processed?.job_status_url && !upload.file_id) {
        throw new Error('Upload response missing job_status_url / file_id');
      }

      const jobUrl = upload.processed?.job_status_url || `/api/v1/push/video-job/${upload.file_id}`;
      setProcessing(true);
      setJobStatus('queued');

      // Poll job status
      const job = await pollJobStatus(jobUrl, upload.file_id || '');

      // Fetch metrics
      const metricsUrl = job.metrics_json_url || upload.processed?.metrics_json_url;
      if (!metricsUrl) {
        throw new Error('Missing metrics_json_url in job/upload response');
      }

      const metrics = await fetchMetrics(metricsUrl);
      const alerts = extractLatestAlerts(metrics);

      setResult({
        upload,
        job,
        metrics,
        alerts,
      });
    } catch (err: any) {
      setUploading(false);
      setProcessing(false);
      setError(err.message || 'Lỗi xử lý video');
      console.error('Video upload error:', err);
    }
  };

  const handleReset = () => {
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setPreview(null);
    setResult(null);
    setError(null);
    setJobStatus(null);
    setProgressMessage('');
    setUploading(false);
    setProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getAnnotatedVideoUrl = (): string | null => {
    if (!result) return null;
    const url = result.job.annotated_video_url || result.upload.processed?.annotated_video_url;
    if (!url) return null;
    const apiBaseUrl = getApiBaseUrl();
    return url.startsWith('http') ? url : `${apiBaseUrl}${url.startsWith('/') ? url : `/${url}`}`;
  };

  const getMetricsUrl = (): string | null => {
    if (!result) return null;
    const url = result.job.metrics_json_url || result.upload.processed?.metrics_json_url;
    if (!url) return null;
    const apiBaseUrl = getApiBaseUrl();
    return url.startsWith('http') ? url : `${apiBaseUrl}${url.startsWith('/') ? url : `/${url}`}`;
  };

  const handleDownloadAnnotatedVideo = () => {
    const url = getAnnotatedVideoUrl();
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleDownloadMetrics = () => {
    const url = getMetricsUrl();
    if (url) {
      window.open(url, '_blank');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="p-4 safe-bottom">
      {/* Offline Banner */}
      {!isOnline && (
        <div
          className="mb-4 p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 text-amber-800 text-sm rounded-xl shadow-soft"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">📡</span>
            <span>Đang ngoại tuyến — Vui lòng kết nối để upload video</span>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Empty State */}
      {!preview && (
        <div className="py-12 lg:py-20 text-center">
          <div className="mb-6 lg:mb-8">
            <div
              className="w-24 h-24 lg:w-36 lg:h-36 mx-auto mb-6 lg:mb-8 flex items-center justify-center gradient-accent rounded-3xl shadow-accent"
              role="img"
              aria-label="Biểu tượng video"
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden="true" className="lg:w-20 lg:h-20">
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <h2 className="text-xl lg:text-3xl font-bold text-[var(--color-text)] mb-2 lg:mb-3">
              Upload video để phân tích
            </h2>
            <p className="text-sm lg:text-base text-[var(--color-text-secondary)] max-w-md mx-auto">
              Chọn video tôm để phân tích hành vi và phát hiện bệnh (tối đa 200MB)
            </p>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || processing || !isOnline}
            className="btn btn-accent btn-lg w-full sm:w-auto sm:min-w-[240px] lg:min-w-[300px] lg:text-lg"
            aria-label="Chọn video để upload"
            aria-busy={uploading || processing}
          >
            {uploading || processing ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                {uploading ? 'Đang upload...' : 'Đang xử lý...'}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="text-xl">🎥</span>
                Chọn video
              </span>
            )}
          </button>
        </div>
      )}

      {/* Preview and Results */}
      {preview && (
        <div className="space-y-4 lg:space-y-6">
          {/* Video Preview */}
          <div className="relative lg:max-w-2xl lg:mx-auto">
            <div className="card-modern overflow-hidden p-2">
              <video
                ref={videoRef}
                src={preview}
                controls
                className="w-full rounded-xl"
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    videoRef.current.play().catch(() => {});
                  }
                }}
              />
            </div>
            {(uploading || processing) && (
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-2xl"
                role="status"
                aria-live="polite"
                aria-label={uploading ? 'Đang upload video' : 'Đang xử lý video'}
              >
                <div className="text-white text-center">
                  <div className="w-16 h-16 lg:w-20 lg:h-20 mx-auto mb-4 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-base lg:text-lg font-semibold">{progressMessage || (uploading ? 'Đang upload...' : 'Đang xử lý...')}</p>
                  <p className="text-sm text-white/80 mt-1">Vui lòng đợi trong giây lát</p>
                </div>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {(uploading || processing) && (
            <div className="card-modern p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[var(--color-text)]">
                  {uploading ? 'Đang upload...' : progressMessage || 'Đang xử lý...'}
                </span>
                {jobStatus && (
                  <span className="badge badge-info text-xs">
                    {jobStatus === 'queued' ? 'Xếp hàng' : jobStatus === 'running' ? 'Đang chạy' : jobStatus}
                  </span>
                )}
              </div>
              <div className="w-full h-2 bg-[var(--color-border-light)] rounded-full overflow-hidden">
                <div
                  className="h-full gradient-accent rounded-full transition-all duration-300"
                  style={{
                    width: uploading ? '50%' : processing ? '75%' : '100%',
                    animation: processing ? 'pulse 2s ease-in-out infinite' : undefined,
                  }}
                />
              </div>
            </div>
          )}

          {/* Alerts Display */}
          {result && result.alerts && (
            <div className="space-y-3">
              {/* Level 2 Alert (WSSV) */}
              {result.alerts.level2?.active && (
                <div
                  className="card-modern p-5 lg:p-6 border-l-4 border-[var(--color-danger)] bg-red-50"
                  role="alert"
                  aria-live="assertive"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-3xl">🚨</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="badge badge-danger">Level 2</span>
                        <span className="text-lg font-bold text-[var(--color-danger)]">
                          Phát hiện đốm trắng (WSSV)
                        </span>
                      </div>
                      {result.alerts.level2.features && (
                        <div className="text-sm text-red-700 space-y-1">
                          <p>
                            Xác suất tối đa: <span className="font-semibold">{(result.alerts.level2.features.wssv_prob_max || 0).toFixed(2)}</span>
                          </p>
                          <p>
                            Xác suất trung bình: <span className="font-semibold">{(result.alerts.level2.features.wssv_prob_mean || 0).toFixed(2)}</span>
                          </p>
                          {result.alerts.level2.wssv_streak !== undefined && (
                            <p>
                              Chuỗi phát hiện: <span className="font-semibold">{result.alerts.level2.wssv_streak} windows</span>
                            </p>
                          )}
                        </div>
                      )}
                      {result.alerts.level2.reasons && result.alerts.level2.reasons.length > 0 && (
                        <div className="mt-2 text-sm text-red-800">
                          <p className="font-semibold mb-1">Lý do:</p>
                          <ul className="list-disc list-inside space-y-1">
                            {result.alerts.level2.reasons.map((reason, idx) => (
                              <li key={idx}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Level 1 Alert (Slow Swimming) */}
              {result.alerts.level1?.active && !result.alerts.level2?.active && (
                <div
                  className="card-modern p-5 lg:p-6 border-l-4 border-[var(--color-warning)] bg-amber-50"
                  role="alert"
                  aria-live="assertive"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-3xl">⚠️</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="badge badge-warning">Level 1</span>
                        <span className="text-lg font-bold text-[var(--color-warning)]">
                          Phát hiện bơi chậm
                        </span>
                      </div>
                      {result.alerts.level1.slow_streak !== undefined && (
                        <p className="text-sm text-amber-700">
                          Chuỗi phát hiện: <span className="font-semibold">{result.alerts.level1.slow_streak} windows</span>
                        </p>
                      )}
                      {result.alerts.level1.reasons && result.alerts.level1.reasons.length > 0 && (
                        <div className="mt-2 text-sm text-amber-800">
                          <p className="font-semibold mb-1">Lý do:</p>
                          <ul className="list-disc list-inside space-y-1">
                            {result.alerts.level1.reasons.map((reason, idx) => (
                              <li key={idx}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* No Alerts */}
              {result.alerts.highestLevel === 0 && (
                <div
                  className="card-modern p-5 lg:p-6 border-l-4 border-[var(--color-success)] bg-green-50"
                  role="alert"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">✅</span>
                    <div>
                      <p className="text-lg font-bold text-[var(--color-success)]">Không phát hiện vấn đề</p>
                      <p className="text-sm text-green-700 mt-1">Video phân tích không có dấu hiệu bất thường</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Annotated Video Player */}
          {result && getAnnotatedVideoUrl() && (
            <div className="card-modern p-4">
              <h3 className="text-lg font-bold text-[var(--color-text)] mb-3">Video đã được phân tích</h3>
              <div className="relative">
                <video
                  src={getAnnotatedVideoUrl() || undefined}
                  controls
                  className="w-full rounded-xl"
                />
              </div>
            </div>
          )}

          {/* Metrics Chart */}
          {result && result.metrics?.windows && result.metrics.windows.length > 0 && (
            <div className="card-modern p-4">
              <h3 className="text-lg font-bold text-[var(--color-text)] mb-4">Biểu đồ phân tích</h3>
              <VideoMetricsChart metrics={result.metrics} />
            </div>
          )}

          {/* Download Buttons */}
          {result && (
            <div className="flex flex-col sm:flex-row gap-3">
              {getAnnotatedVideoUrl() && (
                <button
                  onClick={handleDownloadAnnotatedVideo}
                  className="btn btn-primary flex-1"
                  aria-label="Tải video đã phân tích"
                >
                  <span className="flex items-center gap-2">
                    <span>📥</span>
                    <span>Tải video đã phân tích</span>
                  </span>
                </button>
              )}
              {getMetricsUrl() && (
                <button
                  onClick={handleDownloadMetrics}
                  className="btn btn-secondary flex-1"
                  aria-label="Tải dữ liệu phân tích"
                >
                  <span className="flex items-center gap-2">
                    <span>📊</span>
                    <span>Tải dữ liệu phân tích</span>
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="card-modern p-4 bg-red-50 border-l-4 border-[var(--color-danger)]"
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">❌</span>
                <div>
                  <p className="font-semibold text-[var(--color-danger)]">Lỗi xảy ra</p>
                  <p className="mt-1 text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="btn btn-secondary flex-1"
              aria-label="Chọn video khác"
            >
              <span className="flex items-center gap-2">
                <span>🔄</span>
                <span>Chọn video khác</span>
              </span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || processing}
              className="btn btn-primary flex-1"
              aria-label="Upload video mới"
              aria-busy={uploading || processing}
            >
              <span className="flex items-center gap-2">
                <span>🎥</span>
                <span>Video mới</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Simple Metrics Chart Component
const VideoMetricsChart = ({ metrics }: { metrics: MetricsJSON }) => {
  const windows = metrics?.windows || [];
  if (windows.length === 0) return null;

  const maxSpeed = Math.max(...windows.map(w => w.features.mean_speed_px_s || 0), 1);
  const maxCount = Math.max(...windows.map(w => w.features.mean_count || 0), 1);
  const maxWssv = Math.max(...windows.map(w => w.level2?.features?.wssv_prob_max || 0), 1);

  const chartHeight = 200;
  const chartWidth = Math.max(600, windows.length * 40);
  const padding = 40;

  const getX = (index: number) => padding + (index / (windows.length - 1 || 1)) * (chartWidth - 2 * padding);
  const getY = (value: number, max: number) => chartHeight - padding - (value / max) * (chartHeight - 2 * padding);

  return (
    <div className="overflow-x-auto">
      <svg width={chartWidth} height={chartHeight + 60} className="w-full" viewBox={`0 0 ${chartWidth} ${chartHeight + 60}`}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding + ratio * (chartHeight - 2 * padding);
          return (
            <line
              key={ratio}
              x1={padding}
              y1={y}
              x2={chartWidth - padding}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Speed line */}
        <polyline
          points={windows
            .map((w, i) => `${getX(i)},${getY(w.features.mean_speed_px_s || 0, maxSpeed)}`)
            .join(' ')}
          fill="none"
          stroke="var(--color-primary-dark)"
          strokeWidth="2"
        />
        {windows.map((w, i) => (
          <circle
            key={`speed-${i}`}
            cx={getX(i)}
            cy={getY(w.features.mean_speed_px_s || 0, maxSpeed)}
            r="3"
            fill="var(--color-primary-dark)"
          />
        ))}

        {/* Count line */}
        <polyline
          points={windows
            .map((w, i) => `${getX(i)},${getY(w.features.mean_count || 0, maxCount)}`)
            .join(' ')}
          fill="none"
          stroke="var(--color-success)"
          strokeWidth="2"
        />
        {windows.map((w, i) => (
          <circle
            key={`count-${i}`}
            cx={getX(i)}
            cy={getY(w.features.mean_count || 0, maxCount)}
            r="3"
            fill="var(--color-success)"
          />
        ))}

        {/* WSSV prob line (if available) */}
        {windows.some(w => w.level2?.features?.wssv_prob_max) && (
          <>
            <polyline
              points={windows
                .map((w, i) => `${getX(i)},${getY(w.level2?.features?.wssv_prob_max || 0, maxWssv)}`)
                .join(' ')}
              fill="none"
              stroke="var(--color-danger)"
              strokeWidth="2"
            />
            {windows.map((w, i) => (
              w.level2?.features?.wssv_prob_max && (
                <circle
                  key={`wssv-${i}`}
                  cx={getX(i)}
                  cy={getY(w.level2.features.wssv_prob_max, maxWssv)}
                  r="3"
                  fill="var(--color-danger)"
                />
              )
            ))}
          </>
        )}

        {/* X-axis labels */}
        {windows.map((w, i) => {
          if (i % Math.ceil(windows.length / 5) !== 0 && i !== windows.length - 1) return null;
          return (
            <text
              key={`x-label-${i}`}
              x={getX(i)}
              y={chartHeight + 20}
              textAnchor="middle"
              fontSize="10"
              fill="var(--color-text-secondary)"
            >
              {w.t_end_sec.toFixed(0)}s
            </text>
          );
        })}

        {/* Y-axis labels */}
        <text x={padding - 10} y={padding} textAnchor="end" fontSize="10" fill="var(--color-text-secondary)">
          {maxSpeed.toFixed(0)}
        </text>
        <text x={padding - 10} y={chartHeight - padding} textAnchor="end" fontSize="10" fill="var(--color-text-secondary)">
          0
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-[var(--color-primary-dark)]"></div>
          <span className="text-[var(--color-text-secondary)]">Tốc độ (px/s)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-[var(--color-success)]"></div>
          <span className="text-[var(--color-text-secondary)]">Số lượng tôm</span>
        </div>
        {windows.some(w => w.level2?.features?.wssv_prob_max) && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-[var(--color-danger)]"></div>
            <span className="text-[var(--color-text-secondary)]">Xác suất WSSV</span>
          </div>
        )}
      </div>
    </div>
  );
};
