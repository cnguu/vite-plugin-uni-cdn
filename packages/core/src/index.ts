import type { Plugin } from 'vite'
import type { VitePluginUniCdnOption } from './type'
import { PLUGIN_NAME } from './constant'
import { Context } from './context'

export default (options?: VitePluginUniCdnOption): Plugin => {
  const ctx = new Context(options)

  if (!ctx.cdnBasePath || !ctx.options.sourceDir) {
    return { name: PLUGIN_NAME }
  }

  return {
    name: PLUGIN_NAME,
    async configResolved(resolvedConfig) {
      await ctx.configResolved(resolvedConfig)
    },
    transform(code, id) {
      return ctx.transform(code, id)
    },
    generateBundle(options, bundle) {
      ctx.generateBundle(options, bundle)
    },
    async closeBundle() {
      await ctx.closeBundle()
    },
  }
}

export type * from './type'
