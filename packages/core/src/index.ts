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
   * 默认：'./static/cdn/'
   */
  sourceDir?: string
  /**
   * 白名单
   * 默认：['\*\*\/\*.png', '\*\*\/\*.svg', '\*\*\/\*.gif', '\*\*\/\*.jp(e)?g', '\*\*\/\*.vue', '\*\*\/\*.scss']
   */
  include?: FilterPattern
  /**
   * 黑名单
   * 默认：['node_modules/\*\*', 'uni_modules/\*\*', 'dist/\*\*', 'unpackage/\*\*']
   */
  exclude?: FilterPattern
  /**
   * 是否删除替换资源目录对应的输出目录
   * 默认：true
   */
  deleteOutputFiles?: boolean
  /**
   * 是否输出命令行信息
   * 默认：true
   */
  verbose?: boolean
}

function UniCdn(opt: VitePluginUniCdnOption): Plugin {
  const PLUGIN_NAME = 'vite-plugin-uni-cdn'
  const defaultOption: VitePluginUniCdnOption = {
    cdn: '',
    sourceDir: './static/cdn/',
    include: ['**/*.png', '**/*.svg', '**/*.gif', '**/*.jp(e)?g', '**/*.vue', '**/*.scss'],
    exclude: ['node_modules/**', 'uni_modules/**', 'dist/**', 'unpackage/**'],
    deleteOutputFiles: true,
    verbose: true,
  }
  const options = { ...defaultOption, ...opt }
  const cdnBasePath = options.cdn
    ? options.cdn.endsWith('/')
      ? options.cdn
      : `${options.cdn}/`
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
  let projectRoot = ''
  let normalizedSourceDir = ''
  let outputSourceDir = ''
  return {
    name: PLUGIN_NAME,
    enforce: 'pre',
    configResolved(resolvedConfig) {
      projectRoot = resolvedConfig.root
      const absoluteSourceDir = path.resolve(projectRoot, path.normalize(options.sourceDir!))
      normalizedSourceDir = normalizePath(absoluteSourceDir)
      logger.log(`源文件目录: ${absoluteSourceDir}`)
      outputSourceDir = path.resolve(
        resolvedConfig.build.outDir,
        path.relative(projectRoot, absoluteSourceDir),
      )
      logger.log(`输出目录: ${outputSourceDir}`)
    },
    load(id) {
      if (!filter(id))
        return null
      if (/\.(?:scss|vue)/.test(id))
        return null
      const normalizedId = normalizePath(id)
      const relativePath = path.relative(normalizedSourceDir, normalizedId)
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath))
        return null
      try {
        const outputFileName = `${cdnBasePath}${relativePath}`
        logger.pathReplace(id, outputFileName)
        return `export default "${outputFileName}"`
      }
      catch (error) {
        logger.error(`处理文件失败: ${id}`, error as Error)
        return null
      }
    },
    transform(code, id) {
      if (!filter(id) || !code)
        return null
      if (!id.includes('type=style') || !id.includes('lang.scss'))
        return null
      const transformedCode = code.replace(
        /url\(\s*['"]?([^\s'")?]+)(?:\?[^\s'")]+)?['"]?\s*\)/g,
        (match, originalPath) => {
          try {
            const absoluteOriginalPath = path.resolve(projectRoot, originalPath.slice(1))
            const normalizedAbsolutePath = normalizePath(absoluteOriginalPath)
            const relativePath = path.relative(normalizedSourceDir, normalizedAbsolutePath)
            if (relativePath.startsWith('..') || path.isAbsolute(relativePath))
              return match
            const outputFileName = `${cdnBasePath}${relativePath}`
            logger.pathReplace(originalPath, outputFileName)
            return `url('${outputFileName}')`
          }
          catch (error) {
            logger.error(`处理文件失败: ${id}`, error as Error)
            return match
          }
        },
      )
      return { code: transformedCode, map: null }
    },
    async closeBundle() {
      if (!options.deleteOutputFiles) {
        logger.log('已禁用输出文件删除功能')
        return
      }
      try {
        await fs.access(outputSourceDir)
        await fs.rm(outputSourceDir, { recursive: true, force: true, maxRetries: 2 })
        logger.success(`已成功删除目录: ${outputSourceDir}`)
      }
      catch (error) {
        const err = error as NodeJS.ErrnoException
        if (err.code === 'ENOENT') {
          logger.log(`目录不存在，跳过删除: ${outputSourceDir}`)
        }
        else {
          logger.error(`删除目录失败: ${outputSourceDir}`, err)
        }
      }
    },
  }
}

export default UniCdn
