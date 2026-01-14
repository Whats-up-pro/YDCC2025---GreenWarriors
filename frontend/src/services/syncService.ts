import { dbHelpers, DetectionRecord } from '../db/database';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * SyncService - Background sync với fallback cho iOS
 * 
 * Strategy:
 * 1. Background Sync API (Chrome/Edge)
 * 2. Visibility Change (iOS fallback)
 * 3. Periodic sync khi app active
 * 4. Beacon API cho last-chance sync
 */
class SyncService {
    private isSyncing = false;
    private syncInterval: number | null = null;
    private readonly SYNC_INTERVAL_MS = 30000; // 30 seconds
    private readonly BATCH_SIZE = 5; // Sync 5 records at a time

    // Check network status
    isOnline(): boolean {
        return navigator.onLine;
    }

    /**
     * Initialize sync service
     */
    async init(): Promise<void> {
        console.log('[SyncService] Initializing...');

        // 1. Register Background Sync (Chrome, Edge)
        if ('serviceWorker' in navigator && 'sync' in (navigator.serviceWorker as any)) {
            await this.registerBackgroundSync();
        } else {
            console.log('[SyncService] Background Sync API not supported, using fallback');
        }

        // 2. iOS Fallback: Visibility Change
        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible' && this.isOnline()) {
                console.log('[SyncService] App became visible, triggering sync');
                await this.syncNow();
            }
        });

        // 3. Online event
        window.addEventListener('online', this.handleOnline);

        // 4. Periodic sync khi app active (iOS workaround)
        this.startAutoSync();

        // 5. Before unload - last chance sync
        window.addEventListener('beforeunload', () => {
            if (this.isOnline() && !this.isSyncing) {
                this.sendBeacon();
            }
        });

        // 6. Listen to SW messages
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data.type === 'SYNC_COMPLETE') {
                    console.log(`[SyncService] SW sync completed: ${event.data.count} records`);
                    this.notifySyncComplete(event.data.count, 0);
                }
            });
        }

        console.log('[SyncService] Initialized successfully');
    }

    /**
     * Register Background Sync API
     */
    private async registerBackgroundSync(): Promise<void> {
        try {
            const registration = await navigator.serviceWorker.ready;
            await (registration as any).sync.register('sync-detections');
            console.log('[SyncService] Background Sync registered');
        } catch (error) {
            console.warn('[SyncService] Background Sync registration failed:', error);
        }
    }

    // Start auto-sync (iOS fallback + periodic sync)
    startAutoSync(intervalMs = this.SYNC_INTERVAL_MS): void {
        if (this.syncInterval) return;

        // Sync immediately if online
        if (this.isOnline()) {
            this.syncNow();
        }

        // Set up interval - only sync khi tab visible và online
        this.syncInterval = window.setInterval(async () => {
            if (document.visibilityState === 'visible' && this.isOnline() && !this.isSyncing) {
                await this.syncNow();
            }
        }, intervalMs);

        console.log(`[SyncService] Periodic sync started (${intervalMs}ms interval)`);
    }

    // Stop auto-sync
    stopAutoSync(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('[SyncService] Periodic sync stopped');
        }
        window.removeEventListener('online', this.handleOnline);
    }

    // Handle coming online
    private handleOnline = async (): Promise<void> => {
        console.log('[SyncService] Device back online, syncing...');
        await this.syncNow();
    };

    /**
     * Sync now - main sync logic
     */
    async syncNow(): Promise<{ synced: number; failed: number }> {
        if (this.isSyncing) {
            console.log('[SyncService] Sync already in progress');
            return { synced: 0, failed: 0 };
        }

        if (!this.isOnline()) {
            console.log('[SyncService] Device offline, skipping sync');
            return { synced: 0, failed: 0 };
        }

        this.isSyncing = true;
        let synced = 0;
        let failed = 0;

        try {
            const unsynced = await dbHelpers.getUnsynced();
            
            if (unsynced.length === 0) {
                console.log('[SyncService] No records to sync');
                return { synced: 0, failed: 0 };
            }

            console.log(`[SyncService] Syncing ${unsynced.length} records...`);

            // Sync từng batch để tránh timeout
            for (let i = 0; i < unsynced.length; i += this.BATCH_SIZE) {
                const batch = unsynced.slice(i, i + this.BATCH_SIZE);
                console.log(`[SyncService] Processing batch ${Math.floor(i / this.BATCH_SIZE) + 1}/${Math.ceil(unsynced.length / this.BATCH_SIZE)}`);

                const results = await Promise.allSettled(
                    batch.map(record => this.syncRecord(record))
                );

                results.forEach((result, idx) => {
                    if (result.status === 'fulfilled') {
                        synced++;
                    } else {
                        failed++;
                        console.error(`[SyncService] Failed to sync record ${batch[idx].id}:`, result.reason);
                    }
                });

                // Small delay between batches
                if (i + this.BATCH_SIZE < unsynced.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            // Update last sync time
            await dbHelpers.updateAppState({
                lastSync: Date.now()
            });

            console.log(`[SyncService] Sync complete: ${synced} synced, ${failed} failed`);
            
            this.notifySyncComplete(synced, failed);

        } catch (error) {
            console.error('[SyncService] Sync error:', error);
        } finally {
            this.isSyncing = false;
        }

        return { synced, failed };
    }

    // Sync all pending detection records (alias)
    async syncPendingRecords(): Promise<{
        synced: number;
        failed: number;
        errors: string[];
    }> {
        const result = await this.syncNow();
        return {
            ...result,
            errors: result.failed > 0 ? [`${result.failed} records failed to sync`] : []
        };
    }

    // Sync a single record to server
    private async syncRecord(record: DetectionRecord): Promise<void> {
        const formData = new FormData();
        
        // Append image (full size, not thumbnail)
        formData.append('image', record.imageBlob, 'detection.jpg');
        formData.append('label', record.label);
        formData.append('confidence', record.confidence.toString());
        formData.append('timestamp', new Date(record.timestamp).toISOString());
        formData.append('localInference', record.localInference.toString());

        if (record.processingTime) {
            formData.append('processing_time', record.processingTime.toString());
        }

        if (record.metadata) {
            formData.append('metadata', JSON.stringify(record.metadata));
        }

        // Get client ID
        const appState = await dbHelpers.getAppState();
        formData.append('clientId', appState.userId || '');

        const response = await fetch(`${API_BASE_URL}/api/v1/sync/detection`, {
            method: 'POST',
            body: formData,
            headers: {
                'X-Client-ID': appState.userId || ''
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Sync failed (${response.status}): ${errorText}`);
        }

        const result = await response.json();

        // Mark as synced and save server ID
        await dbHelpers.markSynced(record.id!, result.id || result.detection_id);
    }

    /**
     * Beacon API for last-chance sync when page unloads
     */
    private sendBeacon(): void {
        dbHelpers.getUnsynced().then(unsynced => {
            if (unsynced.length === 0) return;

            const data = JSON.stringify({
                detections: unsynced.map(d => ({
                    id: d.id,
                    timestamp: d.timestamp,
                    label: d.label,
                    confidence: d.confidence,
                    localInference: d.localInference
                }))
            });

            navigator.sendBeacon(`${API_BASE_URL}/api/v1/sync/beacon`, data);
            console.log(`[SyncService] Sent beacon with ${unsynced.length} records`);
        });
    }

    /**
     * Notify sync complete
     */
    private notifySyncComplete(synced: number, failed: number): void {
        window.dispatchEvent(new CustomEvent('sync-complete', {
            detail: { synced, failed }
        }));
    }

    // Get sync status
    async getSyncStatus(): Promise<{
        pendingCount: number;
        lastSyncedAt: number | null;
        isOnline: boolean;
        isSyncing: boolean;
    }> {
        const stats = await dbHelpers.getStats();
        const appState = await dbHelpers.getAppState();

        return {
            pendingCount: stats.pending,
            lastSyncedAt: appState.lastSync || null,
            isOnline: this.isOnline(),
            isSyncing: this.isSyncing
        };
    }
}

export const syncService = new SyncService();
