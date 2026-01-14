import { detectionAPI } from './api';

// AI Service interface - hỗ trợ cả online và offline inference
class AIService {
    private useLocalModel = false; // Set true khi có TensorFlow.js model
    private model: unknown = null; // TensorFlow.js model (sẽ implement sau)
    private isModelLoading = false;

    // Check if we should use local inference
    shouldUseLocalInference(): boolean {
        return this.useLocalModel && this.model !== null;
    }

    // Load TensorFlow.js model (placeholder - sẽ implement khi có model)
    async loadLocalModel(): Promise<boolean> {
        if (this.isModelLoading || this.model) return !!this.model;

        this.isModelLoading = true;
        try {
            // TODO: Implement TensorFlow.js model loading
            // this.model = await tf.loadGraphModel('/models/shrimp_model/model.json');
            console.log('⚠️ Local AI model not yet implemented');
            this.useLocalModel = false;
            return false;
        } catch (error) {
            console.error('Failed to load local AI model:', error);
            return false;
        } finally {
            this.isModelLoading = false;
        }
    }

    // Predict using local model (placeholder)
    async predictLocal(_imageElement: HTMLImageElement): Promise<{
        label: 'Healthy' | 'WSD';
        confidence: number;
        processingTime: number;
    }> {
        const startTime = performance.now();

        // TODO: Implement actual TensorFlow.js inference
        // For now, return mock data
        const mockResult = {
            label: Math.random() > 0.5 ? 'WSD' as const : 'Healthy' as const,
            confidence: 0.7 + Math.random() * 0.25,
            processingTime: performance.now() - startTime
        };

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 500));
        mockResult.processingTime = performance.now() - startTime;

        return mockResult;
    }

    // Main predict function - uses local model if available, otherwise calls API
    async predict(
        file: File,
        forceOnline = false
    ): Promise<{
        label: 'Healthy' | 'WSD';
        confidence: number;
        processingTime: number;
        source: 'local' | 'server';
    }> {
        // If online and forced, or local model not available, use server
        if (forceOnline || !this.shouldUseLocalInference()) {
            if (!navigator.onLine) {
                throw new Error('Không có kết nối mạng. Vui lòng kết nối để sử dụng.');
            }

            try {
                const result = await detectionAPI.detect(file);
                return {
                    label: result.label as 'Healthy' | 'WSD',
                    confidence: result.confidence,
                    processingTime: result.processing_time, // Map snake_case to camelCase
                    source: 'server'
                };
            } catch (error) {
                // If server fails and we have local model, try local
                if (this.shouldUseLocalInference()) {
                    console.log('Server failed, falling back to local inference');
                    return this.predictFromFile(file);
                }
                throw error;
            }
        }

        // Use local inference
        return this.predictFromFile(file);
    }

    // Helper to predict from File using local model
    private async predictFromFile(file: File): Promise<{
        label: 'Healthy' | 'WSD';
        confidence: number;
        processingTime: number;
        source: 'local';
    }> {
        const imageElement = await this.fileToImage(file);
        const result = await this.predictLocal(imageElement);
        return {
            ...result,
            source: 'local'
        };
    }

    // Convert File to HTMLImageElement
    private fileToImage(file: File): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    // Preprocess image (resize to 224x224) - for future use
    async preprocessImage(imageElement: HTMLImageElement): Promise<HTMLCanvasElement> {
        const canvas = document.createElement('canvas');
        canvas.width = 224;
        canvas.height = 224;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(imageElement, 0, 0, 224, 224);
        return canvas;
    }

    // Create thumbnail for storage
    async createThumbnail(file: File, maxSize = 200): Promise<Blob> {
        const img = await this.fileToImage(file);
        const canvas = document.createElement('canvas');

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
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        // Return Blob instead of data URL for IndexedDB
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Failed to create thumbnail'));
                },
                'image/jpeg',
                0.7
            );
        });
    }
}

export const aiService = new AIService();
