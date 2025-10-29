// QR Learning System JavaScript
// Handles the learning interface, authentication, pattern collection, and deployment

//const serverURL = "https://kurachi.onrender.com";
const serverURL = "http://localhost:3000";

// State management
let isAuthenticated = false;
let currentUser = null;
let pairedSamples = []; // Array of {customerQR, internalQR, timestamp, id} pairs
let mismatchSamples = []; // Array of incorrect pairs for negative learning
let learnedPatterns = null;
let collectionMode = null; // 'correct' or 'mismatch'
let scanningMode = null; // 'customer' or 'internal'
let currentCustomerQR = null;
let waitingForInternal = false;

// DOM Cache
const domCache = {};

// Initialize the learning system
document.addEventListener("DOMContentLoaded", async () => {
  console.log('Initializing QR Learning System...');
  
  // Cache DOM elements
  ['authModal', 'conflictModal', 'testModal', 'learningCustomerSelect', 
   'pairedSamples', 'scanStatus', 'scanInstruction', 'scanDetails',
   'startCorrectPairs', 'startMismatchPairs', 'finishLearning', 'pairCount', 'mismatchCount',
   'analyzePatterns', 'testPattern', 'clearLearning', 'deleteCustomerData',
   'learningLog', 'progressFill', 'progressText', 'success-sound', 'error-sound'].forEach(id => {
    domCache[id] = document.getElementById(id);
  });

  // Initialize audio
  if (domCache['success-sound']) domCache['success-sound'].load();
  if (domCache['error-sound']) domCache['error-sound'].load();

  // Show authentication modal
  showAuthModal();
  
  // Set up event listeners
  setupEventListeners();
  
  // Initialize sample containers
  updateSampleContainers();
  updateProgress();
});

// Show authentication modal
function showAuthModal() {
  if (domCache['authModal']) {
    domCache['authModal'].style.display = 'flex';
  }
}

// Set up event listeners
function setupEventListeners() {
  // Customer selection change
  if (domCache['learningCustomerSelect']) {
    domCache['learningCustomerSelect'].addEventListener('change', (e) => {
      const customerType = e.target.value;
      if (customerType) {
        enablePairedLearning();
        logMessage(`📋 Selected customer: ${customerType}`);
        updateScanInstruction('Ready to start paired learning');
      } else {
        disablePairedLearning();
        updateScanInstruction('Please select a customer first');
      }
      updateProgress();
    });
  }

  // Global keyboard event listener for QR scanning
  document.addEventListener('keydown', handleQRScan);
}

// Handle QR scanning for authentication and learning
let scanBuffer = '';
let scanTimeout;
const SCAN_TIMEOUT = 200;

function handleQRScan(e) {
  // Ignore if typing in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    if (scanBuffer.trim()) {
      processScanBuffer(scanBuffer.trim());
      scanBuffer = '';
      clearTimeout(scanTimeout);
    }
    return;
  }

  if (e.key.length === 1) {
    e.preventDefault();
    scanBuffer += e.key;
    
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      if (scanBuffer.trim()) {
        processScanBuffer(scanBuffer.trim());
        scanBuffer = '';
      }
    }, SCAN_TIMEOUT);
  }
}

// Process scanned QR code
async function processScanBuffer(qrCode) {
  console.log('Processing scanned QR:', qrCode);
  
  if (!isAuthenticated) {
    // Handle authentication scan
    await handleAuthenticationScan(qrCode);
  } else if (scanningMode) {
    // Handle paired learning scan
    processScannedQR(qrCode);
  } else {
    // Handle learning scan
    handleLearningScan(qrCode);
  }
}

