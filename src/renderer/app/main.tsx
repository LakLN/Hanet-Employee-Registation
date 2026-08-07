import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { RuntimeConfigGate } from './components/RuntimeConfigGate';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RuntimeConfigGate>
        <App />
      </RuntimeConfigGate>
    </ErrorBoundary>
  </React.StrictMode>,
);
