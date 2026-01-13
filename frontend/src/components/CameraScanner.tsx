import { useRef, useState } from 'react';
import { useAI } from '../hooks/useAI';

export const CameraScanner = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<{ label: string; confidence: number } | null>(null);
  const { detectDisease, loading, error } = useAI();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      });
    } catch (err) {
      console.error('Lỗi phát hiện:', err);
    }
  };

  const getLabelVietnamese = (label: string) => {
    return label === 'WSD' ? 'Bệnh đốm trắng' : 'Khỏe mạnh';
  };

  return (
    <div className="p-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold disabled:bg-gray-400"
        disabled={loading}
      >
        {loading ? 'Đang xử lý...' : 'Chụp ảnh tôm'}
      </button>
      
      {preview && (
        <div className="mt-4">
          <img src={preview} alt="Ảnh tôm" className="w-full rounded-lg border-2 border-gray-300" />
        </div>
      )}
      
      {result && (
        <div className="mt-4 p-4 bg-gray-100 rounded-lg border-l-4 border-blue-500">
          <p className="font-bold text-lg">Kết quả: {getLabelVietnamese(result.label)}</p>
          <p className="text-gray-700 mt-2">Độ tin cậy: {(result.confidence * 100).toFixed(2)}%</p>
        </div>
      )}
      
      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-lg border-l-4 border-red-500">
          {error}
        </div>
      )}
    </div>
  );
};
