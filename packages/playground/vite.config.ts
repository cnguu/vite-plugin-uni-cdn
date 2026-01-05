import { fileURLToPath, URL } from 'node:url'

import VitePluginUniCdn from '@cnguu/vite-plugin-uni-cdn'
import Uni from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    VitePluginUniCdn({
      cdn: 'https://cdn.jsdelivr.net/gh/cnguu/vite-plugin-uni-cdn@main/packages/playground/src/static/cdn',
      sourceDir: 'src/static/cdn',
    }),
    Uni(),
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
