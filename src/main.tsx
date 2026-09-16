import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DatabaseGate, ErrorBoundary } from './components/Failsafe';
import './index.css';

const container = document.getElementById('root');
if (container === null) throw new Error('V index.html chybí #root.');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <DatabaseGate>
        <App />
      </DatabaseGate>
    </ErrorBoundary>
  </StrictMode>,
);
