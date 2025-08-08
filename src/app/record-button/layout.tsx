import type { Metadata } from 'next'
import './page.css'

export const metadata: Metadata = {
  title: 'Screen Studio - Record Button',
}

export default function RecordButtonLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}