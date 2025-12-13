import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { isDev } from '../config'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])

function getParallaxRootDir(): string {
  return isDev
    ? path.join(__dirname, '../../../public/parallax')
    : path.join(process.resourcesPath, 'public', 'parallax')
}

function numericSortKey(filename: string): number {
  const match = filename.match(/(\d+)(?!.*\d)/)
  return match ? Number(match[1]) : Number.NEGATIVE_INFINITY
}

export function registerAssetHandlers(): void {
  ipcMain.handle('list-parallax-presets', async () => {
    const root = getParallaxRootDir()

    try {
      if (!fs.existsSync(root)) return []

      const presetDirs = fs.readdirSync(root, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort((a, b) => a.localeCompare(b))

      return presetDirs.map((folder) => {
        const presetPath = path.join(root, folder)
        const files = fs.readdirSync(presetPath, { withFileTypes: true })
          .filter(d => d.isFile())
          .map(d => d.name)
          .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
          .sort((a, b) => {
            const ak = numericSortKey(a)
            const bk = numericSortKey(b)
            if (ak !== bk) return bk - ak
            return a.localeCompare(b)
          })

        return { id: folder, name: folder, folder, files }
      }).filter(p => p.files.length > 0)
    } catch (error) {
      console.error('[Assets] Failed to list parallax presets:', error)
      return []
    }
  })
}

