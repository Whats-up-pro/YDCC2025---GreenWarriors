import { detectionAPI, getApiBaseUrl } from "./api";

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

type AlertInfo = {
  level: number;
  active: boolean;
  type?: string | null;
  reasons?: string[];
  slow_streak?: number;
  thresholds?: Record<string, any>;
};
type Level2Info = {
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
type MetricsJSON = {
  meta?: any;
  windows?: Array<{
    window_index: number;
    t_end_sec: number;
    features: {
      mean_speed_px_s?: number; // <- bạn đang dùng mean_speed trong backend
      idle_ratio?: number;
      near_wall_ratio?: number;
      dispersion_entropy?: number;
      mean_count?: number;
    };
    anomaly_score?: number;
    alert?: AlertInfo;     // Level 1
    level2?: Level2Info;   // Level 2
  }>;
};
type VideoAlerts = {
  level1: AlertInfo | null;
  level2: Level2Info | null;
  highestLevel: 0 | 1 | 2;
  reasons: string[];
};

class AIService {
  private useLocalModel = false;
  private model: unknown = null;
  private isModelLoading = false;
  private async sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
  private absolutize(url: string): string {
    if (!url) return url;
    // already absolute
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    // already root-relative
    if (url.startsWith("/")) return url;
    // make it root-relative
    return "/" + url;
  }

  private async pollJob(jobUrl: string, timeoutMs = 120_000, intervalMs = 1000): Promise<VideoJobResponse["job"]> {
    const start = Date.now();

    while (true) {
      const res = await fetch(this.absolutize(jobUrl), { method: "GET" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Poll job failed: ${res.status}`);
      }

      const data = (await res.json()) as VideoJobResponse;
      const job = data?.job;
      if (!job) throw new Error("Job response missing job field");

      if (job.status === "done") return job;
      if (job.status === "failed") throw new Error(job.error || "Video job failed");

      if (Date.now() - start > timeoutMs) {
        throw new Error("Timeout waiting for video processing");
      }

      await this.sleep(intervalMs);
    }
  }

  private async fetchMetrics(metricsUrl: string): Promise<MetricsJSON> {
    const res = await fetch(this.absolutize(metricsUrl), { method: "GET" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || `Fetch metrics failed: ${res.status}`);
    }
    return res.json();
  }

  private extractLatestAlerts(metrics: MetricsJSON): VideoAlerts {
    const windows = metrics?.windows || [];
    if (windows.length === 0) {
      return { level1: null, level2: null, highestLevel: 0, reasons: [] };
    }

    const last = windows[windows.length - 1];
    const level1 = last?.alert || null;
    const level2 = (last as any)?.level2 || null;

    const l2Active = !!(level2 && level2.active);
    const l1Active = !!(level1 && level1.active);

    if (l2Active) {
      return {
        level1,
        level2,
        highestLevel: 2,
        reasons: level2.reasons ?? ["Phát hiện dấu hiệu đốm trắng (Level 2)"],
      };
    }

    if (l1Active) {
      return {
        level1,
        level2,
        highestLevel: 1,
        reasons: level1.reasons ?? ["Phát hiện bơi chậm dưới ngưỡng (Level 1)"],
      };
    }

    return { level1, level2, highestLevel: 0, reasons: [] };
  }


  shouldUseLocalInference(): boolean {
    return this.useLocalModel && this.model !== null;
  }

  async loadLocalModel(): Promise<boolean> {
    if (this.isModelLoading || this.model) return !!this.model;

    this.isModelLoading = true;
    try {
      console.log("⚠️ Local AI model not yet implemented");
      this.useLocalModel = false;
      return false;
    } catch (error) {
      console.error("Failed to load local AI model:", error);
      return false;
    } finally {
      this.isModelLoading = false;
    }
  }

  private normalizeLabel(raw: unknown): "Healthy" | "WSSV" {
    const s = String(raw ?? "").toUpperCase();
    if (s === "WSSV" || s === "WSD") return "WSSV";
    return "Healthy";
  }

  async predictLocal(_imageElement: HTMLImageElement): Promise<{
    label: "Healthy" | "WSSV";
    confidence: number;
    processingTime: number;
  }> {
    const startTime = performance.now();

    const label: "Healthy" | "WSSV" = Math.random() > 0.5 ? "WSSV" : "Healthy";
    const mockResult = {
      label,
      confidence: 0.7 + Math.random() * 0.25,
      processingTime: 0,
    };

    await new Promise((resolve) => setTimeout(resolve, 500));
    mockResult.processingTime = performance.now() - startTime;

    return mockResult;
  }

  async predict(
    file: File,
    forceOnline = false
  ): Promise<{
    label: "Healthy" | "WSSV";
    confidence: number;
    processingTime: number;
    source: "local" | "server";
  }> {
    if (forceOnline || !this.shouldUseLocalInference()) {
      if (!navigator.onLine) {
        throw new Error("Không có kết nối mạng. Vui lòng kết nối để sử dụng.");
      }

      try {
        const result = await detectionAPI.detect(file);
        return {
          label: this.normalizeLabel(result.label),
          confidence: result.confidence,
          processingTime: result.processing_time,
          source: "server",
        };
      } catch (error) {
        if (this.shouldUseLocalInference()) {
          console.log("Server failed, falling back to local inference");
          return this.predictFromFile(file);
        }
        throw error;
      }
    }

    return this.predictFromFile(file);
  }

  private async predictFromFile(file: File): Promise<{
    label: "Healthy" | "WSSV";
    confidence: number;
    processingTime: number;
    source: "local";
  }> {
    const imageElement = await this.fileToImage(file);
    const result = await this.predictLocal(imageElement);
    return { ...result, source: "local" };
  }

  private fileToImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  async preprocessImage(imageElement: HTMLImageElement): Promise<HTMLCanvasElement> {
    const canvas = document.createElement("canvas");
    canvas.width = 224;
    canvas.height = 224;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(imageElement, 0, 0, 224, 224);
    return canvas;
  }

  async createThumbnail(file: File, maxSize = 200): Promise<Blob> {
    const img = await this.fileToImage(file);
    const canvas = document.createElement("canvas");

    let width = img.width;
    let height = img.height;

    if (width > height) {
      if (width > maxSize) {
        height = height * (maxSize / width);
        width = maxSize;
      }
    } else {
      if (height > maxSize) {
        width = width * (maxSize / height);
        height = maxSize;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, width, height);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Failed to create thumbnail"))),
        "image/jpeg",
        0.7
      );
    });
  }

  // VIDEO UPLOAD
  async uploadVideoAndWaitAlert(file: File): Promise<{
    upload: UploadVideoResponse;
    job: VideoJobResponse["job"];
    metrics: MetricsJSON;
    alerts: VideoAlerts;
  }> {
    const upload = await this.uploadVideo(file);

    const jobUrl =
      upload?.processed?.job_status_url ||
      (upload.file_id ? `/api/v1/push/video-job/${upload.file_id}` : "");

    if (!jobUrl) throw new Error("Upload response missing job_status_url / file_id.");

    const job = await this.pollJob(jobUrl);

    const metricsUrl = job.metrics_json_url || upload.processed?.metrics_json_url;
    if (!metricsUrl) throw new Error("Missing metrics_json_url in job/upload response");

    const metrics = await this.fetchMetrics(metricsUrl);
    const alerts = this.extractLatestAlerts(metrics);

    return { upload, job, metrics, alerts };
  }

  async uploadVideo(file: File): Promise<UploadVideoResponse> {
    if (!navigator.onLine) {
      throw new Error("Không có kết nối mạng. Vui lòng kết nối để upload video.");
    }

    if (file.type && !file.type.startsWith("video/")) {
      console.warn("File type is not video/*:", file.type);
    }

    const form = new FormData();
    form.append("video", file);

    const apiBaseUrl = getApiBaseUrl();
    const res = await fetch(`${apiBaseUrl}/api/v1/push/upload-video?process=true&async_mode=true`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      // backend có thể trả json hoặc text
      const text = await res.text().catch(() => "");
      try {
        const j = JSON.parse(text);
        throw new Error(j?.detail || `Upload video failed: ${res.status}`);
      } catch {
        throw new Error(text || `Upload video failed: ${res.status}`);
      }
    }

    return res.json();
  }
}

export const aiService = new AIService();
