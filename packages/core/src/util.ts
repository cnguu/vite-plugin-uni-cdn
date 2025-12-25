import type { Logger } from 'vite'
import { PLUGIN_NAME } from './constant'

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
