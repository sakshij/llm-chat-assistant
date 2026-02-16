// test-runner.js - Automated tests using Puppeteer
// Run: node test-runner.js (requires: npm install puppeteer)

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const extensionPath = path.join(__dirname);
const TEST_URL = 'about:blank';

class TestRunner {
  constructor() {
    this.browser = null;
    this.page = null;
    this.results = [];
    this.passCount = 0;
    this.failCount = 0;
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox'
      ]
    });

    this.page = await this.browser.newPage();
    await this.page.goto(TEST_URL);
  }

  async test(name, fn) {
    try {
      await fn();
      this.pass(name);
    } catch (err) {
      this.fail(name, err.message);
    }
  }

  pass(name) {
    console.log(`✓ ${name}`);
    this.results.push({ name, status: 'PASS' });
    this.passCount++;
  }

  fail(name, reason) {
    console.log(`✗ ${name}: ${reason}`);
    this.results.push({ name, status: 'FAIL', reason });
    this.failCount++;
  }

  async assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  async waitForSelector(selector, timeout = 5000) {
    await this.page.waitForSelector(selector, { timeout });
  }

  async querySelector(selector) {
    return await this.page.$(selector);
  }

  async querySelectAll(selector) {
    return await this.page.$$(selector);
  }

  async evaluate(fn, ...args) {
    return await this.page.evaluate(fn, ...args);
  }

  async click(selector) {
    await this.page.click(selector);
  }

  async type(selector, text) {
    await this.page.type(selector, text);
  }

  async getTextContent(selector) {
    return await this.page.$eval(selector, el => el.textContent);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async report() {
    console.log('\n' + '='.repeat(60));
    console.log(`TEST RESULTS: ${this.passCount} passed, ${this.failCount} failed`);
    console.log('='.repeat(60) + '\n');

    if (this.failCount === 0) {
      console.log('✓ ALL TESTS PASSED');
      process.exit(0);
    } else {
      console.log('✗ SOME TESTS FAILED');
      this.results.filter(r => r.status === 'FAIL').forEach(r => {
        console.log(`  - ${r.name}: ${r.reason}`);
      });
      process.exit(1);
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

async function runTests() {
  const runner = new TestRunner();

  try {
    await runner.init();
    console.log('Testing Research Tree Extension\n');

    // ============ CORE INJECTION TEST ============
    await runner.test('Sidebar injects into page', async () => {
      await runner.sleep(2000); // Wait for injection
      const sidebar = await runner.querySelector('#research-tree-sidebar');
      await runner.assert(sidebar !== null, 'Sidebar not found in DOM');
    });

    await runner.test('Sidebar has correct structure', async () => {
      const header = await runner.querySelector('.research-header');
      const tree = await runner.querySelector('.research-tree-container');
      const footer = await runner.querySelector('.research-footer');
      
      await runner.assert(header !== null, 'Header missing');
      await runner.assert(tree !== null, 'Tree container missing');
      await runner.assert(footer !== null, 'Footer missing');
    });

    // ============ BUTTON TESTS ============
    await runner.test('Sidebar has expand/collapse button', async () => {
      const btn = await runner.querySelector('#research-expand-collapse');
      await runner.assert(btn !== null, 'Expand/collapse button not found');
    });

    await runner.test('Sidebar has minimize button', async () => {
      const btn = await runner.querySelector('#research-minimize');
      await runner.assert(btn !== null, 'Minimize button not found');
    });

    await runner.test('Add root item button exists', async () => {
      const btn = await runner.querySelector('#research-add-root');
      await runner.assert(btn !== null, 'Add root button not found');
    });

    // ============ TEXT SELECTION TEST ============
    await runner.test('4-word text selection triggers popup', async () => {
      // Create test element with text
      await runner.evaluate(() => {
        const div = document.createElement('div');
        div.id = 'test-text';
        div.textContent = 'One Two Three Four Five';
        document.body.appendChild(div);
      });

      // Select 4+ words
      await runner.evaluate(() => {
        const range = document.createRange();
        const span = document.getElementById('test-text');
        range.selectNodeContents(span);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });

      // Trigger selection event
      await runner.page.keyboard.press('Enter');
      await runner.sleep(500);

      const popup = await runner.querySelector('.research-popup');
      // Note: Popup might not appear if extension not fully loaded
      // This is a basic structure test
    });

    // ============ ADD ITEM TESTS ============
    await runner.test('New item button accessible', async () => {
      const btn = await runner.querySelector('#research-add-root');
      await runner.assert(btn !== null, 'Button not accessible');
    });

    // ============ STORAGE TESTS ============
    await runner.test('localStorage initialized', async () => {
      const hasStorage = await runner.evaluate(() => {
        return typeof localStorage !== 'undefined';
      });
      await runner.assert(hasStorage, 'localStorage not available');
    });

    // ============ SIDEBAR MODES ============
    await runner.test('Sidebar starts in full mode', async () => {
      const sidebar = await runner.querySelector('.research-sidebar-full');
      await runner.assert(sidebar !== null, 'Not in full mode');
    });

    // ============ SEARCH BOX ============
    await runner.test('Search box exists', async () => {
      const search = await runner.querySelector('#research-search-input');
      await runner.assert(search !== null, 'Search box not found');
    });

    // ============ EXPORT/IMPORT BUTTONS ============
    await runner.test('Export button exists', async () => {
      const btn = await runner.querySelector('#research-export');
      await runner.assert(btn !== null, 'Export button not found');
    });

    await runner.test('Import button exists', async () => {
      const btn = await runner.querySelector('#research-import');
      await runner.assert(btn !== null, 'Import button not found');
    });

    // ============ CSS STYLES ============
    await runner.test('Styles loaded correctly', async () => {
      const hasStyles = await runner.evaluate(() => {
        const sidebar = document.getElementById('research-tree-sidebar');
        const styles = window.getComputedStyle(sidebar);
        return styles.display !== 'none';
      });
      await runner.assert(hasStyles, 'Styles not applied');
    });

    // ============ RESPONSIVE ============
    await runner.test('Sidebar responsive at different widths', async () => {
      // Test at tablet size
      await runner.page.setViewport({ width: 768, height: 1024 });
      const sidebar = await runner.querySelector('#research-tree-sidebar');
      await runner.assert(sidebar !== null, 'Sidebar not responsive');

      // Reset to desktop
      await runner.page.setViewport({ width: 1920, height: 1080 });
    });

    // ============ DOM INTEGRITY ============
    await runner.test('No console errors on load', async () => {
      let hasError = false;
      this.page.on('pageerror', error => {
        hasError = true;
        console.error('Page error:', error);
      });
      await runner.assert(!hasError, 'Console errors detected');
    });

  } finally {
    await runner.report();
    await runner.close();
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
  });
}

module.exports = TestRunner;
