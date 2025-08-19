/**
 * Calculate video positioning within a container with padding
 * Used for consistent video placement across preview and rendering
 */
export function calculateVideoPosition(
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding: number = 80
) {
  const videoAspect = videoWidth / videoHeight
  const availableWidth = containerWidth - (padding * 2)
  const availableHeight = containerHeight - (padding * 2)
  const availableAspect = availableWidth / availableHeight

  let drawWidth: number
  let drawHeight: number
  let offsetX: number
  let offsetY: number

  if (videoAspect > availableAspect) {
    // Video is wider than available space
    drawWidth = availableWidth
    drawHeight = availableWidth / videoAspect
    offsetX = padding
    offsetY = padding + (availableHeight - drawHeight) / 2
  } else {
    // Video is taller than available space
    drawHeight = availableHeight
    drawWidth = availableHeight * videoAspect
    offsetX = padding + (availableWidth - drawWidth) / 2
    offsetY = padding
  }

  return {
    drawWidth,
    drawHeight,
    offsetX,
    offsetY
  }
}