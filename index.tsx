
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

// 垫片处理：防止浏览器环境缺失 process 对象
if (typeof window !== 'undefined' && !window.process) {
  (window as any).process = { env: {} };
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