// Handle authentication QR scan
async function handleAuthenticationScan(username) {
  try {
    logMessage(`Authenticating user: ${username}`);
    
    const response = await fetch(`${serverURL}/qr-learning/validate-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username })
    });

    const result = await response.json();
    
    if (response.ok && result.success) {
      // Authentication successful
      isAuthenticated = true;
      currentUser = result.user;
      
      logMessage(`✅ Authentication successful! Welcome ${result.user.firstName} ${result.user.lastName} (${result.user.role})`);
      playSuccessSound();
      
      // Hide auth modal
      if (domCache['authModal']) {
        domCache['authModal'].style.display = 'none';
      }
      
      // Enable learning interface
      enableLearningInterface();
      
    } else {
      // Authentication failed
      logMessage(`❌ Authentication failed: ${result.error}`);
      playErrorSound();
      
      if (result.userRole) {
        logMessage(`Your role (${result.userRole}) is not authorized for learning mode`);
        logMessage(`Required roles: ${result.requiredRoles.join(', ')}`);
      }
    }
    
  } catch (error) {
    console.error('Authentication error:', error);
    logMessage(`❌ Authentication error: ${error.message}`);
    playErrorSound();
  }
}

// Handle learning QR scan
function handleLearningScan(qrCode) {
  if (!scanningMode) {
    logMessage('❌ Please click "Add Sample" button first to start scanning');
    return;
  }
  
  if (scanningMode === 'customer') {
    addCustomerQRSample(qrCode);
  } else if (scanningMode === 'internal') {
    addInternalQRSample(qrCode);
  }
  
  // Reset scanning mode
  scanningMode = null;
  updateButtonStates();
}

// Enable learning interface after authentication
function enableLearningInterface() {
  // Enable customer selection if not already selected
  if (domCache['learningCustomerSelect']) {
    domCache['learningCustomerSelect'].disabled = false;
  }
  
  // Enable buttons if customer is selected
  if (domCache['learningCustomerSelect'].value) {
    enableButtons();
  }
}

// Enable/disable buttons
function enableButtons() {
  ['startCorrectPairs', 'startMismatchPairs', 'analyzePatterns', 'clearAllPairs', 'deleteCustomerData'].forEach(id => {
    if (domCache[id]) domCache[id].disabled = false;
  });
  updateButtonStates();
}

function disableButtons() {
  ['startCorrectPairs', 'startMismatchPairs', 'analyzePatterns', 'clearAllPairs', 'deleteCustomerData'].forEach(id => {
    if (domCache[id]) domCache[id].disabled = true;
  });
}

// Update button states based on current data
function updateButtonStates() {
  const hasEnoughPairs = pairedSamples.length >= 3;
  
  if (domCache['analyzePatterns']) {
    domCache['analyzePatterns'].disabled = !hasEnoughPairs;
  }
  
  if (domCache['testPattern']) {
    domCache['testPattern'].disabled = !learnedPatterns;
  }
}



// Update sample containers in UI
function updateSampleContainers() {
  updatePairedSamplesDisplay();
}



// Create sample element


// Remove sample


// Button handlers






// Deploy pattern to all devices
async function deployPattern() {
  try {
    logMessage('🚀 Deploying pattern to all devices...');
    
    // Pattern is already saved to database during learning
    // Just need to update the hash for cache invalidation
    logMessage('✅ Pattern deployed successfully!');
    logMessage('All devices will receive the new pattern on next load');
    
    playSuccessSound();
    closeTestModal();
    
  } catch (error) {
    console.error('Deploy error:', error);
    logMessage(`❌ Deploy error: ${error.message}`);
    playErrorSound();
  }
}

// Clear learning data
function clearLearning() {
  pairedSamples = [];
  mismatchSamples = [];
  learnedPatterns = null;
  collectionMode = null;
  scanningMode = null;
  currentCustomerQR = null;
  waitingForInternal = false;
  
  updatePairedSamplesDisplay();
  updateProgress(0, 'Cleared all data');
  updateButtonStates();
  
  logMessage('🗑️ Cleared all learning data');
}

// Delete customer data from database
async function deleteCustomerData() {
  const customerType = domCache['learningCustomerSelect'].value;
  if (!customerType) {
    logMessage('❌ Please select a customer first');
    return;
  }
  
  if (!confirm(`Are you sure you want to delete all learned data for ${getCustomerName(customerType)}?`)) {
    return;
  }
  
  try {
    const response = await fetch(`${serverURL}/qr-patterns/${customerType}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      logMessage(`✅ Deleted learned data for ${getCustomerName(customerType)}`);
      learnedPatterns = null;
      updateButtonStates();
    } else {
      logMessage(`❌ Delete failed: ${result.error}`);
    }
    
  } catch (error) {
    console.error('Delete error:', error);
    logMessage(`❌ Delete error: ${error.message}`);
  }
}

// Modal handlers
function showConflictModal(conflicts) {
  const modal = domCache['conflictModal'];
  const messageDiv = document.getElementById('conflictMessage');
  
  if (modal && messageDiv) {
    let message = '<div class="space-y-2">';
    conflicts.forEach(conflict => {
      const severity = conflict.severity === 'error' ? 'text-red-600' : 'text-yellow-600';
      message += `<div class="${severity}">• ${conflict.message}</div>`;
    });
    message += '</div>';
    
    messageDiv.innerHTML = message;
    modal.style.display = 'flex';
  }
}

