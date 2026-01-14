import { useState, useEffect } from 'react';
import { dbHelpers, DetectionRecord } from '../db/database';
import { syncService } from '../services/syncService';

export const HistoryView = () => {
    const [records, setRecords] = useState<DetectionRecord[]>([]);
    const [stats, setStats] = useState({ total: 0, healthy: 0, wsd: 0, pending: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        loadData();

        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [fetchedRecords, fetchedStats] = await Promise.all([
                dbHelpers.getDetections(50),
                dbHelpers.getStats()
            ]);
            setRecords(fetchedRecords);
            setStats(fetchedStats);
        } catch (error) {
            console.error('Failed to load history:', error);
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
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin-slow text-2xl text-[var(--color-text-muted)]">⏳</div>
            </div>
        );
    }

    return (
        <div className="p-4 safe-bottom">
            {/* Status Bar */}
            <div
                className={`mb-4 p-3 flex items-center justify-between text-sm ${isOnline ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                    } border`}
                style={{ borderRadius: 'var(--radius-sm)' }}
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
                    >
                        {isSyncing ? 'Đang đồng bộ...' : `Đồng bộ (${stats.pending})`}
                    </button>
                )}
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-3 gap-2 mb-6">
                <div className="card p-3 text-center">
                    <p className="text-2xl font-bold text-[var(--color-text)]">{stats.total}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">Tổng</p>
                </div>
                <div className="card p-3 text-center bg-green-50">
                    <p className="text-2xl font-bold text-green-600">{stats.healthy}</p>
                    <p className="text-xs text-green-700">Khỏe</p>
                </div>
                <div className="card p-3 text-center bg-red-50">
                    <p className="text-2xl font-bold text-red-600">{stats.wsd}</p>
                    <p className="text-xs text-red-700">Bệnh</p>
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
                <div className="space-y-2">
                    <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
                        Lịch sử gần đây
                    </h3>
                    {records.map((record) => (
                        <div
                            key={record.id}
                            className="card p-3 flex items-center gap-3"
                        >
                            <img
                                src={record.imagePreview}
                                alt=""
                                className="w-14 h-14 object-cover border border-[var(--color-border)]"
                                style={{ borderRadius: 'var(--radius-sm)' }}
                            />

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
                                <p className="text-sm text-[var(--color-text-secondary)]">
                                    {(record.confidence * 100).toFixed(0)}% tin cậy
                                </p>
                                <p className="text-xs text-[var(--color-text-muted)]">
                                    {formatDate(record.timestamp)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
