import type { AliOSSModule } from '../type'

let aliOSSModule: AliOSSModule = null

export async function checkAliOSSInstalled(): Promise<AliOSSModule> {
  if (aliOSSModule !== null) {
    return aliOSSModule
  }
  try {
    aliOSSModule = (await import('ali-oss')).default
    return aliOSSModule
  }
  catch (error) {
    if ((error as Error).message.includes('Cannot find module') || (error as Error).message.includes('Failed to resolve module specifier')) {
      return null
    }
    throw error
  }
}
