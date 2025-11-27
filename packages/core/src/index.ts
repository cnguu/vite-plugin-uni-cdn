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
  const logger = (() => {
    const prefix = chalk.blue.bold(`\n[${PLUGIN_NAME}]`)
    return {
      log: (message: string) => {
        if (options.verbose) {
          consola.log(`${prefix} ${chalk.white(message)}`)
        }
      },
      success: (message: string) => {
        if (options.verbose) {
          consola.success(`${prefix} ${chalk.green(message)}`)
        }
      },
      error: (message: string, error?: Error) => {
        consola.error(`${prefix} ${chalk.red(message)}`, error)
      },
      pathReplace: (from: string, to: string) => {
        if (options.verbose) {
          consola.log(`${prefix} ${chalk.gray(from)} ${chalk.yellow('======>')} ${chalk.cyan(to)}`)
        }
      },
    }
  })()
  const filter = createFilter(options.include, options.exclude)
  let isSrc = false
  let projectRoot = ''
  let sourceDir = ''
  let assetDir = ''
  let outputDir = ''
  return {
    name: PLUGIN_NAME,
    enforce: 'pre',
    async configResolved(resolvedConfig) {
      projectRoot = resolvedConfig.root
      const normalizeSourceDir = normalizePath(path.normalize(options.sourceDir!))
      sourceDir = normalizePath(path.resolve(projectRoot, normalizeSourceDir))
      try {
        await fs.access(sourceDir)
      }
      catch (error) {
        const err = error as NodeJS.ErrnoException
        logger.error('替换资源目录不存在', err)
        return
      }
      logger.log(`替换资源目录: ${sourceDir}`)
      const srcIndex = normalizeSourceDir.indexOf('src')
      isSrc = srcIndex > -1
      assetDir = isSrc ? normalizeSourceDir.slice(srcIndex + 4) : sourceDir
      logger.log(`匹配资源目录: ${assetDir}`)
      outputDir = normalizePath(path.resolve(
        resolvedConfig.build.outDir,
        path.relative(projectRoot, path.resolve(projectRoot, assetDir)),
      ))
      logger.log(`输出目录: ${outputDir}`)
    },
    transform(code, id) {
      if (!sourceDir || !assetDir || !filter(id) || id.endsWith('.vue') || !code) {
        return { code }
      }
      const transformedCode = code.replace(
        /url\(\s*['"]?([^\s'")?]+)(?:\?[^\s'")]+)?['"]?\s*\)/g,
        (match, originalPath) => {
          if (!originalPath.includes(assetDir) || !originalPath.startsWith('/')) {
            return match
          }
          try {
            const outputFileName = `${cdnBasePath}${isSrc ? '/src' : ''}${originalPath}`
            logger.pathReplace(originalPath, outputFileName)
            return `url('${outputFileName}')`
          }
          catch (error) {
            logger.error(`处理文件失败: ${id}`, error as Error)
            return match
          }
        },
      )
      return { code: transformedCode }
    },
    async closeBundle() {
      if (!sourceDir || !assetDir) {
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
