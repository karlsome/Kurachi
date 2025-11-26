const puppeteer = require('puppeteer');
const fs = require('fs');

const LOGIN_URL = 'https://sasaki-mfg.gen-cloud.jp/login';
const RECEIVED_URL = 'https://sasaki-mfg.gen-cloud.jp/list/received/';

const CREDS = {
  user: process.env.GEN_USER || 'u03',
  pass: process.env.GEN_PASS || 'ideaidea'
};

async function extractGENTokens() {
    console.log('🚀 Starting GEN token extraction...');
    
    // Browser launch logic with Render.com support
    const isRender = process.env.RENDER === 'true';
    
    const launchProfiles = isRender ? [
        // Render-specific configuration (headless only with optimizations)
        { 
            desc: 'bundled Chromium (headless) for Render', 
            opts: { 
                headless: true,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'
            } 
        }
    ] : [
        // Local development profiles
        { desc: 'system Chrome (headless:new)', opts: { channel: 'chrome', headless: 'new' } },
        { desc: 'bundled Chromium (headless:new)', opts: { headless: 'new' } },
        { desc: 'system Chrome (headed)', opts: { channel: 'chrome', headless: false } },
        { desc: 'bundled Chromium (headed)', opts: { headless: false } }
    ];

    let browser;
    for (const p of launchProfiles) {
        try {
            console.log('🧪 Launching', p.desc);
            browser = await puppeteer.launch({
                ...p.opts,
                dumpio: !isRender, // Reduce logs on Render
                args: baseArgs(),
                timeout: 30000 // 30 second timeout for Render
            });
            console.log('✅ Launched with', p.desc);
            break;
        } catch (e) {
            console.error('❌ Launch failed:', p.desc, '-', e.message);
        }
    }
    if (!browser) {
        console.error('💥 Could not launch any browser.');
        throw new Error('Could not launch any browser profile');
    }

    try {
        const page = await browser.newPage();
        await prepPage(page);

        // CSRF header sniffing variables
        let csrfHeaderName = null;
        let csrfHeaderValue = null;

        // CSRF header sniffing setup (from test.js approach)
        page.on('request', (req) => {
            try {
                const url = req.url();
                // Watch app API/GraphQL requests
                if (!/\/api\/|\/graphql|gen-cloud\.jp/i.test(url)) return;
                const headers = req.headers();
                for (const [k, v] of Object.entries(headers)) {
                    if (/csrf|xsrf/i.test(k)) {
                        csrfHeaderName = k;
                        csrfHeaderValue = v;
                        console.log(`🔐 Sniffed CSRF header from ${new URL(url).pathname}: ${k} = ${v.slice(0, 16)}…`);
                    }
                }
            } catch {}
        });

        console.log('📝 Opening login…');
        await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait for hydration (Next.js) - from test.js
        console.log('⏳ Waiting for React hydration…');
        await page.waitForFunction(
            () => {
                const root = document.getElementById('__next');
                return !!root && !!root.querySelector('input,button');
            },
            { timeout: 30000 }
        );

        // Resolve selectors using test.js method
        const selectors = await detectLoginSelectors(page);
        console.log('🔎 Selectors:', selectors);
        if (!selectors.user || !selectors.pass || !selectors.button) {
            throw new Error('Could not detect login fields.');
        }

        // Type creds using test.js method
        console.log('⌨️ Typing credentials…');
        await page.click(selectors.user, { clickCount: 3 }).catch(() => {});
        await page.type(selectors.user, CREDS.user, { delay: 18 });
        await page.click(selectors.pass, { clickCount: 3 }).catch(() => {});
        await page.type(selectors.pass, CREDS.pass, { delay: 18 });

        console.log('🚪 Submitting login…');
        await Promise.race([
            (async () => {
                await page.click(selectors.button);
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
            })(),
            (async () => {
                await page.click(selectors.button).catch(() => {});
                await new Promise(resolve => setTimeout(resolve, 4000));
            })()
        ]);

        const afterLogin = page.url();
        console.log('🔗 URL after login:', afterLogin);
        if (afterLogin.includes('/login')) {
            const errText = await page.$eval('#loginErrorMessage', el => el.textContent.trim()).catch(() => '');
            throw new Error('Still on login page. ' + (errText ? `Server said: ${errText}` : ''));
        }
        console.log('✅ Logged in');

        // Go to a page that triggers app API calls (to sniff CSRF header)
        console.log('📄 Going to received list…');
        await page.goto(RECEIVED_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // Give the app a moment to make its own requests so we can sniff
        await new Promise(resolve => setTimeout(resolve, 2500));

        // Fallback: pull csrf-like cookies
        if (!csrfHeaderName || !csrfHeaderValue) {
            const cookies = await page.cookies();
            const csrfCookie = cookies.find(c => /csrf|xsrf/i.test(c.name));
            if (csrfCookie) {
                csrfHeaderName = 'X-Gen-CSRF-Token'; // common header name on this app
                csrfHeaderValue = csrfCookie.value;
                console.log(`🔐 Using CSRF cookie ${csrfCookie.name} -> header ${csrfHeaderName}`);
            } else {
                console.log('⚠️ No CSRF header/cookie sniffed yet.');
            }
        }

        // Get session cookie
        const cookies = await page.cookies();
        const sessionCookie = cookies.find(c => c.name === 'PHPSESSID');
        
        if (!sessionCookie) {
            throw new Error('No PHPSESSID cookie found');
        }

        if (!csrfHeaderName || !csrfHeaderValue) {
            throw new Error('No CSRF token found');
        }

        console.log('🎯 Extracted tokens:');
        console.log('PHPSESSID:', sessionCookie.value.substring(0, 20) + '...');
        console.log('CSRF Token:', csrfHeaderValue.substring(0, 20) + '...');

        // Test the tokens by downloading CSV
        console.log('🧪 Testing tokens with CSV download...');
        const testResult = await testTokens(sessionCookie.value, csrfHeaderValue);
        
        if (!testResult) {
            throw new Error('Token test failed - tokens may not be valid');
        }

        // Save tokens to file
        const tokenData = {
            phpsessid: sessionCookie.value,
            csrfToken: csrfHeaderValue,
            timestamp: new Date().toISOString(),
            expires: 'Check session expiry in browser'
        };
        
        fs.writeFileSync('gen_tokens.json', JSON.stringify(tokenData, null, 2));
        console.log('💾 Tokens saved to gen_tokens.json');
        
        return tokenData;

    } catch (error) {
        console.error('❌ Error during token extraction:', error.message);
        return null;
    } finally {
        await browser.close();
    }
}

async function testTokens(phpsessid, csrfToken) {
    console.log('🧪 Testing tokens with CSV API call...');
    
    const fetch = require('node-fetch');
    const https = require('https');
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    
    const url = 'https://sasaki-mfg.gen-cloud.jp/api/received/csv?' + new URLSearchParams({
        search_worker_id: 'gen_all',
        search_section_id: 'gen_all', 
        search_received_detail_delivery_completed: 'false',
        search_custom_text_1: 'gen_all',
        search_custom_text_2: 'gen_all',
        search_gen_crossTableHorizontal: 'gen_nothing',
        search_gen_crossTableVertical: 'gen_nothing',
        search_gen_crossTableValue: 'gen_nothing',
        search_gen_crossTableMethod: 'sum',
        qs: new Date().toISOString().split('T')[0],
        offset: '0',
        search_orderby: 'received_detail_line_no:::false,received_number:::true,id:::false,received_detail_id:::false',
        displayPatternId: ''
    });

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': `PHPSESSID=${phpsessid}`,
                'X-Gen-CSRF-Token': csrfToken,
                'Referer': 'https://sasaki-mfg.gen-cloud.jp/list/received/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            },
            agent: httpsAgent
        });

        if (response.ok) {
            const csvData = await response.buffer();
            console.log('✅ Token test successful!');
            console.log(`📊 Downloaded ${csvData.length} bytes of CSV data`);
            
            // Save test CSV as-is
            fs.writeFileSync('test_download.csv', csvData);
            console.log('💾 Test CSV saved as test_download.csv');
            
            return true;
        } else {
            console.log(`❌ Token test failed: ${response.status} ${response.statusText}`);
            return false;
        }
    } catch (error) {
        console.log('❌ Token test error:', error.message);
        return false;
    }
}