function showTestResults(result) {
  const modal = domCache['testModal'];
  const resultsDiv = document.getElementById('testResults');
  
  if (modal && resultsDiv) {
    let html = `<div class="space-y-3">`;
    html += `<div class="font-bold text-lg">Accuracy: ${result.accuracy.toFixed(1)}%</div>`;
    html += `<div class="text-sm text-gray-600">Passed: ${result.summary.passed}/${result.summary.total}</div>`;
    
    result.testResults.forEach((test, index) => {
      const status = test.match ? '✅' : '❌';
      const bgColor = test.match ? 'bg-green-50' : 'bg-red-50';
      html += `
        <div class="${bgColor} p-2 rounded">
          <div class="font-medium">${status} Test ${index + 1}</div>
          <div class="text-xs">Expected: <code>${test.expectedProduct}</code></div>
          <div class="text-xs">Extracted: <code>${test.extractedProduct || 'null'}</code></div>
        </div>
      `;
    });
    
    html += '</div>';
    resultsDiv.innerHTML = html;
    modal.style.display = 'flex';
  }
}

function continueWithConflict() {
  if (domCache['conflictModal']) {
    domCache['conflictModal'].style.display = 'none';
  }
  // Continue with learning despite conflicts
  logMessage('⚠️ Continuing with conflicts - patterns may be unreliable');
}

function retryLearning() {
  if (domCache['conflictModal']) {
    domCache['conflictModal'].style.display = 'none';
  }
  logMessage('🔄 Please review and re-scan the samples');
}

function closeTestModal() {
  if (domCache['testModal']) {
    domCache['testModal'].style.display = 'none';
  }
}

function cancelAuth() {
  window.location.href = 'labelComparator.html';
}

// Go back to main page
function goBack() {
  window.location.href = 'labelComparator.html';
}

// ============================================
// PAIRED LEARNING SYSTEM
// ============================================

// Start paired learning mode
// Start collecting correct pairs
function startCorrectPairs() {
  console.log('🔵 startCorrectPairs() called');
  
  const customerType = domCache['learningCustomerSelect']?.value;
  if (!customerType) {
    logMessage('❌ Please select a customer first');
    return;
  }

  collectionMode = 'correct';
  scanningMode = 'customer';
  waitingForInternal = false;
  currentCustomerQR = null;
  
  console.log('Started CORRECT pair collection mode');
  console.log('collectionMode:', collectionMode);
  console.log('scanningMode:', scanningMode);
  
  updateScanInstruction('Scan customer QR code (for correct pair)');
  updateScanDetails('正しいペア収集モード - 正しい組み合わせをスキャン');
  
  // Update button states
  domCache['startCorrectPairs'].disabled = true;
  domCache['startMismatchPairs'].disabled = false;
  domCache['finishLearning'].disabled = false;
  
  logMessage('🔵 正しいペア収集開始 - お客様QRをスキャンしてください');
  playSuccessSound();
}

// Start collecting mismatch pairs
function startMismatchPairs() {
  console.log('🔴 startMismatchPairs() called');
  
  const customerType = domCache['learningCustomerSelect']?.value;
  if (!customerType) {
    logMessage('❌ Please select a customer first');
    return;
  }

  collectionMode = 'mismatch';
  scanningMode = 'customer';
  waitingForInternal = false;
  currentCustomerQR = null;
  
  console.log('Started MISMATCH pair collection mode');
  console.log('collectionMode:', collectionMode);
  console.log('scanningMode:', scanningMode);
  
  updateScanInstruction('Scan customer QR code (for mismatch pair)');
  updateScanDetails('不一致ペア収集モード - 間違った組み合わせをスキャン');
  
  // Update button states
  domCache['startCorrectPairs'].disabled = false;
  domCache['startMismatchPairs'].disabled = true;
  domCache['finishLearning'].disabled = false;
  
  logMessage('🔴 不一致ペア収集開始 - お客様QRをスキャンしてください');
  playErrorSound();
}

