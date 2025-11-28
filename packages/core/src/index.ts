import type { FilterPattern, Plugin } from 'vite'
import fs from 'node:fs/promises'
import path from 'node:path'
import chalk from 'chalk'

import consola from 'consola'
import { createFilter, normalizePath } from 'vite'

export interface VitePluginUniCdnOption {
  /**
   * cdn 地址
   */
  cdn?: string
  /**
   * 替换资源目录，不在该目录下的资源不会替换 cdn
   */
  sourceDir?: string
  /**
   * 扫描白名单 GLOB 格式
   */
  include?: FilterPattern
  /**
   * 扫描黑名单 GLOB 格式
   */
  exclude?: FilterPattern
  /**
   * 是否删除替换资源目录对应的输出目录
   */
  deleteOutputFiles?: boolean
  /**
   * 是否输出命令行信息
   */
  verbose?: boolean
}

function createLogger(PLUGIN_NAME: string, verbose: boolean) {
  const prefix = chalk.blue.bold(`\n[${PLUGIN_NAME}]`)
  return {
    log: (message: string) => {
      if (verbose) {
        consola.log(`${prefix} ${chalk.white(message)}`)
      }
    },
    success: (message: string) => {
      if (verbose) {
        consola.success(`${prefix} ${chalk.green(message)}`)
      }
    },
    error: (message: string, error?: Error) => {
      consola.error(`${prefix} ${chalk.red(message)}`, error)
    },
    pathReplace: (from: string, to: string) => {
      if (verbose) {
        consola.log(`${prefix} ${chalk.gray(from)} ${chalk.yellow('======>')} ${chalk.cyan(to)}`)
      }
    },
  }
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceStaticToCdn(
  code: string,
  assetDir: string,
  cdnBasePath: string,
  logger: ReturnType<typeof createLogger>,
): string {
  const escapedStaticPrefix = escapeRegExp(assetDir)

  const cssUrlRE = new RegExp(
    `url\\(\\s*(['"]?)(${escapedStaticPrefix}[^'")\\s]+)\\1\\s*\\)`,
    'g',
  )

  let transformed = code.replace(cssUrlRE, (match, quote: string, originalPath: string) => {
    try {
      if (originalPath.startsWith('http') || originalPath.startsWith('data:')) {
        return match
      }
      const outputFileName = `${cdnBasePath}${originalPath}`
      logger.pathReplace(originalPath, outputFileName)
      return `url(${quote || ''}${outputFileName}${quote || ''})`
    }
    catch (error) {
      logger.error(`处理 CSS 失败`, error as Error)
      return match
    }
  })

  const stringRE = new RegExp(
    `(['"])(${escapedStaticPrefix}[^'"]*)\\1`,
    'g',
  )

  transformed = transformed.replace(stringRE, (match, quote: string, originalPath: string) => {
    try {
      if (originalPath.startsWith('http') || originalPath.startsWith('data:')) {
        return match
      }
      const outputFileName = `${cdnBasePath}${originalPath}`
      logger.pathReplace(originalPath, outputFileName)
      return `${quote}${outputFileName}${quote}`
    }
    catch (error) {
      logger.error(`处理字符串失败`, error as Error)
      return match
    }
  })

  return transformed
}

function UniCdn(opt: VitePluginUniCdnOption): Plugin {
  const PLUGIN_NAME = 'vite-plugin-uni-cdn'

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

  const logger = createLogger(PLUGIN_NAME, options.verbose ?? true)
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

export default UniCdn
