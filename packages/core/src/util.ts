import type { Logger } from 'vite'
import { PLUGIN_NAME } from './constant'

export const replaceUrlCache = new Map<string, string>()

export function createLogger(verbose: boolean, viteLogger: Logger) {
  const prefix = `[${PLUGIN_NAME}]`
  return {
    log: (message: string) => {
      if (verbose) {
        viteLogger.warn(`${prefix} ${message}`)
      }
    },
    success: (message: string) => {
      if (verbose) {
        viteLogger.warn(`${prefix} ${message}`)
      }
    },
    error: (message: string, error?: Error) => {
      viteLogger.error(`${prefix} ${message}`, { error })
    },
    pathReplace: (from: string, to: string) => {
      if (verbose) {
        viteLogger.warn(`${prefix} ${from} ======> ${to}`)
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
