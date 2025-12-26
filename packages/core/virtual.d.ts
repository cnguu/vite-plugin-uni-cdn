declare module 'virtual:vite-plugin-uni-cdn' {
  /**
   * 拼接静态资源 CDN 路径
   * @param uri 资源路径
   * @returns 拼接后的完整 CDN 路径
   */
  export function withCdn(uri: string): string
}
