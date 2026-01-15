import axios from 'axios';

/**
 * Auto-detect API URL based on environment:
 * 1. VITE_API_URL env var (highest priority)
 * 2. If on DevTunnels, use backend DevTunnels URL (port 8000)
 * 3. Fallback to localhost:8000
 */
function getApiBaseUrl(): string {
  // 1. Check env var first (must be non-empty)
  const envApiUrl = import.meta.env.VITE_API_URL;
  if (envApiUrl && envApiUrl.trim() !== '') {
    return envApiUrl;
  }
  
  // 2. If on DevTunnels, auto-detect backend URL
  const currentHost = window.location.hostname;
  if (currentHost.includes('devtunnels.ms')) {
    // Replace frontend port with backend port (8000)
    const backendUrl = window.location.origin.replace(/-\d+\./, '-8000.');
    return backendUrl;
  }
  
  // 3. Fallback to localhost
  return 'http://localhost:8000';
}

const API_BASE_URL = getApiBaseUrl();

console.log('🔧 API Base URL:', API_BASE_URL);
console.log('🌐 Current Origin:', window.location.origin);

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
