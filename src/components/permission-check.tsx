"use client"

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Shield, AlertCircle, CheckCircle } from 'lucide-react'

interface PermissionStatus {
  status: string
  granted: boolean
}

export function PermissionCheck() {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | null>(null)
  const [showPermissionDialog, setShowPermissionDialog] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    checkPermissions()
  }, [])

  const checkPermissions = async () => {
    // Only check permissions in Electron environment
    if (typeof window === 'undefined' || !window.electronAPI) {
      console.log('⚠️ Not in Electron environment - permissions not applicable')
      setIsChecking(false)
      return
    }

    try {
      console.log('🔍 Checking screen recording permissions...')
      const result = await window.electronAPI.checkScreenRecordingPermission()
      console.log('📋 Permission check result:', result)

      setPermissionStatus(result)

      // Show dialog if permission is not granted
      if (!result.granted && result.status !== 'not-applicable') {
        setShowPermissionDialog(true)
      }
    } catch (error) {
      console.error('❌ Failed to check permissions:', error)
      setPermissionStatus({ status: 'unknown', granted: false })
    } finally {
      setIsChecking(false)
    }
  }

  const openSystemPreferences = () => {
    // On macOS, this will open the Screen Recording preferences
    if (window.electronAPI?.requestScreenRecordingPermission) {
      // This will trigger the system prompt or open preferences
      window.electronAPI.requestScreenRecordingPermission().then(() => {
        // After user interaction, check permissions again
        setTimeout(() => {
          checkPermissions()
        }, 1000)
      })
    }
  }

  const handleDismiss = () => {
    setShowPermissionDialog(false)
    // Store that we've shown the dialog once this session
    sessionStorage.setItem('permission-dialog-shown', 'true')
  }

  // Don't show anything if checking or if permission is granted
  if (isChecking || (permissionStatus?.granted && !showPermissionDialog)) {
    return null
  }

  return (
    <Dialog open={showPermissionDialog} onOpenChange={setShowPermissionDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {permissionStatus?.status === 'denied' ? (
              <AlertCircle className="h-6 w-6 text-destructive" />
            ) : (
              <Shield className="h-6 w-6 text-yellow-500" />
            )}
            <DialogTitle>Screen Recording Permission Required</DialogTitle>
          </div>
          <DialogDescription className="space-y-3 pt-2">
            <p>
              Screen Studio needs permission to record your screen. This is required for the app to function properly.
            </p>

            {permissionStatus?.status === 'denied' && (
              <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
                <p className="font-semibold mb-1">Permission Denied</p>
                <p>You&apos;ll need to manually enable screen recording in System Preferences.</p>
              </div>
            )}

            <div className="bg-muted rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium">To enable screen recording:</p>
              <ol className="text-sm space-y-1 ml-4">
                <li>1. Open System Preferences</li>
                <li>2. Go to Security & Privacy → Privacy</li>
                <li>3. Select &quot;Screen Recording&quot; from the list</li>
                <li>4. Check the box next to Screen Studio</li>
                <li>5. Restart Screen Studio</li>
              </ol>
            </div>

            {permissionStatus?.status === 'not-determined' && (
              <div className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-lg p-3 text-sm">
                <p>Click &quot;Open System Preferences&quot; to grant permission.</p>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleDismiss}>
            Continue Without Permission
          </Button>
          <Button onClick={openSystemPreferences}>
            Open System Preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Helper component to show permission status in the UI
export function PermissionStatusIndicator() {
  const [status, setStatus] = useState<PermissionStatus | null>(null)

  useEffect(() => {
    if (window.electronAPI?.checkScreenRecordingPermission) {
      window.electronAPI.checkScreenRecordingPermission().then(setStatus)
    }
  }, [])

  if (!status || status.status === 'not-applicable') return null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {status.granted ? (
        <div className="flex items-center gap-2 bg-green-500/10 text-green-600 dark:text-green-400 px-3 py-2 rounded-lg text-sm">
          <CheckCircle className="h-4 w-4" />
          <span>Screen recording enabled</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 px-3 py-2 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>Screen recording permission required</span>
        </div>
      )}
    </div>
  )
}