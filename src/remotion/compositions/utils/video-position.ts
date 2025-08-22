/**
 * Shared utility for calculating video position with padding
 */

export function calculateVideoPosition(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
  padding: number
) {
  // Simply position the video with padding
  // The composition should already be sized correctly
  const drawWidth = containerWidth - (padding * 2);
  const drawHeight = containerHeight - (padding * 2);
  const offsetX = padding;
  const offsetY = padding;
  
  return { drawWidth, drawHeight, offsetX, offsetY };
}