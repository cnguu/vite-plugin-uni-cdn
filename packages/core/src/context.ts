import type { NormalizedOutputOptions, OutputBundle, TransformResult } from 'rollup'
import type { ResolvedConfig } from 'vite'
import type { VitePluginUniCdnOption } from './type'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createFilter, normalizePath } from 'vite'
import { createLogger, generateDtsFile, replaceStaticToCdn } from './util'

export class Context {
  options: VitePluginUniCdnOption

  cdnBasePath: string = ''

  logger: ReturnType<typeof createLogger>

  filter: (id: string | unknown) => boolean

  // 是否以 src 开头（CLI 项目）
  isSrc: boolean = false

  projectRoot: string = ''

  sourceDirAbs: string = ''

  assetDir: string = ''

  outputDir: string = ''

  constructor(options?: VitePluginUniCdnOption) {
    this.options = {
      cdn: '',
      sourceDir: 'static/cdn',
      include: ['**/*.{vue,css,scss,sass,less,styl}'],
      exclude: ['**/node_modules/**', '**/uni_modules/**', '**/dist/**', '**/unpackage/**'],
      deleteOutputFiles: true,
      verbose: true,
      dtsPath: '',
      ...options,
    }

    this.cdnBasePath = this.options.cdn
      ? this.options.cdn.endsWith('/')
        ? this.options.cdn.slice(0, -1)
        : this.options.cdn
      : ''

    this.logger = createLogger(this.options.verbose!, {
      info: () => {},
      warn: () => {},
      warnOnce: () => {},
      error: () => {},
      clearScreen: () => {},
      hasErrorLogged: () => false,
      hasWarned: false,
    })

    this.filter = createFilter(this.options.include, this.options.exclude)
  }

  loadVirtualModule(): string {
    return `
export function withCdn(uri) {
  const cdnBasePath = '${this.cdnBasePath}';
  if (!cdnBasePath) {
    return uri;
  }
  if (uri.startsWith('http') || uri.startsWith('data:')) {
    return uri;
  }
  if (!uri.startsWith('/')) {
    uri = '/' + uri;
  }
  return \`\${cdnBasePath}\${uri}\`;
}
    `.trim()
  }

  async configResolved(resolvedConfig: ResolvedConfig): Promise<void> {
    this.projectRoot = resolvedConfig.root

    this.logger = createLogger(this.options.verbose!, resolvedConfig.logger)

    const relSourceDir = normalizePath(path.normalize(this.options.sourceDir!)).replace(/^\/+/, '')

    this.sourceDirAbs = normalizePath(path.resolve(this.projectRoot, relSourceDir))
    try {
      await fs.access(this.sourceDirAbs)
    }
    catch (error) {
      const err = error as NodeJS.ErrnoException
      this.logger.error('替换资源目录不存在', err)
      return
    }

    this.isSrc = relSourceDir.startsWith('src/')

    const staticSubPath = this.isSrc
      ? relSourceDir.slice('src/'.length)
      : relSourceDir

    this.assetDir = `/${staticSubPath.replace(/^\/+/, '')}`

    this.logger.log(`工程根目录: ${this.projectRoot}`)
    this.logger.log(`替换资源目录: ${this.sourceDirAbs}`)
    this.logger.log(`匹配资源前缀: ${this.assetDir}`)

    this.outputDir = normalizePath(
      path.resolve(
        resolvedConfig.build.outDir,
        staticSubPath,
      ),
    )

    this.logger.log(`输出目录: ${this.outputDir}`)

    await this.generateDts()
  }

  transform(code: string, id: string): TransformResult {
    if (!this.sourceDirAbs || !this.assetDir || !code) {
      return { code }
    }

    const [filepath] = id.split('?', 2)
    if (!this.filter(filepath)) {
      return { code }
    }

    const transformed = replaceStaticToCdn(code, this.assetDir, this.cdnBasePath, this.logger)
    return { code: transformed }
  }

  generateBundle(options: NormalizedOutputOptions, bundle: OutputBundle): void {
    if (!this.sourceDirAbs || !this.assetDir) {
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
        chunk.source = replaceStaticToCdn(before, this.assetDir, this.cdnBasePath, this.logger)
      }
      else if (chunk.type === 'chunk') {
        const before = chunk.code
        chunk.code = replaceStaticToCdn(before, this.assetDir, this.cdnBasePath, this.logger)
      }
    }
  }

  async closeBundle(): Promise<void> {
    if (!this.sourceDirAbs || !this.assetDir) {
      return
    }

    if (!this.options.deleteOutputFiles) {
      this.logger.log('已禁用输出文件删除功能')
      return
    }

    try {
      await fs.access(this.outputDir)
      await fs.rm(this.outputDir, { recursive: true, force: true, maxRetries: 2 })
      this.logger.success(`已成功删除目录: ${this.outputDir}`)
    }
    catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') {
        this.logger.log(`目录不存在，跳过删除: ${this.outputDir}`)
      }
      else {
        this.logger.error(`删除目录失败: ${this.outputDir}`, err)
      }
    }
  }

  private async generateDts() {
    const dtsPath = this.options.dtsPath
      ? normalizePath(path.resolve(this.projectRoot, this.options.dtsPath))
      : normalizePath(path.resolve(this.projectRoot, 'uni-cdn.d.ts'))
    await generateDtsFile(dtsPath, this.logger)
  }
}
