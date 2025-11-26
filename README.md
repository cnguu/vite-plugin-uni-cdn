# vite-plugin-uni-cdn

Vite 插件，在 UniApp 中替换资源链接为 CDN 链接

[![release](https://badgen.net/github/release/cnguu/vite-plugin-uni-cdn)](https://github.com/cnguu/vite-plugin-uni-cdn/releases)
[![license](https://badgen.net/github/license/cnguu/vite-plugin-uni-cdn)](https://github.com/cnguu/vite-plugin-uni-cdn/blob/main/LICENSE)

## 安装

```shell
pnpm i -D @cnguu/vite-plugin-uni-cdn
```

## 使用

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import UniCdn from '@cnguu/vite-plugin-uni-cdn'

export default defineConfig({
  plugins: [
    UniCdn(),
  ],
})
```
