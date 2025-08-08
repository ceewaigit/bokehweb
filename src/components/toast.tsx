"use client"

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { Button } from './ui/button'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

interface ToastProps extends Toast {
  onClose: (id: string) => void
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info
}

const styles = {
  success: 'border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400',
  error: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400',
  warning: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  info: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400'
}

function ToastComponent({ id, type, title, description, duration = 5000, action, onClose }: ToastProps) {
  const Icon = icons[type]

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id)
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [id, duration, onClose])

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.9 }}
      className={`border rounded-lg p-4 shadow-lg backdrop-blur-sm max-w-sm ${styles[type]}`}
    >
      <div className="flex items-start space-x-3">
        <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
        
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm">{title}</h4>
          {description && (
            <p className="text-xs mt-1 opacity-90">{description}</p>
          )}
          
          {action && (
            <Button
              variant="ghost"
              size="sm"
              onClick={action.onClick}
              className="mt-2 h-6 px-2 text-xs"
            >
              {action.label}
            </Button>
          )}
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onClose(id)}
          className="h-6 w-6 p-0 opacity-70 hover:opacity-100"
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </motion.div>
  )
}

// Toast manager
class ToastManager {
  private toasts: Toast[] = []
  private listeners: ((toasts: Toast[]) => void)[] = []

  subscribe(listener: (toasts: Toast[]) => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private notify() {
    this.listeners.forEach(listener => listener([...this.toasts]))
  }

  show(toast: Omit<Toast, 'id'>) {
    const newToast: Toast = {
      id: crypto.randomUUID(),
      ...toast
    }
    
    this.toasts.push(newToast)
    this.notify()
    
    return newToast.id
  }

  remove(id: string) {
    this.toasts = this.toasts.filter(toast => toast.id !== id)
    this.notify()
  }

  clear() {
    this.toasts = []
    this.notify()
  }

  success(title: string, description?: string, options?: Partial<Toast>) {
    return this.show({ type: 'success', title, description, ...options })
  }

  error(title: string, description?: string, options?: Partial<Toast>) {
    return this.show({ type: 'error', title, description, duration: 0, ...options })
  }

  warning(title: string, description?: string, options?: Partial<Toast>) {
    return this.show({ type: 'warning', title, description, ...options })
  }

  info(title: string, description?: string, options?: Partial<Toast>) {
    return this.show({ type: 'info', title, description, ...options })
  }
}

export const toast = new ToastManager()

// Toast container component
export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    return toast.subscribe(setToasts)
  }, [])

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2">
      <AnimatePresence>
        {toasts.map((toastItem) => (
          <ToastComponent
            key={toastItem.id}
            {...toastItem}
            onClose={toast.remove.bind(toast)}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}