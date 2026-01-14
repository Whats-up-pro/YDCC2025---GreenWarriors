import { db, dbHelpers, DetectionRecord } from '../db/database';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class SyncService {
    private isSyncing = false;
    private syncInterval: number | null = null;

    // Check network status
    isOnline(): boolean {
        return navigator.onLine;
    }

    // Start auto-sync (every 5 minutes when online)
    startAutoSync(intervalMs = 5 * 60 * 1000): void {
        if (this.syncInterval) return;

        // Sync immediately if online
        if (this.isOnline()) {
            this.syncPendingRecords();
        }

        // Set up interval
        this.syncInterval = window.setInterval(() => {
            if (this.isOnline()) {
                this.syncPendingRecords();
            }
        }, intervalMs);

        // Listen for online event
        window.addEventListener('online', this.handleOnline);
    }

    // Stop auto-sync
    stopAutoSync(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        window.removeEventListener('online', this.handleOnline);
    }

    // Handle coming online
    private handleOnline = (): void => {
        console.log('📶 Network restored, starting sync...');
        this.syncPendingRecords();
    };

    // Sync all pending detection records
    async syncPendingRecords(): Promise<{
        synced: number;
        failed: number;
        errors: string[];
    }> {
        if (this.isSyncing) {
            console.log('⏳ Sync already in progress');
            return { synced: 0, failed: 0, errors: ['Sync already in progress'] };
        }

        if (!this.isOnline()) {
            console.log('📴 Offline, skipping sync');
            return { synced: 0, failed: 0, errors: ['Device is offline'] };
        }

        this.isSyncing = true;
        const results = { synced: 0, failed: 0, errors: [] as string[] };

        try {
            const pendingRecords = await dbHelpers.getPendingSync();
            console.log(`📤 Syncing ${pendingRecords.length} pending records...`);

            for (const record of pendingRecords) {
                try {
                    await this.syncRecord(record);
                    await dbHelpers.markSynced(record.id!);
                    results.synced++;
                } catch (error) {
                    results.failed++;
                    results.errors.push(`Record ${record.id}: ${error}`);
                    console.error(`❌ Failed to sync record ${record.id}:`, error);
                }
            }

            console.log(`✅ Sync complete: ${results.synced} synced, ${results.failed} failed`);
        } catch (error) {
            results.errors.push(`Sync error: ${error}`);
            console.error('❌ Sync failed:', error);
        } finally {
            this.isSyncing = false;
        }

        return results;
    }

    // Sync a single record to server
    private async syncRecord(record: DetectionRecord): Promise<void> {
        const formData = new FormData();
        formData.append('image', record.imageBlob, 'image.jpg');
        formData.append('label', record.label);
        formData.append('confidence', record.confidence.toString());
        formData.append('timestamp', record.timestamp.toISOString());
        if (record.processingTime) {
            formData.append('processing_time', record.processingTime.toString());
        }

        const response = await fetch(`${API_BASE_URL}/api/v1/sync`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
    }

    // Get sync status
    async getSyncStatus(): Promise<{
        pendingCount: number;
        lastSyncedAt: Date | null;
        isOnline: boolean;
        isSyncing: boolean;
    }> {
        const stats = await dbHelpers.getStats();
        const lastSynced = await db.detections
            .where('synced')
            .equals(1) // true
            .reverse()
            .first();

        return {
            pendingCount: stats.pending,
            lastSyncedAt: lastSynced?.syncedAt || null,
            isOnline: this.isOnline(),
            isSyncing: this.isSyncing
        };
    }
}

export const syncService = new SyncService();
