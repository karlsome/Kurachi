const express = require('express');
const path = require('path');
const fs = require('fs');
const { extractGENTokens } = require('./gen-token-extractor');
const fetch = require('node-fetch');
const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const app = express();
const port = 3000;

// Token management functions
async function loadExistingTokens() {
    try {
        if (!fs.existsSync('gen_tokens.json')) {
            console.log('📄 No existing tokens file found');
            return null;
        }
        
        const tokenData = JSON.parse(fs.readFileSync('gen_tokens.json', 'utf8'));
        const tokenAge = Date.now() - new Date(tokenData.timestamp).getTime();
        const maxAge = 60 * 60 * 1000; // 1 hour in milliseconds
        
        if (tokenAge > maxAge) {
            console.log('⏰ Existing tokens are too old (> 1 hour), will refresh');
            return null;
        }
        
        console.log(`🔄 Found existing tokens (${Math.round(tokenAge / 1000 / 60)} minutes old)`);
        return tokenData;
    } catch (error) {
        console.log('❌ Error loading existing tokens:', error.message);
        return null;
    }
}

async function testTokenValidity(phpsessid, csrfToken) {
    console.log('🧪 Testing token validity...');
    
    const testUrl = 'https://sasaki-mfg.gen-cloud.jp/api/received/csv?' + new URLSearchParams({
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
        const response = await fetch(testUrl, {
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
            const csvText = csvData.toString();
            // Check if response contains error message
            if (csvText.includes('エラーが発生しました') || csvText.includes('session_error') || csvData.length < 50) {
                console.log('❌ Tokens are invalid (error in response)');
                return false;
            }
            console.log('✅ Tokens are valid');
            return true;
        } else {
            console.log(`❌ Tokens are invalid (HTTP ${response.status})`);
            return false;
        }
    } catch (error) {
        console.log('❌ Token validation failed:', error.message);
        return false;
    }
}

async function getValidTokens() {
    // Try to use existing tokens first
    const existingTokens = await loadExistingTokens();
    
    if (existingTokens) {
        const isValid = await testTokenValidity(existingTokens.phpsessid, existingTokens.csrfToken);
        
        if (isValid) {
            console.log('✅ Reusing existing valid tokens');
            return existingTokens;
        } else {
            console.log('🔄 Existing tokens invalid, extracting fresh ones...');
        }
    }
    
    // Extract fresh tokens if no valid existing ones
    console.log('🔐 Extracting fresh authentication tokens...');
    const freshTokens = await extractGENTokens();
    
    if (!freshTokens) {
        throw new Error('Failed to extract fresh authentication tokens');
    }
    
    console.log('✅ Fresh tokens extracted successfully');
    return freshTokens;
}

async function downloadCSVWithRetry(apiUrl, tokens, fromDate, toDate) {
    const makeRequest = async (phpsessid, csrfToken) => {
        return await fetch(apiUrl, {
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
    };

    // First attempt with provided tokens
    let response = await makeRequest(tokens.phpsessid, tokens.csrfToken);
    
    if (response.ok) {
        const data = await response.buffer();
        const dataText = data.toString();
        
        // Check if response contains error message indicating invalid session
        if (dataText.includes('エラーが発生しました') || dataText.includes('session_error') || 
            dataText.includes('CSRF') || dataText.includes('expired')) {
            console.log('🔄 Response contains error, tokens may be invalid, retrying with fresh tokens...');
            
            // Force fresh token extraction
            if (fs.existsSync('gen_tokens.json')) {
                fs.renameSync('gen_tokens.json', 'gen_tokens_backup.json');
            }
            
            const freshTokens = await extractGENTokens();
            
            if (freshTokens && freshTokens.csrfToken !== 'MANUAL_REQUIRED') {
                console.log('✅ Fresh tokens extracted, retrying CSV download...');
                
                const retryResponse = await makeRequest(freshTokens.phpsessid, freshTokens.csrfToken);
                
                if (retryResponse.ok) {
                    const retryData = await retryResponse.buffer();
                    console.log(`✅ Retry successful! Downloaded ${retryData.length} bytes`);
                    
                    // Restore backup if retry was successful
                    if (fs.existsSync('gen_tokens_backup.json')) {
                        fs.unlinkSync('gen_tokens_backup.json');
                    }
                    
                    return retryData;
                } else {
                    throw new Error(`Retry failed: ${retryResponse.status} ${retryResponse.statusText}`);
                }
            } else {
                throw new Error('Failed to extract fresh tokens for retry');
            }
        }
        
        console.log(`✅ CSV downloaded successfully (${data.length} bytes)`);
        return data;
    } else {
        // HTTP error on first attempt, try fresh tokens
        console.log(`❌ HTTP ${response.status}, attempting with fresh tokens...`);
        
        if (fs.existsSync('gen_tokens.json')) {
            fs.renameSync('gen_tokens.json', 'gen_tokens_backup.json');
        }
        
        const freshTokens = await extractGENTokens();
        
        if (freshTokens && freshTokens.csrfToken !== 'MANUAL_REQUIRED') {
            console.log('✅ Fresh tokens extracted, retrying CSV download...');
            
            const retryResponse = await makeRequest(freshTokens.phpsessid, freshTokens.csrfToken);
            
            if (retryResponse.ok) {
                const retryData = await retryResponse.buffer();
                console.log(`✅ Retry successful! Downloaded ${retryData.length} bytes`);
                
                if (fs.existsSync('gen_tokens_backup.json')) {
                    fs.unlinkSync('gen_tokens_backup.json');
                }
                
                return retryData;
            } else {
                const retryError = await retryResponse.text();
                throw new Error(`Both attempts failed. Last error: ${retryResponse.status} ${retryResponse.statusText} - ${retryError.substring(0, 200)}`);
            }
        } else {
            throw new Error('Failed to extract fresh tokens for retry');
        }
    }
}

// Middleware
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files from current directory

// Serve the HTML file at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'gen-automated.html'));
});

// API endpoint to extract tokens and download CSV
app.post('/extract-tokens', async (req, res) => {
    const { fromDate, toDate, workerFilter } = req.body;
    
    console.log('🚀 Starting automated CSV download...');
    console.log(`📅 Date range: ${fromDate} to ${toDate}`);
    console.log(`👤 Worker filter: ${workerFilter}`);
    console.log('🔍 Request body received:', JSON.stringify(req.body, null, 2));

    try {
        // Get valid tokens (reuse existing or extract fresh)
        const tokens = await getValidTokens();
        
        if (tokens.csrfToken === 'MANUAL_REQUIRED') {
            throw new Error('CSRF token requires manual extraction. Please use the manual mode in the web interface.');
        }
        console.log('📥 Downloading CSV with date filters...');

        // Build API URL with date parameters
        const params = {
            search_worker_id: workerFilter || 'gen_all',
            search_section_id: 'gen_all',
            search_received_detail_delivery_completed: 'false',
            search_custom_text_1: 'gen_all',
            search_custom_text_2: 'gen_all',
            search_gen_crossTableHorizontal: 'gen_nothing',
            search_gen_crossTableVertical: 'gen_nothing',
            search_gen_crossTableValue: 'gen_nothing',
            search_gen_crossTableMethod: 'sum'
        };

        // Add correct date filters based on actual GEN website behavior
        if (fromDate && toDate && fromDate === toDate) {
            // Single date: use 'qs' parameter only
            console.log(`📅 Single date query: ${fromDate}`);
            params.qs = fromDate;
        } else if (fromDate && toDate) {
            // Date range: use dead_line_from and dead_line_to WITHOUT qs parameter
            console.log(`📅 Date range: ${fromDate} to ${toDate}`);
            params.search_received_detail_dead_line_from = fromDate;
            params.search_received_detail_dead_line_to = toDate;
            // Note: No qs parameter for date ranges based on actual GEN website behavior
        } else if (fromDate) {
            // Only fromDate: use dead_line_from only
            console.log(`📅 From date: ${fromDate}`);
            params.search_received_detail_dead_line_from = fromDate;
        } else if (toDate) {
            // Only toDate: use dead_line_to only
            console.log(`📅 To date: ${toDate}`);
            params.search_received_detail_dead_line_to = toDate;
        }
        
        // Add offset and orderby after date filters
        params.offset = '0';
        params.search_orderby = 'received_detail_line_no:::false,received_number:::true,id:::false,received_detail_id:::false';
        params.displayPatternId = '';
        
        const urlParams = new URLSearchParams(params);

        const apiUrl = `https://sasaki-mfg.gen-cloud.jp/api/received/csv?${urlParams}`;
        console.log('🌐 API URL:', apiUrl);
        console.log('🔑 Using tokens:', { 
            phpsessid: tokens.phpsessid?.substring(0, 20) + '...', 
            csrfToken: tokens.csrfToken?.substring(0, 20) + '...' 
        });

        // Download CSV data with retry logic
        const downloadedCSV = await downloadCSVWithRetry(apiUrl, tokens, fromDate, toDate);

        // Send CSV data back to client as-is
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="gen_received_orders_${fromDate || 'all'}_to_${toDate || 'all'}.csv"`);
        res.send(downloadedCSV);

    } catch (error) {
        console.error('❌ Error during automated download:', error.message);
        
        let userFriendlyMessage = error.message;
        let instructions = 'Please try again or use manual mode.';
        
        if (error.message.includes('socket hang up')) {
            userFriendlyMessage = 'Automated login failed - browser automation blocked';
            instructions = 'MANUAL MODE STEPS:\n\n1. Open https://sasaki-mfg.gen-cloud.jp/login in a new tab\n2. Login with your credentials\n3. Go to any page (like Received Orders)\n4. Press F12 → Network tab\n5. Navigate or refresh the page\n6. Find any request and check headers:\n   - Copy Cookie: PHPSESSID=...\n   - Copy x-gen-csrf-token: ...\n7. Paste both values in Manual Mode below and try again';
        } else if (error.message.includes('session_error')) {
            userFriendlyMessage = 'Authentication tokens have expired';
            instructions = 'Your session has expired. Please get fresh tokens using Manual Mode below.';
        }
        
        res.status(500).json({ 
            error: userFriendlyMessage,
            instructions: instructions,
            technicalDetails: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'GEN CSV Download Server is running'
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
    });
});

// Start server
app.listen(port, () => {
    console.log('🌟 GEN CSV Download Server Started');
    console.log(`📡 Server running at: http://localhost:${port}`);
    console.log(`🌐 Open your browser to: http://localhost:${port}`);
    console.log('');
    console.log('📋 Features:');
    console.log('  • Automated token extraction with Puppeteer');
    console.log('  • Date range filtering');
    console.log('  • Worker filtering');
    console.log('  • Manual token input fallback');
    console.log('');
    console.log('🔧 Press Ctrl+C to stop the server');
});

module.exports = app;