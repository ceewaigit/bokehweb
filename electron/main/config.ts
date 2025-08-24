import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

export const isDev = process.env.NODE_ENV === 'development'

export function getAppURL(route: string = ''): string {
  if (isDev && !process.env.MAIN_WINDOW_WEBPACK_ENTRY) {
    // Development mode with Next.js dev server
    const devServerUrl = process.env.DEV_SERVER_URL || 'http://localhost:3000'
    return `${devServerUrl}${route}`
  }

  // For webpack builds (both dev and production)
  if (process.env.MAIN_WINDOW_WEBPACK_ENTRY) {
    const baseUrl = process.env.MAIN_WINDOW_WEBPACK_ENTRY

    // For routes, we need to navigate within the single-page app
    if (route) {
      // Return the main entry with a hash route for client-side routing
      return `${baseUrl}#${route}`
    }

    return baseUrl
  }

  // Fallback for packaged app without webpack
  const isPackaged = app.isPackaged

  if (isPackaged) {
    // In packaged app, serve from the bundled out directory
    const htmlFile = 'index.html'
    const appUrl = `app://${htmlFile}`

    if (route) {
      return `${appUrl}#${route}`
    }

    console.log(`📦 Loading packaged app URL: ${appUrl}`)
    return appUrl
  } else {
    // Local build without webpack
    const htmlPath = path.join(__dirname, '../../out/index.html')
    const fileUrl = `file://${htmlPath}`

    if (route) {
      return `${fileUrl}#${route}`
    }

    console.log(`📁 Loading local production HTML: ${htmlPath}`)
    console.log(`📁 File exists: ${fs.existsSync(htmlPath)}`)

    return fileUrl
  }
}

export function getRecordingsDirectory(): string {
  const recordingsDir = path.join(app.getPath('documents'), 'FlowCapture Recordings')
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true })
  }
  return recordingsDir
}