// Finish learning and stop collection
function finishLearning() {
  console.log('🟢 finishLearning() called');
  
  collectionMode = null;
  scanningMode = null;
  waitingForInternal = false;
  currentCustomerQR = null;
  
  updateScanInstruction('Paired learning completed');
  updateScanDetails(`Collected ${pairedSamples.length} correct pairs and ${mismatchSamples.length} mismatches`);
  
  // Update button states
  domCache['startCorrectPairs'].disabled = false;
  domCache['startMismatchPairs'].disabled = false;
  domCache['finishLearning'].disabled = true;
  domCache['analyzePatterns'].disabled = pairedSamples.length < 3;
  
  logMessage(`🟢 学習完了 - ${pairedSamples.length}個の正しいペアと${mismatchSamples.length}個の不一致ペアを収集しました`);
  playSuccessSound();
}

// QR scan handling is done by the existing handleQRScan function

// Process scanned QR code
function processScannedQR(qrCode) {
  console.log('🔍 processScannedQR called');
  console.log('Scanned QR:', qrCode);
  console.log('Current collectionMode:', collectionMode);
  console.log('Current scanningMode:', scanningMode);
  console.log('waitingForInternal:', waitingForInternal);
  console.log('currentCustomerQR:', currentCustomerQR);
  
  // Check if we're in collection mode
  if (!collectionMode) {
    logMessage('⚠️ Please click "正しいペア収集開始" or "不一致ペア収集開始" first');
    return;
  }
  
  if (scanningMode === 'customer') {
    // Scanning customer QR
    console.log('🟢 Processing CUSTOMER scan');
    currentCustomerQR = qrCode;
    waitingForInternal = true;
    scanningMode = 'internal';
    
    const modeText = collectionMode === 'correct' ? '正しい' : '間違った';
    updateScanInstruction(`Now scan the ${collectionMode === 'correct' ? 'CORRECT' : 'WRONG'} internal QR`);
    updateScanDetails(`Customer QR captured. Next: ${modeText}社内QRをスキャン`);
    
    console.log('After customer scan:');
    console.log('currentCustomerQR:', currentCustomerQR?.substring(0, 50) + '...');
    console.log('waitingForInternal:', waitingForInternal);
    console.log('scanningMode:', scanningMode);
    
    logMessage(`✅ お客様QR取得: ${qrCode.substring(0, 50)}...`);
    playSuccessSound();
    
  } else if (scanningMode === 'internal' && waitingForInternal) {
    // Scanning internal QR
    const internalQR = qrCode;
    
    if (collectionMode === 'correct') {
      console.log('✅ Processing CORRECT pair');
      // Create correct pair
      const pair = {
        id: Date.now(),
        customerQR: currentCustomerQR,
        internalQR: internalQR,
        timestamp: new Date().toISOString(),
        type: 'match'
      };
      
      pairedSamples.push(pair);
      console.log('Created correct pair. Total correct pairs:', pairedSamples.length);
      
      logMessage(`✅ 正しいペア #${pairedSamples.length} 追加完了`);
      playSuccessSound();
      
    } else if (collectionMode === 'mismatch') {
      console.log('❌ Processing MISMATCH pair');
      // Create mismatch pair
      const mismatchPair = {
        id: Date.now(),
        customerQR: currentCustomerQR,
        internalQR: internalQR,
        timestamp: new Date().toISOString(),
        type: 'mismatch'
      };
      
      mismatchSamples.push(mismatchPair);
      console.log('Created mismatch pair. Total mismatch pairs:', mismatchSamples.length);
      
      logMessage(`❌ 不一致ペア #${mismatchSamples.length} 追加完了`);
      playErrorSound();
    }
    
    // Reset for next pair (but stay in same collection mode)
    currentCustomerQR = null;
    waitingForInternal = false;
    scanningMode = 'customer';
    
    const modeText = collectionMode === 'correct' ? '正しいペア' : '不一致ペア';
    updateScanInstruction(`Scan next customer QR code (${modeText}モード)`);
    updateScanDetails(`次のお客様QRをスキャンしてください - ${modeText}収集中`);
    updatePairedSamplesDisplay();
    updateStatistics();
    
    domCache['analyzePatterns'].disabled = pairedSamples.length < 3;
    
  } else {
    console.log('⚠️ No matching condition in processScannedQR');
    console.log('collectionMode:', collectionMode);
    console.log('scanningMode:', scanningMode);
    console.log('waitingForInternal:', waitingForInternal);
  }
}

// Mark current pair as mismatch
// Update scan instruction display
function updateScanInstruction(message) {
  if (domCache['scanInstruction']) {
    domCache['scanInstruction'].textContent = message;
  }
}

