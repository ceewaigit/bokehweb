#!/usr/bin/env node

/**
 * REAL Integration test that actually verifies recording works
 * This test will:
 * 1. Start the app
 * 2. Click record
 * 3. Verify no crashes
 * 4. Check that recording actually starts
 */

const { spawn } = require('child_process');
const path = require('path');

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

class RealRecordingTest {
  constructor() {
    this.electronProcess = null;
    this.testPassed = false;
    this.errors = [];
  }

  async startApp() {
    return new Promise((resolve, reject) => {
      log('\n🚀 Starting Electron app...', colors.blue);
      
      this.electronProcess = spawn('npm', ['run', 'electron-dev'], {
        cwd: path.join(__dirname),
        env: { ...process.env, NODE_ENV: 'development' }
      });

      let appReady = false;
      let permissionStatus = 'unknown';

      const checkOutput = (data) => {
        const output = data.toString();
        
        // Log everything for debugging
        if (output.includes('ERROR') || output.includes('error')) {
          log(`  ❌ ${output.trim()}`, colors.red);
        }
        
        // Check if app started
        if (output.includes('App ready - Electron version') && !appReady) {
          appReady = true;
          log('  ✓ Electron started', colors.green);
        }
        
        // Check permissions
        if (output.includes('Screen recording permission: granted')) {
          permissionStatus = 'granted';
          log('  ✓ Screen recording permission granted', colors.green);
        } else if (output.includes('Screen recording permission: denied')) {
          permissionStatus = 'denied';
          log('  ⚠️  Screen recording permission denied', colors.yellow);
        }
        
        // Check if app is fully ready
        if (appReady && permissionStatus !== 'unknown') {
          setTimeout(() => resolve({ appReady, permissionStatus }), 2000);
        }
      };

      this.electronProcess.stdout.on('data', checkOutput);
      this.electronProcess.stderr.on('data', checkOutput);

      // Timeout
      setTimeout(() => {
        reject(new Error('App failed to start in 30 seconds'));
      }, 30000);
    });
  }

  async testRecording() {
    return new Promise((resolve, reject) => {
      log('\n🎥 Testing recording functionality...', colors.cyan);
      
      let countdownStarted = false;
      let recordingStarted = false;
      let crashDetected = false;
      
      const checkOutput = (data) => {
        const output = data.toString();
        
        // Check for countdown
        if (output.includes('show-countdown')) {
          countdownStarted = true;
          log('  ✓ Countdown started', colors.green);
        }
        
        // Check for source selection
        if (output.includes('Using screen source:')) {
          log('  ✓ Screen source selected', colors.green);
        }
        
        // CRITICAL: Check what constraints are being sent
        if (output.includes('UMCI::RequestUserMedia')) {
          log('\n  📋 getUserMedia constraints:', colors.yellow);
          
          // Extract the constraints being sent
          const constraintsMatch = output.match(/video constraints=\{([^}]+)\}/);
          if (constraintsMatch) {
            const constraints = constraintsMatch[0];
            
            // Check if using wrong format
            if (constraints.includes('deviceId:') || constraints.includes('mediaStreamSource:')) {
              log(`    ❌ WRONG CONSTRAINTS DETECTED: ${constraints}`, colors.red);
              this.errors.push('Using incorrect constraint format - will crash!');
              crashDetected = true;
            }
            
            // Check if using correct format
            if (constraints.includes('mandatory:')) {
              log(`    ✓ Correct mandatory constraints`, colors.green);
            }
          }
        }
        
        // Check for the actual crash
        if (output.includes('Renderer process killed') || 
            output.includes('bad IPC message, reason 263')) {
          crashDetected = true;
          log('  ❌ RENDERER CRASHED! Bad constraints format!', colors.red);
          this.errors.push('Renderer process crashed due to incorrect constraints');
          reject(new Error('Renderer crashed'));
        }
        
        // Check if recording actually started
        if (output.includes('MediaRecorder started') || 
            output.includes('Recording started successfully')) {
          recordingStarted = true;
          log('  ✓ Recording started successfully', colors.green);
          resolve(true);
        }
      };

      this.electronProcess.stdout.on('data', checkOutput);
      this.electronProcess.stderr.on('data', checkOutput);

      // Simulate clicking record after a delay
      setTimeout(() => {
        log('  ⏱️  Waiting for recording to start...', colors.yellow);
      }, 3000);

      // Timeout - if no recording started or crash
      setTimeout(() => {
        if (crashDetected) {
          reject(new Error('Recording crashed'));
        } else if (!recordingStarted) {
          reject(new Error('Recording did not start'));
        }
      }, 15000);
    });
  }

  async cleanup() {
    if (this.electronProcess) {
      log('\n🧹 Cleaning up...', colors.blue);
      this.electronProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (!this.electronProcess.killed) {
        this.electronProcess.kill('SIGKILL');
      }
    }
  }

  async run() {
    log('=' .repeat(60), colors.cyan);
    log('🧪 REAL Screen Studio Recording Test', colors.cyan);
    log('=' .repeat(60), colors.cyan);

    try {
      // Start app
      const { appReady, permissionStatus } = await this.startApp();
      
      if (!appReady) {
        throw new Error('App failed to start properly');
      }
      
      if (permissionStatus === 'denied') {
        log('\n⚠️  Warning: Screen recording permission not granted', colors.yellow);
        log('  Please grant permission in System Preferences', colors.yellow);
      }
      
      // Test recording
      await this.testRecording();
      
      this.testPassed = true;
      log('\n✅ TEST PASSED: Recording works without crashing!', colors.green);
      
    } catch (error) {
      this.testPassed = false;
      log(`\n❌ TEST FAILED: ${error.message}`, colors.red);
      
      if (this.errors.length > 0) {
        log('\n📋 Errors detected:', colors.red);
        this.errors.forEach(err => log(`  • ${err}`, colors.red));
      }
      
      log('\n💡 Solution:', colors.yellow);
      log('  The constraints MUST use mandatory format:', colors.yellow);
      log('    video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: source.id }}', colors.green);
      log('  NOT the modern format:', colors.yellow);
      log('    video: { deviceId: { exact: ... }, mediaStreamSource: { exact: ... }}', colors.red);
    } finally {
      await this.cleanup();
      
      log('\n' + '=' .repeat(60), colors.cyan);
      log(this.testPassed ? '✅ Test Result: PASSED' : '❌ Test Result: FAILED', 
          this.testPassed ? colors.green : colors.red);
      log('=' .repeat(60), colors.cyan);
      
      process.exit(this.testPassed ? 0 : 1);
    }
  }
}

// Run test
if (require.main === module) {
  const test = new RealRecordingTest();
  test.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}