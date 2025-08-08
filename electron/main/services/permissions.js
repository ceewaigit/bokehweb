const { systemPreferences } = require('electron')

async function checkMediaPermissions() {
  if (process.platform === 'darwin') {
    try {
      console.log('🔐 Checking macOS media permissions...')

      const screenStatus = systemPreferences.getMediaAccessStatus('screen')
      console.log('🖥️ Screen recording permission:', screenStatus)

      if (screenStatus !== 'granted') {
        console.log('⚠️ Screen recording permission not granted')
        global.screenRecordingPermission = screenStatus
        console.log('📝 Will show permission guide to user after window loads')
      } else {
        global.screenRecordingPermission = 'granted'
      }

      try {
        const microphoneStatus = await systemPreferences.askForMediaAccess('microphone')
        console.log('🎤 Microphone permission:', microphoneStatus ? 'granted' : 'denied')
      } catch (e) {
        console.log('🎤 Microphone permission check skipped:', e.message)
      }

    } catch (error) {
      console.error('❌ Error checking media permissions:', error)
      global.screenRecordingPermission = 'unknown'
    }
  } else {
    global.screenRecordingPermission = 'granted'
  }
}

module.exports = { checkMediaPermissions }