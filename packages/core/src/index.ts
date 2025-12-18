import type { Plugin } from 'vite'
import type { VitePluginUniCdnOption } from './type'
import { PLUGIN_NAME, RESOLVED_VIRTUAL_MODULE_ID, VIRTUAL_MODULE_ID } from './constant'
import { Context } from './context'

export default (options?: VitePluginUniCdnOption): Plugin => {
  const ctx = new Context(options)

  let plugin: Plugin = {
    name: PLUGIN_NAME,
    enforce: 'pre',
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return ctx.loadVirtualModule()
      }
    },
  }

  if (!ctx.cdnBasePath || !ctx.options.sourceDir) {
    return plugin
  }

  plugin = {
    ...plugin,
    async configResolved(resolvedConfig) {
      await ctx.configResolved(resolvedConfig)
    },
    async buildStart() {
      await ctx.buildStart()
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

  return plugin
}

export type * from './type'
