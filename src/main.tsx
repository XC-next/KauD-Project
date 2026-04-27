import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Fix for environments where global or process might be accessed by dependencies
if (typeof window !== 'undefined') {
  // Ensure global and process are available
  (window as any).global = window;
  (window as any).process = (window as any).process || { env: {} };
}

import { AuthProvider } from './components/AuthProvider.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
