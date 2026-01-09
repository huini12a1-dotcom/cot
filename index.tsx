
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

if (typeof window !== 'undefined' && !window.process) {
  (window as any).process = { env: {} };
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
