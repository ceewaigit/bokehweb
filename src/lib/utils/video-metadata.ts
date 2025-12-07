// Cache for video durations to prevent repeated metadata loads
const durationCache = new Map<string, Promise<number>>()

export async function getVideoDuration(videoUrl: string): Promise<number> {
  // Check cache first - deduplicate concurrent and repeated requests
  const cached = durationCache.get(videoUrl)
  if (cached) {
    return cached
  }

  // Create promise and cache it immediately to deduplicate concurrent calls
  const promise = loadVideoDurationInternal(videoUrl)
  durationCache.set(videoUrl, promise)
  return promise
}

function loadVideoDurationInternal(videoUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('error', onError)
      video.src = ''
      video.load()
    }

    const onMetadata = () => {
      const duration = video.duration
      cleanup()
      resolve(isNaN(duration) || !isFinite(duration) ? 0 : duration * 1000) // Return in milliseconds
    }

    const onError = () => {
      cleanup()
      resolve(0) // Return 0 on error instead of rejecting
    }

    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('error', onError)

    // Set a timeout to prevent hanging
    setTimeout(() => {
      cleanup()
      resolve(0)
    }, 5000)

    video.src = videoUrl
  })
}