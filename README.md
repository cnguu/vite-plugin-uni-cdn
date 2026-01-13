# vite-plugin-uni-cdn

Vite 插件，在 uni-app 中替换静态资源链接为 CDN 链接

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
  build: {
    // 控制 sourcemap 生成
    sourcemap: true,
  },
})
```

在 `ts` 中使用辅助函数

```typescript
import { withCdn } from 'virtual:vite-plugin-uni-cdn'

console.log(withCdn('/static/cdn/7.png'))
```

> 注意：
> 1. 目前只支持绝对路径，如 `/static/xxx/xxx.png`
> 2. 微信小程序平台会被 uni-app 自动转成 Base64，无法被替换为 cdn 链接

## 参数

- `cdn`
  - cdn 地址
  - 默认 `''`
- `sourceDir`
  - 替换资源目录，不在该目录下的资源不会被替换
  - 默认 `'static/cdn'`
- `include`
  - 扫描白名单 GLOB 格式
  - 默认 `['**/*.vue']`
- `exclude`
  - 扫描黑名单 GLOB 格式
  - 默认 `['**/node_modules/**', '**/uni_modules/**', '**/dist/**', '**/unpackage/**']`
- `deleteOutputFiles`
  - 是否删除替换资源目录对应的输出目录
  - 默认 `true`
- `verbose`
  - 是否输出命令行信息
  - 默认 `true`
- `aliOSS`
  - 配置上传阿里云 OSS
  - 默认 `undefined`
    - `enable`
      - 启用
      - 默认 `false`
    - `options`
      - ali-oss 实例初始化参数，[文档](https://www.alibabacloud.com/help/zh/oss/developer-reference/putobject)
      - 默认 `undefined`
    - `headers`
      - ali-oss 上传请求头，[文档](https://www.alibabacloud.com/help/zh/oss/developer-reference/initialization-10)
      - 默认 `undefined`

## tsconfig 配置

```json
{
  "compilerOptions": {
    "types": [
      "@cnguu/vite-plugin-uni-cdn/virtual"
    ]
  }
}
```