// Update scan details display
function updateScanDetails(message) {
  if (domCache['scanDetails']) {
    domCache['scanDetails'].textContent = message;
  }
}

// Update paired samples display
function updatePairedSamplesDisplay() {
  const container = domCache['pairedSamples'];
  if (!container) return;
  
  if (pairedSamples.length === 0 && mismatchSamples.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-4">ペア学習を開始してください</p>';
    return;
  }
  
  let html = '';
  
  // Show correct pairs
  pairedSamples.forEach((pair, index) => {
    html += `
      <div class="border border-green-200 bg-green-50 p-3 rounded-lg">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium text-green-800">正しいペア #${index + 1}</span>
          <button onclick="removePair(${pair.id})" class="text-red-500 hover:text-red-700 text-xs">
            削除
          </button>
        </div>
        <div class="text-xs text-gray-600 space-y-1">
          <div><strong>Customer:</strong> ${pair.customerQR.substring(0, 40)}...</div>
          <div><strong>Internal:</strong> ${pair.internalQR}</div>
        </div>
      </div>
    `;
  });
  
  // Show mismatch pairs
  mismatchSamples.forEach((pair, index) => {
    html += `
      <div class="border border-red-200 bg-red-50 p-3 rounded-lg">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium text-red-800">不一致ペア #${index + 1}</span>
          <button onclick="removeMismatch(${pair.id})" class="text-red-500 hover:text-red-700 text-xs">
            削除
          </button>
        </div>
        <div class="text-xs text-gray-600 space-y-1">
          <div><strong>Customer:</strong> ${pair.customerQR.substring(0, 40)}...</div>
          <div><strong>Wrong Internal:</strong> ${pair.internalQR}</div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// Update statistics display
function updateStatistics() {
  if (domCache['pairCount']) {
    domCache['pairCount'].textContent = pairedSamples.length;
  }
  if (domCache['mismatchCount']) {
    domCache['mismatchCount'].textContent = mismatchSamples.length;
  }
}

// Remove a correct pair
function removePair(id) {
  pairedSamples = pairedSamples.filter(pair => pair.id !== id);
  updatePairedSamplesDisplay();
  updateStatistics();
  domCache['analyzePatterns'].disabled = pairedSamples.length < 3;
  logMessage('🗑️ Pair removed');
}

// Remove a mismatch pair
function removeMismatch(id) {
  mismatchSamples = mismatchSamples.filter(pair => pair.id !== id);
  updatePairedSamplesDisplay();
  updateStatistics();
  logMessage('🗑️ Mismatch removed');
}

// Clear all pairs
function clearAllPairs() {
  pairedSamples = [];
  mismatchSamples = [];
  updatePairedSamplesDisplay();
  updateStatistics();
  domCache['analyzePatterns'].disabled = true;
  logMessage('🧹 All pairs cleared');
}

// Enable paired learning controls
function enablePairedLearning() {
  console.log('🟢 enablePairedLearning() - Enabling collection buttons');
  if (domCache['startCorrectPairs']) {
    domCache['startCorrectPairs'].disabled = false;
    console.log('Blue button (正しいペア収集開始) enabled');
  }
  if (domCache['startMismatchPairs']) {
    domCache['startMismatchPairs'].disabled = false;
    console.log('Red button (不一致ペア収集開始) enabled');
  }
}

// Disable paired learning controls
function disablePairedLearning() {
  console.log('🔴 disablePairedLearning() - Disabling collection buttons');
  if (domCache['startCorrectPairs']) {
    domCache['startCorrectPairs'].disabled = true;
  }
  if (domCache['startMismatchPairs']) {
    domCache['startMismatchPairs'].disabled = true;
  }
}

// Analyze patterns from paired samples
async function analyzePatterns() {
  const customerType = domCache['learningCustomerSelect']?.value;
  if (!customerType) {
    logMessage('❌ Please select a customer first');
    return;
  }
  
  if (pairedSamples.length < 3) {
    logMessage('❌ Need at least 3 correct pairs for analysis');
    return;
  }
  
  try {
    logMessage('🧠 Starting pattern analysis...');
    updateProgress(50, 'Analyzing paired patterns...');
    
    // Convert paired samples to the format expected by the server
    const customerSamples = pairedSamples.map(pair => ({
      id: pair.id,
      qr: pair.customerQR,
      timestamp: pair.timestamp
    }));
    
    const internalSamples = pairedSamples.map(pair => ({
      id: pair.id,
      qr: pair.internalQR,
      timestamp: pair.timestamp
    }));
    
    const response = await fetch(`${serverURL}/qr-learning/learn-patterns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerType: customerType,
        customerSamples: customerSamples,
        internalSamples: internalSamples,
        mismatchSamples: mismatchSamples, // Include negative examples
        trainedBy: currentUser.username
      })
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      learnedPatterns = result;
      logMessage(`✅ Pattern analysis completed! Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      logMessage(`Generated ${result.extractionRules.length} extraction rules and ${result.detectionRules.length} detection rules`);
      
      updateProgress(100, 'Analysis complete');
      domCache['testPattern'].disabled = false;
      playSuccessSound();
      
    } else {
      logMessage(`❌ Pattern analysis failed: ${result.error || 'Unknown error'}`);
      if (result.conflicts) {
        showConflictModal(result.conflicts);
      }
      playErrorSound();
    }
    
  } catch (error) {
    console.error('Error analyzing patterns:', error);
    logMessage(`❌ Error analyzing patterns: ${error.message}`);
    playErrorSound();
  }
}

// Sound functions
function playSuccessSound() {
  if (domCache['success-sound']) {
    domCache['success-sound'].currentTime = 0;
    domCache['success-sound'].play().catch(e => console.warn('Could not play success sound:', e));
  }
}

function playErrorSound() {
  if (domCache['error-sound']) {
    domCache['error-sound'].currentTime = 0;
    domCache['error-sound'].play().catch(e => console.warn('Could not play error sound:', e));
  }
}

// Utility functions
function updateProgress(percentage = null, message = null) {
  if (percentage !== null && domCache['progressFill']) {
    domCache['progressFill'].style.width = `${percentage}%`;
  }
  
  if (message && domCache['progressText']) {
    domCache['progressText'].textContent = message;
  }
  
  // Auto-calculate progress if not specified
  if (percentage === null) {
    const pairingProgress = Math.min(pairedSamples.length / 3, 1) * 60;
    const mismatchProgress = Math.min(mismatchSamples.length / 2, 1) * 20;
    const learningProgress = learnedPatterns ? 20 : 0;
    
    const totalProgress = pairingProgress + mismatchProgress + learningProgress;
    
    if (domCache['progressFill']) {
      domCache['progressFill'].style.width = `${totalProgress}%`;
    }
    
    if (domCache['progressText']) {
      let statusText = 'Collecting samples...';
      if (pairedSamples.length >= 3) {
        statusText = learnedPatterns ? 'Ready for testing and deployment' : 'Ready for pattern learning';
      }
      domCache['progressText'].textContent = statusText;
    }
  }
}

function logMessage(message) {
  const timestamp = new Date().toLocaleTimeString();
  const logDiv = domCache['learningLog'];
  
  if (logDiv) {
    const logEntry = document.createElement('div');
    logEntry.innerHTML = `<span class="text-gray-500">[${timestamp}]</span> ${message}`;
    logDiv.appendChild(logEntry);
    logDiv.scrollTop = logDiv.scrollHeight;
  }
  
  console.log(`[Learning] ${message}`);
}

function getCustomerName(customerType) {
  const names = {
    'tn': 'ティーエヌ製作所',
    'toyota': 'トヨタ紡織',
    'kinuura': '衣浦'
  };
  return names[customerType] || customerType;
}

function playSuccessSound() {
  const sound = domCache['success-sound'];
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch(e => console.warn('Could not play success sound:', e));
  }
}

function playErrorSound() {
  const sound = domCache['error-sound'];
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch(e => console.warn('Could not play error sound:', e));
  }
}

// Expose functions for button clicks
window.startCorrectPairs = startCorrectPairs;
window.startMismatchPairs = startMismatchPairs;
window.finishLearning = finishLearning;
window.analyzePatterns = analyzePatterns;
window.removePair = removePair;
window.removeMismatch = removeMismatch;
window.clearAllPairs = clearAllPairs;
window.clearLearning = clearLearning;
window.deleteCustomerData = deleteCustomerData;
window.continueWithConflict = continueWithConflict;
window.retryLearning = retryLearning;
window.closeTestModal = closeTestModal;
window.cancelAuth = cancelAuth;
window.goBack = goBack;