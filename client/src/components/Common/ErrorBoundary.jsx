import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Resilient Error Boundary for TrueView AI
 * Catches rendering errors in child components and displays a clean fallback UI with Retry
 * rather than turning the entire application screen white.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="bg-white border border-rose-200 rounded-2xl p-10 text-center space-y-4 max-w-md mx-auto my-8 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {this.props.title || 'Unable to display this view'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {this.state.error?.message || 'An unexpected rendering error occurred while loading this view.'}
            </p>
          </div>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
