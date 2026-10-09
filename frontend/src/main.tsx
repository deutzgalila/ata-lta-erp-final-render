import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { bootstrapRuntimeConfig } from './lib/bootstrap';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

void bootstrapRuntimeConfig().finally(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});

