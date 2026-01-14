# 📱 Phase 2: Advanced PWA Features - Chi tiết Kỹ thuật

## Tổng quan Priority
Focus vào 3 tính năng core cho PWA offline-first:
1. **IndexedDB** - Local storage cho detection history và model cache
2. **Background Sync** - Đồng bộ dữ liệu khi online trở lại
3. **Push Notifications** - Cảnh báo bệnh tôm và alerts

⚠️ **iOS Limitations cần lưu ý:**
- iOS Safari 16.4+ mới support Push Notifications cho PWA
- Background Sync không được support đầy đủ → Cần fallback strategy
- Service Worker có giới hạn cache storage (~50MB)

---

## 🗄️ Part 1: IndexedDB Architecture (PRIORITY #1)

### 1.1 Database Schema Design

**File: `frontend/src/db/schema.ts`**

```typescript
export interface Detection {
  id?: number;
  timestamp: number;
  imageBlob: Blob;
  imageThumbnail: Blob; // Thumbnail 150x150 để hiển thị nhanh
  label: 'Healthy' | 'WSD' | 'Unknown';
  confidence: number;
  localInference: boolean; // true = TF.js, false = server
  synced: boolean;
  syncedAt?: number;
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
}

export interface AppState {
  id: string; // Always 'app-state'
  lastSync: number;
  modelVersion: string;
  modelLastUpdate: number;
  pushSubscription?: PushSubscriptionJSON;
  userId?: string;
}

export interface CachedModel {
  id: string; // model version
  modelData: ArrayBuffer; // TensorFlow.js model weights
  metadata: {
    version: string;
    size: number;
    uploadedAt: number;
  };
}
```

### 1.2 Dexie Database Implementation

**File: `frontend/src/db/database.ts`**

```typescript
import Dexie, { Table } from 'dexie';
import { Detection, ChatMessage, AppState, CachedModel } from './schema';

export class ShrimpDatabase extends Dexie {
  detections!: Table<Detection, number>;
  chatMessages!: Table<ChatMessage, number>;
  appState!: Table<AppState, string>;
  cachedModels!: Table<CachedModel, string>;

  constructor() {
    super('ShrimpDiseaseDB');
    
    this.version(1).stores({
      detections: '++id, timestamp, synced, label, [synced+timestamp]',
      chatMessages: '++id, timestamp, synced',
      appState: 'id',
      cachedModels: 'id'
    });

    // Indexes để query nhanh
    this.version(2).stores({
      detections: '++id, timestamp, synced, label, [synced+timestamp], [label+timestamp]'
    });
  }

  // Helper methods
  async getUnsynced(): Promise<Detection[]> {
    return this.detections
      .where('synced')
      .equals(0)
      .sortBy('timestamp');
  }

  async getRecentDetections(limit: number = 20): Promise<Detection[]> {
    return this.detections
      .orderBy('timestamp')
      .reverse()
      .limit(limit)
      .toArray();
  }

  async getDetectionStats(days: number = 7) {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    const detections = await this.detections
      .where('timestamp')
      .above(since)
      .toArray();

    return {
      total: detections.length,
      wsd: detections.filter(d => d.label === 'WSD').length,
      healthy: detections.filter(d => d.label === 'Healthy').length,
      avgConfidence: detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length
    };
  }

  async cleanOldData(daysToKeep: number = 30): Promise<number> {
    const threshold = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    
    // Chỉ xóa records đã sync
    const toDelete = await this.detections
      .where('timestamp')
      .below(threshold)
      .and(d => d.synced)
      .toArray();

    await this.detections.bulkDelete(toDelete.map(d => d.id!));
    return toDelete.length;
  }
}

export const db = new ShrimpDatabase();
```

### 1.3 Storage Manager với Quota API

**File: `frontend/src/db/storageManager.ts`**

