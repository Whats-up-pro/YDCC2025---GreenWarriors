import axios from 'axios';

/**
 * Auto-detect API URL based on environment:
 * 1. VITE_API_URL env var (highest priority)
 * 2. If on DevTunnels, use backend DevTunnels URL (port 8000)
 * 3. Fallback to localhost:8000
 */
export function getApiBaseUrl(): string {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fed2e526-a826-4abb-b2e7-94241249afd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:9',message:'getApiBaseUrl entry',data:{hostname:window.location.hostname,origin:window.location.origin,envApiUrl:import.meta.env.VITE_API_URL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  // 1. Check env var first (must be non-empty)
  const envApiUrl = import.meta.env.VITE_API_URL;
  if (envApiUrl && envApiUrl.trim() !== '') {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fed2e526-a826-4abb-b2e7-94241249afd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:13',message:'getApiBaseUrl using env var',data:{apiUrl:envApiUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return envApiUrl;
  }
  
  // 2. If on DevTunnels, auto-detect backend URL
  const currentHost = window.location.hostname;
  if (currentHost.includes('devtunnels.ms')) {
    // Replace frontend port with backend port (8000)
    const backendUrl = window.location.origin.replace(/-\d+\./, '-8000.');
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fed2e526-a826-4abb-b2e7-94241249afd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:20',message:'getApiBaseUrl using devtunnels',data:{backendUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return backendUrl;
  }
  
  // 3. Fallback: Use same hostname as frontend, different port
  // If frontend is on localhost:8080, backend should be localhost:8000
  // If frontend is on 127.0.0.1:8080, backend should be 127.0.0.1:8000
  const fallbackUrl = `${window.location.protocol}//${window.location.hostname}:8000`;
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fed2e526-a826-4abb-b2e7-94241249afd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:34',message:'getApiBaseUrl using fallback',data:{fallbackUrl,hostname:window.location.hostname,protocol:window.location.protocol},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  return fallbackUrl;
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
