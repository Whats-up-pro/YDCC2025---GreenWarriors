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
      // 🎯 OFFLINE-FIRST: Save to IndexedDB IMMEDIATELY (không chờ server)
      const thumbnailBlob = await aiService.createThumbnail(file);
      const tempId = await dbHelpers.saveDetection(
        file, // Full image Blob
        thumbnailBlob, // Thumbnail Blob
        'Unknown', // Temporary label
        0, // Temporary confidence
        false, // Local inference = false (pending)
        0 // No processing time yet
      );
      setSavedToHistory(true);

      // Show pending state
      setResult({
        label: 'Đang phân tích...',
        confidence: 0,
        source: 'local'
      });

      // 🌐 Try server detection (không block UI)
      if (isOnline) {
        try {
          const detectionResult = await detectDisease(file);
          
          // Update IndexedDB với kết quả từ server
          await dbHelpers.markSynced(tempId);
          // TODO: Add updateDetection method to update label/confidence
          
          setResult({
            label: detectionResult.label,
            confidence: detectionResult.confidence,
            source: 'server'
          });
        } catch (serverErr) {
          console.warn('Server detection failed, queued for sync:', serverErr);
          setResult({
            label: 'Chờ đồng bộ',
            confidence: 0,
            source: 'local'
          });
        }
      } else {
        // Offline: Show queued message
        setResult({
          label: 'Đã lưu - Chờ đồng bộ',
          confidence: 0,
          source: 'local'
        });
      }
    } catch (err) {
      console.error('Lỗi lưu ảnh:', err);
      setResult({
        label: 'Lỗi',
        confidence: 0,
        source: 'local'
      });
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
    return label === 'WSSV' ? 'Bệnh đốm trắng' : 'Khỏe mạnh';
  };

  return (
    <div className="p-4 safe-bottom">
      {/* Offline Banner */}
      {!isOnline && (
        <div 
          className="mb-4 p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 text-amber-800 text-sm rounded-xl shadow-soft" 
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">📡</span>
            <span>Đang ngoại tuyến — Kết quả sẽ được lưu và đồng bộ sau</span>
          </div>
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
        <div className="py-12 lg:py-20 text-center">
          <div className="mb-6 lg:mb-8">
            <div
              className="w-24 h-24 lg:w-36 lg:h-36 mx-auto mb-6 lg:mb-8 flex items-center justify-center gradient-accent rounded-3xl shadow-accent"
              role="img"
              aria-label="Biểu tượng máy ảnh"
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden="true" className="lg:w-20 lg:h-20">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <h2 className="text-xl lg:text-3xl font-bold text-[var(--color-text)] mb-2 lg:mb-3">
              Chụp ảnh để chẩn đoán
            </h2>
            <p className="text-sm lg:text-base text-[var(--color-text-secondary)] max-w-md mx-auto">
              Chụp rõ nét vùng nghi ngờ bệnh trên tôm để AI phân tích
            </p>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="btn btn-accent btn-lg w-full sm:w-auto sm:min-w-[240px] lg:min-w-[300px] lg:text-lg"
            aria-label="Mở camera để chụp ảnh tôm"
            aria-busy={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Đang xử lý...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="text-xl">📷</span>
                Chụp ảnh tôm
              </span>
            )}
          </button>
        </div>
      )}

      {/* Preview and Results */}
      {preview && (
        <div className="space-y-4 lg:space-y-6">
          {/* Image */}
          <div className="relative lg:max-w-2xl lg:mx-auto">
            <div className="card-modern overflow-hidden p-2">
              <img
                src={preview}
                alt="Ảnh tôm đã chụp để phân tích"
                className="w-full rounded-xl"
              />
            </div>
            {loading && (
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-2xl"
                role="status"
                aria-live="polite"
                aria-label="Đang phân tích ảnh"
              >
                <div className="text-white text-center">
                  <div className="w-16 h-16 lg:w-20 lg:h-20 mx-auto mb-4 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-base lg:text-lg font-semibold">Đang phân tích...</p>
                  <p className="text-sm text-white/80 mt-1">Vui lòng đợi trong giây lát</p>
                </div>
              </div>
            )}
          </div>

          {/* Result */}
          {result && (
            <div
              className={`card-modern p-5 lg:p-6 ${
                result.label === 'WSD' || result.label === 'Bệnh đốm trắng'
                  ? 'border-l-4 border-[var(--color-accent)]'
                  : 'border-l-4 border-[var(--color-success)]'
              }`}
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-3xl ${result.label === 'WSD' || result.label === 'Bệnh đốm trắng' ? 'text-[var(--color-accent)]' : 'text-[var(--color-success)]'}`}>
                      {result.label === 'WSD' || result.label === 'Bệnh đốm trắng' ? '⚠️' : '✅'}
                    </span>
                    <div>
                      <p className={`text-xl lg:text-2xl font-bold ${result.label === 'WSD' || result.label === 'Bệnh đốm trắng' ? 'text-[var(--color-accent)]' : 'text-[var(--color-success)]'}`}>
                        {getLabelVietnamese(result.label)}
                      </p>
                      <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                        Độ tin cậy: <span className="font-semibold text-[var(--color-text)]">{(result.confidence * 100).toFixed(1)}%</span>
                      </p>
                    </div>
                  </div>
                </div>
                <span className={`badge ${result.label === 'WSD' || result.label === 'Bệnh đốm trắng' ? 'badge-danger' : 'badge-success'}`}>
                  {result.label === 'WSD' || result.label === 'Bệnh đốm trắng' ? 'Bệnh' : 'Khỏe'}
                </span>
              </div>

              {/* Confidence bar */}
              <div className="w-full h-3 bg-[var(--color-border-light)] rounded-full mt-4 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    result.label === 'WSD' || result.label === 'Bệnh đốm trắng'
                      ? 'gradient-accent'
                      : 'bg-gradient-to-r from-[var(--color-success)] to-green-400'
                  }`}
                  style={{
                    width: `${result.confidence * 100}%`,
                  }}
                />
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 mt-4 text-xs">
                {result.source === 'server' && (
                  <span className="badge badge-info flex items-center gap-1">
                    <span>🌐</span> Server
                  </span>
                )}
                {savedToHistory && (
                  <span className="badge badge-success flex items-center gap-1">
                    <span>💾</span> Đã lưu
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="card-modern p-4 bg-red-50 border-l-4 border-[var(--color-danger)]"
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">❌</span>
                <div>
                  <p className="font-semibold text-[var(--color-danger)]">Lỗi xảy ra</p>
                  <p className="mt-1 text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button 
              onClick={handleReset} 
              className="btn btn-secondary flex-1"
              aria-label="Chụp lại ảnh hiện tại"
            >
              <span className="flex items-center gap-2">
                <span>🔄</span>
                <span>Chụp lại</span>
              </span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="btn btn-primary flex-1"
              aria-label="Chọn ảnh khác từ thư viện"
              aria-busy={loading}
            >
              <span className="flex items-center gap-2">
                <span>📸</span>
                <span>Ảnh mới</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
