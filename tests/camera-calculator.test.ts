import { computeCameraState, type CameraPhysicsState } from '@/lib/effects/utils/camera-calculator'
import { EffectType } from '@/types/effects'

function makePhysics(): CameraPhysicsState {
  return { x: 0.5, y: 0.5, vx: 0, vy: 0, lastTimeMs: 0, lastSourceTimeMs: 0 }
}

describe('camera-calculator spring simulation', () => {
  test('pans smoothly across frames', () => {
    const effects: any[] = [
      {
        id: 'z1',
        type: EffectType.Zoom,
        enabled: true,
        startTime: 0,
        endTime: 2000,
        data: { scale: 2, introMs: 500, outroMs: 500, followStrategy: 'mouse' },
      },
    ]

    const mouseEvents: any[] = []
    const w = 1000
    const h = 1000
    for (let t = 0; t <= 2000; t += 50) {
      const x = 100 + (800 * t) / 2000
      const y = 500
      mouseEvents.push({ timestamp: t, x, y, captureWidth: w, captureHeight: h })
    }

    const recording: any = {
      id: 'r1',
      width: w,
      height: h,
      metadata: { mouseEvents },
    }

    const centers: { x: number; y: number }[] = []
    const physics = makePhysics()
    for (let t = 0; t <= 2000; t += 33) {
      const out = computeCameraState({
        effects: effects as any,
        timelineMs: t,
        sourceTimeMs: t,
        recording,
        physics,
        deterministic: false,
      })
      physics.x = out.physics.x
      physics.y = out.physics.y
      physics.vx = out.physics.vx
      physics.vy = out.physics.vy
      physics.lastTimeMs = out.physics.lastTimeMs
      physics.lastSourceTimeMs = out.physics.lastSourceTimeMs
      centers.push(out.zoomCenter)
    }

    let maxStep = 0
    for (let i = 1; i < centers.length; i++) {
      const dx = centers[i].x - centers[i - 1].x
      const dy = centers[i].y - centers[i - 1].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      maxStep = Math.max(maxStep, dist)
    }

    // A "teleport" is typically a large single-frame jump; keep it bounded.
    expect(maxStep).toBeLessThan(0.15)
  })
})
