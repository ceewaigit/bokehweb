# Screen Studio Pro - Library Architecture

This directory contains the core library modules organized for maintainability and extensibility.

## Module Structure

### 📁 `/core` - Core System Functionality
Essential system management and error handling.

- **`resource-manager.ts`** - Resource lifecycle management and cleanup
- **`error-recovery.ts`** - Error boundaries and recovery mechanisms

### 📁 `/recording` - Recording System
Screen recording, media management, and recording utilities.

- **`screen-recorder.ts`** - Main screen recording engine with effects support
- **`recording-debug.ts`** - Recording debugging and development utilities

### 📁 `/effects` - Effects and Visual Processing
Video effects, motion tracking, and visual enhancements.

- **`effects-processor.ts`** - Video frame processing with smooth animations
- **`motion-tracker.ts`** - Intelligent auto-zoom and motion detection

### 📁 `/export` - Export System
Video export, encoding, and output management.

- **`export-engine.ts`** - Video export pipeline and format conversion

### 📁 `/performance` - Performance Monitoring
Performance tracking, memory management, and optimization.

- **`performance-manager.ts`** - Frame rate monitoring and memory tracking

### 📁 `/utils` - Utilities
General utility functions, helpers, and common tools.

- **`event-throttle.ts`** - Event throttling and async storage helpers
- **`utils.ts`** - General purpose utility functions

### 📁 `/security` - Security and Validation
Data validation, memory management, and security utilities.

- **`blob-url-manager.ts`** - Secure blob URL management (prevents memory leaks)
- **`data-validation.ts`** - Input validation and XSS prevention

## Usage

### Clean Imports
```typescript
// Import from specific modules
import { ScreenRecorder } from '@/lib/recording'
import { EffectsProcessor } from '@/lib/effects'
import { BlobURLManager } from '@/lib/security'

// Or import from the main index for convenience
import { ScreenRecorder, EffectsProcessor, BlobURLManager } from '@/lib'
```

### Module Boundaries
Each module has a clear responsibility:
- **No cross-dependencies** between peer modules
- **Shared utilities** go in `/utils`
- **Core functionality** shared by all modules goes in `/core`

## Design Principles

### Foundation-First
- Core system functionality is stable before advanced features
- Simple, working implementations over complex abstractions
- Performance and security are built-in, not added later

### Modular Architecture
- **Single Responsibility**: Each module handles one domain
- **Explicit Dependencies**: Clear import paths and boundaries
- **Clean Exports**: Well-documented public APIs

### Maintainability
- **Searchable**: Easy to find relevant code
- **Testable**: Each module can be tested in isolation
- **Extensible**: New features fit logically into existing modules

## Adding New Modules

1. Create directory: `/src/lib/new-module/`
2. Add implementation files
3. Create `/src/lib/new-module/index.ts` with exports
4. Update `/src/lib/index.ts` to re-export the module
5. Update this README

## Security Notes

- All user input is validated in `/security`
- Resource cleanup is managed by `/core`
- Performance monitoring prevents resource exhaustion
- No sensitive data is logged or stored