import UniCdn from '@cnguu/vite-plugin-uni-cdn'
import uni from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    uni(),
    UniCdn({
      cdn: '',
      sourceDir: 'src/static/cdn',
    }),
  ],
})
