import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('❌ ErrorBoundary caught an error:', error, errorInfo);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Component stack:', errorInfo.componentStack);
    
    this.setState({
      error,
      errorInfo
    });
  }

  private handleReset = () => {
    // Clear tracking params and reload
    const url = new URL(window.location.href);
    url.search = ''; // Clear all query params
    window.location.href = url.toString();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[var(--color-surface)] rounded-lg shadow-lg p-6 text-center">
            <div className="text-6xl mb-4">🐛</div>
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">
              Đã xảy ra lỗi
            </h2>
            <p className="text-[var(--color-text-secondary)] mb-4">
              Ứng dụng gặp sự cố. Vui lòng thử tải lại trang.
            </p>
            
            {this.state.error && (
              <details className="text-left mb-4 p-3 bg-red-50 rounded text-sm">
                <summary className="cursor-pointer font-medium text-red-700 mb-2">
                  Chi tiết lỗi
                </summary>
                <pre className="text-xs text-red-600 overflow-auto">
                  {this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            
            <div className="flex gap-2 justify-center">
              <button
                onClick={this.handleReset}
                className="btn btn-primary"
              >
                Tải lại
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="btn btn-secondary"
              >
                Về trang chủ
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
