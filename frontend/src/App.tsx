import { useState, useEffect, lazy, Suspense } from 'react';
import { syncService } from './services/syncService';

// ⚡ PERFORMANCE: Lazy load heavy components
const CameraScanner = lazy(() => import('./components/CameraScanner').then(m => ({ default: m.CameraScanner })));
const ChatUI = lazy(() => import('./components/ChatUI').then(m => ({ default: m.ChatUI })));
const HistoryView = lazy(() => import('./components/HistoryView').then(m => ({ default: m.HistoryView })));

type TabType = 'detect' | 'history' | 'chat';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('detect');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    syncService.startAutoSync();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      syncService.stopAutoSync();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const tabs: { id: TabType; label: string }[] = [
    { id: 'detect', label: 'Chụp ảnh' },
    { id: 'history', label: 'Lịch sử' },
    { id: 'chat', label: 'Tư vấn' },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Header */}
      <header 
        className="bg-[var(--color-surface)] border-b border-[var(--color-border)] safe-top sticky top-0 z-20"
        role="banner"
      >
        <div className="container-app py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-[var(--color-shrimp)] text-xl font-bold">ShrimpDetect</h1>
            </div>
            <div 
              className={`flex items-center gap-1.5 px-2 py-1 text-xs ${isOnline ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'
              }`}
              role="status"
              aria-live="polite"
              aria-label={isOnline ? 'Trạng thái: Trực tuyến' : 'Trạng thái: Ngoại tuyến'}
            >
              <div className={`status-dot ${isOnline ? 'status-dot-online' : 'status-dot-offline'}`} />
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation - iOS Bottom Tab Bar Style (when needed) */}
      <nav 
        className="bg-[var(--color-surface)] border-b border-[var(--color-border)] sticky top-[49px] z-10"
        role="navigation"
        aria-label="Điều hướng chính"
      >
        <div className="container-app">
          <div className="flex" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === tab.id
                    ? 'text-[var(--color-leaf)] border-b-2 border-[var(--color-leaf)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                  }`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                id={`tab-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container-app" role="main">
        <div className="bg-[var(--color-surface)] min-h-[calc(100vh-98px)] border-x border-b border-[var(--color-border)]">
          {/* ⚡ PERFORMANCE: Suspense wrapper for lazy loaded components */}
          <Suspense fallback={
            <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
              <div className="text-center">
                <div className="text-2xl mb-2 animate-pulse">⏳</div>
                <p className="text-sm text-[var(--color-text-secondary)]">Đang tải...</p>
              </div>
            </div>
          }>
            <div 
              id="panel-detect" 
              role="tabpanel" 
              aria-labelledby="tab-detect"
              hidden={activeTab !== 'detect'}
            >
              {activeTab === 'detect' && <CameraScanner />}
            </div>
            <div 
              id="panel-history" 
              role="tabpanel" 
              aria-labelledby="tab-history"
              hidden={activeTab !== 'history'}
            >
              {activeTab === 'history' && <HistoryView />}
            </div>
            <div 
              id="panel-chat" 
              role="tabpanel" 
              aria-labelledby="tab-chat"
              hidden={activeTab !== 'chat'}
              className="h-[calc(100vh-98px)]"
            >
              {activeTab === 'chat' && <ChatUI />}
            </div>
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default App;
