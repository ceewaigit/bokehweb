# Screen Studio Pro - Foundation-First Development

A professional screen recording and editing application built with pragmatic engineering principles.

## Core Principle

**Simple and working beats complex and broken.** Build a solid foundation before adding advanced features.

## Tech Stack

- **Frontend**: Next.js 14 + React + TypeScript
- **Desktop**: Electron for native capabilities  
- **UI**: shadcn/ui + Tailwind CSS
- **State**: Zustand for lightweight state management
- **Video**: FFmpeg.wasm + Canvas API
- **Testing**: Jest + React Testing Library with real browser API testing

## Design Principles

### User Experience
- **Information Dense**: Maximum relevant data, minimal clutter
- **Keyboard-First**: Shortcuts for every action (Space = play/pause, I/O = in/out points, etc.)
- **Contemporary**: Modern, minimal, functional design language
- **Professional**: Interface that looks and feels like industry-standard tools

### Performance
- **60fps Timeline**: Smooth scrubbing and playback at all times
- **Hardware Acceleration**: GPU-accelerated rendering where possible
- **Responsive**: No blocking operations on main thread
- **Memory Efficient**: Clean resource management and garbage collection

## Architecture Guidelines

### Foundation-First Development
1. **Core recording must work reliably** before adding effects
2. **Basic timeline editing** before advanced animations
3. **Simple export pipeline** before format optimization
4. **Clean error handling** before complex state management

### Code Organization Principles
- **Single responsibility**: Each module handles one concern
- **Explicit cleanup**: All resources (streams, canvas, timers) must have cleanup
- **Error boundaries**: Graceful failures with user-friendly messages
- **Event-driven**: Use events for loose coupling between components

## Senior Engineering Guidelines

### Core Architecture Decisions

#### Recording Engine
- **Single MediaRecorder path**: Avoid dual-recording complexity
- **Post-processing effects**: Record clean video, apply effects during export
- **Resource management**: Explicit cleanup patterns for all media resources
- **Error recovery**: Simple try-catch with fallback constraints

#### State Management
- **Recording engine owns state**: UI components subscribe to events
- **Minimal state**: Only track what's necessary for UI updates
- **Event-driven updates**: Use CustomEvents for loose coupling
- **No complex state machines**: Simple status transitions (idle → recording → processing)

#### Data Storage
- **Original video + JSON metadata**: Keep video untouched, store effects separately
- **Timestamp-based animations**: Store cursor/click data with millisecond timestamps
- **Simple project format**: ZIP with video file + project.json
- **Frame-accurate timing**: Snap to frame boundaries for precision

### Testing Strategy

#### Browser API Testing
```typescript
// Mock MediaRecorder with real behavior
class MockMediaRecorder {
  state: RecordingState = 'inactive';
  
  start(timeslice?: number) {
    this.state = 'recording';
    // Simulate real data chunks
    setInterval(() => {
      this.ondataavailable?.({ 
        data: new Blob(['mock'], { type: 'video/webm' }) 
      });
    }, timeslice || 1000);
  }
}
```

#### Coverage Strategy
- **Target 20% coverage** initially on core recording functionality
- **Test real browser APIs** with minimal mocking
- **Integration tests** for full record → edit → export workflow
- **Error condition testing** for permission failures and stream issues

### Performance Guidelines

#### Canvas Rendering
- **RequestAnimationFrame with time budget**: Skip frames if behind schedule
- **Quality degradation**: Reduce effects quality if performance drops
- **Memory monitoring**: Track canvas memory usage and cleanup
- **Throttled events**: Limit mousemove events to 60fps max

#### Resource Management
```typescript
class ResourceManager {
  private cleanups = new Set<() => void>();
  
  register(cleanup: () => void) {
    this.cleanups.add(cleanup);
    return () => this.cleanups.delete(cleanup);
  }
  
  dispose() {
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups.clear();
  }
}
```

## Anti-Patterns to Avoid

