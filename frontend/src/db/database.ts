import Dexie, { Table } from 'dexie';

// Detection record - lưu kết quả phát hiện bệnh
export interface DetectionRecord {
    id?: number;
    timestamp: number; // Unix timestamp for better indexing
    imageBlob: Blob;
    imageThumbnail: Blob; // Thumbnail 150x150 for quick display
    label: 'Healthy' | 'WSD' | 'Unknown';
    confidence: number;
    localInference: boolean; // true = TF.js local, false = server
    processingTime?: number;
    synced: boolean; // Đã đồng bộ lên server chưa
    syncedAt?: number;
    serverId?: number; // ID từ backend sau khi sync
    metadata?: {
        location?: { lat: number; lng: number };
        pondId?: string;
        notes?: string;
    };
}

// Chat message - lưu lịch sử chat
export interface ChatMessage {
    id?: number;
    text: string;
    role: 'user' | 'assistant'; // Thay đổi từ isUser
    timestamp: number;
    synced: boolean;
    syncedAt?: number;
}

// App settings
export interface AppSettings {
    id: string; // 'app-state' for main state
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

// Cached AI model
export interface CachedModel {
    id: string; // model version
    modelData: ArrayBuffer;
    metadata: {
        version: string;
        size: number;
        uploadedAt: number;
        checksum?: string;
    };
}

// Sync queue for failed syncs
export interface SyncQueue {
    id?: number;
    timestamp: number;
    type: 'detection' | 'chat' | 'feedback';
    payload: any;
    retries: number;
    lastError?: string;
}

class ShrimpDatabase extends Dexie {
    detections!: Table<DetectionRecord>;
    chatMessages!: Table<ChatMessage>;
    appState!: Table<AppSettings>;
    cachedModels!: Table<CachedModel>;
    syncQueue!: Table<SyncQueue>;

