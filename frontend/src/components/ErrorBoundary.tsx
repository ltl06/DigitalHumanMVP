import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return <>{this.props.fallback}</>;

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 40px',
          textAlign: 'center',
          minHeight: 300,
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}>
            <AlertTriangle size={28} style={{ color: 'var(--error)' }} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--error)', marginBottom: 8 }}>
            {this.props.title ?? '页面渲染出错'}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, maxWidth: 480 }}>
            {this.state.error?.message || '发生了一个未知错误，请尝试刷新页面。'}
          </p>
          {this.state.error?.stack && (
            <details style={{
              textAlign: 'left',
              fontSize: 11,
              color: 'var(--text3)',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 12px',
              marginBottom: 24,
              maxWidth: 600,
              maxHeight: 120,
              overflow: 'auto',
              wordBreak: 'break-all',
            }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 4 }}>技术详情</summary>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 10 }}>{this.state.error.stack}</pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="btn btn-secondary"
              onClick={this.handleRetry}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={14} />
              重试
            </button>
            <a
              href="/"
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
            >
              <Home size={14} />
              返回首页
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
