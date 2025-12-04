import type { Plugin } from 'vite'
import type { VitePluginUniCdnOption } from './types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createFilter, normalizePath } from 'vite'
import { createLogger, PLUGIN_NAME, replaceStaticToCdn } from './util'

export * from './types'

function VitePluginUniCdn(opt?: VitePluginUniCdnOption): Plugin {
  const defaultOption: VitePluginUniCdnOption = {
    cdn: '',
    sourceDir: 'static/cdn',
    include: ['**/*.{vue,css,scss,sass,less,styl}'],
    exclude: ['**/node_modules/**', '**/uni_modules/**', '**/dist/**', '**/unpackage/**'],
    deleteOutputFiles: true,
    verbose: true,
  }
  const options = { ...defaultOption, ...opt }

  const cdnBasePath = options.cdn
    ? options.cdn.endsWith('/')
      ? options.cdn.slice(0, -1)
      : options.cdn
    : ''

  if (!cdnBasePath || !options.sourceDir) {
    return { name: PLUGIN_NAME }
  }

  const logger = createLogger(options.verbose ?? true)
  const filter = createFilter(options.include, options.exclude)

  // 是否以 src 开头（CLI 项目）
  let isSrc = false
  let projectRoot = ''
  let sourceDirAbs = ''
  let assetDir = ''
  let outputDir = ''

  return {
    name: PLUGIN_NAME,
    async configResolved(resolvedConfig) {
      projectRoot = resolvedConfig.root

      const normalizeSourceDir = normalizePath(path.normalize(options.sourceDir!))
      const relSourceDir = normalizeSourceDir.replace(/^\/+/, '')

      sourceDirAbs = normalizePath(path.resolve(projectRoot, relSourceDir))
      try {
        await fs.access(sourceDirAbs)
      }
      catch (error) {
        const err = error as NodeJS.ErrnoException
        logger.error('替换资源目录不存在', err)
        return
      }

      isSrc = relSourceDir.startsWith('src/')

      const staticSubPath = isSrc
        ? relSourceDir.slice('src/'.length)
        : relSourceDir

      assetDir = `/${staticSubPath.replace(/^\/+/, '')}`

      logger.log(`工程根目录: ${projectRoot}`)
      logger.log(`替换资源目录: ${sourceDirAbs}`)
      logger.log(`匹配资源前缀: ${assetDir}`)

      outputDir = normalizePath(
        path.resolve(
          resolvedConfig.build.outDir,
          staticSubPath,
        ),
      )
      logger.log(`输出目录: ${outputDir}`)
    },
    transform(code, id) {
      if (!sourceDirAbs || !assetDir || !code) {
        return { code }
      }

      const [filepath] = id.split('?', 2)
      if (!filter(filepath)) {
        return { code }
      }

      const transformed = replaceStaticToCdn(code, assetDir, cdnBasePath, logger)
      return { code: transformed }
    },
    generateBundle(_options, bundle) {
      if (!sourceDirAbs || !assetDir) {
        return
      }

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'asset') {
          if (typeof chunk.source !== 'string') {
            continue
          }
          if (!/\.(?:css|js|mjs|html)$/.test(fileName)) {
            continue
          }
          const before = chunk.source
          chunk.source = replaceStaticToCdn(before, assetDir, cdnBasePath, logger)
        }
        else if (chunk.type === 'chunk') {
          const before = chunk.code
          chunk.code = replaceStaticToCdn(before, assetDir, cdnBasePath, logger)
        }
      }
    },
    async closeBundle() {
      if (!sourceDirAbs || !assetDir) {
        return
      }

      if (!options.deleteOutputFiles) {
        logger.log('已禁用输出文件删除功能')
        return
      }

      try {
        await fs.access(outputDir)
        await fs.rm(outputDir, { recursive: true, force: true, maxRetries: 2 })
        logger.success(`已成功删除目录: ${outputDir}`)
      }
      catch (error) {
        const err = error as NodeJS.ErrnoException
        if (err.code === 'ENOENT') {
          logger.log(`目录不存在，跳过删除: ${outputDir}`)
        }
        else {
          logger.error(`删除目录失败: ${outputDir}`, err)
        }
      }
    },
  }
}

export default VitePluginUniCdn