```typescript
export class StorageManager {
  private static readonly MAX_STORAGE_MB = 45; // iOS limit ~50MB
  private static readonly WARNING_THRESHOLD = 0.8; // 80% cảnh báo

  static async checkQuota(): Promise<{
    usage: number;
    quota: number;
    percentage: number;
    isNearLimit: boolean;
  }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 50 * 1024 * 1024; // 50MB fallback
      const percentage = usage / quota;

      return {
        usage,
        quota,
        percentage,
        isNearLimit: percentage > this.WARNING_THRESHOLD
      };
    }

    return {
      usage: 0,
      quota: 50 * 1024 * 1024,
      percentage: 0,
      isNearLimit: false
    };
  }

  static async requestPersistentStorage(): Promise<boolean> {
    if ('storage' in navigator && 'persist' in navigator.storage) {
      return await navigator.storage.persist();
    }
    return false;
  }

  static async isPersisted(): Promise<boolean> {
    if ('storage' in navigator && 'persisted' in navigator.storage) {
      return await navigator.storage.persisted();
    }
    return false;
  }

  // Auto cleanup khi gần đầy
  static async autoCleanup(): Promise<void> {
    const { isNearLimit } = await this.checkQuota();
    
    if (isNearLimit) {
      console.warn('Storage near limit, performing cleanup...');
      
      // 1. Xóa data cũ (>30 ngày và đã sync)
      const deletedCount = await db.cleanOldData(30);
      console.log(`Deleted ${deletedCount} old records`);

      // 2. Xóa old model versions, giữ lại latest
      const models = await db.cachedModels.toArray();
      if (models.length > 1) {
        const sortedModels = models.sort((a, b) => 
          b.metadata.uploadedAt - a.metadata.uploadedAt
        );
        const toDelete = sortedModels.slice(1); // Keep only latest
        await db.cachedModels.bulkDelete(toDelete.map(m => m.id));
      }

      // 3. Compress thumbnails quality
      // (implementation below)
    }
  }
}
```

---

## 🔄 Part 2: Background Sync Strategy (iOS Fallback)

### 2.1 Background Sync API với iOS Fallback

**File: `frontend/src/services/syncService.ts`**

