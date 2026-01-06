import type { SFCBlock } from '@vue/compiler-sfc'
import type AliOSS from 'ali-oss'
import type { TransformResult } from 'rollup'
import type { ResolvedConfig, UserConfig } from 'vite'
import type { AliOSSModule, VitePluginUniCdnOption } from './type'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { parse as vueParse } from '@vue/compiler-sfc'
import { createFilter, normalizePath } from 'vite'
import { POSTCSS_PLUGIN_NAME } from './constant'
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
      include: ['**/*.vue'],
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

  config(): Omit<UserConfig, 'plugins'> | null | void | Promise<Omit<UserConfig, 'plugins'> | null | void> {
    if (!this.cdnBasePath || !this.options.sourceDir) {
      return
    }
    const relSourceDir = normalizePath(path.normalize(this.options.sourceDir)).replace(/^\/+/, '')
    const staticSubPath = relSourceDir.startsWith('src/') ? relSourceDir.slice('src/'.length) : relSourceDir
    const staticDir = `/${staticSubPath.replace(/^\/+/, '')}`
    const cdnBasePath = this.cdnBasePath
    const urlRegex = /url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g
    return {
      css: {
        postcss: {
          plugins: [
            {
              postcssPlugin: POSTCSS_PLUGIN_NAME,
              Declaration: (decl) => {
                if (!decl.value || !decl.value.startsWith('url(') || decl.value.includes('http') || decl.value.includes('data:')) {
                  return
                }
                decl.value = decl.value.replace(urlRegex, (match, quote, originalPath) => {
                  if (originalPath.startsWith(staticDir)) {
                    let outputFileName = this.replaceUrlCache.get(originalPath)
                    if (!outputFileName) {
                      let relativePath = originalPath.slice(staticDir.length)
                      if (!relativePath.startsWith('/')) {
                        relativePath = `/${relativePath}`
                      }
                      outputFileName = `${cdnBasePath}${relativePath}`
                      this.replaceUrlCache.set(originalPath, outputFileName)
                      this.logger?.pathReplace?.(originalPath, outputFileName)
                    }
                    return `url(${quote}${outputFileName}${quote})`
                  }
                  return match
                })
              },
            },
          ],
        },
      },
    }
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
    if (id.endsWith('.vue')) {
      return this.processVueSfc(code)
    }
    const transformedCode = this.replaceStaticToCdn(code)
    return { code: transformedCode }
  }

  async closeBundle(): Promise<void> {
    if (!this.sourceDirAbs || !this.assetDir) {
      return
    }
    await this.uploadAliOSS()
    await this.deleteOutputFiles()
  }

  private processVueSfc(code: string): TransformResult {
    let transformedCode = code
    try {
      const sfc = vueParse(code)
      transformedCode = this.processSfcBlock(transformedCode, sfc.descriptor.template)
      transformedCode = this.processSfcBlock(transformedCode, sfc.descriptor.scriptSetup)
      transformedCode = this.processSfcBlock(transformedCode, sfc.descriptor.script)
    }
    catch (error) {
      this.logger.error('解析 Vue SFC 失败', error as Error)
      transformedCode = this.replaceStaticToCdn(code)
    }
    return { code: transformedCode }
  }

  private processSfcBlock(code: string, block: SFCBlock | null): string {
    if (!block) {
      return code
    }
    const { content, loc } = block
    const transformedContent = this.replaceStaticToCdn(content)
    return code.slice(0, loc.start.offset)
      + transformedContent
      + code.slice(loc.end.offset)
  }

  private replaceStaticToCdn(
    code: string,
  ): string {
    return code.replace(new RegExp(
      `(['"])(${escapeRegExp(this.assetDir)}[^'"]*)\\1`,
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
  }

  private codeReplaceMatch(originalPath: string, match: string, quote: string): string {
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
