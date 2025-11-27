// Check Puppeteer-core + Chromium installation
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

console.log('✅ Puppeteer-core and @sparticuz/chromium installed successfully');

(async () => {
  try {
    const executablePath = await chromium.executablePath();
    console.log('📍 Chrome executable path:', executablePath);
  } catch (error) {
    console.log('⚠️ Chrome executable path resolution:', error.message);
  }
})();
