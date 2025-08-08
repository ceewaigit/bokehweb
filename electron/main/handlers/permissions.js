const { ipcMain, systemPreferences } = require('electron')

let permissionCheckInterval = null

function registerPermissionHandlers() {
  ipcMain.handle('check-screen-recording-permission', async () => {
    if (process.platform === 'darwin') {
      try {
        const status = systemPreferences.getMediaAccessStatus('screen')
        console.log('🔍 Screen recording permission status:', status)
        return { status, granted: status === 'granted' }
      } catch (error) {
        console.error('❌ Error checking screen recording permission:', error)
        return { status: 'unknown', granted: false }
      }
    }
    return { status: 'not-applicable', granted: true }
  })

  ipcMain.handle('start-permission-monitoring', async (event) => {
    if (process.platform !== 'darwin') return

    if (permissionCheckInterval) {
      clearInterval(permissionCheckInterval)
    }

    permissionCheckInterval = setInterval(() => {
      try {
        const status = systemPreferences.getMediaAccessStatus('screen')
        event.sender.send('permission-status-changed', { status, granted: status === 'granted' })
      } catch (error) {
        console.error('Error checking permission status:', error)
      }
    }, 2000)

    console.log('📊 Started monitoring screen recording permission')
  })

  ipcMain.handle('stop-permission-monitoring', async () => {
    if (permissionCheckInterval) {
      clearInterval(permissionCheckInterval)
      permissionCheckInterval = null
      console.log('🛑 Stopped monitoring screen recording permission')
    }
  })

  ipcMain.handle('request-screen-recording-permission', async () => {
    if (process.platform === 'darwin') {
      try {
        console.log('🔐 Opening System Preferences for screen recording permission')
        require('child_process').exec('open x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')

        const status = systemPreferences.getMediaAccessStatus('screen')
        return { opened: true, status, granted: status === 'granted' }
      } catch (error) {
        console.error('❌ Error opening System Preferences:', error)
        return { opened: false, status: 'unknown', granted: false }
      }
    }
    return { opened: false, status: 'not-applicable', granted: true }
  })
}

module.exports = { registerPermissionHandlers }