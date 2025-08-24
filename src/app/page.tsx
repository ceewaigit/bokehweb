"use client"

import { useEffect, useState } from 'react'
import { WorkspaceManager } from "@/components/workspace/workspace-manager"
import { RecordButtonDock } from "@/components/record-button-dock"

export default function Home() {
  const [isRecordButton, setIsRecordButton] = useState(false)
  
  useEffect(() => {
    // Check if we're in the record button window
    // The record button window is smaller and has specific window properties
    const checkWindowType = () => {
      // Check URL hash first
      if (window.location.hash === '#/record-button') {
        setIsRecordButton(true)
        return
      }
      
      // Check window size as fallback (record button is much smaller)
      if (window.innerWidth < 400 && window.innerHeight < 400) {
        setIsRecordButton(true)
        return
      }
      
      setIsRecordButton(false)
    }
    
    checkWindowType()
    window.addEventListener('hashchange', checkWindowType)
    
    return () => window.removeEventListener('hashchange', checkWindowType)
  }, [])
  
  if (isRecordButton) {
    return <RecordButtonDock />
  }
  
  return <WorkspaceManager />
}