import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { HttpsProxyAgent } from 'https-proxy-agent'

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:10808'
const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/supabase': {
        target: 'https://uvvehsnukzuujncwjwqq.supabase.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/supabase/, ''),
        secure: false,
        agent: agent,
      },
    },
  },
})
