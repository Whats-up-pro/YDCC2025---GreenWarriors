import { useState } from 'react';
import { CameraScanner } from './components/CameraScanner';
import { ChatUI } from './components/ChatUI';

function App() {
  const [activeTab, setActiveTab] = useState<'detect' | 'chat'>('detect');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-center text-gray-800">
            Phát hiện bệnh tôm
          </h1>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-md mx-auto flex">
          <button
            onClick={() => setActiveTab('detect')}
            className={`flex-1 py-3 text-center font-semibold ${
              activeTab === 'detect'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : 'text-gray-600'
            }`}
          >
            Chụp ảnh
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-3 text-center font-semibold ${
              activeTab === 'chat'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : 'text-gray-600'
            }`}
          >
            Tư vấn
          </button>
        </div>
      </nav>

      <main className="max-w-md mx-auto bg-white min-h-[calc(100vh-120px)]">
        {activeTab === 'detect' && <CameraScanner />}
        {activeTab === 'chat' && (
          <div className="h-[calc(100vh-120px)]">
            <ChatUI />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
