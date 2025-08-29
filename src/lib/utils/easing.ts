/**
 * Shared easing functions for animations
 */

export function smoothStep(t: number): number {
  return t * t * (3 - 2 * t)
}

export function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

