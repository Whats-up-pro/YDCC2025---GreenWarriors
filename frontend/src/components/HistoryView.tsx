import { useState, useEffect } from 'react';
import { dbHelpers, DetectionRecord, waitForDatabase, getDatabaseError } from '../db/database';
import { syncService } from '../services/syncService';

export const HistoryView = () => {
    const [records, setRecords] = useState<DetectionRecord[]>([]);
    const [stats, setStats] = useState({ total: 0, healthy: 0, wsd: 0, pending: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [thumbnailUrls, setThumbnailUrls] = useState<Map<number, string>>(new Map());

    // Check IndexedDB availability
    useEffect(() => {
        console.log('🔍 HistoryView mounted');
        
        // Check if IndexedDB is available
        if (!window.indexedDB) {
            console.error('❌ IndexedDB not available');
            setError('Trình duyệt không hỗ trợ lưu trữ dữ liệu. Vui lòng sử dụng trình duyệt khác hoặc tắt chế độ riêng tư.');
            setIsLoading(false);
            return;
        }
        
        loadData();

        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            console.log('🧹 HistoryView unmounting');
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            // Cleanup all Blob URLs
            thumbnailUrls.forEach(url => URL.revokeObjectURL(url));
        };
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            console.log('🔄 Loading history data...');
            
            // Wait for database initialization
            try {
                console.log('⏳ Waiting for database...');
                await waitForDatabase();
                console.log('✅ Database ready');
            } catch (dbError) {
                const error = getDatabaseError();
                console.error('❌ Database init failed:', error);
                throw new Error(`Không thể khởi tạo database: ${error?.message || 'Unknown error'}`);
            }
            
            const [fetchedRecords, fetchedStats] = await Promise.all([
                dbHelpers.getDetections(50),
                dbHelpers.getStats()
            ]);
            
            console.log('📊 Fetched records:', fetchedRecords.length);
            console.log('📈 Stats:', fetchedStats);
            
            // Create Blob URLs for thumbnails
            const urlMap = new Map<number, string>();
            if (fetchedRecords && fetchedRecords.length > 0) {
                fetchedRecords.forEach(record => {
                    if (record.id && record.imageThumbnail) {
                        try {
                            const url = URL.createObjectURL(record.imageThumbnail);
                            urlMap.set(record.id, url);
                        } catch (err) {
                            console.error(`❌ Failed to create thumbnail URL for record #${record.id}:`, err);
                        }
                    }
                });
            }
            
            console.log('🖼️ Created', urlMap.size, 'thumbnail URLs');
            
            // Revoke old URLs
            thumbnailUrls.forEach(url => URL.revokeObjectURL(url));
            
            setThumbnailUrls(urlMap);
            setRecords(fetchedRecords || []);
            setStats(fetchedStats || { total: 0, healthy: 0, wsd: 0, pending: 0 });
        } catch (error: any) {
            console.error('❌ Failed to load history:', error);
            console.error('Error stack:', error?.stack);
            setError(error?.message || 'Không thể tải lịch sử. Vui lòng thử lại.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const result = await syncService.syncPendingRecords();
            if (result.synced > 0) {
                await loadData();
            }
            alert(`Đã đồng bộ ${result.synced} bản ghi`);
        } catch (error) {
            alert('Đồng bộ thất bại');
        } finally {
            setIsSyncing(false);
        }
    };

    const formatDate = (date: Date) => {
        return new Date(date).toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="animate-spin-slow text-2xl text-[var(--color-text-muted)]">⏳</div>
                <p className="text-sm text-[var(--color-text-secondary)]">Đang tải lịch sử...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4 p-4">
                <div className="text-4xl">❌</div>
                <p className="text-center text-[var(--color-text-secondary)]">{error}</p>
                <button 
                    onClick={loadData}
                    className="btn btn-primary"
                >
                    Thử lại
                </button>
            </div>
        );
    }

    return (
        <div className="p-4 safe-bottom">
            {/* Status Bar */}
            <div
                className={`mb-4 p-3 flex items-center justify-between text-sm ${isOnline ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                    } border`}
                style={{ borderRadius: '12px' }} /* iOS 12px */
                role="status"
                aria-live="polite"
            >
                <div className="flex items-center gap-2">
                    <div className={`status-dot ${isOnline ? 'status-dot-online' : 'status-dot-offline'}`} />
                    <span className={isOnline ? 'text-green-700' : 'text-amber-700'}>
                        {isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
                    </span>
                </div>
                {stats.pending > 0 && (
                    <button
                        onClick={handleSync}
                        disabled={!isOnline || isSyncing}
                        className="btn btn-sm btn-secondary"
                        aria-label={`Đồng bộ ${stats.pending} bản ghi chưa đồng bộ`}
                        aria-busy={isSyncing}
                    >
                        {isSyncing ? 'Đang đồng bộ...' : `Đồng bộ (${stats.pending})`}
                    </button>
                )}
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-3 gap-2 lg:gap-4 mb-6">
                <div className="card p-3 lg:p-6 text-center">
                    <p className="text-2xl lg:text-4xl font-bold text-[var(--color-text)]">{stats.total}</p>
                    <p className="text-xs lg:text-sm text-[var(--color-text-secondary)] mt-1">Tổng</p>
                </div>
                <div className="card p-3 lg:p-6 text-center bg-green-50">
                    <p className="text-2xl lg:text-4xl font-bold text-green-600">{stats.healthy}</p>
                    <p className="text-xs lg:text-sm text-green-700 mt-1">Khỏe</p>
                </div>
                <div className="card p-3 lg:p-6 text-center bg-red-50">
                    <p className="text-2xl lg:text-4xl font-bold text-red-600">{stats.wsd}</p>
                    <p className="text-xs lg:text-sm text-red-700 mt-1">Bệnh</p>
                </div>
            </div>

            {/* Records List */}
            {records.length === 0 ? (
                <div className="text-center py-12 text-[var(--color-text-secondary)]">
                    <p>Chưa có lịch sử phát hiện</p>
                    <p className="text-sm mt-1 text-[var(--color-text-muted)]">
                        Chụp ảnh tôm để bắt đầu
                    </p>
                </div>
            ) : (
                <div>
                    <h3 className="text-sm lg:text-base font-medium text-[var(--color-text-secondary)] mb-3">
                        Lịch sử gần đây
                    </h3>
                    <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                    {records.map((record) => {
                        const thumbnailUrl = record.id ? thumbnailUrls.get(record.id) : undefined;
                        
                        return (
                            <div
                                key={record.id}
                                className="card p-3 lg:p-4 flex items-center gap-3 lg:gap-4"
                            >
                                {thumbnailUrl ? (
                                    <img
                                        src={thumbnailUrl}
                                        alt={`Ảnh phát hiện ${record.label}`}
                                        className="w-14 h-14 lg:w-20 lg:h-20 object-cover border border-[var(--color-border)]"
                                        style={{ borderRadius: '12px' }} /* iOS 12px */
                                    />
                                ) : (
                                    <div 
                                        className="w-14 h-14 lg:w-20 lg:h-20 bg-gray-100 flex items-center justify-center border border-[var(--color-border)]"
                                        style={{ borderRadius: '12px' }}
                                    >
                                        <span className="text-2xl lg:text-3xl">🦐</span>
                                    </div>
                                )}

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`badge ${record.label === 'WSD' ? 'badge-danger' : 'badge-success'
                                            }`}>
                                            {record.label === 'WSD' ? 'Bệnh' : 'Khỏe'}
                                        </span>
                                        {!record.synced && (
                                            <span className="badge badge-warning">Chờ đồng bộ</span>
                                        )}
                                    </div>
                                    <p className="text-sm lg:text-base text-[var(--color-text-secondary)]">
                                        {(record.confidence * 100).toFixed(0)}% tin cậy
                                    </p>
                                    <p className="text-xs lg:text-sm text-[var(--color-text-muted)]">
                                        {formatDate(new Date(record.timestamp))}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                    </div>
                </div>
            )}
        </div>
    );
};
