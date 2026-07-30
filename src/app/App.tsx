import { QueryProvider } from './providers/QueryProvider';
import { AuthProvider } from './providers/AuthProvider';
import { AppRouter } from './router/index';
import { ErrorBoundary } from './components/ErrorBoundary';

export function App() {
  return (
    <QueryProvider>
      <ErrorBoundary>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </ErrorBoundary>
    </QueryProvider>
  );
}

export default App;