// Main execution
if (require.main === module) {
    extractGENTokens().then((result) => {
        if (result) {
            console.log('\n🎉 SUCCESS! Tokens extracted and tested.');
            console.log('💡 Use these tokens in your CSV download tool:');
            console.log(`PHPSESSID: ${result.phpsessid}`);
            console.log(`CSRF Token: ${result.csrfToken}`);
        } else {
            console.log('\n❌ Token extraction failed. Try manual method.');
        }
        process.exit(0);
    }).catch((error) => {
        console.error('\n💥 Fatal error during token extraction:');
        console.error(error.message);
        console.error('\nTry running again or use manual token extraction method.');
        process.exit(1);
    });
}

/** ---------- helpers from test.js ---------- */

function baseArgs() {
  const isRender = process.env.RENDER === 'true';
  
  const args = [
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-software-rasterizer'
  ];
  
  // Render.com and Linux require these flags
  if (process.platform === 'linux' || isRender) {
    args.push(
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process' // Important for Render's resource limits
    );
  }
  
  return args;
}

async function prepPage(page) {
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1366, height: 860 });
  // Light stealth
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
  });
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('🖥️ console error:', msg.text());
  });
  page.on('pageerror', e => console.log('⚠️ pageerror:', e.message));
  page.on('error', e => console.log('⚠️ page error:', e.message));
}

