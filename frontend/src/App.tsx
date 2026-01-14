import { useState, useEffect } from 'react';
import { CameraScanner } from './components/CameraScanner';
import { ChatUI } from './components/ChatUI';
import { HistoryView } from './components/HistoryView';
import { syncService } from './services/syncService';

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
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border)] safe-top sticky top-0 z-20">
        <div className="container-app py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-shrimp)] text-xl font-bold">ShrimpDetect</span>
            </div>
            <div className={`flex items-center gap-1.5 px-2 py-1 text-xs ${isOnline ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'
              }`}>
              <div className={`status-dot ${isOnline ? 'status-dot-online' : 'status-dot-offline'}`} />
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-[var(--color-surface)] border-b border-[var(--color-border)] sticky top-[49px] z-10">
        <div className="container-app">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === tab.id
                    ? 'text-[var(--color-leaf)] border-b-2 border-[var(--color-leaf)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container-app">
        <div className="bg-[var(--color-surface)] min-h-[calc(100vh-98px)] border-x border-b border-[var(--color-border)]">
          {activeTab === 'detect' && <CameraScanner />}
          {activeTab === 'history' && <HistoryView />}
          {activeTab === 'chat' && (
            <div className="h-[calc(100vh-98px)]">
              <ChatUI />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
