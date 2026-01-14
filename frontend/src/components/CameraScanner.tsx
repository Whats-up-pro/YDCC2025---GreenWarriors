import { useRef, useState, useEffect } from 'react';
import { useAI } from '../hooks/useAI';
import { dbHelpers } from '../db/database';
import { aiService } from '../services/aiService';

export const CameraScanner = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<{
    label: string;
    confidence: number;
    source?: 'local' | 'server';
  } | null>(null);
  const [savedToHistory, setSavedToHistory] = useState(false);
  const { detectDisease, loading, error } = useAI();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResult(null);
    setSavedToHistory(false);

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    try {
      const detectionResult = await detectDisease(file);
      setResult({
        label: detectionResult.label,
        confidence: detectionResult.confidence,
        source: 'server'
      });

      const thumbnail = await aiService.createThumbnail(file);
      await dbHelpers.saveDetection(
        file,
        thumbnail,
        detectionResult.label as 'Healthy' | 'WSD',
        detectionResult.confidence,
        detectionResult.processing_time
      );
      setSavedToHistory(true);
    } catch (err) {
      console.error('Lỗi phát hiện:', err);
    }
  };

  const handleReset = () => {
    setPreview(null);
    setResult(null);
    setSavedToHistory(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getLabelVietnamese = (label: string) => {
    return label === 'WSD' ? 'Bệnh đốm trắng' : 'Khỏe mạnh';
  };

  return (
    <div className="p-4 safe-bottom">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm" style={{ borderRadius: 'var(--radius-sm)' }}>
          Đang ngoại tuyến — Kết quả sẽ được lưu và đồng bộ sau
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Empty State */}
      {!preview && (
        <div className="py-12 text-center">
          <div className="mb-6">
            <div
              className="w-20 h-20 mx-auto mb-4 flex items-center justify-center bg-orange-50 text-[var(--color-shrimp)]"
              style={{ borderRadius: 'var(--radius-md)' }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-1">
              Chụp ảnh để chẩn đoán
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Chụp rõ nét vùng nghi ngờ bệnh trên tôm
            </p>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="btn btn-primary btn-lg w-full sm:w-auto sm:min-w-[200px]"
          >
            {loading ? 'Đang xử lý...' : 'Chụp ảnh tôm'}
          </button>
        </div>
      )}

      {/* Preview and Results */}
      {preview && (
        <div className="space-y-4">
          {/* Image */}
          <div className="relative">
            <img
              src={preview}
              alt="Ảnh tôm"
              className="w-full border border-[var(--color-border)]"
              style={{ borderRadius: 'var(--radius-md)' }}
            />
            {loading && (
              <div
                className="absolute inset-0 bg-black/50 flex items-center justify-center"
                style={{ borderRadius: 'var(--radius-md)' }}
              >
                <div className="text-white text-center">
                  <div className="animate-spin-slow text-2xl mb-2">⏳</div>
                  <p className="text-sm">Đang phân tích...</p>
                </div>
              </div>
            )}
          </div>

          {/* Result */}
          {result && (
            <div
              className={`p-4 border-l-4 ${result.label === 'WSD'
                  ? 'bg-red-50 border-red-500'
                  : 'bg-green-50 border-green-500'
                }`}
              style={{ borderRadius: 'var(--radius-sm)' }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className={`text-lg font-semibold ${result.label === 'WSD' ? 'text-red-700' : 'text-green-700'
                    }`}>
                    {getLabelVietnamese(result.label)}
                  </p>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Độ tin cậy: {(result.confidence * 100).toFixed(1)}%
                  </p>
                </div>
                <span className={`badge ${result.label === 'WSD' ? 'badge-danger' : 'badge-success'}`}>
                  {result.label}
                </span>
              </div>

              {/* Confidence bar */}
              <div className="w-full h-1.5 bg-gray-200 mt-3" style={{ borderRadius: '2px' }}>
                <div
                  className={`h-1.5 ${result.label === 'WSD' ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{
                    width: `${result.confidence * 100}%`,
                    borderRadius: '2px'
                  }}
                />
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 mt-3 text-xs text-[var(--color-text-muted)]">
                {result.source === 'server' && <span className="badge badge-info">Server</span>}
                {savedToHistory && <span className="badge badge-success">Đã lưu</span>}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm"
              style={{ borderRadius: 'var(--radius-sm)' }}
            >
              <p className="font-medium">Lỗi</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={handleReset} className="btn btn-ghost flex-1">
              Chụp lại
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="btn btn-primary flex-1"
            >
              Ảnh mới
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
