import type OSS from 'ali-oss'
import type { FilterPattern } from 'vite'

export interface VitePluginUniCdnOption {
  /**
   * cdn 地址
   */
  cdn?: string
  /**
   * 替换资源目录，不在该目录下的资源不会被替换
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
  /**
   * 类型声明文件输出路径
   */
  dtsPath?: string
}

export type AliOssModule = typeof OSS | null
