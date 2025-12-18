function withCdn(uri: string): string {
  const cdnBasePath = __CDN__
  const assetDir = __ASSET_DIR__
  if (!cdnBasePath) {
    return uri
  }
  if (uri.startsWith('http') || uri.startsWith('data:')) {
    return uri
  }
  let processedUri = uri.trim()
  if (!processedUri) {
    return uri
  }
  if (!processedUri.startsWith('/')) {
    processedUri = `/${processedUri}`
  }
  if (assetDir) {
    processedUri = processedUri.replace(new RegExp(`^${assetDir}`), '')
  }
  return `${cdnBasePath}${processedUri}`
}
