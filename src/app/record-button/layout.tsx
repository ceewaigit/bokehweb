import type { Metadata } from 'next'
import '@/app/globals.css'

export const metadata: Metadata = {
  title: 'Screen Studio - Record Button',
}

export default function RecordButtonLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div 
      className="m-0 p-0 overflow-hidden select-none fixed inset-0"
      style={{ 
        backgroundColor: 'transparent',
        // @ts-ignore
        WebkitAppRegion: 'drag',
      }}>
      {children}
    </div>
  )
}