#!/usr/bin/env node

/**
 * Master test runner - executes all test suites
 * Run with: npm test
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

class TestRunner {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  async runTest(testPath, testName, category) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      log(`\n${colors.bold}Running ${category} test:${colors.reset} ${testName}`, colors.cyan);
      
      const testProcess = spawn('node', [testPath], {
        cwd: path.dirname(testPath),
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let output = '';
      let hasError = false;

      testProcess.stdout.on('data', (data) => {
        const str = data.toString();
        output += str;
        // Only show important lines, not everything
        if (str.includes('✓') || str.includes('✅')) {
          process.stdout.write(`  ${colors.green}${str.trim()}${colors.reset}\n`);
        } else if (str.includes('❌') || str.includes('ERROR')) {
          process.stdout.write(`  ${colors.red}${str.trim()}${colors.reset}\n`);
        } else if (str.includes('⚠') || str.includes('Warning')) {
          process.stdout.write(`  ${colors.yellow}${str.trim()}${colors.reset}\n`);
        }
      });

      testProcess.stderr.on('data', (data) => {
        const str = data.toString();
        output += str;
        hasError = true;
        process.stdout.write(`  ${colors.red}${str}${colors.reset}`);
      });

      testProcess.on('close', (code) => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const passed = code === 0;
        
        this.results.push({
          name: testName,
          category,
          passed,
          duration,
          output: passed ? '' : output
        });

        if (passed) {
          log(`  ✅ ${testName} passed (${duration}s)`, colors.green);
        } else {
          log(`  ❌ ${testName} failed (${duration}s)`, colors.red);
        }
        
        resolve(passed);
      });

      // Kill test after 60 seconds
      setTimeout(() => {
        if (testProcess.killed) return;
        testProcess.kill();
        log(`  ⏱️ ${testName} timed out`, colors.yellow);
        resolve(false);
      }, 60000);
    });
  }

  async runTestSuite(category, tests) {
    log(`\n${'='.repeat(60)}`, colors.magenta);
    log(`${colors.bold}${category.toUpperCase()} TESTS${colors.reset}`, colors.magenta);
    log('='.repeat(60), colors.magenta);

    const results = [];
    for (const test of tests) {
      const passed = await this.runTest(test.path, test.name, category);
      results.push(passed);
    }

    const passed = results.filter(r => r).length;
    const failed = results.filter(r => !r).length;
    
    log(`\n${category} Results: ${passed} passed, ${failed} failed`, 
        failed > 0 ? colors.red : colors.green);
    
    return results.every(r => r);
  }

  async discoverTests() {
    const tests = {
      unit: [],
      integration: [],
      e2e: []
    };

    // Discover unit tests
    const unitDir = path.join(__dirname, 'unit');
    if (fs.existsSync(unitDir)) {
      const files = fs.readdirSync(unitDir).filter(f => f.endsWith('.js'));
      tests.unit = files.map(f => ({
        name: f.replace('.js', ''),
        path: path.join(unitDir, f)
      }));
    }

    // Discover integration tests
    const integrationDir = path.join(__dirname, 'integration');
    if (fs.existsSync(integrationDir)) {
      const files = fs.readdirSync(integrationDir).filter(f => f.endsWith('.js'));
      tests.integration = files.map(f => ({
        name: f.replace('.js', ''),
        path: path.join(integrationDir, f)
      }));
    }

    // Discover e2e tests
    const e2eDir = path.join(__dirname, 'e2e');
    if (fs.existsSync(e2eDir)) {
      const files = fs.readdirSync(e2eDir).filter(f => f.endsWith('.js'));
      tests.e2e = files.map(f => ({
        name: f.replace('.js', ''),
        path: path.join(e2eDir, f)
      }));
    }

    return tests;
  }

  printSummary() {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    
    log(`\n${'='.repeat(60)}`, colors.bold);
    log('TEST SUMMARY', colors.bold);
    log('='.repeat(60), colors.bold);

    // Group by category
    const categories = {};
    this.results.forEach(r => {
      if (!categories[r.category]) {
        categories[r.category] = { passed: 0, failed: 0, tests: [] };
      }
      categories[r.category].tests.push(r);
      if (r.passed) {
        categories[r.category].passed++;
      } else {
        categories[r.category].failed++;
      }
    });

    // Print each category
    Object.entries(categories).forEach(([cat, data]) => {
      log(`\n${cat.toUpperCase()}:`, colors.cyan);
      data.tests.forEach(test => {
        const icon = test.passed ? '✅' : '❌';
        const color = test.passed ? colors.green : colors.red;
        log(`  ${icon} ${test.name} (${test.duration}s)`, color);
      });
      log(`  Total: ${data.passed} passed, ${data.failed} failed`, 
          data.failed > 0 ? colors.red : colors.green);
    });

    // Overall summary
    const totalPassed = this.results.filter(r => r.passed).length;
    const totalFailed = this.results.filter(r => !r.passed).length;
    
    log(`\n${'='.repeat(60)}`, colors.bold);
    log(`OVERALL: ${totalPassed} passed, ${totalFailed} failed (${duration}s)`, 
        totalFailed > 0 ? colors.red : colors.green);
    log('='.repeat(60), colors.bold);

    // Show failed test details
    if (totalFailed > 0) {
      log('\nFAILED TEST DETAILS:', colors.red);
      this.results.filter(r => !r.passed).forEach(test => {
        log(`\n${test.category}/${test.name}:`, colors.red);
        if (test.output) {
          const lines = test.output.split('\n').slice(0, 10);
          lines.forEach(line => log(`  ${line}`, colors.yellow));
          if (test.output.split('\n').length > 10) {
            log('  ... (output truncated)', colors.yellow);
          }
        }
      });
    }

    return totalFailed === 0;
  }

  async run() {
    log('🧪 Screen Studio Test Suite', colors.bold + colors.cyan);
    log(`Started at: ${new Date().toLocaleTimeString()}`, colors.cyan);
    
    try {
      const tests = await this.discoverTests();
      
      log(`\nDiscovered tests:`, colors.blue);
      log(`  • Unit tests: ${tests.unit.length}`, colors.blue);
      log(`  • Integration tests: ${tests.integration.length}`, colors.blue);
      log(`  • E2E tests: ${tests.e2e.length}`, colors.blue);

      // Run tests in order: unit -> integration -> e2e
      let allPassed = true;

      if (tests.unit.length > 0) {
        const unitPassed = await this.runTestSuite('unit', tests.unit);
        allPassed = allPassed && unitPassed;
      }

      if (tests.integration.length > 0) {
        const integrationPassed = await this.runTestSuite('integration', tests.integration);
        allPassed = allPassed && integrationPassed;
      }

      if (tests.e2e.length > 0) {
        const e2ePassed = await this.runTestSuite('e2e', tests.e2e);
        allPassed = allPassed && e2ePassed;
      }

      const success = this.printSummary();
      
      if (success) {
        log('\n✅ All tests passed!', colors.green + colors.bold);
      } else {
        log('\n❌ Some tests failed!', colors.red + colors.bold);
      }

      process.exit(success ? 0 : 1);
    } catch (error) {
      log(`\n❌ Test runner error: ${error.message}`, colors.red);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new TestRunner();
  runner.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = TestRunner;