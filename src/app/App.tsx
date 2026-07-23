import { QueryProvider } from './providers/QueryProvider';
import { AuthProvider } from './providers/AuthProvider';
import { AppRouter } from './router/index';

export function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;