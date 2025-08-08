/**
 * BlobURLManager - Simple memory leak prevention
 */

export class BlobURLManager {
  private urls = new Set<string>()
  private disposed = false

  create(blob: Blob): string {
    if (this.disposed) {
      throw new Error('BlobURLManager has been disposed')
    }

    const url = URL.createObjectURL(blob)
    this.urls.add(url)
    return url
  }

  revoke(url: string): void {
    if (this.urls.has(url)) {
      URL.revokeObjectURL(url)
      this.urls.delete(url)
    }
  }

  getUrlCount(): number {
    return this.urls.size
  }

  cleanup(): void {
    this.urls.forEach(url => {
      try {
        URL.revokeObjectURL(url)
      } catch (error) {
        console.error('Error revoking URL:', error)
      }
    })
    this.urls.clear()
  }

  dispose(): void {
    if (!this.disposed) {
      this.cleanup()
      this.disposed = true
    }
  }
}

// Global instance for the application
export const globalBlobManager = new BlobURLManager()

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    globalBlobManager.dispose()
  })
}