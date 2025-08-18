import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Screen Studio - Record Button',
}

export default function RecordButtonLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // For record button, we bypass all layout styling
  return (
    <div style={{ 
      position: 'fixed', 
      inset: 0, 
      margin: 0, 
      padding: 0, 
      background: 'transparent' 
    }}>
      {children}
    </div>
  )
}