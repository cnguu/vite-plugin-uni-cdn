import chalk from 'chalk'
import consola from 'consola'

export const PLUGIN_NAME = 'vite-plugin-uni-cdn'

export const replaceUrlCache = new Map<string, string>()

export function createLogger(verbose: boolean) {
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

export function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function isInvalidOriginalPath(originalPath: string): boolean {
  return originalPath.startsWith('http') || originalPath.startsWith('data:')
}

export function codeReplaceMatch(
  assetDir: string,
  cdnBasePath: string,
  logger: ReturnType<typeof createLogger>,
  match: string,
  quote: string,
  originalPath: string,
  css: boolean = false,
): string {
  let outputFileName = replaceUrlCache.get(originalPath) || ''
  if (!outputFileName) {
    if (isInvalidOriginalPath(originalPath)) {
      return match
    }
    let relativePath = originalPath.startsWith(assetDir)
      ? originalPath.slice(assetDir.length)
      : originalPath
    if (!relativePath.startsWith('/')) {
      relativePath = `/${relativePath}`
    }
    outputFileName = `${cdnBasePath}${relativePath}`
    replaceUrlCache.set(originalPath, outputFileName)
    logger.pathReplace(originalPath, outputFileName)
  }
  if (css) {
    return `url(${quote || ''}${outputFileName}${quote || ''})`
  }
  return `${quote}${outputFileName}${quote}`
}

export function replaceStaticToCdn(
  code: string,
  assetDir: string,
  cdnBasePath: string,
  logger: ReturnType<typeof createLogger>,
): string {
  const escapedStaticPrefix = escapeRegExp(assetDir)

  let transformed = code.replace(new RegExp(
    `url\\(\\s*(['"]?)(${escapedStaticPrefix}[^'")\\s]+)\\1\\s*\\)`,
    'g',
  ), (match: string, quote: string, originalPath: string) => {
    try {
      return codeReplaceMatch(assetDir, cdnBasePath, logger, match, quote, originalPath, true)
    }
    catch (error) {
      logger.error(`处理 CSS 失败`, error as Error)
      return match
    }
  })

  transformed = transformed.replace(new RegExp(
    `(['"])(${escapedStaticPrefix}[^'"]*)\\1`,
    'g',
  ), (match: string, quote: string, originalPath: string) => {
    try {
      return codeReplaceMatch(assetDir, cdnBasePath, logger, match, quote, originalPath)
    }
    catch (error) {
      logger.error(`处理字符串失败`, error as Error)
      return match
    }
  })

  return transformed
}