```typescript
import { db } from '../db/database';
import { Detection } from '../db/schema';

class SyncService {
  private syncInProgress = false;
  private syncInterval: number | null = null;
  private readonly SYNC_INTERVAL_MS = 30000; // 30 seconds

  async init(): Promise<void> {
    // 1. Register Background Sync (Chrome, Edge)
    if ('serviceWorker' in navigator && 'sync' in navigator.serviceWorker) {
      await this.registerBackgroundSync();
    }

    // 2. iOS Fallback: Visibility Change
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        await this.syncNow();
      }
    });

    // 3. Online event
    window.addEventListener('online', async () => {
      console.log('Device back online, syncing...');
      await this.syncNow();
    });

    // 4. Periodic sync khi app active (iOS workaround)
    this.startPeriodicSync();

    // 5. Before unload - last chance sync
    window.addEventListener('beforeunload', async () => {
      if (navigator.onLine && !this.syncInProgress) {
        // Beacon API for guaranteed delivery
        await this.sendBeacon();
      }
    });
  }

  private async registerBackgroundSync(): Promise<void> {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('sync-detections');
      console.log('Background Sync registered');
    } catch (error) {
      console.warn('Background Sync not supported:', error);
    }
  }

  private startPeriodicSync(): void {
    // Only sync khi tab visible và online
    this.syncInterval = window.setInterval(async () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        await this.syncNow();
      }
    }, this.SYNC_INTERVAL_MS);
  }

  async syncNow(): Promise<{ synced: number; failed: number }> {
    if (this.syncInProgress || !navigator.onLine) {
      return { synced: 0, failed: 0 };
    }

    this.syncInProgress = true;
    let synced = 0;
    let failed = 0;

    try {
      const unsynced = await db.getUnsynced();
      console.log(`Syncing ${unsynced.length} records...`);

      // Sync từng batch (5 records at a time để tránh timeout)
      const BATCH_SIZE = 5;
      for (let i = 0; i < unsynced.length; i += BATCH_SIZE) {
        const batch = unsynced.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(record => this.syncRecord(record))
        );

        results.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            synced++;
          } else {
            failed++;
            console.error(`Failed to sync record ${batch[idx].id}:`, result.reason);
          }
        });

        // Small delay between batches
        if (i + BATCH_SIZE < unsynced.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Update last sync time
      await db.appState.put({
        id: 'app-state',
        lastSync: Date.now(),
        modelVersion: '', // Will be updated separately
        modelLastUpdate: 0
      });

      console.log(`Sync complete: ${synced} synced, ${failed} failed`);
      
      // Dispatch custom event để UI update
      window.dispatchEvent(new CustomEvent('sync-complete', {
        detail: { synced, failed }
      }));

    } finally {
      this.syncInProgress = false;
    }

    return { synced, failed };
  }

  private async syncRecord(record: Detection): Promise<void> {
    const formData = new FormData();
    
    // Append image (full size, not thumbnail)
    formData.append('image', record.imageBlob, 'detection.jpg');
    formData.append('label', record.label);
    formData.append('confidence', record.confidence.toString());
    formData.append('timestamp', new Date(record.timestamp).toISOString());
    formData.append('localInference', record.localInference.toString());

    if (record.metadata) {
      formData.append('metadata', JSON.stringify(record.metadata));
    }

    const response = await fetch('/api/v1/sync/detection', {
      method: 'POST',
      body: formData,
      headers: {
        'X-Client-ID': await this.getClientId()
      }
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`);
    }

    const result = await response.json();

    // Mark as synced
    await db.detections.update(record.id!, {
      synced: true,
      syncedAt: Date.now()
    });
  }

  // Beacon API for last-chance sync
  private async sendBeacon(): Promise<void> {
    const unsynced = await db.getUnsynced();
    if (unsynced.length === 0) return;

    const data = JSON.stringify({
      detections: unsynced.map(d => ({
        id: d.id,
        timestamp: d.timestamp,
        label: d.label,
        confidence: d.confidence
      }))
    });

    navigator.sendBeacon('/api/v1/sync/beacon', data);
  }

  private async getClientId(): Promise<string> {
    let state = await db.appState.get('app-state');
    if (!state?.userId) {
      const userId = crypto.randomUUID();
      await db.appState.put({
        id: 'app-state',
        lastSync: 0,
        modelVersion: '',
        modelLastUpdate: 0,
        userId
      });
      return userId;
    }
    return state.userId;
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export const syncService = new SyncService();
```

### 2.2 Service Worker Background Sync Handler

**File: `public/sw-custom.js`** (merge vào workbox config)

```javascript
// Background Sync Event (Chrome/Edge only)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-detections') {
    event.waitUntil(syncDetections());
  }
});

async function syncDetections() {
  console.log('[SW] Background sync triggered');
  
  try {
    // Open IndexedDB
    const db = await openDatabase();
    const unsynced = await getUnsyncedRecords(db);

    for (const record of unsynced) {
      await syncRecord(record);
    }

    // Notify main app
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        count: unsynced.length
      });
    });

  } catch (error) {
    console.error('[SW] Sync failed:', error);
    throw error; // Retry
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ShrimpDiseaseDB', 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getUnsyncedRecords(db) {
  return new Promise((resolve) => {
    const tx = db.transaction('detections', 'readonly');
    const store = tx.objectStore('detections');
    const index = store.index('synced');
    const request = index.getAll(0); // synced = 0 (false)
    
    request.onsuccess = () => resolve(request.result);
  });
}

