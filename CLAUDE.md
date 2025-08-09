# Screen Studio Clone - Full Feature Implementation

Build a complete 1:1 Screen Studio clone with all professional features.
IMPORTANT: YOUR CODE SHOULD BE STREAMLINED BUT NOT OVERLY COMPLEX. AIM FOR A BALANCED APPROACH THAT PRIORITIZES FUNCTIONALITY AND USER EXPERIENCE. REMEMBER, THIS IS A PROFESSIONAL TOOL, SO IT SHOULD BE POLISHED AND EFFICIENT AND PRODUCTION READY. HOWEVER, DO NOT OVER-ENGINEER; KEEP IT SIMPLE AND EFFECTIVE.

## 🚨 PRODUCTION REQUIREMENTS
**ALL code must work in PRODUCTION (packaged .dmg/.exe):**
- NO external servers or localhost dependencies
- Electron must serve the Next.js app internally via webpack
- All assets must be bundled with the app
- Test with `npm run make` to create distributable
- NEVER assume dev server is running

## ⚡ CRITICAL WEBPACK CONFIG
- renderer.tsx routes components via URL hash (#/record-button)
- Preload uses MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY variable
- Record button component lives in src/app/record-button/page.tsx
- Dev: DEV_SERVER_URL env var overrides localhost:3000
- Prod: webpack bundles everything, no Next.js server needed

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
npm test                 # Run all tests automatically
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:e2e        # Run end-to-end tests only
npm run test:autoclick   # Quick test for auto-click feature
```

## Test Structure
```
tests/
├── unit/               # Fast isolated tests (constraints, effects, export)
├── integration/        # Component integration tests
├── e2e/               # Full app end-to-end tests
└── run-all.js         # Master test runner
```

## IMPORTANT: Testing Requirements
**ALWAYS run tests after making changes to recording functionality:**
1. Run `npm test` to execute full test suite automatically
2. Tests verify getUserMedia constraints, effects, export, and recording flow
3. E2E tests now AUTO-CLICK the record button (no manual intervention needed!)
4. Tests run in order: unit → integration → e2e
5. All tests must pass before committing changes

**Auto-Click Feature:**
- E2E tests set `TEST_AUTO_RECORD=true` environment variable
- Electron app detects this and auto-clicks "Start Recording" after 3 seconds
- No manual clicking required during tests!

## Current Status
- Basic recording: ✅ FIXED - Electron desktop capture with correct constraints
- Video preview: ✅ Shows recordings with live effects
- Cursor overlay: ✅ macOS-style cursor with motion blur
- Zoom effects: ✅ Smooth with context-aware easing (smoothStep, easeOutExpo, etc)
- Export with effects: ✅ Optimized with frame caching (30-50% faster)
- Background system: ✅ Gradients, blur, padding, shadows implemented
- Audio recording: ✅ System + microphone support added
- Countdown timer: ✅ FIXED - Shows transparent countdown correctly
- Record button dock: ✅ FIXED - Full 700x100 size, draggable, transparent
- Timeline: ⚠️ Basic only - NO editing features yet

## Critical Fixes Applied (Latest Session)
1. **Recording Crash Fixed** - electron-recorder.ts now uses mandatory constraints in fallback (line 162-165)
2. **Dock Window Fixed** - 700x100 size shows all controls
3. **Countdown Transparency Fixed** - Window recreated each time for proper transparency
4. **Window Dragging Fixed** - WebkitAppRegion properly applied
5. **Hardcoded localhost Removed** - Uses getAppURL() helper

## Critical Issues for Next Agent
- Timeline editing completely missing - can't cut/trim/split
- No webcam overlay - critical Screen Studio feature
- No keyboard shortcut overlay - doesn't show keypresses
- Export only WebM - needs MP4/MOV/GIF support via FFmpeg
- No manual zoom controls UI - only automatic zoom works
- Window/app selection missing - only captures entire screen
- Performance still 7/10 - needs GPU acceleration for true 60fps
- **NOTE**: Screen recording permission must be granted in System Preferences

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

## 🎯 QUICK REMINDERS
- Zoom: smoothStep/easeOutExpo for native feel
- Cursor: macOS style with motion blur implemented
- Export: frame caching = 30-50% faster
- Background: renderer ready, needs UI controls
- Audio: works, needs system capture permissions
- Timeline: basic only, NO editing yet
- Webcam: NOT implemented
- Export: WebM only, needs FFmpeg for MP4

**Next Priority**: Timeline editing (cut/trim/split) + Webcam overlay + MP4 export