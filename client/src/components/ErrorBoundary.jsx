import { Component } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-stack" style={{ padding: 32 }}>
          <section className="panel empty-state" style={{ maxWidth: 520, margin: '0 auto' }}>
            <span className="empty-state-icon" style={{ color: 'var(--color-amber-500)' }}>
              <AlertTriangle size={32} aria-hidden="true" />
            </span>
            <h2>Something went wrong.</h2>
            <p>
              {this.state.error?.message || 'An unexpected error occurred while rendering this page.'}
            </p>
            <button className="button button-primary" onClick={this.handleReload} type="button">
              <RotateCw size={16} /> Reload Page
            </button>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details style={{ marginTop: 16, width: '100%', textAlign: 'left' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--color-muted)' }}>
                  Developer details
                </summary>
                <pre
                  style={{
                    marginTop: 8,
                    padding: 12,
                    background: 'var(--color-surface-muted)',
                    borderRadius: 8,
                    overflow: 'auto',
                    fontSize: 12,
                    color: 'var(--color-muted)',
                  }}
                >
                  {String(this.state.error.stack || this.state.error.message)}
                </pre>
              </details>
            )}
          </section>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
