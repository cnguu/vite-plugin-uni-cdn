# vite-plugin-uni-cdn

Vite 插件，在 UniApp 中替换静态资源链接为 CDN 链接

[![release](https://badgen.net/github/release/cnguu/vite-plugin-uni-cdn)](https://github.com/cnguu/vite-plugin-uni-cdn/releases)
[![license](https://badgen.net/github/license/cnguu/vite-plugin-uni-cdn)](https://github.com/cnguu/vite-plugin-uni-cdn/blob/main/LICENSE)

## 安装

```shell
pnpm i -D @cnguu/vite-plugin-uni-cdn
```

## 使用

```typescript
// vite.config.ts
import UniCdn from '@cnguu/vite-plugin-uni-cdn'
import Uni from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    UniCdn({
      cdn: 'https://cdn.jsdelivr.net/gh/cnguu/vite-plugin-uni-cdn@main/packages/playground/src/static/cdn',
      sourceDir: 'src/static/cdn',
    }),
    Uni(),
  ],
})
```

> 目前只支持绝对路径，如 `/static/xxx/xxx.png`