async function syncRecord(record) {
  const formData = new FormData();
  formData.append('image', record.imageBlob);
  formData.append('label', record.label);
  formData.append('confidence', record.confidence);

  const response = await fetch('/api/v1/sync/detection', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) throw new Error('Sync failed');

  // Update record in IndexedDB
  const db = await openDatabase();
  const tx = db.transaction('detections', 'readwrite');
  const store = tx.objectStore('detections');
  record.synced = true;
  record.syncedAt = Date.now();
  store.put(record);
}
```

---

## 🔔 Part 3: Push Notifications (iOS 16.4+)

### 3.1 Push Subscription Manager

**File: `frontend/src/services/pushService.ts`**

```typescript
import { db } from '../db/database';

class PushService {
  private readonly VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

  async init(): Promise<void> {
    if (!this.isSupported()) {
      console.warn('Push notifications not supported');
      return;
    }

    // Check existing subscription
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      console.log('Push subscription exists');
      await this.saveSubscription(subscription);
    }
  }

  isSupported(): boolean {
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;

    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      await this.subscribe();
      return true;
    }

    return false;
  }

  async subscribe(): Promise<PushSubscription | null> {
    try {
      const registration = await navigator.serviceWorker.ready;

      // Unsubscribe existing
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        await existingSubscription.unsubscribe();
      }

      // Create new subscription
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.VAPID_PUBLIC_KEY)
      });

      await this.saveSubscription(subscription);
      await this.sendSubscriptionToServer(subscription);

      console.log('Push subscription created:', subscription.endpoint);
      return subscription;

    } catch (error) {
      console.error('Failed to subscribe to push:', error);
      return null;
    }
  }

  async unsubscribe(): Promise<boolean> {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      await this.deleteSubscriptionFromServer(subscription);
      
      // Remove from IndexedDB
      await db.appState.update('app-state', { pushSubscription: undefined });
      
      return true;
    }

    return false;
  }

  private async saveSubscription(subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    await db.appState.update('app-state', { pushSubscription: json });
  }

  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    const response = await fetch('/api/v1/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent,
        timestamp: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save subscription to server');
    }
  }

  private async deleteSubscriptionFromServer(subscription: PushSubscription): Promise<void> {
    await fetch('/api/v1/push/unsubscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint
      })
    });
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Test notification (client-side)
  async showTestNotification(): Promise<void> {
    const registration = await navigator.serviceWorker.ready;
    
    await registration.showNotification('ShrimpDetect Test', {
      body: 'Push notifications đang hoạt động!',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      vibrate: [200, 100, 200],
      tag: 'test-notification',
      requireInteraction: false
    });
  }
}

export const pushService = new PushService();
```

### 3.2 Service Worker Push Handler

**File: `public/sw-push.js`**

```javascript
// Push notification received
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let data = {
    title: 'ShrimpDetect',
    body: 'Bạn có thông báo mới',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png'
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/badge-72x72.png',
    vibrate: data.vibrate || [200, 100, 200],
    data: {
      url: data.url || '/',
      timestamp: Date.now(),
      ...data.data
    },
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);

  event.notification.close();

  // Handle action buttons
  if (event.action) {
    handleNotificationAction(event.action, event.notification.data);
    return;
  }

  // Open app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const url = event.notification.data?.url || '/';

        // Reuse existing window
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }

        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

function handleNotificationAction(action, data) {
  switch (action) {
    case 'view':
      clients.openWindow(data.url || '/');
      break;
    case 'dismiss':
      // Just close
      break;
    default:
      console.log('Unknown action:', action);
  }
}
```

### 3.3 Notification Templates

**File: `frontend/src/services/notificationTemplates.ts`**

```typescript
export interface NotificationTemplate {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  vibrate?: number[];
  requireInteraction?: boolean;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  data?: any;
}

