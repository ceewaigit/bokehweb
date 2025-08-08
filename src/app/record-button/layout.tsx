import '@/app/globals.css'

export default function RecordButtonLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ 
        margin: 0, 
        padding: 0, 
        overflow: 'hidden',
        backgroundColor: 'transparent',
        userSelect: 'none'
      }}>
        {children}
      </body>
    </html>
  )
}