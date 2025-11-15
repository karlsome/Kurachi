const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";

// Enable debug mode for troubleshooting
const DEBUG_MODE = true;

// Debug logging function that only logs when debug mode is enabled
function debug(...args) {
  if (DEBUG_MODE) {
    console.debug(...args);
  }
}

// Cache for DOM elements
const domCache = {};

// Local storage keys
const STORAGE_KEYS = {
  PENDING_LOGS: 'labelComparator_pendingLogs',
  SCAN_LOG: 'labelComparator_scanLog',
  FORM_DATA: 'labelComparator_formData'
};

// Queue for pending database insertions
let pendingLogs = [];
let isOnline = navigator.onLine;

// Load pending logs from localStorage on startup
function loadPendingLogs() {
  const stored = localStorage.getItem(STORAGE_KEYS.PENDING_LOGS);
  if (stored) {
    try {
      pendingLogs = JSON.parse(stored);
    } catch (e) {
      console.error('Error loading pending logs:', e);
      pendingLogs = [];
    }
  }
}

// Save pending logs to localStorage
function savePendingLogs() {
  localStorage.setItem(STORAGE_KEYS.PENDING_LOGS, JSON.stringify(pendingLogs));
}

// Load scan log from localStorage
function loadScanLog() {
  const stored = localStorage.getItem(STORAGE_KEYS.SCAN_LOG);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Error loading scan log:', e);
      return [];
    }
  }
  return [];
}

// Optimized localStorage operations with debouncing
let saveOperationsTimer = null;
const pendingSaves = new Map();

// Non-blocking localStorage operations
function debouncedStorageSave(key, data, delay = 100) {
  pendingSaves.set(key, data);
  
  if (saveOperationsTimer) {
    clearTimeout(saveOperationsTimer);
  }
  
  saveOperationsTimer = setTimeout(() => {
    // Process all pending saves at once
    pendingSaves.forEach((value, storageKey) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch (e) {
        console.error(`Error saving to localStorage (${storageKey}):`, e);
      }
    });
    pendingSaves.clear();
  }, delay);
}

// Save scan log to localStorage - non-blocking
function saveScanLog(logs) {
  debouncedStorageSave(STORAGE_KEYS.SCAN_LOG, logs);
}

// Load form data from localStorage - with cache
let cachedFormData = null;
function loadFormData() {
  if (cachedFormData) return cachedFormData;
  
  const stored = localStorage.getItem(STORAGE_KEYS.FORM_DATA);
  if (stored) {
    try {
      cachedFormData = JSON.parse(stored);
      return cachedFormData;
    } catch (e) {
      console.error('Error loading form data:', e);
      return {};
    }
  }
  return {};
}

// Save form data to localStorage - non-blocking
function saveFormData(data) {
  cachedFormData = data; // Update cache
  debouncedStorageSave(STORAGE_KEYS.FORM_DATA, data);
}

