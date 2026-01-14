import { db, dbHelpers } from './database';

/**
 * StorageManager - Quản lý storage quota và auto cleanup
 * iOS Safari có giới hạn ~50MB, cần quản lý cẩn thận
 */
export class StorageManager {
  private static readonly WARNING_THRESHOLD = 0.8; // 80% cảnh báo
  private static readonly CRITICAL_THRESHOLD = 0.9; // 90% critical

  /**
   * Check current storage quota
   */
  static async checkQuota(): Promise<{
    usage: number;
    quota: number;
    percentage: number;
    isNearLimit: boolean;
    isCritical: boolean;
  }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 50 * 1024 * 1024; // 50MB fallback
        const percentage = usage / quota;

        return {
          usage,
          quota,
          percentage,
          isNearLimit: percentage > this.WARNING_THRESHOLD,
          isCritical: percentage > this.CRITICAL_THRESHOLD
        };
      } catch (error) {
        console.error('Failed to check storage quota:', error);
      }
    }

    // Fallback values
    return {
      usage: 0,
      quota: 50 * 1024 * 1024,
      percentage: 0,
      isNearLimit: false,
      isCritical: false
    };
  }

  /**
   * Request persistent storage (prevents automatic eviction)
   */
  static async requestPersistentStorage(): Promise<boolean> {
    if ('storage' in navigator && 'persist' in navigator.storage) {
      try {
        const isPersisted = await navigator.storage.persist();
        console.log('Persistent storage:', isPersisted ? 'granted' : 'denied');
        return isPersisted;
      } catch (error) {
        console.error('Failed to request persistent storage:', error);
      }
    }
    return false;
  }

  /**
   * Check if storage is persisted
   */
  static async isPersisted(): Promise<boolean> {
    if ('storage' in navigator && 'persisted' in navigator.storage) {
      try {
        return await navigator.storage.persisted();
      } catch (error) {
        console.error('Failed to check persistence:', error);
      }
    }
    return false;
  }

  /**
   * Auto cleanup when storage is near limit
   */
  static async autoCleanup(): Promise<{
    deletedRecords: number;
    deletedModels: number;
    beforeUsage: number;
    afterUsage: number;
  }> {
    const before = await this.checkQuota();
    let deletedRecords = 0;
    let deletedModels = 0;

    if (before.isNearLimit) {
      console.warn(`Storage near limit (${(before.percentage * 100).toFixed(1)}%), performing cleanup...`);

      // 1. Delete old synced records (>30 days)
      deletedRecords = await dbHelpers.cleanOldData(30);

      // If still near limit, delete older records (>14 days)
      const mid = await this.checkQuota();
      if (mid.isNearLimit) {
        deletedRecords += await dbHelpers.cleanOldData(14);
      }

      // 2. Remove old model versions (keep only latest)
      const models = await db.cachedModels.toArray();
      if (models.length > 1) {
        const sortedModels = models.sort((a, b) => 
          b.metadata.uploadedAt - a.metadata.uploadedAt
        );
        const toDelete = sortedModels.slice(1); // Keep only latest
        await db.cachedModels.bulkDelete(toDelete.map(m => m.id));
        deletedModels = toDelete.length;
        console.log(`Deleted ${deletedModels} old model versions`);
      }

      // 3. Clear chat messages older than 7 days
      const chatThreshold = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const oldChats = await db.chatMessages
        .where('timestamp')
        .below(chatThreshold)
        .toArray();
      
      if (oldChats.length > 0) {
        await db.chatMessages.bulkDelete(oldChats.map(c => c.id!));
        console.log(`Deleted ${oldChats.length} old chat messages`);
      }
    }

    const after = await this.checkQuota();

    return {
      deletedRecords,
      deletedModels,
      beforeUsage: before.usage,
      afterUsage: after.usage
    };
  }

  /**
   * Format bytes to human readable
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get detailed storage breakdown
   */
  static async getStorageBreakdown(): Promise<{
    total: string;
    quota: string;
    percentage: number;
    detections: number;
    chatMessages: number;
    models: number;
    isPersisted: boolean;
  }> {
    const quotaInfo = await this.checkQuota();
    const usage = await dbHelpers.getStorageUsage();
    const isPersisted = await this.isPersisted();

    return {
      total: this.formatBytes(quotaInfo.usage),
      quota: this.formatBytes(quotaInfo.quota),
      percentage: quotaInfo.percentage * 100,
      detections: usage.detections,
      chatMessages: usage.chatMessages,
      models: usage.models,
      isPersisted
    };
  }

  /**
   * Create thumbnail from image blob
   */
  static async createThumbnail(
    imageBlob: Blob,
    maxSize: number = 150
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }

      img.onload = () => {
        // Calculate dimensions
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create thumbnail'));
            }
          },
          'image/jpeg',
          0.7 // 70% quality for thumbnail
        );

        URL.revokeObjectURL(img.src);
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
        URL.revokeObjectURL(img.src);
      };

      img.src = URL.createObjectURL(imageBlob);
    });
  }

  /**
   * Compress image for upload
   */
  static async compressImage(
    imageBlob: Blob,
    maxWidth: number = 1024,
    quality: number = 0.85
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Resize if too large
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/jpeg',
          quality
        );

        URL.revokeObjectURL(img.src);
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
        URL.revokeObjectURL(img.src);
      };

      img.src = URL.createObjectURL(imageBlob);
    });
  }
}
