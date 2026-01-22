import { detectionAPI } from "./api";

type UploadVideoResponse = {
  status: string;
  filename?: string;
  original_filename?: string;
  content_type?: string;
  size_bytes?: number;
  url?: string;
};

class AIService {
  private useLocalModel = false;
  private model: unknown = null;
  private isModelLoading = false;

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
  async uploadVideo(file: File): Promise<UploadVideoResponse> {
    if (!navigator.onLine) {
      throw new Error("Không có kết nối mạng. Vui lòng kết nối để upload video.");
    }

    if (file.type && !file.type.startsWith("video/")) {
      console.warn("File type is not video/*:", file.type);
    }

    const form = new FormData();
    form.append("video", file);

    const res = await fetch("/api/v1/push/upload-video", {
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
