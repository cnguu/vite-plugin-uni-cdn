import type { AliOSSModule } from '../type'

let aliOSSModule: AliOSSModule = null

export async function checkAliOSSInstalled(): Promise<AliOSSModule> {
  if (aliOSSModule !== null) {
    return aliOSSModule
  }
  try {
    const importModule = (await import('ali-oss'))
    aliOSSModule = importModule?.default || importModule
    return aliOSSModule
  }
  catch (error) {
    if ((error as Error).message.includes('Cannot find module') || (error as Error).message.includes('Failed to resolve module specifier')) {
      return null
    }
    throw error
  }
}
