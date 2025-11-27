import { fileURLToPath, URL } from 'node:url'

import UniCdn from '@cnguu/vite-plugin-uni-cdn'
import uni from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    uni(),
    UniCdn({
      cdn: 'https://cdn.jsdelivr.net/gh/cnguu/vite-plugin-uni-cdn@main/packages/playground',
      sourceDir: 'src/static/cdn',
    }),
  ],
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: fileURLToPath(new URL('./', import.meta.url)),
      },
    ],
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import '@/style/global.scss';`,
      },
    },
  },
})