### Complexity Before Foundation
- ❌ Web Workers before canvas rendering works
- ❌ Plugin architecture before core features are stable  
- ❌ State machines before basic recording works
- ❌ Advanced effects before simple timeline editing
- ❌ Performance optimization before performance problems exist

### Over-Engineering
- ❌ Abstract factories for simple object creation
- ❌ Complex dependency injection before architecture is proven
- ❌ Microservices patterns in a desktop application
- ❌ Generic solutions before specific use cases are understood

### Poor Resource Management
- ❌ Canvas elements without explicit cleanup
- ❌ Event listeners without removal
- ❌ Media streams without track stopping
- ❌ Timers without clearing

## Code Organization

### File Structure Limits
- **Maximum 300 lines per file**: Split larger files by responsibility
- **Maximum 5 dependencies per module**: Reduce coupling
- **Clear naming**: File names should describe exact purpose
- **Single export per file**: Avoid barrel exports for core modules

### Module Boundaries
```
src/lib/
├── recording/
│   ├── media-recorder.ts      # MediaRecorder API wrapper
│   ├── animation-capture.ts   # Mouse/click tracking  
│   └── recording-engine.ts    # Orchestrates recording
├── timeline/
│   ├── player.ts             # Video playback
│   ├── editor.ts             # Clip manipulation
│   └── timeline-store.ts     # Timeline state
├── effects/
│   ├── cursor-renderer.ts    # Cursor overlay
│   ├── click-effects.ts      # Click animations
│   └── effect-processor.ts   # Apply effects to video
└── export/
    ├── canvas-exporter.ts    # Real-time rendering
    └── video-exporter.ts     # Final output generation
```

## Success Criteria

### Core Recording (Must Work Perfectly)
- [ ] Start/stop recording without crashes
- [ ] Clean resource cleanup on all code paths
- [ ] User-friendly error messages for permission failures
- [ ] Stable memory usage during 10+ minute recordings
- [ ] Audio/video sync maintained throughout recording

### Basic Timeline (Foundation for Editing)
- [ ] Load recorded video into timeline player
- [ ] Seek to any position without lag
- [ ] Display cursor/click animation data
- [ ] Cut clips at frame boundaries
- [ ] Save/load projects with video + animation data

### Simple Export (Quality Output)
- [ ] Export video with cursor overlay
- [ ] Maintain original video quality
- [ ] Handle 1080p+ resolutions without performance issues
- [ ] Progress indication during export
- [ ] Cancel export operation cleanly

## Development Commands

```bash
# Development
npm run dev              # Next.js development server
npm run electron-dev     # Electron with hot reload

# Testing
npm test                 # Run all tests with coverage
npm test -- --watch     # Watch mode for development
npm test -- --coverage  # Generate coverage report

# Quality Checks
npm run type-check      # TypeScript compiler
npm run lint           # ESLint
npm run test:quality   # Coverage + quality gates

# Building
npm run build          # Production Next.js build
npm run build-electron # Full Electron application
```

## Error Handling Patterns

### MediaRecorder Errors
```typescript
async startRecording() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia();
    this.recorder = new MediaRecorder(stream);
    this.recorder.start();
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      throw new Error('Screen recording permission denied. Please allow screen sharing.');
    }
    throw new Error(`Recording failed: ${error.message}`);
  }
}
```

### Resource Cleanup
```typescript
class ScreenRecorder {
  private resources = new ResourceManager();
  
  async start() {
    const stream = await this.getDisplayMedia();
    
    // Always register cleanup
    this.resources.register(() => {
      stream.getTracks().forEach(track => track.stop());
    });
    
    // Auto-cleanup on page unload
    window.addEventListener('beforeunload', () => this.cleanup());
  }
  
  cleanup() {
    this.resources.dispose();
  }
}
```

## Current Priority

Build the most reliable screen recorder possible. Every feature must work consistently before moving to the next. Focus on user experience over technical complexity.