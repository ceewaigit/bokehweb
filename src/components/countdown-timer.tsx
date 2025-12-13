'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface CountdownTimerProps {
  seconds: number
  onComplete: () => void
  onCancel?: () => void
  isVisible: boolean
}

export function CountdownTimer({
  seconds,
  onComplete,
  onCancel,
  isVisible
}: CountdownTimerProps) {
  const [count, setCount] = useState(seconds)
  const [animationKey, setAnimationKey] = useState(0)

  useEffect(() => {
    if (!isVisible) {
      setCount(seconds)
      return
    }

    if (count === 0) {
      onComplete()
      return
    }

    const timer = setTimeout(() => {
      setCount(count - 1)
      setAnimationKey(prev => prev + 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [count, seconds, onComplete, isVisible])

  useEffect(() => {
    if (isVisible) {
      setCount(seconds)
      setAnimationKey(0)
    }
  }, [isVisible, seconds])

  if (!isVisible) return null

  // Calculate progress for the ring (0 to 1, where 1 is complete)
  const progress = (seconds - count) / seconds
  const circumference = 2 * Math.PI * 120
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />

      <div className="relative flex flex-col items-center justify-center">
        {/* Outer glow ring */}
        <div
          className="absolute w-80 h-80 rounded-full opacity-70 animate-pulse"
          style={{
            background: 'conic-gradient(from 0deg, rgba(168, 85, 247, 0.4), rgba(139, 92, 246, 0.6), rgba(168, 85, 247, 0.4), rgba(99, 102, 241, 0.3), rgba(168, 85, 247, 0.4))',
            filter: 'blur(40px)',
            animation: 'glowPulse 2s ease-in-out infinite, slowRotate 8s linear infinite'
          }}
        />

        {/* Glass circle background */}
        <div
          className="absolute w-60 h-60 rounded-full backdrop-blur-xl"
          style={{
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 0 80px rgba(139, 92, 246, 0.2), inset 0 0 60px rgba(255, 255, 255, 0.02)'
          }}
        />

        {/* Progress ring SVG */}
        <svg className="absolute w-[260px] h-[260px]" viewBox="0 0 260 260">
          <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>

          {/* Background ring */}
          <circle
            cx="130"
            cy="130"
            r="120"
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="3"
          />

          {/* Progress ring */}
          <circle
            cx="130"
            cy="130"
            r="120"
            fill="none"
            stroke="url(#progressGradient)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-linear origin-center -rotate-90"
            style={{
              filter: 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.5))',
              transformBox: 'fill-box'
            }}
          />
        </svg>

        {/* The number */}
        <div
          key={animationKey}
          className={cn(
            "relative text-[160px] font-extralight tracking-[-8px]",
            "animate-in fade-in zoom-in-50 duration-500"
          )}
          style={{
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0.8) 50%, rgba(200, 180, 255, 0.9) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 4px 20px rgba(139, 92, 246, 0.3))'
          }}
        >
          {count === 0 ? '●' : count}
        </div>

        {/* Decorative dots */}
        {[
          { pos: 'top-[-40px] left-1/2 -translate-x-1/2', delay: '0s' },
          { pos: 'bottom-[-40px] left-1/2 -translate-x-1/2', delay: '0.5s' },
          { pos: 'left-[-40px] top-1/2 -translate-y-1/2', delay: '0.25s' },
          { pos: 'right-[-40px] top-1/2 -translate-y-1/2', delay: '0.75s' }
        ].map((dot, i) => (
          <div
            key={i}
            className={`absolute ${dot.pos} w-1 h-1 rounded-full bg-purple-500/60`}
            style={{
              animation: `dotPulse 1.5s ease-in-out infinite`,
              animationDelay: dot.delay
            }}
          />
        ))}

        {/* Label */}
        <div
          className="absolute bottom-[-80px] text-sm font-medium tracking-[3px] uppercase text-white/50 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200"
        >
          Recording starts
        </div>

        {/* Cancel button */}
        {onCancel && count > 0 && (
          <button
            onClick={onCancel}
            className={cn(
              "absolute bottom-[-140px] px-6 py-2.5",
              "text-sm font-medium tracking-wide text-white/70 hover:text-white",
              "bg-white/[0.08] hover:bg-white/[0.12]",
              "border border-white/10 hover:border-white/20",
              "rounded-full backdrop-blur-md",
              "transition-all duration-200 ease-out",
              "animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300"
            )}
          >
            Cancel
          </button>
        )}
      </div>

      {/* Inject keyframe animations */}
      <style jsx global>{`
        @keyframes glowPulse {
          0%, 100% { 
            opacity: 0.6;
            transform: scale(1);
          }
          50% { 
            opacity: 0.9;
            transform: scale(1.05);
          }
        }
        
        @keyframes slowRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes dotPulse {
          0%, 100% { 
            opacity: 0.3;
            transform: translate(-50%, 0) scale(1);
          }
          50% { 
            opacity: 0.8;
            transform: translate(-50%, 0) scale(1.5);
          }
        }
      `}</style>
    </div>
  )
}