export const notificationTemplates = {
  diseaseDetected: (confidence: number): NotificationTemplate => ({
    title: '⚠️ Phát hiện bệnh đốm trắng!',
    body: `Độ tin cậy: ${(confidence * 100).toFixed(1)}%. Vui lòng kiểm tra và xử lý ngay.`,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-warning.png',
    vibrate: [300, 100, 300, 100, 300],
    requireInteraction: true,
    actions: [
      { action: 'view', title: 'Xem chi tiết', icon: '/icons/action-view.png' },
      { action: 'dismiss', title: 'Đóng' }
    ],
    data: {
      type: 'disease-alert',
      url: '/?tab=history'
    }
  }),

  highRiskArea: (location: string): NotificationTemplate => ({
    title: '🚨 Cảnh báo khu vực',
    body: `Phát hiện nhiều ca bệnh ở ${location}. Tăng cường kiểm tra ao nuôi.`,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-alert.png',
    vibrate: [200, 100, 200],
    requireInteraction: false,
    data: {
      type: 'area-alert',
      location
    }
  }),

  syncComplete: (count: number): NotificationTemplate => ({
    title: 'Đồng bộ hoàn tất',
    body: `Đã đồng bộ ${count} kết quả lên server.`,
    icon: '/icons/icon-192x192.png',
    vibrate: [100],
    requireInteraction: false,
    data: {
      type: 'sync-complete'
    }
  }),

  modelUpdate: (version: string): NotificationTemplate => ({
    title: 'Cập nhật AI Model',
    body: `Phiên bản ${version} đã sẵn sàng. Nhấn để cập nhật.`,
    icon: '/icons/icon-192x192.png',
    actions: [
      { action: 'update', title: 'Cập nhật ngay' },
      { action: 'later', title: 'Để sau' }
    ],
    data: {
      type: 'model-update',
      version
    }
  })
};
```

---

## 🎨 Part 4: UI Components với Responsive Design

### 4.1 iOS-Optimized CSS Variables

**File: `frontend/src/styles/ios-optimized.css`**

```css
:root {
  /* Safe areas for iOS notch/home indicator */
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);

  /* iOS-friendly tap targets (min 44x44 points) */
  --tap-target-min: 44px;
  
  /* Responsive spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* Typography optimized for readability */
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-base: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
  --font-size-2xl: 32px;

  /* Line heights for mobile */
  --line-height-tight: 1.25;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;
}

/* iOS-specific overrides */
@supports (-webkit-touch-callout: none) {
  :root {
    /* Disable iOS text size adjustment */
    -webkit-text-size-adjust: 100%;
  }

  /* Smooth scrolling */
  * {
    -webkit-overflow-scrolling: touch;
  }

  /* Remove iOS input shadow */
  input,
  textarea,
  select {
    -webkit-appearance: none;
    border-radius: 0;
  }

  /* Button styling */
  button {
    -webkit-tap-highlight-color: transparent;
  }
}

/* Safe area utilities */
.safe-top {
  padding-top: max(var(--spacing-md), var(--safe-area-top));
}

.safe-bottom {
  padding-bottom: max(var(--spacing-md), var(--safe-area-bottom));
}

.safe-left {
  padding-left: max(var(--spacing-md), var(--safe-area-left));
}

.safe-right {
  padding-right: max(var(--spacing-md), var(--safe-area-right));
}

/* Responsive container */
.container-app {
  width: 100%;
  margin: 0 auto;
  padding-left: max(var(--spacing-md), var(--safe-area-left));
  padding-right: max(var(--spacing-md), var(--safe-area-right));
}

@media (min-width: 768px) {
  .container-app {
    max-width: 768px;
  }
}

@media (min-width: 1024px) {
  .container-app {
    max-width: 1024px;
  }
}

/* Touch-friendly buttons */
.btn {
  min-height: var(--tap-target-min);
  min-width: var(--tap-target-min);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-base);
  border-radius: 12px;
  transition: all 0.2s ease;
  touch-action: manipulation;
  user-select: none;
}

.btn:active {
  transform: scale(0.97);
  opacity: 0.8;
}