// Insert log to database using /queries route with timeout
async function insertLogToDatabase(logData) {
  // Use AbortController for fetch timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
  
  try {
    console.time('mongodb-insert');
    const startTime = performance.now();
    
    const response = await fetch(`${serverURL}/queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dbName: "submittedDB",
        collectionName: "labelComparatorLogDB",
        insertData: [logData]
      }),
      signal: controller.signal
    });

    const result = await response.json();
    const duration = performance.now() - startTime;
    
    if (response.ok && result.insertedCount > 0) {
      console.log(`Log successfully inserted to database in ${duration.toFixed(0)}ms`);
      return true;
    } else {
      console.error(`Failed to insert log in ${duration.toFixed(0)}ms:`, result);
      return false;
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Database insertion timed out after 10s');
    } else {
      console.error('Error inserting log to database:', error);
    }
    return false;
  } finally {
    clearTimeout(timeoutId);
    console.timeEnd('mongodb-insert');
  }
}

// Process pending logs in the background with rate limiting
async function processPendingLogsBackground() {
  if (!isOnline || pendingLogs.length === 0) {
    uploadQueueProcessing = false;
    return;
  }

  console.log(`Processing ${pendingLogs.length} pending logs in background...`);
  
  // Record start time for rate limiting
  lastUploadTime = Date.now();
  
  // Sort by timestamp to maintain order
  pendingLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // Only process a small batch at a time to prevent long-running tasks
  // This way, if user starts scanning again, we won't block the main thread
  const MAX_BATCH_SIZE = 5;
  const currentBatch = pendingLogs.slice(0, MAX_BATCH_SIZE);
  const remainingLogs = pendingLogs.slice(MAX_BATCH_SIZE);
  const failedLogs = [];

  try {
    // Process current batch
    for (const log of currentBatch) {
      try {
        const success = await insertLogToDatabase(log);
        if (!success) {
          failedLogs.push(log);
        }
      } catch (error) {
        console.error('Error uploading log:', error);
        failedLogs.push(log);
      }
    }
    
    // Update pending logs with failed ones from this batch plus remaining ones
    pendingLogs = [...failedLogs, ...remainingLogs];
    savePendingLogs();
    
    // Report status
    if (failedLogs.length === 0) {
      console.log(`Successfully processed ${currentBatch.length} logs`);
    } else {
      console.log(`${failedLogs.length}/${currentBatch.length} logs failed to process`);
    }
  } catch (error) {
    console.error('Error in background processing:', error);
  } finally {
    // If we still have logs to process, schedule another batch
    if (pendingLogs.length > 0) {
      // Wait a bit before processing next batch to prevent overloading
      setTimeout(() => {
        processPendingLogsBackground();
      }, MIN_UPLOAD_INTERVAL);
    } else {
      uploadQueueProcessing = false;
      console.log('All logs processed');
    }
  }
}

// Legacy function for manual triggering
async function processPendingLogs() {
  if (uploadQueueProcessing) {
    console.log("Upload already in progress");
    return;
  }
  
  scheduleBackgroundUpload();
}

// Background upload queue management
let uploadQueueProcessing = false;
let lastUploadTime = 0;
const MIN_UPLOAD_INTERVAL = 2000; // At least 2 seconds between upload batches

// Add log entry (always saves locally first, then queues for background upload)
function addLogEntry(customerProduct, ourProduct, isMatch, customerQR, ourQR) {
  const timestamp = new Date().toISOString();
  const customerType = domCache['customerSelect'] ? domCache['customerSelect'].value : 'tn';
  
  const logData = {
    timestamp: timestamp,
    customer_type: customerType,
    品番_customer: customerProduct,
    品番_our: ourProduct,
    comparison_result: isMatch ? '一致' : '不一致',
    customer_qr: customerQR,
    our_qr: ourQR,
    is_match: isMatch,
    created_at: timestamp
  };

  // Always add to pending logs first (treat as offline by default)
  pendingLogs.push(logData);
  savePendingLogs();
  
  // Schedule background processing if online - with rate limiting
  if (isOnline && !uploadQueueProcessing) {
    const now = Date.now();
    const timeSinceLastUpload = now - lastUploadTime;
    
    // If we haven't uploaded recently, process the queue
    if (timeSinceLastUpload > MIN_UPLOAD_INTERVAL) {
      scheduleBackgroundUpload();
    }
  }
}

// Schedule background upload with low priority
function scheduleBackgroundUpload() {
  if (uploadQueueProcessing) return; // Already processing
  uploadQueueProcessing = true;
  
  // Use setTimeout with zero delay to push to end of event queue
  // This ensures UI operations complete first
  setTimeout(() => {
    processPendingLogsBackground();
  }, 0);
}

// Monitor network status
window.addEventListener('online', () => {
  isOnline = true;
  console.log('Network connection restored');
  
  // Schedule background upload with a slight delay to ensure connection is stable
  setTimeout(() => {
    if (pendingLogs.length > 0 && !uploadQueueProcessing) {
      console.log(`Scheduling upload of ${pendingLogs.length} pending logs after reconnection`);
      scheduleBackgroundUpload();
    }
  }, 1000);
});

window.addEventListener('offline', () => {
  isOnline = false;
  console.log('Network connection lost');
  
  // Set flag to false since uploads can't continue
  uploadQueueProcessing = false;
});

  // Pre-initialize DOM elements
document.addEventListener("DOMContentLoaded", () => {
  console.time('initialization');
  
  // Cache frequently used DOM elements
  ['logList', 'scanStatus', 'alert-sound', 'success-sound', 'welcomeModal', 'startButton', 
   'customerQR', 'ourQR', 'result', 'mismatchModal', 'customerSelect'].forEach(id => {
    domCache[id] = document.getElementById(id);
  });  // Reference cached elements - make sure they exist
  const logList = domCache['logList'];
  const welcomeModal = domCache['welcomeModal'];
  const startButton = domCache['startButton'];
  
  // Show welcome modal on page load (immediately)
  welcomeModal.style.display = 'flex';
  
  // Prepare audio elements for faster response
  if (domCache['alert-sound']) {
    domCache['alert-sound'].load();
  }
  if (domCache['success-sound']) {
    domCache['success-sound'].load();
  }
  
  // Handle customer selection change
  const customerSelect = domCache['customerSelect'];
  if (customerSelect) {
    customerSelect.addEventListener('change', () => {
      const formData = {
        customerQR: domCache['customerQR'] ? domCache['customerQR'].value : '',
        ourQR: domCache['ourQR'] ? domCache['ourQR'].value : '',
        customerType: customerSelect.value
      };
      saveFormData(formData);
      console.log('Customer type changed to:', customerSelect.value);
    });
  }

  // Handle start button click - optimized
  startButton.addEventListener('click', () => {
    console.time('start-button');
    
    // Hide welcome modal immediately
    welcomeModal.style.display = 'none';
    
    // Initialize audio with user interaction
    if (domCache['alert-sound']) {
      // Play a silent sound to initialize audio
      const audio = domCache['alert-sound'];
      audio.muted = true;
      audio.volume = 0;
      
      // Pre-load the sound
      audio.load();
      
      // Try to play it silently to initialize audio context
      audio.play().then(() => {
        console.log("Alert audio successfully initialized");
      }).catch(error => {
        console.error("Alert audio initialization error:", error);
      });
    }
    
    // Initialize success sound with user interaction
    if (domCache['success-sound']) {
      const successAudio = domCache['success-sound'];
      successAudio.muted = true;
      successAudio.volume = 0;
      
      // Pre-load the success sound
      successAudio.load();
      
      // Try to play it silently to initialize audio context
      successAudio.play().then(() => {
        console.log("Success audio successfully initialized");
      }).catch(error => {
        console.error("Success audio initialization error:", error);
      });
    }
    
    // Focus on scanning area
    document.body.focus();
    console.timeEnd('start-button');
  });
  
  // Initialize QR Pattern System
  setTimeout(async () => {
    try {
      await initQRPatternSystem(serverURL); // Pass the serverURL from labelComparator.js
      console.log('QR Pattern System initialized successfully');
      
      // Sync patterns for all customers on startup
      const customers = ['tn', 'toyota', 'kinuura'];
      for (const customer of customers) {
        try {
          await qrPatternSync.syncCustomerPattern(customer);
        } catch (error) {
          console.warn(`Failed to sync patterns for ${customer}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to initialize QR Pattern System:', error);
    }
  }, 500);

  // Non-critical initialization - defer to not block UI
  setTimeout(() => {
    // Load pending logs (background operation)
    loadPendingLogs();
    
    // Restore form data if exists
    const savedFormData = loadFormData();
    if (savedFormData.customerQR && domCache['customerQR']) {
      domCache['customerQR'].value = savedFormData.customerQR;
    }
    if (savedFormData.ourQR && domCache['ourQR']) {
      domCache['ourQR'].value = savedFormData.ourQR;
    }
    if (savedFormData.customerType && domCache['customerSelect']) {
      domCache['customerSelect'].value = savedFormData.customerType;
    }
    
    // Restore scan log in batches to prevent UI blocking
    const savedLogs = loadScanLog();
    
    if (savedLogs.length > 0) {
      // Create fragment for batch DOM update (more efficient)
      const fragment = document.createDocumentFragment();
      
      // Process logs in batches
      const processBatch = (startIdx, batchSize) => {
        const endIdx = Math.min(startIdx + batchSize, savedLogs.length);
        
        for (let i = startIdx; i < endIdx; i++) {
          const li = document.createElement("li");
          li.innerHTML = savedLogs[i];
          fragment.appendChild(li);
        }
        
        // If more batches remain, schedule next batch
        if (endIdx < savedLogs.length) {
          setTimeout(() => processBatch(endIdx, batchSize), 0);
        } else {
          // Final batch - append to DOM
          logList.appendChild(fragment);
        }
      };
      
      // Start batch processing (10 items per batch)
      processBatch(0, 10);
    }
    
    // Process any pending logs if online - low priority
    if (isOnline) {
      setTimeout(() => {
        processPendingLogs();
      }, 1000);
    }
    
    console.timeEnd('initialization');
  }, 0);
  
  // State for bluetooth scanner input
  let scanBuffer = "";
  let scanTimeout;
  const SCAN_TIMEOUT = 150; // ms - increased for better reliability with customer QR codes

  // Customer product extraction using learned patterns from cache
  async function extractCustomerProduct(qr) {
    console.log('Extracting customer product from:', qr);
    
    // If empty input, return null
    if (!qr) {
      console.log('Empty QR input');
      return null;
    }
    
    // Get selected customer type
    const customerType = domCache['customerSelect'] ? domCache['customerSelect'].value : 'tn';
    console.log('Selected customer type:', customerType);
    
    try {
      // Try to use learned patterns first
      if (qrPatternSync) {
        const pattern = await qrPatternSync.getCustomerPattern(customerType);
        if (pattern && pattern.extractionRules) {
          console.log('Using learned pattern for extraction');
          return extractWithLearnedPattern(qr, pattern.extractionRules);
        }
      }
      
      // Fallback to hardcoded logic for backward compatibility
      console.log('Falling back to hardcoded extraction logic');
      switch (customerType) {
        case 'tn':
          return extractTNProduct(qr);
        case 'toyota':
          return extractToyotaProduct(qr);
        case 'kinuura':
          return extractKinuuraProduct(qr);
        default:
          console.error('Unknown customer type:', customerType);
          return null;
      }
    } catch (e) {
      console.error('Error extracting customer product:', e);
      return null;
    }
  }

  // Extract product using learned patterns
  function extractWithLearnedPattern(qr, extractionRules) {
    console.log('Applying learned extraction rules:', extractionRules);
    
    for (const rule of extractionRules) {
      try {
        if (rule.type === 'regex') {
          const match = qr.match(new RegExp(rule.pattern));
          if (match && match[rule.captureGroup || 1]) {
            let result = match[rule.captureGroup || 1];
            
            // Apply formatting rules if specified
            if (rule.formatting) {
              result = applyFormatting(result, rule.formatting);
            }
            
            console.log('Extracted using regex rule:', result);
            return result;
          }
        } else if (rule.type === 'position') {
          // Position-based extraction
          const parts = qr.split(new RegExp(rule.delimiter || '\\s+'));
          if (parts.length > rule.partIndex && parts[rule.partIndex]) {
            let part = parts[rule.partIndex];
            
            if (rule.substring) {
              part = part.substring(rule.substring.start, rule.substring.end);
            }
            
            if (rule.formatting) {
              part = applyFormatting(part, rule.formatting);
            }
            
            console.log('Extracted using position rule:', part);
            return part;
          }
        }
      } catch (error) {
        console.error('Error applying extraction rule:', error, rule);
      }
    }
    
    console.log('No learned pattern matched');
    return null;
  }

  // Apply formatting rules to extracted text
  function applyFormatting(text, formatting) {
    let result = text;
    
    if (formatting.insert) {
      // Insert characters at specific positions
      for (const insert of formatting.insert) {
        result = result.substring(0, insert.position) + 
                insert.character + 
                result.substring(insert.position);
      }
    }
    
    if (formatting.prefix) {
      result = formatting.prefix + result;
    }
    
    if (formatting.suffix) {
      result = result + formatting.suffix;
    }
    
    return result;
  }

  // ティーエヌ製作所 format extraction
  function extractTNProduct(qr) {
    console.log('Extracting TN product from:', qr);
    
    // Specific customer format parsing:
    // Example: "2149657    460502B5B2C    0019GN5200253000202510010000150"
    
    // Step 1: Split by spaces to get the parts
    const parts = qr.trim().split(/\s+/);
    console.log(`Split QR into ${parts.length} parts:`, parts);
    
    // Step 2: Look for the part that starts with "0019"
    let raw = null;
    
    // First try the expected format: three parts with third part starting with "0019"
    if (parts.length === 3 && parts[2].startsWith('0019')) {
      console.log('Found standard 3-part format with 0019 in third part');
      raw = parts[2];
    } else {
      // If we don't have exactly 3 parts, look for any part that contains "0019"
      console.log('Searching for any part starting with 0019');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith('0019')) {
          console.log(`Found 0019 in part ${i+1}`);
          raw = parts[i];
          break;
        }
      }
    }
    
    // Step 3: If we found a part with "0019", extract the product code
    if (raw) {
      console.log('Processing raw customer data:', raw);
      
      // Format: 0019GN5200253000202510010000150
      // We want to extract "GN520-02530" from position 4 (after "0019")
      if (raw.length >= 14) { // Make sure it's long enough
        // Extract the product code after "0019"
        const productRaw = raw.substring(4, 14);  // Get GN52002530
        console.log('Raw product string:', productRaw);
        
        // Format it as GN520-02530
        let result;
        if (productRaw.startsWith('GN')) {
          // If it already starts with GN, use proper formatting
          const codeAfterGN = productRaw.substring(2);
          result = 'GN' + codeAfterGN.substring(0, 3) + '-' + codeAfterGN.substring(3, 8);
        } else {
          // Otherwise assume it's directly the product code
          result = productRaw.substring(0, 5) + '-' + productRaw.substring(5, 10);
        }
        
        console.log('Successfully extracted TN product:', result);
        return result;
      }
    }
    
    // If the standard format didn't work, try looking for GN anywhere in the string
    console.log('Trying alternative extraction method...');
    const gnMatch = qr.match(/GN([0-9]{3}[\-\/]?[0-9]{5})/);
    if (gnMatch && gnMatch[1]) {
      const formattedCode = 'GN' + gnMatch[1].replace(/[\-\/]/, '-');
      console.log('Extracted TN product via regex:', formattedCode);
      return formattedCode;
    }
    
    console.log('Failed to extract TN product');
    return null;
  }

  // トヨタ紡織 format extraction (placeholder - you'll need to provide the actual format)
  function extractToyotaProduct(qr) {
    console.log('Extracting Toyota product from:', qr);
    
    // TODO: Implement Toyota QR format extraction
    // For now, return null as placeholder
    console.log('Toyota QR format not implemented yet');
    return null;
  }

  // 衣浦 format extraction (placeholder - you'll need to provide the actual format)
  function extractKinuuraProduct(qr) {
    console.log('Extracting Kinuura product from:', qr);
    
    // TODO: Implement Kinuura QR format extraction
    // For now, return null as placeholder
    console.log('Kinuura QR format not implemented yet');
    return null;
  }

  function extractOurProduct(qr) {
    // Fast check before splitting
    const commaPos = qr.indexOf(',');
    if (commaPos === -1) return qr.trim();
    return qr.substring(0, commaPos).trim();
  }

  // QR type detection using learned patterns
  async function detectQRType(qrCode) {
    console.log(`QR Type detection for: ${qrCode}`);
    
    // Get selected customer type
    const customerType = domCache['customerSelect'] ? domCache['customerSelect'].value : 'tn';
    
    // First check if it's our company QR (internal QR)
    // Internal QR characteristics:
    // 1. Contains comma (product,quantity format)
    // 2. Has dashes in product code
    // 3. Relatively short (< 50 characters)
    // 4. Product code pattern: digits-alphanumeric-alphanumeric
    
    const hasComma = qrCode.includes(',');
    const hasDash = qrCode.includes('-') || qrCode.includes('/');
    const isShort = qrCode.length < 50;
    
    // Pattern for internal QR: NNNNN-AAAAAA-AA or GN###-##### format
    const internalPattern = /^[A-Z0-9]{4,6}[\-\/][A-Z0-9]{4,6}[\-\/]?[A-Z0-9]{0,4}/;
    
    if ((hasComma && hasDash) || (isShort && hasDash && internalPattern.test(qrCode))) {
      console.log('Detected internal QR by pattern');
      return 'our';
    }
    
    // Try to use learned patterns for customer QR detection
    if (qrPatternSync) {
      try {
        const pattern = await qrPatternSync.getCustomerPattern(customerType);
        if (pattern && pattern.detectionRules) {
          console.log('Using learned pattern for detection');
          const isCustomer = detectWithLearnedPattern(qrCode, pattern.detectionRules);
          if (isCustomer) {
            return 'customer';
          }
        }
      } catch (error) {
        console.error('Error using learned detection pattern:', error);
      }
    }
    
    // Fallback to hardcoded detection logic
    console.log('Falling back to hardcoded detection logic');
    switch (customerType) {
      case 'tn':
        return detectTNQR(qrCode);
      case 'toyota':
        return detectToyotaQR(qrCode);
      case 'kinuura':
        return detectKinuuraQR(qrCode);
      default:
        console.log('Unknown customer type:', customerType);
        return null;
    }
  }

  // Detect QR type using learned patterns
  function detectWithLearnedPattern(qrCode, detectionRules) {
    console.log('Applying learned detection rules:', detectionRules);
    
    for (const rule of detectionRules) {
      try {
        if (rule.type === 'regex') {
          const regex = new RegExp(rule.pattern);
          if (regex.test(qrCode)) {
            console.log('Matched detection rule:', rule);
            return true;
          }
        } else if (rule.type === 'contains') {
          if (qrCode.includes(rule.text)) {
            console.log('Matched contains rule:', rule.text);
            return true;
          }
        } else if (rule.type === 'length') {
          if (qrCode.length >= rule.min && qrCode.length <= rule.max) {
            console.log('Matched length rule:', rule);
            return true;
          }
        } else if (rule.type === 'structure') {
          const parts = qrCode.split(new RegExp(rule.delimiter || '\\s+'));
          if (parts.length === rule.partCount) {
            console.log('Matched structure rule:', rule);
            return true;
          }
        }
      } catch (error) {
        console.error('Error applying detection rule:', error, rule);
      }
    }
    
    return false;
  }

  // ティーエヌ製作所 QR detection
  function detectTNQR(qrCode) {
    // Check for customer QR with specific space-separated format (e.g., "2149657    460502B5B2C    0019GN5200253000202510010000150")
    const spaceParts = qrCode.split(/\s+/);
    if (spaceParts.length === 3) {
      console.log('Detected possible triple-part space-separated QR:', spaceParts);
      
      // Check if third part starts with the customer pattern
      if (spaceParts[2] && spaceParts[2].includes('0019GN')) {
        console.log('Confirmed TN customer QR with 0019GN pattern in third part');
        return 'customer';
      }
    }
    
    // If it's longer and more complex, it's likely a customer QR
    if (qrCode.length > 20 && /^[A-Z0-9\s]+$/.test(qrCode)) {
      console.log('Detected TN customer QR by length and character pattern');
      return 'customer';
    }
    
    return null;
  }

  // トヨタ紡織 QR detection (placeholder)
  function detectToyotaQR(qrCode) {
    console.log('Toyota QR detection not implemented yet');
    // TODO: Implement Toyota QR detection logic
    return null;
  }

  // 衣浦 QR detection (placeholder)
  function detectKinuuraQR(qrCode) {
    console.log('Kinuura QR detection not implemented yet');
    // TODO: Implement Kinuura QR detection logic
    return null;
  }

  function updateScanStatus(message, type = 'info') {
    if (domCache['scanStatus']) {
      domCache['scanStatus'].textContent = message;
      domCache['scanStatus'].className = `text-center text-sm font-medium ${
        type === 'success' ? 'text-green-600' : 
        type === 'error' ? 'text-red-600' : 'text-blue-600'
      }`;
    }
  }

  // Performance timing debug variables
  let lastScanTime = 0;
  let processingStartTime = 0;
  let lastScannedValues = []; // Store last few scanned values for debugging
  
  async function processScannedQR(qrCode) {
    // Start timing measurement
    processingStartTime = performance.now();
    console.log(`Processing QR (length: ${qrCode.length}) - Time since last scan: ${processingStartTime - lastScanTime}ms`);
    
    // Use cached DOM elements for better performance
    const customerQRField = domCache['customerQR'];
    const ourQRField = domCache['ourQR'];
    
    if (!customerQRField || !ourQRField) {
      console.error("DOM elements not found in cache");
      return;
    }
    
    // Get selected customer type for special case detection
    const customerType = domCache['customerSelect'] ? domCache['customerSelect'].value : 'tn';
    
    // Special case: Quick detection for known customer patterns
    let isCustomerQR = false;
    if (customerType === 'tn' && qrCode.includes('0019GN')) {
      isCustomerQR = true;
    }
    // Add more special cases for other customers when their formats are known
    
    if (isCustomerQR) {
      console.log(`Detected ${customerType} customer QR by pattern match`);
      customerQRField.value = qrCode;
      updateScanStatus("✅ お客様QRをスキャンしました", 'success');
      const endTime = performance.now();
      console.log(`Customer QR processed in ${endTime - processingStartTime}ms`);
      lastScanTime = endTime;
      
      // Save form data and check if comparison is possible
      const formData = {
        customerQR: customerQRField.value,
        ourQR: ourQRField.value,
        customerType: domCache['customerSelect'] ? domCache['customerSelect'].value : 'tn'
      };
      
      setTimeout(() => saveFormData(formData), 0);
      
      if (formData.ourQR) {
        compareQRs();
      }
      
      return;
    }
    
    // Standard detection
    const type = await detectQRType(qrCode);
    
    if (!type) {
      updateScanStatus("❌ 不明なQRフォーマットです", 'error');
      const endTime = performance.now();
      console.log(`Unknown QR processed in ${endTime - processingStartTime}ms`);
      lastScanTime = endTime;
      return;
    }

    // Update the appropriate field
    if (type === 'customer') {
      customerQRField.value = qrCode;
      updateScanStatus("✅ お客様QRをスキャンしました", 'success');
    } else {
      ourQRField.value = qrCode;
      updateScanStatus("✅ 社内QRをスキャンしました", 'success');
    }

      // Save form data (debounced by using local variables)
    const formData = {
      customerQR: customerQRField.value,
      ourQR: ourQRField.value,
      customerType: domCache['customerSelect'] ? domCache['customerSelect'].value : 'tn'
    };    // Defer non-critical operations
    setTimeout(() => {
      saveFormData(formData);
    }, 0);

    // Auto-compare if both fields are filled - without delay
    if (formData.customerQR && formData.ourQR) {
      compareQRs();
    }
    
    // Log timing
    const endTime = performance.now();
    console.log(`QR processed in ${endTime - processingStartTime}ms`);
    lastScanTime = endTime;
  }

  async function compareQRs() {
    const compareStartTime = performance.now();
    console.log("Starting QR comparison");
    
    // Use cached DOM elements
    const customerQR = domCache['customerQR'] ? domCache['customerQR'].value : '';
    const ourQR = domCache['ourQR'] ? domCache['ourQR'].value : '';
    const result = domCache['result'];
    
    if (!result) {
      console.error("Result DOM element not found in cache");
      return;
    }
    
    // Debug the input values
    console.debug('Customer QR for extraction:', customerQR);
    console.debug('Our QR for extraction:', ourQR);
    
    // Extract product codes (these functions are now optimized)
    const customerProduct = await extractCustomerProduct(customerQR);
    const ourProduct = extractOurProduct(ourQR);
    
    console.debug('Extracted customer product:', customerProduct);
    console.debug('Extracted our product:', ourProduct);
    console.log(`Extraction complete in ${performance.now() - compareStartTime}ms`);
    
    // Generate timestamp once for both UI and logging
    const timestamp = new Date().toLocaleString();

    if (!customerProduct || !ourProduct) {
      result.textContent = "❌ 製品番号の抽出に失敗しました";
      result.className = "mt-6 text-center text-lg font-semibold text-red-600";
      console.log(`Comparison failed in ${performance.now() - compareStartTime}ms - extraction error`);
      return;
    }

    // Simple string comparison
    const isMatch = customerProduct === ourProduct;
    console.log(`Match result (${isMatch}) determined in ${performance.now() - compareStartTime}ms`);

    // Update UI based on match result
    if (isMatch) {
      // Show match result
      result.textContent = "✅ 一致: " + customerProduct;
      result.className = "mt-6 text-center text-lg font-semibold text-green-600";
      
      // Play success sound to indicate match
      playSuccessSound();
      
      // Clear input fields immediately to prepare for next scan
      // But keep the result message and success sound
      if (domCache['customerQR']) domCache['customerQR'].value = "";
      if (domCache['ourQR']) domCache['ourQR'].value = "";
      
      // Clear saved form data immediately
      saveFormData({
        customerQR: "",
        ourQR: ""
      });
      
      // After a brief delay, clear the result message too
      setTimeout(() => {
        if (domCache['result']) domCache['result'].textContent = "";
        updateScanStatus("次のスキャンを待機中...");
      }, 1500);
      
    } else {
      result.textContent = `❌ 不一致 お客様: ${customerProduct} 社内: ${ourProduct}`;
      result.className = "mt-6 text-center text-lg font-semibold text-red-600";
      
      // Play alert sound and show visual warning immediately
      playAlertSound();
      document.body.classList.add('flash-red');
      showMismatchModal(customerProduct, ourProduct);
    }

    // Prepare log entry HTML once and reuse
    const logHtml = `<span class="text-gray-500">[${timestamp}]</span> 
                     お客様: <span class="font-medium">${customerProduct}</span>, 
                     社内: <span class="font-medium">${ourProduct}</span>, 
                     <span class="${isMatch ? 'text-green-600' : 'text-red-600'} font-semibold">
                       ${isMatch ? '一致' : '不一致'}
                     </span>`;
    
    // Update UI log immediately
    const li = document.createElement("li");
    li.innerHTML = logHtml;
    logList.prepend(li);
    
    // Defer ALL non-critical operations to after critical UI updates
    // Use requestIdleCallback if available for even lower priority, otherwise setTimeout
    const deferOperation = window.requestIdleCallback || 
      ((callback) => setTimeout(callback, 50)); // 50ms delay as fallback
    
    deferOperation(() => {
      console.time('background-logging');
      
      // Add log entry to database (completely background operation)
      addLogEntry(customerProduct, ourProduct, isMatch, customerQR, ourQR);
      
      // Save log to localStorage for persistence - with separate timing
      const localStorageStart = performance.now();
      const currentLogs = loadScanLog();
      currentLogs.unshift(logHtml);
      if (currentLogs.length > 50) currentLogs.splice(50);
      saveScanLog(currentLogs);
      
      console.log(`Local storage operations: ${performance.now() - localStorageStart}ms`);
      console.timeEnd('background-logging');
      console.log(`Total comparison process: ${performance.now() - compareStartTime}ms`);
    });
    
    console.log(`Comparison complete in ${performance.now() - compareStartTime}ms`);
  }
  
  // Play the alert sound - using cached element or fallback
  function playAlertSound() {
    // Use AudioSystem if available (handles online/offline automatically)
    if (window.AudioSystem) {
      window.AudioSystem.playError();
      return;
    }
    
    // Fallback to original method
    const alertSound = domCache['alert-sound'];
    if (alertSound) {
      // Unmute and play at full volume
      alertSound.muted = false;
      alertSound.volume = 0.3;
      alertSound.currentTime = 0; // Reset to start
      
      // Use promise with timeout to prevent hanging
      const playPromise = alertSound.play();
      if (playPromise) {
        playPromise.catch(error => {
          console.error("Failed to play alert sound:", error);
          // Try once more with user interaction already present
          setTimeout(() => alertSound.play().catch(e => console.error("Retry failed:", e)), 100);
        });
      }
    }
  }
  
  // Play the success sound when QR codes match
  function playSuccessSound() {
    // Use AudioSystem if available (handles online/offline automatically)
    if (window.AudioSystem) {
      window.AudioSystem.playSuccess();
      return;
    }
    
    // Fallback to original method
    const successSound = domCache['success-sound'];
    if (successSound) {
      // Unmute and play at full volume
      successSound.muted = false;
      successSound.volume = 1.0; // Increased to full volume to be more audible
      successSound.currentTime = 0; // Reset to start
      
      // Use promise with timeout to prevent hanging
      const playPromise = successSound.play();
      if (playPromise) {
        playPromise.catch(error => {
          console.error("Failed to play success sound:", error);
          // Try once more with user interaction already present
          setTimeout(() => successSound.play().catch(e => console.error("Retry failed:", e)), 100);
        });
      }
    }
  }
  
  // Show mismatch modal with product details - using cached elements
  function showMismatchModal(customerProduct, ourProduct) {
    const modal = domCache['mismatchModal'];
    if (!modal) {
      console.error("Mismatch modal not found in DOM cache");
      return;
    }
    
    // Get message element - don't use cache for this infrequently used element
    const message = document.getElementById('mismatchMessage');
    if (message) {
      message.innerHTML = `
        <div class="text-left">
          <div class="mb-2">お客様製品番号: <span class="font-bold">${customerProduct}</span></div>
          <div>社内製品番号: <span class="font-bold">${ourProduct}</span></div>
        </div>
      `;
    }
    
    modal.style.display = 'flex';
  }
  
  // Close mismatch modal and reset state - using cached elements
  window.closeMismatchModal = function() {
    const modal = domCache['mismatchModal'];
    const alertSound = domCache['alert-sound'];
    const successSound = domCache['success-sound'];
    
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('flash-red');
    
    // Stop all sounds
    if (alertSound) {
      alertSound.muted = true;
      alertSound.pause();
      alertSound.currentTime = 0;
    }
    
    if (successSound) {
      successSound.muted = true;
      successSound.pause();
      successSound.currentTime = 0;
    }
    
    clearFields();
  }
  
  // Handle ESC key to close modals
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const mismatchModal = document.getElementById('mismatchModal');
      if (mismatchModal.style.display === 'flex') {
        closeMismatchModal();
      }
    }
  });

  function clearFields() {
    // Use cached DOM elements for better performance
    if (domCache['customerQR']) domCache['customerQR'].value = "";
    if (domCache['ourQR']) domCache['ourQR'].value = "";
    if (domCache['result']) domCache['result'].textContent = "";
    
    // Reset visual alerts if any
    document.body.classList.remove('flash-red');
    
    // Stop any playing sounds
    if (domCache['alert-sound']) {
      domCache['alert-sound'].pause();
      domCache['alert-sound'].currentTime = 0;
      domCache['alert-sound'].muted = true;
    }
    
    if (domCache['success-sound']) {
      domCache['success-sound'].pause();
      domCache['success-sound'].currentTime = 0;
      domCache['success-sound'].muted = true;
    }
    
    // Clear saved form data - use deferred saving for better performance
    setTimeout(() => {
      saveFormData({
        customerQR: "",
        ourQR: "",
        customerType: domCache['customerSelect'] ? domCache['customerSelect'].value : 'tn'
      });
    }, 0);
    
    updateScanStatus("次のスキャンを待機中...");
  }

  // Optimized global keyboard event listener for bluetooth scanner
  let lastKeyTime = 0;
  const MAX_SCAN_GAP = 30; // ms between keystrokes for fast scanner (increased slightly)
  let spaceCount = 0; // Track spaces for detecting multi-part QR codes
  
  document.addEventListener('keydown', (e) => {
    const now = performance.now();
    
    // Ignore if user is typing in an input field manually
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    // Handle Enter key (end of scan) immediately for better responsiveness
    if (e.key === 'Enter') {
      e.preventDefault();
      if (scanBuffer.trim()) {
        // If the buffer has content, process immediately
        console.log('Scan complete with ENTER key, buffer:', scanBuffer);
        processScannedQR(scanBuffer.trim());
        scanBuffer = "";
        spaceCount = 0;
        clearTimeout(scanTimeout); // Clear any pending timeouts
      }
      return;
    }

    // Add character to buffer if it's printable
    if (e.key.length === 1) {
      e.preventDefault();
      
      // Check if this is the first character or part of rapid sequence
      const keyGap = now - lastKeyTime;
      
      // If it's been a while since the last keystroke, this might be a new scan
      // Clear buffer if it's likely a new scan starting
      if (keyGap > 1000 && scanBuffer.length > 0) {
        console.log(`Clearing stale scan buffer (${keyGap}ms gap)`);
        scanBuffer = "";
        spaceCount = 0;
      }
      
      // Track spaces to detect multi-part QR codes (like customer format with 2 spaces)
      if (e.key === ' ') {
        spaceCount++;
        console.log(`Space detected (${spaceCount} spaces so far)`);
      }
      
      // Add character to buffer
      scanBuffer += e.key;
      lastKeyTime = now;
      
      // Customer QR codes can be quite long, but we need to make sure we catch them
      // Log buffer status periodically for debugging
      if (scanBuffer.length % 10 === 0) {
        console.log(`Scan buffer length: ${scanBuffer.length}`);
      }
      
      // For the specific customer QR format with 2 spaces, we can detect completion
      // based on pattern: "numbers    alphanumeric    0019GN..."
      if (spaceCount === 2 && scanBuffer.includes('0019GN')) {
        console.log('Customer QR pattern detected, processing immediately');
        // Give a little time for the last characters to arrive
        clearTimeout(scanTimeout);
        scanTimeout = setTimeout(() => {
          console.log('Processing detected customer QR:', scanBuffer);
          processScannedQR(scanBuffer.trim());
          scanBuffer = "";
          spaceCount = 0;
        }, 50); // Short timeout to ensure complete scan
        return;
      }
      
      // Set a timeout to process the QR code after a short delay
      clearTimeout(scanTimeout);
      
      // Set a shorter timeout if keystrokes are coming rapidly (scanner-like)
      // For customer QRs which are longer, we need a slightly longer timeout
      const timeoutDuration = keyGap < MAX_SCAN_GAP ? 150 : SCAN_TIMEOUT; // Increased from 100ms to 150ms
      
      scanTimeout = setTimeout(() => {
        if (scanBuffer.trim()) {
          console.log('Scan timeout triggered, buffer:', scanBuffer);
          processScannedQR(scanBuffer.trim());
          scanBuffer = "";
          spaceCount = 0;
        }
      }, timeoutDuration);
    }
  });

  // Initialize
  updateScanStatus("スキャン待機中...");

  // Show pending logs count if any
  if (pendingLogs.length > 0) {
    console.log(`${pendingLogs.length} logs pending upload`);
  }

  // Periodic retry for pending logs (less frequent - every 60 seconds)
  setInterval(() => {
    if (isOnline && pendingLogs.length > 0 && !uploadQueueProcessing) {
      console.log(`Periodic upload check: ${pendingLogs.length} logs pending`);
      
      // Throttle background uploads based on queue size
      const now = Date.now();
      const timeSinceLastUpload = now - lastUploadTime;
      
      // More aggressive upload schedule based on pending logs size
      const uploadInterval = pendingLogs.length > 50 ? 10000 : 
                            pendingLogs.length > 20 ? 20000 : 
                            MIN_UPLOAD_INTERVAL;
      
      if (timeSinceLastUpload > uploadInterval) {
        scheduleBackgroundUpload();
      }
    }
  }, 60000);

  // Learning mode functionality
  window.openLearningMode = function() {
    window.location.href = 'qrLearning.html';
  };

  // Expose functions for manual button click and debugging
  window.compareQRs = compareQRs;
  window.clearFields = clearFields;
  window.processPendingLogs = processPendingLogs;
  window.getPendingLogsCount = () => pendingLogs.length;
  
  // Add debugging function for upload status
  window.getUploadStatus = () => {
    return {
      isOnline: isOnline,
      pendingCount: pendingLogs.length,
      isUploading: uploadQueueProcessing,
      lastUploadTime: lastUploadTime ? new Date(lastUploadTime).toLocaleTimeString() : 'never',
      timeUntilNextUpload: lastUploadTime ? 
        Math.max(0, MIN_UPLOAD_INTERVAL - (Date.now() - lastUploadTime)) + 'ms' : 
        'ready'
    };
  };
});
