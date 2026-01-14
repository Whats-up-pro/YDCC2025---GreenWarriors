import { useState, useRef, useEffect } from 'react';
import { useAI } from '../hooks/useAI';

interface Message {
  text: string;
  isUser: boolean;
  timestamp: Date;
}

export const ChatUI = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendChatMessage, loading } = useAI();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputMessage.trim() || loading) return;

    const userMessage: Message = {
      text: inputMessage,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');

    try {
      const response = await sendChatMessage(inputMessage);
      const botMessage: Message = {
        text: response.response,
        isUser: false,
        timestamp: new Date(response.timestamp),
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch {
      const errorMessage: Message = {
        text: 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.',
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar">
        {messages.length === 0 && (
          <div className="text-center py-12 lg:py-20">
            <div
              className="w-16 h-16 lg:w-24 lg:h-24 mx-auto mb-4 lg:mb-6 flex items-center justify-center bg-cyan-50 text-[var(--color-water)]"
              style={{ borderRadius: '20px' }} /* iOS 20px large icon */
              role="img"
              aria-label="Biểu tượng trò chuyện"
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="lg:w-12 lg:h-12">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <p className="text-[var(--color-text-secondary)] lg:text-lg">
              Chào mừng đến với hệ thống tư vấn
            </p>
            <p className="text-sm lg:text-base text-[var(--color-text-muted)] mt-1">
              Hỏi về bệnh tôm hoặc cách chăm sóc
            </p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] sm:max-w-[75%] lg:max-w-[65%] px-3 py-2 lg:px-4 lg:py-3 text-sm lg:text-base ${msg.isUser
                  ? 'bg-[var(--color-leaf)] text-white'
                  : 'bg-[var(--color-border)] text-[var(--color-text)]'
                }`}
              style={{ borderRadius: '16px' }} /* iOS 16px message bubble */
              role="article"
              aria-label={msg.isUser ? 'Tin nhắn của bạn' : 'Phản hồi từ hệ thống'}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              className="px-3 py-2 bg-[var(--color-border)] text-[var(--color-text-secondary)] text-sm"
              style={{ borderRadius: '16px' }} /* iOS 16px */
              role="status"
              aria-live="polite"
            >
              Đang suy nghĩ...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--color-border)] p-3 safe-bottom bg-[var(--color-surface)]">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Nhập câu hỏi..."
            disabled={loading}
            className="input flex-1"
            aria-label="Ô nhập tin nhắn"
            aria-invalid="false"
          />
          <button
            onClick={handleSend}
            disabled={loading || !inputMessage.trim()}
            className="btn btn-primary"
            aria-label="Gửi tin nhắn"
            aria-busy={loading}
          >
            Gửi
          </button>
        </div>
      </div>
    </div>
  );
};
