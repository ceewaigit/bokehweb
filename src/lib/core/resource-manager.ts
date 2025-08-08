/**
 * ResourceManager - Simple cleanup pattern for critical memory leaks
 */

export class ResourceManager {
  private cleanups = new Set<() => void>()
  private namedCleanups = new Map<string, () => void>()
  private disposed = false

  constructor(private onError?: (error: Error, id?: string) => void) {}

  register(cleanup: () => void, identifier?: string): () => void {
    if (this.disposed) {
      throw new Error('ResourceManager has been disposed')
    }

    if (identifier) {
      if (this.namedCleanups.has(identifier)) {
        throw new Error(`Resource with identifier "${identifier}" already exists`)
      }
      this.namedCleanups.set(identifier, cleanup)
    } else {
      this.cleanups.add(cleanup)
    }

    return () => {
      if (identifier) {
        this.namedCleanups.delete(identifier)
      } else {
        this.cleanups.delete(cleanup)
      }
    }
  }

  cleanupResource(identifier: string): void {
    const cleanup = this.namedCleanups.get(identifier)
    if (cleanup) {
      try {
        cleanup()
      } catch (error) {
        this.onError?.(error as Error, identifier)
      }
      this.namedCleanups.delete(identifier)
    }
  }

  hasResource(identifier: string): boolean {
    return this.namedCleanups.has(identifier)
  }

  getResourceCount(): number {
    return this.cleanups.size + this.namedCleanups.size
  }

  getResourceInfo() {
    return {
      totalResources: this.getResourceCount(),
      namedResources: this.namedCleanups.size,
      identifiers: Array.from(this.namedCleanups.keys())
    }
  }

  dispose(): void {
    if (this.disposed) return

    // Cleanup all resources
    this.cleanups.forEach(cleanup => {
      try {
        cleanup()
      } catch (error) {
        this.onError?.(error as Error, undefined)
      }
    })

    this.namedCleanups.forEach((cleanup, id) => {
      try {
        cleanup()
      } catch (error) {
        this.onError?.(error as Error, id)
      }
    })

    this.cleanups.clear()
    this.namedCleanups.clear()
    this.disposed = true
  }
}