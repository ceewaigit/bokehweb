import { useEffect, useRef } from 'react'

type EventHandler<T = Event> = (event: T) => void

export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: EventHandler<WindowEventMap[K]>,
  element: EventTarget = window,
  options?: boolean | AddEventListenerOptions
) {
  const savedHandler = useRef<EventHandler<WindowEventMap[K]>>()

  useEffect(() => {
    savedHandler.current = handler
  }, [handler])

  useEffect(() => {
    if (!element || !element.addEventListener) {
      return
    }

    const eventListener: EventHandler<WindowEventMap[K]> = (event) => {
      if (savedHandler.current) {
        savedHandler.current(event)
      }
    }

    element.addEventListener(eventName, eventListener as EventListener, options)

    return () => {
      element.removeEventListener(eventName, eventListener as EventListener, options)
    }
  }, [eventName, element, options])
}

export function useDocumentEvent<K extends keyof DocumentEventMap>(
  eventName: K,
  handler: EventHandler<DocumentEventMap[K]>,
  options?: boolean | AddEventListenerOptions
) {
  useEventListener(eventName as any, handler as any, document, options)
}