/* Card design */
.card {
  background: var(--color-surface);
  border-radius: 16px;
  padding: var(--spacing-md);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: var(--spacing-md);
}

@media (min-width: 768px) {
  .card {
    padding: var(--spacing-lg);
    border-radius: 20px;
  }
}

/* Modal/Bottom Sheet iOS style */
.bottom-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-surface);
  border-radius: 20px 20px 0 0;
  padding: var(--spacing-lg);
  padding-bottom: max(var(--spacing-lg), var(--safe-area-bottom));
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  transform: translateY(100%);
  transition: transform 0.3s ease;
}

.bottom-sheet.active {
  transform: translateY(0);
}

.bottom-sheet::before {
  content: '';
  display: block;
  width: 40px;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  margin: 0 auto var(--spacing-md);
}
```

### 4.2 Sync Status Component

**File: `frontend/src/components/SyncStatus.tsx`**

```typescript
import { useState, useEffect } from 'react';
import { syncService } from '../services/syncService';
import { db } from '../db/database';

export function SyncStatus() {
  const [unsynced, setUnsynced] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    loadUnsyncedCount();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleSyncComplete = () => {
      setSyncing(false);
      loadUnsyncedCount();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sync-complete', handleSyncComplete);

    // Refresh count mỗi 10s
    const interval = setInterval(loadUnsyncedCount, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sync-complete', handleSyncComplete);
      clearInterval(interval);
    };
  }, []);

  async function loadUnsyncedCount() {
    const records = await db.getUnsynced();
    setUnsynced(records.length);
  }

  async function handleManualSync() {
    if (!isOnline || syncing) return;
    
    setSyncing(true);
    try {
      await syncService.syncNow();
    } finally {
      setSyncing(false);
    }
  }

  if (unsynced === 0) return null;

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            {syncing ? (
              <div className="animate-spin h-5 w-5 border-2 border-yellow-600 border-t-transparent rounded-full" />
            ) : (
              <svg className="h-5 w-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-yellow-800">
              {syncing ? 'Đang đồng bộ...' : `${unsynced} kết quả chưa đồng bộ`}
            </p>
            <p className="text-xs text-yellow-700 mt-0.5">
              {!isOnline && 'Không có kết nối mạng'}
            </p>
          </div>
        </div>
        
        {isOnline && !syncing && (
          <button
            onClick={handleManualSync}
            className="btn-sm bg-yellow-600 text-white hover:bg-yellow-700"
          >
            Đồng bộ ngay
          </button>
        )}
      </div>
    </div>
  );
}
```

### 4.3 Push Permission Request Component

**File: `frontend/src/components/PushPermission.tsx`**

```typescript
import { useState } from 'react';
import { pushService } from '../services/pushService';

