const { app } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development'

function getAppURL(route = '') {
  if (isDev) {
    return `http://localhost:3000${route}`
  }
  
  const isPackaged = app.isPackaged
  
  if (isPackaged) {
    const htmlFile = route === ''
      ? 'index.html'
      : `${route.replace('/', '')}/index.html`
    
    console.log(`📦 Loading packaged app URL: app://${htmlFile}`)
    return `app://${htmlFile}`
  } else {
    const htmlPath = route === ''
      ? path.join(__dirname, '../../out/index.html')
      : path.join(__dirname, '../../out', route.replace('/', ''), 'index.html')

    console.log(`📁 Loading local production HTML: ${htmlPath}`)
    console.log(`📁 File exists: ${require('fs').existsSync(htmlPath)}`)

    return `file://${htmlPath}`
  }
}

function getRecordingsDirectory() {
  const recordingsDir = path.join(app.getPath('documents'), 'ScreenStudio Recordings')
  const fs = require('fs')
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true })
  }
  return recordingsDir
}

module.exports = {
  isDev,
  getAppURL,
  getRecordingsDirectory
}