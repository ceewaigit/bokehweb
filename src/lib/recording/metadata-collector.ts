"use client"

export interface RecordingMetadata {
  timestamp: number
  mouseX: number
  mouseY: number
  scrollX: number
  scrollY: number
  windowWidth: number
  windowHeight: number
  eventType: 'mouse' | 'click' | 'scroll' | 'key'
  data?: any
}

export class MetadataCollector {
  private metadata: RecordingMetadata[] = []
  private interval: NodeJS.Timeout | number | null = null
  private startTime = 0
  private listeners: Array<{ element: any, event: string, handler: any }> = []
  private lastMouseEvent: MouseEvent | null = null

  start(): void {
    this.startTime = Date.now()
    this.metadata = []
    this.setupEventListeners()
    this.startCapture()
  }

  stop(): RecordingMetadata[] {
    this.stopCapture()
    this.removeEventListeners()
    return [...this.metadata]
  }

  private startCapture(): void {
    // Capture at 60fps for smooth effects
    // Use global setInterval in test environments for better compatibility
    const setIntervalFn = (typeof window !== 'undefined' && window.setInterval) ? window.setInterval : setInterval
    this.interval = setIntervalFn(() => {
      if (this.lastMouseEvent) {
        this.metadata.push({
          timestamp: Date.now() - this.startTime,
          mouseX: this.lastMouseEvent.clientX,
          mouseY: this.lastMouseEvent.clientY,
          scrollX: (typeof window !== 'undefined' && window.scrollX) ? window.scrollX : 0,
          scrollY: (typeof window !== 'undefined' && window.scrollY) ? window.scrollY : 0,
          windowWidth: (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1920,
          windowHeight: (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 1080,
          eventType: 'mouse'
        })
      }
    }, 16)
  }

  private stopCapture(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  private setupEventListeners(): void {
    const handleMouseMove = (e: MouseEvent) => {
      this.lastMouseEvent = e
    }

    const handleClick = (e: MouseEvent) => {
      this.addEvent({
        mouseX: e.clientX,
        mouseY: e.clientY,
        eventType: 'click',
        data: { button: e.button, detail: e.detail }
      })
    }

    const handleScroll = () => {
      this.addEvent({
        mouseX: this.lastMouseEvent?.clientX || 0,
        mouseY: this.lastMouseEvent?.clientY || 0,
        eventType: 'scroll'
      })
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      this.addEvent({
        mouseX: this.lastMouseEvent?.clientX || 0,
        mouseY: this.lastMouseEvent?.clientY || 0,
        eventType: 'key',
        data: { key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey }
      })
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('click', handleClick)
      document.addEventListener('keydown', handleKeyDown)
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', handleScroll)
    }

    this.listeners = [
      { element: document, event: 'mousemove', handler: handleMouseMove },
      { element: document, event: 'click', handler: handleClick },
      { element: window, event: 'scroll', handler: handleScroll },
      { element: document, event: 'keydown', handler: handleKeyDown }
    ]
  }

  private removeEventListeners(): void {
    this.listeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler)
    })
    this.listeners = []
  }

  private addEvent(event: Partial<RecordingMetadata>): void {
    this.metadata.push({
      timestamp: Date.now() - this.startTime,
      scrollX: (typeof window !== 'undefined' && window.scrollX) ? window.scrollX : 0,
      scrollY: (typeof window !== 'undefined' && window.scrollY) ? window.scrollY : 0,
      windowWidth: (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1920,
      windowHeight: (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 1080,
      ...event
    } as RecordingMetadata)
  }

  getMetadataCount(): number {
    return this.metadata.length
  }
}