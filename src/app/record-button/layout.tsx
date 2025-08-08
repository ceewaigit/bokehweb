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
    <html lang="en">
      <head />
      <body 
        className="m-0 p-0 overflow-hidden select-none"
        style={{ 
          backgroundColor: 'transparent',
          // @ts-ignore
          WebkitAppRegion: 'drag',
        }}>
        {children}
      </body>
    </html>
  )
}