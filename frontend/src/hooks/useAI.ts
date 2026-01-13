import { useState } from 'react';
import { detectionAPI, chatAPI } from '../services/api';

export const useAI = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectDisease = async (file: File) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await detectionAPI.detect(file);
      return result;
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Phát hiện thất bại';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const sendChatMessage = async (message: string, userId?: number) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await chatAPI.sendMessage(message, userId);
      return result;
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Gửi tin nhắn thất bại';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    detectDisease,
    sendChatMessage,
    loading,
    error,
  };
};
