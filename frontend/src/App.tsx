import { useState, useEffect, lazy, Suspense } from 'react';
import { syncService } from './services/syncService';
import { HistoryView } from './components/HistoryView'; // Eager load to avoid network issues

// ⚡ PERFORMANCE: Lazy load heavy components (except HistoryView - preloaded)
const CameraScanner = lazy(() => import('./components/CameraScanner').then(m => ({ default: m.CameraScanner })));
const ChatUI = lazy(() => import('./components/ChatUI').then(m => ({ default: m.ChatUI })));
const CommunityView = lazy(() => import('./components/CommunityView').then(m => ({ default: m.CommunityView })));

type TabType = 'detect' | 'history' | 'chat' | 'community';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('detect');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Clean tracking parameters from URL (fbclid, utm_*, etc.)
    const url = new URL(window.location.href);
    const trackingParams = ['fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    let hasTrackingParams = false;
    
    trackingParams.forEach(param => {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        hasTrackingParams = true;
      }
    });
    
    // Replace URL without tracking params (without page reload)
    if (hasTrackingParams) {
      console.log('🧹 Cleaned tracking parameters from URL');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
    
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

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'detect', label: 'Chụp ảnh', icon: '📷' },
    { id: 'history', label: 'Lịch sử', icon: '📋' },
    { id: 'chat', label: 'Tư vấn', icon: '💬' },
    { id: 'community', label: 'Cộng đồng', icon: '👥' },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Header with Background Image */}
      <header 
        className="safe-top sticky top-0 z-20 shadow-md relative overflow-hidden"
        role="banner"
        style={{
          backgroundImage: 'url(/header-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Overlay để text dễ đọc hơn - không blur để giữ chất lượng hình */}
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-primary-dark)]/70 to-[var(--color-primary)]/50"></div>
        
        <div className="container-app py-3 lg:py-4 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="w-10 h-10 lg:w-12 lg:h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-white text-xl lg:text-2xl shadow-lg">
                🦐
              </div>
              <div>
                <h1 className="text-white text-xl lg:text-2xl font-bold drop-shadow-sm">TOMI</h1>
                <p className="hidden lg:block text-xs text-white/90">Cộng đồng nuôi tôm thông minh</p>
              </div>
            </div>
            <div 
              className={`flex items-center gap-1.5 px-3 py-1.5 lg:px-4 lg:py-2 text-xs lg:text-sm rounded-full backdrop-blur-sm ${
                isOnline ? 'bg-white/20 text-white' : 'bg-amber-500/80 text-white'
              }`}
              role="status"
              aria-live="polite"
              aria-label={isOnline ? 'Trạng thái: Trực tuyến' : 'Trạng thái: Ngoại tuyến'}
            >
              <div className={`status-dot ${isOnline ? 'status-dot-online' : 'status-dot-offline'}`} />
              <span className="hidden sm:inline font-medium">{isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}</span>
              <span className="sm:hidden font-medium">{isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation - Responsive: Bottom tabs (mobile) / Side tabs (desktop) */}
      <nav 
        className="bg-white shadow-sm sticky top-[49px] lg:top-[65px] z-10 lg:hidden"
        role="navigation"
        aria-label="Điều hướng chính"
      >
        <div className="container-app">
          <div className="flex" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 text-sm font-medium transition-all relative ${activeTab === tab.id
                    ? 'text-[var(--color-primary-dark)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-primary-dark)]'
                  }`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                id={`tab-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
              >
                <span className="block text-lg mb-1">{tab.icon}</span>
                <span className="text-xs">{tab.label}</span>
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[var(--color-primary-dark)] to-[var(--color-primary-light)]"></div>
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content - Desktop layout with sidebar */}
      <main className="container-app py-4 lg:py-6" role="main">
        <div className="lg:flex lg:gap-6">
          {/* Desktop Sidebar Navigation */}
          <aside className="hidden lg:block lg:w-64 lg:shrink-0">
            <div className="card-modern p-4 sticky top-24">
              <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-4 px-2 uppercase tracking-wide">Menu</h2>
              <nav role="tablist" className="space-y-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-all flex items-center gap-3 ${
                      activeTab === tab.id
                        ? 'gradient-primary text-white shadow-primary'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary-dark)]'
                    }`}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`panel-${tab.id}`}
                    tabIndex={activeTab === tab.id ? 0 : -1}
                  >
                    <span className="text-xl">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </nav>
              
              {/* Desktop stats/info */}
              <div className="mt-6 pt-6 border-t border-[var(--color-border)]">
                <p className="text-xs text-[var(--color-text-muted)] px-2">
                  Phiên bản 1.0.0
                </p>
              </div>
            </div>
          </aside>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            <div className="card-modern min-h-[calc(100vh-180px)] overflow-hidden">
              {/* ⚡ PERFORMANCE: Suspense wrapper for lazy loaded components */}
              <Suspense fallback={
                <div className="flex flex-col items-center justify-center h-64 gap-3" role="status" aria-live="polite">
                  <div className="w-12 h-12 border-4 border-[var(--color-leaf)] border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-[var(--color-text-secondary)]">Đang tải...</p>
                </div>
              }>
                {activeTab === 'detect' && (
                  <div 
                    id="panel-detect" 
                    role="tabpanel" 
                    aria-labelledby="tab-detect"
                  >
                    <CameraScanner />
                  </div>
                )}
                {activeTab === 'history' && (
                  <div 
                    id="panel-history" 
                    role="tabpanel" 
                    aria-labelledby="tab-history"
                  >
                    <HistoryView />
                  </div>
                )}
                {activeTab === 'chat' && (
                  <div 
                    id="panel-chat" 
                    role="tabpanel" 
                    aria-labelledby="tab-chat"
                    className="h-[calc(100vh-98px)] lg:h-[calc(100vh-180px)]"
                  >
                    <ChatUI />
                  </div>
                )}
                {activeTab === 'community' && (
                  <div 
                    id="panel-community" 
                    role="tabpanel" 
                    aria-labelledby="tab-community"
                  >
                    <CommunityView />
                  </div>
                )}
              </Suspense>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
