"use client"

import { useEffect, useState } from 'react'
import { useAnimationStore } from '@/stores/animation-store'
import { motion, AnimatePresence } from 'framer-motion'

interface CursorEffect {
  id: string
  x: number
  y: number
  type: 'highlight' | 'click'
  timestamp: number
}

export function AnimationOverlay() {
  const [cursorEffects, setCursorEffects] = useState<CursorEffect[]>([])
  const { addCursorHighlight, addClickRipple } = useAnimationStore()

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Add cursor trail effect
      const effect: CursorEffect = {
        id: `cursor-${crypto.randomUUID()}`,
        x: e.clientX,
        y: e.clientY,
        type: 'highlight',
        timestamp: Date.now()
      }

      setCursorEffects(prev => [...prev.slice(-5), effect]) // Keep last 5 effects
    }

    const handleClick = (e: MouseEvent) => {
      // Add click ripple effect
      const effect: CursorEffect = {
        id: `click-${crypto.randomUUID()}`,
        x: e.clientX,
        y: e.clientY,
        type: 'click',
        timestamp: Date.now()
      }

      setCursorEffects(prev => [...prev, effect])
      addClickRipple('.animation-overlay', 600)

      // Remove click effect after animation
      setTimeout(() => {
        setCursorEffects(prev => prev.filter(eff => eff.id !== effect.id))
      }, 1000)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('click', handleClick)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('click', handleClick)
    }
  }, [addClickRipple])

  // Clean up old cursor effects
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setCursorEffects(prev =>
        prev.filter(effect => now - effect.timestamp < 2000)
      )
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      <AnimatePresence>
        {cursorEffects.map((effect) => (
          <motion.div
            key={effect.id}
            className={`absolute rounded-full ${effect.type === 'highlight'
              ? 'bg-primary/20 border-2 border-primary/40'
              : 'bg-primary/30 border border-primary/60'
              }`}
            style={{
              left: effect.x - (effect.type === 'highlight' ? 15 : 10),
              top: effect.y - (effect.type === 'highlight' ? 15 : 10),
              width: effect.type === 'highlight' ? 30 : 20,
              height: effect.type === 'highlight' ? 30 : 20,
            }}
            initial={{
              scale: 0,
              opacity: 0.8
            }}
            animate={{
              scale: effect.type === 'highlight' ? [0.8, 1.2, 1] : [0, 1.5, 0],
              opacity: effect.type === 'highlight' ? [0.8, 0.4, 0] : [0.8, 0.4, 0]
            }}
            exit={{
              scale: 0,
              opacity: 0
            }}
            transition={{
              duration: effect.type === 'highlight' ? 0.6 : 0.8,
              ease: "easeOut"
            }}
          />
        ))}
      </AnimatePresence>

      {/* Smooth Zoom Indicator */}
      <motion.div
        className="cursor-highlight absolute w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30"
        initial={{ scale: 0, opacity: 0 }}
        style={{ pointerEvents: 'none' }}
      />

      {/* Click Ripple */}
      <motion.div
        className="click-ripple absolute rounded-full bg-primary/20"
        initial={{ scale: 0, opacity: 0 }}
        style={{ pointerEvents: 'none' }}
      />
    </div>
  )
}