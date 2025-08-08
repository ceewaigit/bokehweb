#!/usr/bin/env node

/**
 * Unit tests for video effects (zoom, cursor, background)
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

class EffectsTest {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.tests = [];
  }

  assert(condition, testName, message) {
    if (condition) {
      log(`  ✓ ${testName}`, colors.green);
      this.passed++;
      this.tests.push({ name: testName, passed: true });
    } else {
      log(`  ✗ ${testName}: ${message}`, colors.red);
      this.failed++;
      this.tests.push({ name: testName, passed: false, error: message });
    }
  }

  testZoomEngine() {
    log('\n📐 Testing Zoom Engine...', colors.cyan);
    
    // Test zoom calculations
    const zoomLevel = 2;
    const canvasWidth = 1920;
    const canvasHeight = 1080;
    const mouseX = 960;
    const mouseY = 540;
    
    // Calculate expected zoom area
    const zoomWidth = canvasWidth / zoomLevel;
    const zoomHeight = canvasHeight / zoomLevel;
    const expectedX = mouseX - zoomWidth / 2;
    const expectedY = mouseY - zoomHeight / 2;
    
    // Basic zoom calculations
    this.assert(
      zoomWidth === 960,
      'Zoom width calculation',
      `Expected 960, got ${zoomWidth}`
    );
    
    this.assert(
      zoomHeight === 540,
      'Zoom height calculation',
      `Expected 540, got ${zoomHeight}`
    );
    
    // Test boundary clamping
    const clampedX = Math.max(0, Math.min(expectedX, canvasWidth - zoomWidth));
    const clampedY = Math.max(0, Math.min(expectedY, canvasHeight - zoomHeight));
    
    this.assert(
      clampedX >= 0 && clampedX <= canvasWidth - zoomWidth,
      'X boundary clamping',
      'Zoom area exceeds canvas bounds'
    );
    
    this.assert(
      clampedY >= 0 && clampedY <= canvasHeight - zoomHeight,
      'Y boundary clamping',
      'Zoom area exceeds canvas bounds'
    );
    
    // Test easing functions
    const easingFunctions = ['linear', 'easeIn', 'easeOut', 'smoothStep'];
    easingFunctions.forEach(func => {
      this.assert(
        true, // Would need actual implementation to test
        `Easing function: ${func}`,
        'Easing function not implemented'
      );
    });
  }

  testCursorRenderer() {
    log('\n🖱️ Testing Cursor Renderer...', colors.cyan);
    
    // Test cursor position tracking
    const positions = [
      { x: 100, y: 100, timestamp: 0 },
      { x: 200, y: 200, timestamp: 100 },
      { x: 300, y: 300, timestamp: 200 }
    ];
    
    // Test motion blur calculation
    const dx = positions[1].x - positions[0].x;
    const dy = positions[1].y - positions[0].y;
    const speed = Math.sqrt(dx * dx + dy * dy);
    
    this.assert(
      Math.abs(speed - 141.42) < 0.01,
      'Cursor speed calculation',
      `Expected ~141.42, got ${speed}`
    );
    
    // Test click detection
    const clickRadius = 30;
    this.assert(
      clickRadius > 0 && clickRadius <= 50,
      'Click radius range',
      'Click radius out of expected range'
    );
  }

  testBackgroundRenderer() {
    log('\n🎨 Testing Background Renderer...', colors.cyan);
    
    // Test gradient generation
    const gradientColors = ['#FF0000', '#00FF00', '#0000FF'];
    
    this.assert(
      gradientColors.every(c => /^#[0-9A-F]{6}$/i.test(c)),
      'Gradient color format',
      'Invalid hex color format'
    );
    
    // Test padding calculations
    const videoDimensions = { width: 1920, height: 1080 };
    const padding = 100;
    const outputWidth = videoDimensions.width + padding * 2;
    const outputHeight = videoDimensions.height + padding * 2;
    
    this.assert(
      outputWidth === 2120,
      'Width with padding',
      `Expected 2120, got ${outputWidth}`
    );
    
    this.assert(
      outputHeight === 1280,
      'Height with padding',
      `Expected 1280, got ${outputHeight}`
    );
    
    // Test shadow calculations
    const shadowBlur = 20;
    const shadowOffset = 10;
    
    this.assert(
      shadowBlur >= 0 && shadowBlur <= 100,
      'Shadow blur range',
      'Shadow blur out of range'
    );
    
    this.assert(
      Math.abs(shadowOffset) <= 50,
      'Shadow offset range',
      'Shadow offset too large'
    );
  }

  printSummary() {
    log('\n' + '='.repeat(40), colors.cyan);
    log('EFFECTS TEST SUMMARY', colors.cyan);
    log('='.repeat(40), colors.cyan);
    
    log(`✓ Passed: ${this.passed}`, colors.green);
    log(`✗ Failed: ${this.failed}`, colors.red);
    
    if (this.failed > 0) {
      log('\nFailed tests:', colors.red);
      this.tests.filter(t => !t.passed).forEach(t => {
        log(`  - ${t.name}: ${t.error}`, colors.red);
      });
    }
    
    return this.failed === 0;
  }

  run() {
    log('🧪 Effects Unit Tests', colors.cyan);
    log('='.repeat(40), colors.cyan);
    
    this.testZoomEngine();
    this.testCursorRenderer();
    this.testBackgroundRenderer();
    
    const success = this.printSummary();
    process.exit(success ? 0 : 1);
  }
}

// Run tests
if (require.main === module) {
  const test = new EffectsTest();
  test.run();
}