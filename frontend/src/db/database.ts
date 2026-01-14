import Dexie, { Table } from 'dexie';

// Detection record - lưu kết quả phát hiện bệnh
export interface DetectionRecord {
    id?: number;
    timestamp: Date;
    imageBlob: Blob;
    imagePreview: string; // Base64 thumbnail for quick display
    label: 'Healthy' | 'WSD';
    confidence: number;
    processingTime?: number;
    synced: boolean; // Đã đồng bộ lên server chưa
    syncedAt?: Date;
}

// Chat message - lưu lịch sử chat
export interface ChatMessage {
    id?: number;
    text: string;
    isUser: boolean;
    timestamp: Date;
    synced: boolean;
}

// App settings
export interface AppSettings {
    id?: number;
    key: string;
    value: string;
}

class ShrimpDatabase extends Dexie {
    detections!: Table<DetectionRecord>;
    chatMessages!: Table<ChatMessage>;
    settings!: Table<AppSettings>;

    constructor() {
        super('ShrimpDiseaseDB');

        this.version(1).stores({
            detections: '++id, timestamp, label, synced',
            chatMessages: '++id, timestamp, synced',
            settings: '++id, &key'
        });
    }
}

export const db = new ShrimpDatabase();

// Helper functions
export const dbHelpers = {
    // Save detection result
    async saveDetection(
        imageBlob: Blob,
        imagePreview: string,
        label: 'Healthy' | 'WSD',
        confidence: number,
        processingTime?: number
    ): Promise<number> {
        return await db.detections.add({
            timestamp: new Date(),
            imageBlob,
            imagePreview,
            label,
            confidence,
            processingTime,
            synced: false
        });
    },

    // Get all detections (most recent first)
    async getDetections(limit = 50): Promise<DetectionRecord[]> {
        return await db.detections
            .orderBy('timestamp')
            .reverse()
            .limit(limit)
            .toArray();
    },

    // Get pending sync records
    async getPendingSync(): Promise<DetectionRecord[]> {
        return await db.detections
            .where('synced')
            .equals(0) // false = 0 in IndexedDB
            .toArray();
    },

    // Mark as synced
    async markSynced(id: number): Promise<void> {
        await db.detections.update(id, {
            synced: true,
            syncedAt: new Date()
        });
    },

    // Delete old records (older than 30 days)
    async cleanupOldRecords(): Promise<number> {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        return await db.detections
            .where('timestamp')
            .below(thirtyDaysAgo)
            .and(record => record.synced)
            .delete();
    },

    // Get statistics
    async getStats(): Promise<{
        total: number;
        healthy: number;
        wsd: number;
        pending: number;
    }> {
        const all = await db.detections.toArray();
        return {
            total: all.length,
            healthy: all.filter(r => r.label === 'Healthy').length,
            wsd: all.filter(r => r.label === 'WSD').length,
            pending: all.filter(r => !r.synced).length
        };
    },

    // Save chat message
    async saveChatMessage(text: string, isUser: boolean): Promise<number> {
        return await db.chatMessages.add({
            text,
            isUser,
            timestamp: new Date(),
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
    }
};
