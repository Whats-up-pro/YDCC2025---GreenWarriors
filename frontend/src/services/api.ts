import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

console.log('🔧 API Base URL:', API_BASE_URL);

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const detectionAPI = {
  detect: async (file: File): Promise<{ label: string; confidence: number; processing_time: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await apiClient.post('/api/v1/detect', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data;
  },
};

export const chatAPI = {
  sendMessage: async (message: string, userId?: number): Promise<{ response: string; timestamp: string }> => {
    const response = await apiClient.post('/api/v1/chat', {
      message,
      user_id: userId,
    });
    
    return response.data;
  },
};
