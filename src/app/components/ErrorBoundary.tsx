import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error caught by ErrorBoundary:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-white border border-gray-200 rounded-3xl shadow-lg p-8 text-center">
            <h1 className="text-2xl font-semibold text-gray-900 mb-3">Что-то пошло не так</h1>
            <p className="text-sm text-gray-600 mb-6">
              Произошла ошибка в приложении. Попробуйте обновить страницу или вернуться чуть позже.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <button
                type="button"
                onClick={this.handleRetry}
                className="px-5 py-3 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition"
              >
                Перезагрузить страницу
              </button>
              <button
                type="button"
                onClick={() => window.location.assign('/workspaces')}
                className="px-5 py-3 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition"
              >
                Вернуться в рабочие пространства
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
