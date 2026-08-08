import { QueryProvider } from './providers/QueryProvider';
import { AuthProvider } from './providers/AuthProvider';
import { ToastProvider } from './providers/ToastProvider';
import { AppRouter } from './router/index';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineBanner } from './components/OfflineBanner';

export function App() {
  return (
    <QueryProvider>
      <ErrorBoundary>
        <AuthProvider>
          <ToastProvider>
            <OfflineBanner />
            <AppRouter />
          </ToastProvider>
        </AuthProvider>
      </ErrorBoundary>
    </QueryProvider>
  );
}

export default App;