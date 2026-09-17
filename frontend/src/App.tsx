import React, { useEffect } from 'react';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from './routes/AppRoutes';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ReduxProvider } from './store';

const queryClient = new QueryClient();

export const App: React.FC = () => {
  const { fetchMe } = useAuthStore();
  const { initTheme } = useThemeStore();

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/meet/') && !window.location.hash) {
      window.location.replace(`${window.location.origin}/#${window.location.pathname}`);
      return;
    }
    initTheme();
    fetchMe();
  }, []);

  return (
    <ErrorBoundary fallbackTitle="Teams Workspace Error" fallbackMessage="An error occurred while loading the application. Please reload or return to home.">
      <ReduxProvider>
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </QueryClientProvider>
      </ReduxProvider>
    </ErrorBoundary>
  );
};

export default App;
