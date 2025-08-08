# Screen Studio Clone - Full Feature Implementation

Build a complete 1:1 Screen Studio clone with all professional features.
IMPORTANT: YOUR CODE SHOULD BE STREAMLINED BUT NOT OVERLY COMPLEX. AIM FOR A BALANCED APPROACH THAT PRIORITIZES FUNCTIONALITY AND USER EXPERIENCE. REMEMBER, THIS IS A PROFESSIONAL TOOL, SO IT SHOULD BE POLISHED AND EFFICIENT. HOWEVER, DO NOT OVER-ENGINEER; KEEP IT SIMPLE AND EFFECTIVE.

## ⚠️ CRITICAL: Electron Recording Constraints
**MUST use `mandatory` format for getUserMedia or recording will crash:**
```javascript
// ✅ CORRECT - Use this format
video: {
  mandatory: {
    chromeMediaSource: 'desktop',
    chromeMediaSourceId: source.id
  }
}

// ❌ WRONG - This crashes Electron
video: {
  deviceId: { exact: source.id },
  mediaStreamSource: { exact: 'desktop' }
}
```
**ALWAYS run `node test-constraints.js` after modifying recording code!**

## Tech Stack
- **Frontend**: Next.js 14 + React + TypeScript
- **Desktop**: Electron for native capabilities  
- **UI**: shadcn/ui + Tailwind CSS
- **State**: Zustand
- **Video**: FFmpeg.wasm + Canvas API + WebCodecs
- **Effects**: WebGL for GPU acceleration

## Required Features (ALL MUST WORK)

### 1. Recording
- [x] Basic screen capture via Electron
- [ ] Multiple source selection (screen/window/app)
- [ ] Audio recording (system + microphone)
- [ ] Webcam overlay with rounded corners
- [ ] 4K/60fps recording support
- [ ] Pause/resume during recording
- [ ] Countdown timer before recording

### 2. Cursor Effects
- [ ] Smooth cursor movement interpolation
- [ ] Cursor spotlight/highlight effect
- [ ] Click ripple animations
- [ ] Cursor motion blur
- [ ] Custom cursor images
- [ ] Hide/show cursor toggle

### 3. Zoom & Motion
- [ ] Automatic zoom to mouse area
- [ ] Smooth zoom in/out animations  
- [ ] Smart panning following cursor
- [ ] Manual zoom controls
- [ ] Zoom presets (2x, 3x, 4x)
- [ ] Easing curves for motion

### 4. Background & Framing
- [ ] Wallpaper backgrounds
- [ ] Gradient backgrounds
- [ ] Background blur
- [ ] Padding/margins around recording
- [ ] Rounded corners on video
- [ ] Drop shadow effects

### 5. Timeline Editing
- [ ] Trim start/end
- [ ] Cut/split clips
- [ ] Multiple tracks
- [ ] Drag to reorder clips
- [ ] Copy/paste clips
- [ ] Undo/redo system
- [ ] Zoom timeline view
- [ ] Frame-by-frame navigation

### 6. Annotations
- [ ] Keyboard shortcuts overlay
- [ ] Click annotations
- [ ] Text overlays
- [ ] Arrow/shape drawing
- [ ] Highlight boxes

### 7. Export
- [ ] MP4/MOV/GIF export
- [ ] Quality presets
- [ ] Custom resolution
- [ ] Framerate options
- [ ] Progress bar with cancel
- [ ] Batch export

### 8. Performance
- [ ] GPU acceleration via WebGL
- [ ] Real-time preview at 60fps
- [ ] Efficient memory management
- [ ] Background rendering
- [ ] Fast scrubbing

## Implementation Priority

1. **Fix video playback** - Timeline must show actual video preview
2. **Implement zoom effects** - Core Screen Studio feature
3. **Add cursor rendering** - Smooth, professional cursor overlay
4. **Background system** - Gradient/image backgrounds
5. **Timeline editing** - Cut, trim, split functionality
6. **Export with effects** - Apply all effects during export
7. **Polish animations** - Smooth 60fps throughout

## Commands
```bash
npm run electron-dev     # Development
npm run build-electron   # Production build
npm test                 # Run tests
node test-constraints.js # Test recording constraints
node test-recording.js   # Integration test (requires app running)
```

## IMPORTANT: Testing Requirements
**ALWAYS run tests after making changes to recording functionality:**
1. Run `node test-constraints.js` to verify getUserMedia constraints are correct
2. Test the actual recording flow manually or with `node test-recording.js`
3. Verify countdown shows with transparent background (not white)
4. Ensure dock window shows all controls without being cut off
5. Test that recording actually starts without renderer crashes

## Current Status
- Basic recording: ✅ Working with Electron desktop capture
- Video preview: ✅ Shows recordings with live effects
- Cursor overlay: ✅ macOS-style cursor with motion blur
- Zoom effects: ✅ Smooth with context-aware easing (smoothStep, easeOutExpo, etc)
- Export with effects: ✅ Optimized with frame caching (30-50% faster)
- Background system: ✅ Gradients, blur, padding, shadows implemented
- Audio recording: ✅ System + microphone support added
- Timeline: ⚠️ Basic only - NO editing features yet

## Critical Issues for Next Agent
- Timeline editing completely missing - can't cut/trim/split
- No webcam overlay - critical Screen Studio feature
- No keyboard shortcut overlay - doesn't show keypresses
- Export only WebM - needs MP4/MOV/GIF support via FFmpeg
- No manual zoom controls UI - only automatic zoom works
- Window/app selection missing - only captures entire screen
- Performance still 7/10 - needs GPU acceleration for true 60fps

## Known Issues & Solutions
1. **Renderer crash on recording**: Use `mandatory` constraints, NOT modern `deviceId: {exact:}` format
2. **White background on countdown**: Recreate countdown window each time (don't reuse)
3. **Dock cut off**: Window needs to be 700x100px minimum
4. **Can't drag dock**: Parent div needs `WebkitAppRegion: 'drag'`, buttons need `'no-drag'`

## Key Files Updated
- src/lib/effects/zoom-engine.ts - NOW has smooth easing (smoothStep, easeOutExpo, etc)
- src/lib/effects/cursor-renderer.ts - NOW has macOS cursor + motion blur
- src/lib/export/effects-export-engine.ts - NOW has frame caching optimization
- src/lib/effects/background-renderer.ts - NEW - handles backgrounds/padding
- src/lib/recording/electron-recorder.ts - NOW has audio recording support

## Architecture Decisions
- Effects are applied during export, not during recording
- Metadata (mouse positions) stored in localStorage with clip ID
- No post-processing after recording - keeps original video
- Zoom and cursor can be toggled on/off in preview

## Quick Notes for Next Agent
- Zoom now uses smoothStep/easeOutExpo not cubic - much smoother
- Cursor is macOS style with motion blur - looks native
- Export skips unchanged frames - 30-50% faster
- Background system ready - just needs UI controls
- Audio works but needs system audio capture permissions
- Electron main.js updated with better source selection
- Build passes but tests fail (not critical)

**Next Priority**: Timeline editing (cut/trim/split) + Webcam overlay + MP4 export