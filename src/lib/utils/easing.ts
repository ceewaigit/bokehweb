/**
 * Shared easing functions for animations
 */

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function easeInQuad(t: number): number {
  return t * t
}

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

export function linear(t: number): number {
  return t
}

export function easeInCubic(t: number): number {
  return t * t * t
}

export function smoothStep(t: number): number {
  return t * t * (3 - 2 * t)
}

export function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

/**
 * Exponential decay for smooth camera catching up
 * Used for natural camera lag when following mouse
 */
export function exponentialDecay(current: number, target: number, decay: number, deltaTime: number): number {
  return target + (current - target) * Math.exp(-decay * deltaTime)
}

/**
 * Predictive easing based on velocity
 * Anticipates future position based on current velocity
 */
export function predictiveEase(
  position: number,
  velocity: number,
  influence: number,
  maxLookahead: number = 0.1
): number {
  const lookahead = Math.max(-maxLookahead, Math.min(maxLookahead, velocity * influence))
  return position + lookahead
}

/**
 * Spring-based easing for viewport constraints
 * Creates natural bounce-back at edges
 */
export function springEase(
  current: number,
  target: number,
  stiffness: number = 0.15,
  damping: number = 0.9
): { position: number; velocity: number } {
  const displacement = target - current
  const springForce = displacement * stiffness
  const velocity = springForce * damping
  
  return {
    position: current + velocity,
    velocity
  }
}

/**
 * Directional bias easing
 * Strengthens movement along primary axis
 */
export function directionalBias(
  x: number,
  y: number,
  angle: number,
  strength: number = 0.8
): { x: number; y: number } {
  const radians = angle * (Math.PI / 180)
  const primaryAxis = Math.abs(Math.cos(radians)) > Math.abs(Math.sin(radians)) ? 'x' : 'y'
  
  if (primaryAxis === 'x') {
    return {
      x: x,
      y: y * (1 - strength)
    }
  } else {
    return {
      x: x * (1 - strength),
      y: y
    }
  }
}