    constructor() {
        super('ShrimpDiseaseDB');

        // Version 1: Initial schema
        this.version(1).stores({
            detections: '++id, timestamp, label, synced',
            chatMessages: '++id, timestamp, synced',
            appState: 'id',
            cachedModels: 'id',
            syncQueue: '++id, timestamp, type'
        });

        // Version 2: Add compound indexes for better performance
        this.version(2).stores({
            detections: '++id, timestamp, synced, label, [synced+timestamp], [label+timestamp], serverId',
            chatMessages: '++id, timestamp, synced, [synced+timestamp]',
            appState: 'id',
            cachedModels: 'id, metadata.uploadedAt',
            syncQueue: '++id, timestamp, type, [type+timestamp], retries'
        });

        // Auto-add timestamps on create
        this.detections.hook('creating', (_primKey, obj) => {
            if (!obj.timestamp) {
                obj.timestamp = Date.now();
            }
            if (obj.synced === undefined) {
                obj.synced = false;
            }
        });

        this.chatMessages.hook('creating', (_primKey, obj) => {
            if (!obj.timestamp) {
                obj.timestamp = Date.now();
            }
            if (obj.synced === undefined) {
                obj.synced = false;
            }
        });
    }
}

export const db = new ShrimpDatabase();

// Database initialization promise for waiting
let dbInitialized = false;
let dbInitError: Error | null = null;

// Initialize database
const dbInitPromise = db.open()
    .then(() => {
        console.log('✅ IndexedDB opened successfully');
        console.log('📊 Database version:', db.verno);
        console.log('📦 Tables:', Object.keys(db.tables));
        dbInitialized = true;
        return true;
    })
    .catch((err) => {
        console.error('❌ Failed to open IndexedDB:', err);
        console.error('Error name:', err.name);
        console.error('Error message:', err.message);
        
        dbInitError = err;
        
        // Show user-friendly error
        if (err.name === 'QuotaExceededError') {
            console.error('💾 Storage quota exceeded! Clear some data.');
        } else if (err.name === 'VersionError') {
            console.error('🔄 Database version mismatch. Consider clearing data.');
        }
        
        throw err; // Re-throw to make promise reject
    });

// Export init status
export const isDatabaseReady = () => dbInitialized;
export const getDatabaseError = () => dbInitError;
export const waitForDatabase = () => dbInitPromise;

// Helper functions
export const dbHelpers = {
    // Save detection result
    async saveDetection(
        imageBlob: Blob,
        imageThumbnail: Blob,
        label: 'Healthy' | 'WSD' | 'Unknown',
        confidence: number,
        localInference: boolean,
        processingTime?: number,
        metadata?: any
    ): Promise<number> {
        return await db.detections.add({
            timestamp: Date.now(),
            imageBlob,
            imageThumbnail,
            label,
            confidence,
            localInference,
            processingTime,
            synced: false,
            metadata
        });
    },

    // Get all detections (most recent first)
    async getDetections(limit = 50): Promise<DetectionRecord[]> {
        try {
            console.log('🔍 Getting detections, limit:', limit);
            const records = await db.detections
                .orderBy('timestamp')
                .reverse()
                .limit(limit)
                .toArray();
            console.log('✅ Found', records.length, 'records');
            return records;
        } catch (error) {
            console.error('❌ Error getting detections:', error);
            throw error;
        }
    },

    // Get unsynced detections
    async getUnsynced(): Promise<DetectionRecord[]> {
        return await db.detections
            .where('synced')
            .equals(0) // false = 0 in IndexedDB
            .sortBy('timestamp');
    },

    // Get pending sync records (alias for backward compatibility)
    async getPendingSync(): Promise<DetectionRecord[]> {
        return this.getUnsynced();
    },

    // Mark as synced
    async markSynced(id: number, serverId?: number): Promise<void> {
        await db.detections.update(id, {
            synced: true,
            syncedAt: Date.now(),
            serverId
        });
    },

    // Get recent detections
    async getRecentDetections(limit: number = 20): Promise<DetectionRecord[]> {
        return db.detections
            .orderBy('timestamp')
            .reverse()
            .limit(limit)
            .toArray();
    },

    // Get detection stats
    async getDetectionStats(days: number = 7) {
        const since = Date.now() - (days * 24 * 60 * 60 * 1000);
        const detections = await db.detections
            .where('timestamp')
            .above(since)
            .toArray();

        const wsdCount = detections.filter(d => d.label === 'WSD').length;
        const healthyCount = detections.filter(d => d.label === 'Healthy').length;
        const totalConfidence = detections.reduce((sum, d) => sum + d.confidence, 0);

        return {
            total: detections.length,
            wsd: wsdCount,
            healthy: healthyCount,
            unknown: detections.length - wsdCount - healthyCount,
            avgConfidence: detections.length > 0 ? totalConfidence / detections.length : 0,
            wsdPercentage: detections.length > 0 ? (wsdCount / detections.length) * 100 : 0
        };
    },

    // Clean old synced data
    async cleanOldData(daysToKeep: number = 30): Promise<number> {
        const threshold = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
        
        const toDelete = await db.detections
            .where('timestamp')
            .below(threshold)
            .and(d => d.synced === true)
            .toArray();

        if (toDelete.length > 0) {
            await db.detections.bulkDelete(toDelete.map(d => d.id!));
            console.log(`Cleaned ${toDelete.length} old detection records`);
        }

        return toDelete.length;
    },

    // Delete old records (older than 30 days) - backward compatibility
    async cleanupOldRecords(): Promise<number> {
        return this.cleanOldData(30);
    },

    // Get statistics
    async getStats(): Promise<{
        total: number;
        healthy: number;
        wsd: number;
        pending: number;
    }> {
        try {
            console.log('📊 Getting stats...');
            const all = await db.detections.toArray();
            console.log('📈 Total records in DB:', all.length);
            
            const stats = {
                total: all.length,
                healthy: all.filter(r => r.label === 'Healthy').length,
                wsd: all.filter(r => r.label === 'WSD').length,
                pending: all.filter(r => !r.synced).length
            };
            
            console.log('✅ Stats:', stats);
            return stats;
        } catch (error) {
            console.error('❌ Error getting stats:', error);
            throw error;
        }
    },

    // Get or create app state
    async getAppState(): Promise<AppSettings> {
        let state = await db.appState.get('app-state');
        
        if (!state) {
            state = {
                id: 'app-state',
                lastSync: 0,
                modelVersion: '',
                modelLastUpdate: 0,
                userId: crypto.randomUUID(),
                settings: {
                    notificationsEnabled: false,
                    autoSync: true,
                    syncInterval: 30000
                }
            };
            await db.appState.put(state);
        }
        
        return state;
    },

    // Update app state
    async updateAppState(updates: Partial<AppSettings>): Promise<void> {
        const state = await this.getAppState();
        await db.appState.put({ ...state, ...updates });
    },

    // Save chat message
    async saveChatMessage(text: string, role: 'user' | 'assistant'): Promise<number> {
        return await db.chatMessages.add({
            text,
            role,
            timestamp: Date.now(),
            synced: false
        });
    },

    // Get chat history
    async getChatHistory(limit = 100): Promise<ChatMessage[]> {
        return await db.chatMessages
            .orderBy('timestamp')
            .limit(limit)
            .toArray();
    },

    // Clear all data
    async clearAll(): Promise<void> {
        await db.detections.clear();
        await db.chatMessages.clear();
        await db.syncQueue.clear();
    },

    // Get storage usage
    async getStorageUsage(): Promise<{
        detections: number;
        chatMessages: number;
        models: number;
        total: number;
    }> {
        const detectionCount = await db.detections.count();
        const chatCount = await db.chatMessages.count();
        const modelCount = await db.cachedModels.count();

        return {
            detections: detectionCount,
            chatMessages: chatCount,
            models: modelCount,
            total: detectionCount + chatCount + modelCount
        };
    }
};
