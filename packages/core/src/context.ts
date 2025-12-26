import type AliOSS from 'ali-oss'
import type { NormalizedOutputOptions, OutputBundle, TransformResult } from 'rollup'
import type { ResolvedConfig } from 'vite'
import type { AliOSSModule, VitePluginUniCdnOption } from './type'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { createFilter, normalizePath } from 'vite'
import { checkAliOSSInstalled } from './oss/ali'
import { withCdnTemplate } from './templates/withCdn'
import { createLogger, escapeRegExp, isInvalidOriginalPath } from './util'

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

  replaceUrlCache: Map<string, string> = new Map<string, string>()

  aliOSSClient: AliOSS | null = null

  constructor(options?: VitePluginUniCdnOption) {
    this.options = {
      cdn: '',
      sourceDir: 'static/cdn',
      include: ['**/*.{vue,css,scss,sass,less,styl}'],
      exclude: ['**/node_modules/**', '**/uni_modules/**', '**/dist/**', '**/unpackage/**'],
      deleteOutputFiles: true,
      verbose: true,
      aliOSS: void 0,
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
    const cdnBasePath = JSON.stringify(this.cdnBasePath)
    const assetDir = JSON.stringify(this.assetDir)
    const code = withCdnTemplate.replace(/__CDN__/g, cdnBasePath).replace(/__ASSET_DIR__/g, assetDir)
    return `${code.trim()}\n`
  }

  async configResolved(resolvedConfig: ResolvedConfig): Promise<void> {
    this.projectRoot = resolvedConfig.root

    this.logger = createLogger(this.options.verbose!, resolvedConfig.logger)

    const relSourceDir = normalizePath(path.normalize(this.options.sourceDir!)).replace(/^\/+/, '')

    this.sourceDirAbs = normalizePath(path.resolve(this.projectRoot, relSourceDir))
    try {
      await fsPromises.access(this.sourceDirAbs)
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
  }

  async buildStart() {
    if (!this.options.aliOSS?.enable) {
      return
    }
    let AliOSSClass: AliOSSModule = null
    try {
      AliOSSClass = await checkAliOSSInstalled()
    }
    catch (error) {
      this.logger.error('加载 ali-oss 依赖失败', error as Error)
      return
    }
    if (!AliOSSClass) {
      this.logger.error('未安装 ali-oss 依赖')
      return
    }
    try {
      this.aliOSSClient = new AliOSSClass(this.options.aliOSS.options)
      this.logger.log('ali-oss 初始化成功')
    }
    catch (error) {
      this.logger.error('ali-oss 初始化失败', error as Error)
    }
  }

  transform(code: string, id: string): TransformResult {
    if (!this.sourceDirAbs || !this.assetDir || !code) {
      return { code }
    }

    const [filepath] = id.split('?', 2)
    if (!this.filter(filepath)) {
      return { code }
    }

    const transformed = this.replaceStaticToCdn(code)
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
        chunk.source = this.replaceStaticToCdn(before)
      }
      else if (chunk.type === 'chunk') {
        const before = chunk.code
        chunk.code = this.replaceStaticToCdn(before)
      }
    }
  }

  async closeBundle(): Promise<void> {
    if (!this.sourceDirAbs || !this.assetDir) {
      return
    }
    await this.uploadAliOSS()
    this.deleteOutputFiles()
  }

  private replaceStaticToCdn(
    code: string,
  ): string {
    const escapedStaticPrefix = escapeRegExp(this.assetDir)

    let transformed = code.replace(new RegExp(
      `url\\(\\s*(['"]?)(${escapedStaticPrefix}[^'")\\s]+)\\1\\s*\\)`,
      'g',
    ), (match: string, quote: string, originalPath: string) => {
      try {
        return this.codeReplaceMatch(originalPath, match, quote, true)
      }
      catch (error) {
        this.logger.error(`处理 CSS 失败`, error as Error)
        return match
      }
    })

    transformed = transformed.replace(new RegExp(
      `(['"])(${escapedStaticPrefix}[^'"]*)\\1`,
      'g',
    ), (match: string, quote: string, originalPath: string) => {
      try {
        return this.codeReplaceMatch(originalPath, match, quote)
      }
      catch (error) {
        this.logger.error(`处理字符串失败`, error as Error)
        return match
      }
    })

    return transformed
  }

  private codeReplaceMatch(originalPath: string, match: string, quote: string, css: boolean = false): string {
    let outputFileName = this.replaceUrlCache.get(originalPath) || ''
    if (!outputFileName) {
      if (isInvalidOriginalPath(originalPath)) {
        return match
      }
      let relativePath = originalPath.startsWith(this.assetDir)
        ? originalPath.slice(this.assetDir.length)
        : originalPath
      if (!relativePath.startsWith('/')) {
        relativePath = `/${relativePath}`
      }
      outputFileName = `${this.cdnBasePath}${relativePath}`
      this.replaceUrlCache.set(originalPath, outputFileName)
      this.logger.pathReplace(originalPath, outputFileName)
    }
    if (css) {
      return `url(${quote || ''}${outputFileName}${quote || ''})`
    }
    return `${quote}${outputFileName}${quote}`
  }

  private async uploadAliOSS() {
    if (!this.aliOSSClient) {
      return
    }

    try {
      await fsPromises.access(this.outputDir)
    }
    catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') {
        this.logger.log(`输出目录不存在，跳过上传: ${this.outputDir}`)
        return
      }
      this.logger.error(`检查输出目录失败: ${this.outputDir}`, err)
      return
    }

    const promises = []
    for (const originalPath of this.replaceUrlCache.keys()) {
      const name = originalPath.slice(this.assetDir.length)
      const file = normalizePath(path.join(this.outputDir, name))
      try {
        await fsPromises.access(file)
      }
      catch (error) {
        const err = error as NodeJS.ErrnoException
        if (err.code === 'ENOENT') {
          this.logger.error(`文件不存在，跳过上传: ${file}`)
          continue
        }
        this.logger.error(`检查上传文件失败: ${file}`, err)
        continue
      }
      promises.push(this.aliOSSClient.put(name, file, { headers: { ...this.options.aliOSS?.headers } }))
    }
    if (promises.length) {
      this.logger.log(`开始上传文件到阿里云 OSS...`)
      try {
        await Promise.all(promises)
      }
      catch (error) {
        this.logger.error(`上传文件到阿里云失败: `, error as Error)
      }
      this.logger.log(`上传文件到阿里云 OSS 完成`)
    }
  }

  private async deleteOutputFiles() {
    if (!this.options.deleteOutputFiles) {
      this.logger.log('已禁用输出文件删除功能')
      return
    }

    try {
      await fsPromises.access(this.outputDir)
      await fsPromises.rm(this.outputDir, { recursive: true, force: true, maxRetries: 2 })
      this.logger.success(`已成功删除输出目录: ${this.outputDir}`)
    }
    catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') {
        this.logger.log(`输出目录不存在，跳过删除: ${this.outputDir}`)
      }
      else {
        this.logger.error(`删除输出目录失败: ${this.outputDir}`, err)
      }
    }
  }
}