async function detectLoginSelectors(page) {
  const candidates = {
    user: [
      '#loginUserId',
      'input[name="loginUserId"]',
      'input[name="username"]',
      'input[type="text"]',
      'input[type="email"]'
    ],
    pass: ['#password', 'input[name="password"]', 'input[type="password"]'],
    button: ['#loginButton', 'button[type="submit"]', 'input[type="submit"]', 'button']
  };
  const isLoginButton = async (handle) => {
    const txt = (await handle.evaluate(el => (el.innerText || el.value || '').trim())).toLowerCase();
    return ['login', 'log in', 'sign in', 'signin', 'ログイン'].some(t => txt.includes(t));
  };
  const pickFirst = async (selectors, filterFn) => {
    for (const sel of selectors) {
      const h = await page.$(sel);
      if (!h) continue;
      if (filterFn) {
        const ok = await filterFn(h);
        await h.dispose();
        if (!ok) continue;
      }
      return sel;
    }
    return null;
  };
  let userSel = await pickFirst(candidates.user);
  let passSel = await pickFirst(candidates.pass);
  let btnSel = await pickFirst(candidates.button, isLoginButton);

  if (!userSel || !passSel || !btnSel) {
    const got = await page.evaluate(() => {
      const forms = Array.from(document.querySelectorAll('form'));
      for (const f of forms) {
        const inputs = Array.from(f.querySelectorAll('input,button'));
        const user = inputs.find(i => /text|email/i.test(i.type) || i.id === 'loginUserId');
        const pass = inputs.find(i => /password/i.test(i.type) || i.id === 'password');
        const btn =
          inputs.find(i => (i.tagName === 'BUTTON' && /ログイン|login|sign in/i.test(i.innerText))) ||
          inputs.find(i => i.type === 'submit' || i.id === 'loginButton');
        if (user && pass && btn) {
          user.setAttribute('data-qa', 'user');
          pass.setAttribute('data-qa', 'pass');
          btn.setAttribute('data-qa', 'login');
          return { user: '[data-qa="user"]', pass: '[data-qa="pass"]', button: '[data-qa="login"]' };
        }
      }
      const allInputs = Array.from(document.querySelectorAll('input'));
      const user = allInputs.find(i => /text|email/i.test(i.type));
      const pass = allInputs.find(i => /password/i.test(i.type));
      const btn = Array.from(document.querySelectorAll('button,input[type="submit"]')).find(
        b => /ログイン|login|sign in/i.test((b.innerText || b.value || ''))
      );
      if (user && pass && btn) {
        user.setAttribute('data-qa', 'user');
        pass.setAttribute('data-qa', 'pass');
        btn.setAttribute('data-qa', 'login');
        return { user: '[data-qa="user"]', pass: '[data-qa="pass"]', button: '[data-qa="login"]' };
      }
      return { user: null, pass: null, button: null };
    });
    userSel ||= got.user;
    passSel ||= got.pass;
    btnSel ||= got.button;
  }

  return { user: userSel, pass: passSel, button: btnSel };
}

module.exports = { extractGENTokens, testTokens };