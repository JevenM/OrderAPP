import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 部署时通过 `npm run build -- --base=/<仓库名>/` 覆盖 base
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // 第三方库单独成 chunk：它们几乎不变，发版后用户只需重新下载业务代码，
    // react / supabase 命中长效缓存，等于每次更新少下载 ~140 KB
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
