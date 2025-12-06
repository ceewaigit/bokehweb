/**
 * Export progress tracking and aggregation
 * Handles progress from multiple chunks/workers and forwards to UI
 */

import type { WebContents } from 'electron'
import type { SupervisedWorker } from '../../utils/worker-manager'
import type { ProgressData, AggregatedProgress } from './types'

/**
 * Progress tracker for managing export progress across chunks
 */
export class ProgressTracker {
  private chunkProgress = new Map<number, { rendered: number; total: number }>()
  private lastForwardedProgress = 0
  private totalFrameCount: number
  private webContents: WebContents

  constructor(webContents: WebContents, totalFrames: number) {
    this.webContents = webContents
    this.totalFrameCount = Math.max(1, totalFrames || 0)
  }

  /**
   * Clamp progress to valid range and ensure monotonic increase
   */
  private clampProgress(value: number | undefined): number {
    if (!Number.isFinite(value ?? NaN)) {
      return this.lastForwardedProgress
    }
    const normalized = Math.min(100, Math.max(0, Math.round(value!)))
    return Math.max(this.lastForwardedProgress, normalized)
  }

  /**
   * Forward progress message to the renderer
   */
  forwardProgressMessage(payload: ProgressData | any): void {
    const data = payload ?? {}

    const hasChunkInfo =
      typeof data.chunkIndex === 'number' &&
      typeof data.chunkTotalFrames === 'number' &&
      Number.isFinite(data.chunkTotalFrames)

    if (hasChunkInfo) {
      const safeTotal = Math.max(0, data.chunkTotalFrames)
      const rendered = Math.max(0, Math.min(safeTotal, data.chunkRenderedFrames ?? 0))

      const chunkState = this.chunkProgress.get(data.chunkIndex) ?? { rendered: 0, total: safeTotal }
      chunkState.rendered = rendered
      if (safeTotal > 0) {
        chunkState.total = safeTotal
      }
      this.chunkProgress.set(data.chunkIndex, chunkState)

      let renderedSum = 0
      for (const state of this.chunkProgress.values()) {
        const chunkTotal = Math.max(1, state.total || 0)
        const chunkRendered = Math.max(0, Math.min(chunkTotal, state.rendered))
        renderedSum += chunkRendered
      }

      const normalized = Math.min(1, Math.max(0, renderedSum / this.totalFrameCount))
      const scaled = 10 + normalized * 80
      const percent = this.clampProgress(scaled)

      const stage = data.stage === 'finalizing' ? 'finalizing' : data.stage === 'encoding' ? 'encoding' : 'rendering'
      const message = stage === 'finalizing'
        ? 'Finalizing export...'
        : `Rendering ${percent}% complete`

      const aggregated: AggregatedProgress = {
        progress: percent,
        stage,
        message
      }

      this.webContents.send('export-progress', aggregated)
      this.lastForwardedProgress = aggregated.progress
      return
    }

    if (typeof data.progress === 'number') {
      const percent = this.clampProgress(data.progress)
      const stage = data.stage ?? (percent >= 100 ? 'complete' : 'encoding')
      const message = data.stage === 'finalizing'
        ? 'Finalizing export...'
        : data.stage === 'complete'
          ? 'Export complete!'
          : `Rendering ${percent}% complete`

      const aggregated: AggregatedProgress = {
        progress: percent,
        stage,
        message
      }

      this.webContents.send('export-progress', aggregated)
      this.lastForwardedProgress = aggregated.progress
      return
    }

    const fallback: AggregatedProgress = {
      progress: this.lastForwardedProgress,
      stage: data.stage ?? 'rendering',
      message: data.message ?? `Rendering ${this.lastForwardedProgress}% complete`
    }

    this.webContents.send('export-progress', fallback)
    this.lastForwardedProgress = fallback.progress
  }

  /**
   * Send a specific progress update
   */
  sendProgress(progress: number, stage: string, message: string): void {
    this.webContents.send('export-progress', {
      progress: this.clampProgress(progress),
      stage,
      message
    })
    this.lastForwardedProgress = progress
  }

  /**
   * Attach progress forwarder to a worker
   * @returns Cleanup function to detach the forwarder
   */
  attachToWorker(worker: SupervisedWorker): () => void {
    const forward = (message: any) => {
      if (message.type === 'progress') {
        this.forwardProgressMessage(message.data)
      }
    }

    worker.on('message', forward)
    return () => worker.off('message', forward)
  }

  /**
   * Get the last forwarded progress value
   */
  getLastProgress(): number {
    return this.lastForwardedProgress
  }

  /**
   * Reset progress tracking state
   */
  reset(): void {
    this.chunkProgress.clear()
    this.lastForwardedProgress = 0
  }
}
