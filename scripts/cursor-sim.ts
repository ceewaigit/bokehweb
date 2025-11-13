import { calculateCursorState } from '../src/lib/effects/utils/cursor-calculator';
import { getSourceTimeForFrame } from '../src/remotion/compositions/utils/source-time';
import type { Clip, CursorEffectData, MouseEvent, ClickEvent } from '../src/types/project';

const fps = 30;
const clip: Clip = {
  id: 'clip',
  recordingId: 'rec',
  startTime: 0,
  duration: 10000,
  sourceIn: 0,
  sourceOut: 10000,
  playbackRate: 1,
};

const cursorData: CursorEffectData = {
  style: 'default' as any,
  size: 1,
  color: '#fff',
  clickEffects: false,
  motionBlur: false,
  hideOnIdle: false,
  idleTimeout: 0,
  gliding: true,
  speed: 0.5,
  smoothness: 0.5,
};

const mouseEvents: MouseEvent[] = [];
for (let i = 0; i <= 1000; i += 100) {
  mouseEvents.push({
    timestamp: i,
    x: i,
    y: i,
    screenWidth: 1920,
    screenHeight: 1080,
  } as MouseEvent);
}

function simulateChunk(startFrame: number, chunkFrames: number) {
  let prevState;
  const positions: number[] = [];
  for (let localFrame = 0; localFrame < chunkFrames; localFrame++) {
    const frame = localFrame;
    const frameOffset = startFrame;
    const absoluteFrame = frameOffset > 0 && frame < frameOffset ? frame + frameOffset : frame;
    const sourceTime = getSourceTimeForFrame(absoluteFrame, fps, clip);
    const state = calculateCursorState(cursorData, mouseEvents, [] as ClickEvent[], sourceTime, prevState, fps);
    prevState = state;
    positions.push(state.x);
  }
  return positions;
}

const chunk1 = simulateChunk(0, 150);
const chunk2 = simulateChunk(150, 150);

console.log('chunk1 last', chunk1[chunk1.length - 1]);
console.log('chunk2 first 5', chunk2.slice(0, 5));
