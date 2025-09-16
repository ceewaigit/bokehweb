import * as net from 'net'
import * as fs from 'fs'
import * as path from 'path'

// Try to find the actual Next.js port from its output or environment
export function getNextJsPort(): number {
  // Check if port is set via environment variable
  if (process.env.NEXT_PORT) {
    const port = parseInt(process.env.NEXT_PORT, 10)
    console.log('🔍 Using NEXT_PORT from environment:', port)
    return port
  }
  
  // Check common Next.js ports in order
  // This matches what Next.js does when auto-detecting ports
  const portsToTry = [3000, 3001, 3002, 3003, 3004]
  
  // For now, we'll use port 3002 as a fallback (as detected from the output)
  // In a production setup, you'd want to detect this dynamically
  console.log('⚠️ NEXT_PORT not set, defaulting to port 3002')
  return 3002
}

// Check if a port is available
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    
    server.once('error', () => {
      resolve(false)
    })
    
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    
    server.listen(port, '127.0.0.1')
  })
}

// Find the first available port starting from a base port
export async function findAvailablePort(startPort: number = 3000, maxAttempts: number = 10): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i
    if (await isPortAvailable(port)) {
      return port
    }
  }
  throw new Error(`No available port found between ${startPort} and ${startPort + maxAttempts}`)
}

// Store the detected port for the current session
let detectedPort: number | null = null

export function setDetectedPort(port: number) {
  detectedPort = port
  // Optionally write to a temp file for persistence across restarts
  try {
    const tempFile = path.join(__dirname, '.next-port')
    fs.writeFileSync(tempFile, port.toString())
  } catch (err) {
    console.warn('Could not persist port:', err)
  }
}

export function getDetectedPort(): number | null {
  if (detectedPort) return detectedPort
  
  // Try to read from temp file
  try {
    const tempFile = path.join(__dirname, '.next-port')
    if (fs.existsSync(tempFile)) {
      const port = parseInt(fs.readFileSync(tempFile, 'utf-8'), 10)
      if (!isNaN(port)) {
        detectedPort = port
        return port
      }
    }
  } catch (err) {
    // Ignore
  }
  
  return null
}