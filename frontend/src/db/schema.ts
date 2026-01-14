/**
 * IndexedDB Schema Definitions
 * Client-side database cho offline-first PWA
 */

export interface Detection {
  id?: number;
  timestamp: number;
  imageBlob: Blob;
  imageThumbnail: Blob; // Thumbnail 150x150 để hiển thị nhanh
  label: 'Healthy' | 'WSD' | 'Unknown';
  confidence: number;
  localInference: boolean; // true = TF.js local, false = server
  synced: boolean;
  syncedAt?: number;
  serverId?: number; // ID từ backend sau khi sync
  metadata?: {
    location?: { lat: number; lng: number };
    pondId?: string;
    notes?: string;
  };
}

export interface ChatMessage {
  id?: number;
  timestamp: number;
  role: 'user' | 'assistant';
  content: string;
  synced: boolean;
  syncedAt?: number;
}

export interface AppState {
  id: string; // Always 'app-state'
  lastSync: number;
  modelVersion: string;
  modelLastUpdate: number;
  pushSubscription?: PushSubscriptionJSON;
  userId?: string;
  settings?: {
    notificationsEnabled: boolean;
    autoSync: boolean;
    syncInterval: number;
  };
}

export interface CachedModel {
  id: string; // model version
  modelData: ArrayBuffer; // TensorFlow.js model weights
  metadata: {
    version: string;
    size: number;
    uploadedAt: number;
    checksum?: string;
  };
}

export interface SyncQueue {
  id?: number;
  timestamp: number;
  type: 'detection' | 'chat' | 'feedback';
  payload: any;
  retries: number;
  lastError?: string;
}