export function PushPermission() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('push-permission-dismissed') === 'true';
  });
  const [permission, setPermission] = useState(Notification.permission);

  if (!pushService.isSupported() || permission === 'granted' || dismissed) {
    return null;
  }

  async function handleAllow() {
    const granted = await pushService.requestPermission();
    if (granted) {
      setPermission('granted');
    } else {
      setDismissed(true);
      localStorage.setItem('push-permission-dismissed', 'true');
    }
  }

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem('push-permission-dismissed', 'true');
  }

  return (
    <div className="card bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
        </div>
        
        <div className="flex-1">
          <h3 className="text-base font-semibold text-gray-900 mb-1">
            Nhận thông báo cảnh báo bệnh
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            Được thông báo ngay khi phát hiện bệnh đốm trắng với độ tin cậy cao, 
            giúp bạn xử lý kịp thời.
          </p>
          
          <div className="flex gap-2">
            <button
              onClick={handleAllow}
              className="btn bg-blue-600 text-white hover:bg-blue-700 flex-1 sm:flex-initial"
            >
              Cho phép
            </button>
            <button
              onClick={handleDismiss}
              className="btn bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              Để sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## 📦 Part 5: Installation & Integration

### 5.1 Update main App component

**File: `frontend/src/App.tsx`** (additions)

```typescript
import { SyncStatus } from './components/SyncStatus';
import { PushPermission } from './components/PushPermission';
import { syncService } from './services/syncService';
import { pushService } from './services/pushService';
import { StorageManager } from './db/storageManager';

function App() {
  // ... existing code ...

  useEffect(() => {
    // Initialize services
    const initServices = async () => {
      // 1. Sync service
      await syncService.init();
      
      // 2. Push notifications
      await pushService.init();
      
      // 3. Request persistent storage
      const persisted = await StorageManager.requestPersistentStorage();
      console.log('Persistent storage:', persisted);
      
      // 4. Auto cleanup if needed
      await StorageManager.autoCleanup();
    };

    initServices();

    return () => {
      syncService.stopAutoSync();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="safe-top">
        {/* ... existing header ... */}
      </header>

      {/* Add sync status banner */}
      <div className="container-app">
        <SyncStatus />
        <PushPermission />
      </div>

      {/* ... rest of app ... */}
    </div>
  );
}
```

### 5.2 Environment Variables

**File: `frontend/.env.example`**

```env
# API Endpoints
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws

# Push Notifications (VAPID)
VITE_VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY_HERE

# Features
VITE_ENABLE_PUSH=true
VITE_ENABLE_BACKGROUND_SYNC=true
VITE_SYNC_INTERVAL=30000

# Storage
VITE_MAX_STORAGE_MB=45
VITE_AUTO_CLEANUP_DAYS=30
```

### 5.3 Package.json updates

```json
{
  "dependencies": {
    "dexie": "^4.0.1",
    "@tensorflow/tfjs": "^4.15.0",
    "@tensorflow/tfjs-backend-webgl": "^4.15.0"
  },
  "devDependencies": {
    "@types/dexie": "^4.0.0"
  }
}
```

---

## 🧪 Testing Checklist

### iOS Safari Testing
- [ ] PWA install to home screen works
- [ ] Camera access works (https required)
- [ ] IndexedDB persistence (check after app close/reopen)
- [ ] Offline mode - detect without network
- [ ] Online sync - auto sync when network returns
- [ ] Push notifications (iOS 16.4+)
- [ ] Safe area insets (notch, home indicator)
- [ ] Touch targets ≥ 44x44 points
- [ ] Smooth scrolling
- [ ] No zoom on input focus

### Desktop Testing
- [ ] Responsive layout (768px, 1024px, 1920px)
- [ ] Background Sync API (Chrome/Edge)
- [ ] Service Worker updates
- [ ] IndexedDB data persistence
- [ ] Keyboard navigation

### Performance
- [ ] First load < 3s on 3G
- [ ] AI inference < 2s
- [ ] Sync batch size optimal
- [ ] Storage auto-cleanup works
- [ ] No memory leaks

---

## 🚀 Deployment Steps

1. **Build với cache busting**
```bash
cd frontend
npm run build
```

2. **Test PWA locally**
```bash
npm run preview
# Access via https://localhost:4173 (or use ngrok for HTTPS)
```

3. **Deploy to production**
- Deploy to HTTPS domain (required for PWA)
- Configure CORS for API
- Set up VAPID keys for push
- Test on real iOS device (Safari)

---

## 📊 Expected Outcomes

### Storage Usage (iOS)
- App bundle: ~2-5 MB
- TensorFlow.js model: ~8-15 MB (quantized)
- Detection images (50 records): ~10-20 MB
- Total: ~20-40 MB (well under 50MB iOS limit)

### Performance Targets
- First load: < 3s (3G)
- AI inference: < 2s
- Sync latency: < 5s (batch of 5)
- Offline mode: 100% functional

### User Experience
- ✅ Install to home screen (1 tap)
- ✅ Work offline completely
- ✅ Auto sync when online
- ✅ Push notifications for alerts
- ✅ Native-like performance
