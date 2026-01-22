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
    } catch (error: any) {
      console.error('Chat error:', error);
      console.error('Error response:', error.response);
      console.error('Error message:', error.message);
      
      let errorText = 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.';
      
      // Show more specific error for debugging
      if (error.response) {
        errorText = `Lỗi ${error.response.status}: ${error.response.data?.detail || error.message}`;
      } else if (error.request) {
        errorText = 'Không thể kết nối đến server. Vui lòng kiểm tra kết nối mạng.';
      }
      
      const errorMessage: Message = {
        text: errorText,
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
              className="w-20 h-20 lg:w-28 lg:h-28 mx-auto mb-6 lg:mb-8 flex items-center justify-center gradient-primary rounded-3xl shadow-primary"
              role="img"
              aria-label="Biểu tượng trò chuyện"
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden="true" className="lg:w-16 lg:h-16">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <h2 className="text-xl lg:text-2xl font-bold text-[var(--color-text)] mb-2">
              Chào mừng đến với hệ thống tư vấn
            </h2>
            <p className="text-sm lg:text-base text-[var(--color-text-secondary)] max-w-md mx-auto">
              Hỏi về bệnh tôm, cách chăm sóc hoặc bất kỳ thắc mắc nào về nuôi tôm
            </p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] sm:max-w-[75%] lg:max-w-[65%] px-4 py-3 lg:px-5 lg:py-4 text-sm lg:text-base rounded-2xl shadow-soft ${
                msg.isUser
                  ? 'gradient-primary text-white'
                  : 'bg-white border border-[var(--color-border-light)] text-[var(--color-text)]'
              }`}
              role="article"
              aria-label={msg.isUser ? 'Tin nhắn của bạn' : 'Phản hồi từ hệ thống'}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              className="px-4 py-3 bg-white border border-[var(--color-border-light)] text-[var(--color-text-secondary)] text-sm rounded-2xl shadow-soft flex items-center gap-2"
              role="status"
              aria-live="polite"
            >
              <div className="w-4 h-4 border-2 border-[var(--color-primary-dark)] border-t-transparent rounded-full animate-spin"></div>
              <span>Đang suy nghĩ...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--color-border-light)] p-4 safe-bottom bg-gradient-soft">
        <div className="flex gap-3">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Nhập câu hỏi của bạn..."
            disabled={loading}
            className="input flex-1 rounded-xl"
            aria-label="Ô nhập tin nhắn"
            aria-invalid="false"
          />
          <button
            onClick={handleSend}
            disabled={loading || !inputMessage.trim()}
            className="btn btn-primary rounded-xl min-w-[80px]"
            aria-label="Gửi tin nhắn"
            aria-busy={loading}
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <span className="flex items-center gap-1">
                <span>Gửi</span>
                <span>➤</span>
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
