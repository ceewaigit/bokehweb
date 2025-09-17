/**
 * Utility functions for safely handling video-stream:// URLs
 * Prevents double-encoding issues with file paths containing special characters
 */

/**
 * Check if a string is already URL-encoded
 * @param str - String to check
 * @returns true if the string appears to be URL-encoded
 */
export function isUrlEncoded(str: string): boolean {
  // Check if string contains % followed by two hex digits
  // Common patterns: %20 (space), %2F (slash), etc.
  return /%[0-9A-Fa-f]{2}/.test(str);
}

/**
 * Safely encode a file path for use in video-stream:// URLs
 * Avoids double-encoding if the path is already encoded
 * @param filePath - File path to encode
 * @returns Encoded path safe for use in URLs
 */
export function safeEncodeVideoPath(filePath: string): string {
  // If already encoded, return as-is
  if (isUrlEncoded(filePath)) {
    return filePath;
  }
  
  // Otherwise, encode it
  return encodeURIComponent(filePath);
}

/**
 * Safely decode a file path from a video-stream:// URL
 * Handles both encoded and non-encoded paths
 * @param encodedPath - Path to decode
 * @returns Decoded file path
 */
export function safeDecodeVideoPath(encodedPath: string): string {
  try {
    // Try to decode - if it's not encoded, this will just return the original
    const decoded = decodeURIComponent(encodedPath);
    
    // Check if we need to decode again (in case of double-encoding)
    if (isUrlEncoded(decoded)) {
      try {
        return decodeURIComponent(decoded);
      } catch {
        // If second decode fails, return first decode result
        return decoded;
      }
    }
    
    return decoded;
  } catch (error) {
    // If decode fails, path wasn't encoded - return as-is
    return encodedPath;
  }
}

/**
 * Create a video-stream:// URL from a file path
 * @param filePath - File path to convert
 * @returns video-stream:// URL
 */
export function createVideoStreamUrl(filePath: string): string {
  const encodedPath = safeEncodeVideoPath(filePath);
  return `video-stream://${encodedPath}`;
}

/**
 * Extract file path from a video-stream:// URL
 * @param url - video-stream:// URL
 * @returns File path
 */
export function extractPathFromVideoStreamUrl(url: string): string {
  // Remove protocol
  let path = url.replace('video-stream://', '');
  
  // Remove any query parameters or fragments
  const queryIndex = path.indexOf('?');
  const hashIndex = path.indexOf('#');
  if (queryIndex > -1) path = path.substring(0, queryIndex);
  if (hashIndex > -1) path = path.substring(0, hashIndex);
  
  // Safely decode the path
  return safeDecodeVideoPath(path);
}