
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // 关键修复：显式注入 API_KEY，防止前端读取为 undefined
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
    // 保持对 process.env 的兼容性定义，防止某些第三方库报错
    'process.env': {}
  },
  server: {
    host: true // 允许局域网访问，方便手机调试
  }
});
