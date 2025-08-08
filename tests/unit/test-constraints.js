#!/usr/bin/env node

/**
 * Test to verify getUserMedia constraints are correct for Electron
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// Check the record button page for correct constraints
const recordButtonPath = path.join(__dirname, '../../src/app/record-button/page.tsx');
const content = fs.readFileSync(recordButtonPath, 'utf8');

log('\n🔍 Checking getUserMedia constraints...', colors.cyan);
log('=' .repeat(50), colors.cyan);

// Check for mandatory constraints (correct for Electron)
if (content.includes('mandatory: {') && 
    content.includes('chromeMediaSource: \'desktop\'') &&
    content.includes('chromeMediaSourceId: source.id')) {
  log('✓ Correct mandatory constraints found', colors.green);
  log('  - Uses mandatory object', colors.green);
  log('  - Has chromeMediaSource: "desktop"', colors.green);
  log('  - Has chromeMediaSourceId: source.id', colors.green);
} else {
  log('✗ Incorrect constraints format', colors.red);
  log('  Expected mandatory constraints for Electron', colors.red);
}

// Check for incorrect modern constraints
if (content.includes('deviceId: { exact:') || 
    content.includes('mediaStreamSource: { exact:')) {
  log('⚠️  WARNING: Found modern constraint format that causes crashes', colors.yellow);
  log('  These should be removed:', colors.yellow);
  if (content.includes('deviceId: { exact:')) {
    log('    - deviceId: { exact: ... }', colors.yellow);
  }
  if (content.includes('mediaStreamSource: { exact:')) {
    log('    - mediaStreamSource: { exact: ... }', colors.yellow);
  }
}

// Check audio constraints
if (content.includes('echoCancellation: { ideal: true }')) {
  log('✓ Audio constraints properly formatted', colors.green);
}

// Check for potential issues
log('\n📋 Constraint Check Summary:', colors.cyan);

const lines = content.split('\n');
let inGetUserMedia = false;
let constraintBlock = [];

lines.forEach((line, index) => {
  if (line.includes('navigator.mediaDevices.getUserMedia')) {
    inGetUserMedia = true;
  }
  
  if (inGetUserMedia) {
    constraintBlock.push(`  ${index + 1}: ${line.trim()}`);
    
    if (line.includes('})') && constraintBlock.length > 10) {
      inGetUserMedia = false;
      
      log('\ngetUserMedia call found at line ' + (index - constraintBlock.length + 2), colors.cyan);
      log('Current implementation:', colors.yellow);
      console.log(constraintBlock.slice(0, 15).join('\n'));
    }
  }
});

// Verify the exact format needed
log('\n✅ Correct format for Electron should be:', colors.green);
log(`
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: micEnabled ? {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true }
    } : false,
    video: {
      // @ts-ignore
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: source.id
      }
    }
  })
`, colors.green);

log('\n❌ Incorrect format that causes crashes:', colors.red);
log(`
  // DO NOT USE THIS FORMAT:
  video: {
    deviceId: { exact: source.id },
    mediaStreamSource: { exact: 'desktop' }
  }
`, colors.red);

log('\n' + '=' .repeat(50), colors.cyan);
log('Test complete!', colors.cyan);