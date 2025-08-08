#!/usr/bin/env node

/**
 * Quick test to verify auto-click functionality
 */

const { spawn } = require('child_process');
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

log('🧪 Testing Auto-Click Feature', colors.cyan);
log('================================', colors.cyan);

const electronProcess = spawn('npm', ['run', 'electron-dev'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, NODE_ENV: 'development', TEST_AUTO_RECORD: 'true' }
});

let autoClickDetected = false;
let recordingStarted = false;

electronProcess.stdout.on('data', (data) => {
  const output = data.toString();
  
  if (output.includes('App ready')) {
    log('✓ App started', colors.green);
  }
  
  if (output.includes('[TEST] Auto-clicking record button')) {
    log('🤖 Auto-click initiated!', colors.cyan);
    autoClickDetected = true;
  }
  
  if (output.includes('[TEST] Clicked Start Recording button')) {
    log('✓ Auto-click successful!', colors.green);
  }
  
  if (output.includes('Using screen source:')) {
    log('✓ Recording started!', colors.green);
    recordingStarted = true;
    
    setTimeout(() => {
      if (autoClickDetected && recordingStarted) {
        log('\n✅ AUTO-CLICK TEST PASSED!', colors.green);
      } else {
        log('\n❌ AUTO-CLICK TEST FAILED', colors.red);
      }
      electronProcess.kill();
      process.exit(autoClickDetected && recordingStarted ? 0 : 1);
    }, 2000);
  }
});

electronProcess.stderr.on('data', (data) => {
  if (data.toString().includes('ERROR')) {
    log(`❌ ${data.toString()}`, colors.red);
  }
});

// Timeout after 20 seconds
setTimeout(() => {
  log('\n⏱️ Test timed out', colors.yellow);
  electronProcess.kill();
  process.exit(1);
}, 20000);