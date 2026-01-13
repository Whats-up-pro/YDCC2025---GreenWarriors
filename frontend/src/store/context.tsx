import React, { createContext, useContext, useState, ReactNode } from 'react';

interface DetectionHistory {
  id: string;
  label: string;
  confidence: number;
  timestamp: Date;
  imagePreview?: string;
}

interface AppState {
  detectionHistory: DetectionHistory[];
  addDetection: (detection: Omit<DetectionHistory, 'id' | 'timestamp'>) => void;
  clearHistory: () => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [detectionHistory, setDetectionHistory] = useState<DetectionHistory[]>([]);

  const addDetection = (detection: Omit<DetectionHistory, 'id' | 'timestamp'>) => {
    const newDetection: DetectionHistory = {
      ...detection,
      id: Date.now().toString(),
      timestamp: new Date(),
    };
    setDetectionHistory((prev) => [newDetection, ...prev]);
  };

  const clearHistory = () => {
    setDetectionHistory([]);
  };

  return (
    <AppContext.Provider value={{ detectionHistory, addDetection, clearHistory }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppProvider');
  }
  return context;
};
