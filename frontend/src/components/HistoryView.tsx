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
                className={`mb-4 p-4 flex items-center justify-between text-sm card-modern ${
                    isOnline ? 'bg-gradient-to-r from-green-50 to-emerald-50' : 'bg-gradient-to-r from-amber-50 to-orange-50'
                }`}
                role="status"
                aria-live="polite"
            >
                <div className="flex items-center gap-2">
                    <div className={`status-dot ${isOnline ? 'status-dot-online' : 'status-dot-offline'}`} />
                    <span className={`font-medium ${isOnline ? 'text-green-700' : 'text-amber-700'}`}>
                        {isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
                    </span>
                </div>
                {stats.pending > 0 && (
                    <button
                        onClick={handleSync}
                        disabled={!isOnline || isSyncing}
                        className="btn btn-sm btn-primary"
                        aria-label={`Đồng bộ ${stats.pending} bản ghi chưa đồng bộ`}
                        aria-busy={isSyncing}
                    >
                        {isSyncing ? (
                            <span className="flex items-center gap-2">
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                Đang đồng bộ...
                            </span>
                        ) : (
                            `Đồng bộ (${stats.pending})`
                        )}
                    </button>
                )}
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-3 gap-3 lg:gap-4 mb-6">
                <div className="card-modern p-4 lg:p-6 text-center">
                    <p className="text-2xl lg:text-4xl font-bold text-[var(--color-primary-dark)]">{stats.total}</p>
                    <p className="text-xs lg:text-sm text-[var(--color-text-secondary)] mt-1 font-medium">Tổng</p>
                </div>
                <div className="card-modern p-4 lg:p-6 text-center bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                    <p className="text-2xl lg:text-4xl font-bold text-green-600">{stats.healthy}</p>
                    <p className="text-xs lg:text-sm text-green-700 mt-1 font-medium">Khỏe</p>
                </div>
                <div className="card-modern p-4 lg:p-6 text-center bg-gradient-to-br from-red-50 to-orange-50 border-red-200">
                    <p className="text-2xl lg:text-4xl font-bold text-[var(--color-accent)]">{stats.wsd}</p>
                    <p className="text-xs lg:text-sm text-red-700 mt-1 font-medium">Bệnh</p>
                </div>
            </div>

            {/* Records List */}
            {records.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center bg-[var(--color-primary-light)] rounded-3xl">
                        <span className="text-4xl">📋</span>
                    </div>
                    <p className="text-lg font-semibold text-[var(--color-text)]">Chưa có lịch sử phát hiện</p>
                    <p className="text-sm mt-2 text-[var(--color-text-secondary)]">
                        Chụp ảnh tôm để bắt đầu theo dõi
                    </p>
                </div>
            ) : (
                <div>
                    <h3 className="text-base lg:text-lg font-semibold text-[var(--color-text)] mb-4">
                        Lịch sử gần đây
                    </h3>
                    <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                    {records.map((record) => {
                        const thumbnailUrl = record.id ? thumbnailUrls.get(record.id) : undefined;
                        
                        return (
                            <div
                                key={record.id}
                                className="card-modern p-4 flex items-center gap-4 hover:shadow-medium transition-shadow"
                            >
                                {thumbnailUrl ? (
                                    <img
                                        src={thumbnailUrl}
                                        alt={`Ảnh phát hiện ${record.label}`}
                                        className="w-16 h-16 lg:w-20 lg:h-20 object-cover rounded-xl border-2 border-[var(--color-border-light)]"
                                    />
                                ) : (
                                    <div 
                                        className="w-16 h-16 lg:w-20 lg:h-20 bg-gradient-to-br from-[var(--color-primary-light)] to-[var(--color-primary-dark)] flex items-center justify-center rounded-xl"
                                    >
                                        <span className="text-3xl lg:text-4xl">🦐</span>
                                    </div>
                                )}

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`badge ${record.label === 'WSD' ? 'badge-danger' : 'badge-success'}`}>
                                            {record.label === 'WSD' ? 'Bệnh' : 'Khỏe'}
                                        </span>
                                        {!record.synced && (
                                            <span className="badge badge-warning text-xs">Chờ đồng bộ</span>
                                        )}
                                    </div>
                                    <p className="text-sm lg:text-base font-medium text-[var(--color-text)]">
                                        {(record.confidence * 100).toFixed(0)}% tin cậy
                                    </p>
                                    <p className="text-xs lg:text-sm text-[var(--color-text-muted)] mt-1">
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
