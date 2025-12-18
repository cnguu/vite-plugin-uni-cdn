import type { AliOssModule } from '../type'

let aliOssModule: AliOssModule = null

async function checkAliOssInstalled(): Promise<AliOssModule> {
  if (aliOssModule !== null) {
    return aliOssModule
  }
  try {
    aliOssModule = (await import('ali-oss')).default
    return aliOssModule
  }
  catch (e) {
    if ((e as Error).message.includes('Cannot find module') || (e as Error).message.includes('Failed to resolve module specifier')) {
      return null
    }
    throw e
  }
}
