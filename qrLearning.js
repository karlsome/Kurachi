// QR Learning System JavaScript
// Handles the learning interface, authentication, pattern collection, and deployment

const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";

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

// Customer management
let availableCustomers = []; // Will be loaded dynamically from database
let isLoadingCustomers = false;

// DOM Cache
const domCache = {};

// Initialize the learning system
document.addEventListener("DOMContentLoaded", async () => {
  console.log('Initializing QR Learning System...');
  
  // Cache DOM elements
  ['authModal', 'conflictModal', 'testModal', 'addCustomerModal', 'editCustomerModal', 'learningCustomerSelect', 
   'pairedSamples', 'scanStatus', 'scanInstruction', 'scanDetails',
   'startCorrectPairs', 'startMismatchPairs', 'finishLearning', 'pairCount', 'mismatchCount',
   'analyzePatterns', 'testPattern', 'clearLearning', 'deleteCustomerData',
   'learningLog', 'progressFill', 'progressText', 'success-sound', 'error-sound',
   'customerLoadingStatus', 'newCustomerName', 'newCustomerAddress', 'previewCustomerCode',
   'editCustomerCode', 'editCustomerName', 'editCustomerAddress'].forEach(id => {
    domCache[id] = document.getElementById(id);
  });

  // Initialize audio
  if (domCache['success-sound']) domCache['success-sound'].load();
  if (domCache['error-sound']) domCache['error-sound'].load();

  // Show authentication modal
  showAuthModal();
  
  // Load customers from database
  await loadCustomersFromDatabase();
  
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
      const selectedValue = e.target.value;
      
      if (selectedValue === '__ADD_NEW__') {
        // Show add customer modal
        showAddCustomerModal();
        // Reset selection to empty
        e.target.value = '';
        return;
      }
      
      if (selectedValue) {
        enablePairedLearning();
        const customer = availableCustomers.find(c => c.customerCode === selectedValue);
        const displayName = customer ? customer.displayName : selectedValue;
        logMessage(`📋 Selected customer: ${displayName} (${selectedValue})`);
        updateScanInstruction('Ready to start paired learning');
        // Enable test button when customer is selected
        if (domCache['testPattern']) {
          domCache['testPattern'].disabled = false;
        }
      } else {
        disablePairedLearning();
        updateScanInstruction('Please select a customer first');
        // Disable test button when no customer selected
        if (domCache['testPattern']) {
          domCache['testPattern'].disabled = true;
        }
      }
      updateProgress();
    });
  }

  // Real-time customer code preview
  if (domCache['newCustomerName']) {
    domCache['newCustomerName'].addEventListener('input', (e) => {
      const customerName = e.target.value;
      const previewCode = generateCustomerCodePreview(customerName);
      if (domCache['previewCustomerCode']) {
        domCache['previewCustomerCode'].textContent = previewCode || '---';
      }
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
  } else if (testMode) {
    // Handle test mode scan
    await processTestScan(qrCode);
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
  
  // Test button is always enabled when customer is selected
  // It will check MongoDB for existing patterns
  const customerSelected = domCache['learningCustomerSelect']?.value;
  if (domCache['testPattern']) {
    domCache['testPattern'].disabled = !customerSelected;
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

async function deployPattern() {
  const customerType = domCache['learningCustomerSelect']?.value;
  if (!customerType) {
    alert('お客様を選択してください');
    return;
  }

  if (!currentUser) {
    alert('認証エラー: ユーザー情報がありません');
    return;
  }

  const confirmed = confirm(
    `${customerType.toUpperCase()} のパターンを全デバイスに配信しますか？\n\n` +
    `配信後、全てのタブレットでこのパターンを使用できるようになります。`
  );
  
  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`${serverURL}/qr-learning/deploy-pattern`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        customerType,
        deployedBy: currentUser.username
      })
    });

    const result = await response.json();
    
    if (result.success) {
      logMessage(`✅ パターン配信完了: ${customerType.toUpperCase()}`);
      logMessage(`📡 新しいハッシュ: ${result.hash}`);
      logMessage(`👤 配信者: ${currentUser.username}`);
      alert(`✅ パターンを全デバイスに配信しました！\n\nハッシュ: ${result.hash}\n配信者: ${currentUser.username}\n\n全てのタブレットで使用可能になりました。`);
      closeTestModal();
    } else {
      alert(`❌ 配信エラー: ${result.message}`);
      logMessage(`❌ Deploy error: ${result.message}`);
    }
  } catch (error) {
    console.error('Deploy error:', error);
    alert('❌ 配信中にエラーが発生しました');
    logMessage(`❌ Deploy failed: ${error.message}`);
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
// CUSTOMER MANAGEMENT SYSTEM
// ============================================

// Load customers from database
async function loadCustomersFromDatabase() {
  if (isLoadingCustomers) return;
  
  isLoadingCustomers = true;
  updateCustomerLoadingStatus('お客様リストを読み込み中...');
  
  try {
    const response = await fetch(`${serverURL}/api/labelComparator/customers`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      availableCustomers = result.customers;
      populateCustomerDropdown();
      updateCustomerLoadingStatus(`${availableCustomers.length}件のお客様が見つかりました`);
      logMessage(`✅ Loaded ${availableCustomers.length} customers from database`);
    } else {
      throw new Error(result.error || 'Failed to load customers');
    }
    
  } catch (error) {
    console.error('Error loading customers:', error);
    updateCustomerLoadingStatus('❌ お客様リストの読み込みに失敗しました');
    logMessage(`❌ Failed to load customers: ${error.message}`);
    
    // Fallback to hardcoded customers for backward compatibility
    logMessage('🔄 Falling back to hardcoded customers...');
    availableCustomers = [
      { customerCode: 'tn', displayName: 'ティーエヌ製作所', address: '' },
      { customerCode: 'toyota', displayName: 'トヨタ紡織', address: '' },
      { customerCode: 'kinuura', displayName: '衣浦', address: '' }
    ];
    populateCustomerDropdown();
    updateCustomerLoadingStatus('デフォルトお客様を使用中');
  } finally {
    isLoadingCustomers = false;
  }
}

// Populate customer dropdown with loaded customers
function populateCustomerDropdown() {
  const select = domCache['learningCustomerSelect'];
  if (!select) return;
  
  // Clear existing options except the first two
  const optionsToKeep = Array.from(select.options).slice(0, 2); // Keep "選択してください" and "新しいお客様を追加"
  select.innerHTML = '';
  
  // Re-add the kept options
  optionsToKeep.forEach(option => select.appendChild(option));
  
  // Add customers from database
  availableCustomers.forEach(customer => {
    const option = document.createElement('option');
    option.value = customer.customerCode;
    option.textContent = `${customer.displayName}`;
    if (customer.address) {
      option.textContent += ` (${customer.address})`;
    }
    select.appendChild(option);
  });
  
  console.log(`Populated dropdown with ${availableCustomers.length} customers`);
}

// Update customer loading status message
function updateCustomerLoadingStatus(message) {
  if (domCache['customerLoadingStatus']) {
    domCache['customerLoadingStatus'].textContent = message;
  }
}

// Refresh customers from database
async function refreshCustomers() {
  logMessage('🔄 Refreshing customer list...');
  await loadCustomersFromDatabase();
}

// Show add customer modal
function showAddCustomerModal() {
  if (domCache['addCustomerModal']) {
    domCache['addCustomerModal'].style.display = 'flex';
    
    // Clear form fields
    if (domCache['newCustomerName']) domCache['newCustomerName'].value = '';
    if (domCache['newCustomerAddress']) domCache['newCustomerAddress'].value = '';
    if (domCache['previewCustomerCode']) domCache['previewCustomerCode'].textContent = '---';
    
    // Focus on name field
    setTimeout(() => {
      if (domCache['newCustomerName']) domCache['newCustomerName'].focus();
    }, 100);
  }
}

// Close add customer modal
function closeAddCustomerModal() {
  if (domCache['addCustomerModal']) {
    domCache['addCustomerModal'].style.display = 'none';
  }
}

// Generate customer code preview (same logic as backend)
function generateCustomerCodePreview(displayName) {
  if (!displayName || displayName.trim() === '') return '';
  
  // Remove common suffixes and clean the name
  let cleanName = displayName
    .replace(/株式会社|会社|製作所|工業|産業|紡織/g, '')
    .trim();
  
  // Convert to romaji/english approximation
  const conversionMap = {
    'ティーエヌ': 'tn',
    'トヨタ': 'toyota', 
    '衣浦': 'kinuura',
    'アイシン': 'aisin',
    'デンソー': 'denso',
    'マツダ': 'mazda',
    'スバル': 'subaru',
    'ホンダ': 'honda',
    'ニッサン': 'nissan',
    '日産': 'nissan',
    'スズキ': 'suzuki',
    'ダイハツ': 'daihatsu',
    'イスズ': 'isuzu',
    'ミツビシ': 'mitsubishi',
    '三菱': 'mitsubishi'
  };
  
  // Check for direct matches first
  for (const [japanese, romaji] of Object.entries(conversionMap)) {
    if (cleanName.includes(japanese)) {
      return romaji;
    }
  }
  
  // If no direct match, create code from first few characters
  let code = cleanName
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, '')
    .toLowerCase();
  
  // Take first 6 characters or less
  code = code.substring(0, 6);
  
  // If still empty or too short, generate from hash
  if (code.length < 2) {
    code = 'cust' + Math.random().toString(36).substr(2, 4);
  }
  
  return code;
}

// Save new customer to database
async function saveNewCustomer() {
  const customerName = domCache['newCustomerName']?.value?.trim();
  const customerAddress = domCache['newCustomerAddress']?.value?.trim();
  
  if (!customerName) {
    alert('お客様名を入力してください');
    return;
  }
  
  if (!currentUser) {
    alert('認証エラー: ユーザー情報がありません');
    return;
  }
  
  try {
    logMessage('💾 Saving new customer to database...');
    
    const response = await fetch(`${serverURL}/api/labelComparator/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: customerName,
        address: customerAddress || '',
        createdBy: currentUser.username
      })
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      const newCustomer = result.customer;
      
      // Add to local array
      availableCustomers.push(newCustomer);
      
      // Update dropdown
      populateCustomerDropdown();
      
      // Select the new customer
      if (domCache['learningCustomerSelect']) {
        domCache['learningCustomerSelect'].value = newCustomer.customerCode;
        
        // Trigger change event to enable learning controls
        const changeEvent = new Event('change');
        domCache['learningCustomerSelect'].dispatchEvent(changeEvent);
      }
      
      // Close modal
      closeAddCustomerModal();
      
      // Success messages
      logMessage(`✅ Customer added successfully: ${newCustomer.displayName} (${newCustomer.customerCode})`);
      alert(`✅ お客様「${newCustomer.displayName}」を追加しました！\n\n` +
            `お客様コード: ${newCustomer.customerCode}\n\n` +
            `学習モードを開始できます。`);
      
    } else {
      throw new Error(result.error || 'Failed to save customer');
    }
    
  } catch (error) {
    console.error('Error saving customer:', error);
    logMessage(`❌ Failed to save customer: ${error.message}`);
    alert(`❌ お客様の保存に失敗しました: ${error.message}`);
  }
}

// ============================================
// EDIT CUSTOMER FUNCTIONS
// ============================================

// Open edit modal for selected customer
function editSelectedCustomer() {
  const select = domCache['learningCustomerSelect'];
  if (!select) return;
  
  const selectedCode = select.value;
  
  // Validate selection
  if (!selectedCode || selectedCode === '' || selectedCode === '__ADD_NEW__') {
    alert('⚠️ 編集するお客様を選択してください。');
    return;
  }
  
  // Find the customer in the array
  const customer = availableCustomers.find(c => c.customerCode === selectedCode);
  
  if (!customer) {
    alert('❌ お客様情報が見つかりません。');
    return;
  }
  
  // Populate edit form
  if (domCache['editCustomerCode']) {
    domCache['editCustomerCode'].value = customer.customerCode;
  }
  if (domCache['editCustomerName']) {
    domCache['editCustomerName'].value = customer.displayName;
  }
  if (domCache['editCustomerAddress']) {
    domCache['editCustomerAddress'].value = customer.address || '';
  }
  
  // Show modal
  if (domCache['editCustomerModal']) {
    domCache['editCustomerModal'].style.display = 'flex';
    
    // Focus on name field
    setTimeout(() => {
      if (domCache['editCustomerName']) {
        domCache['editCustomerName'].focus();
        domCache['editCustomerName'].select();
      }
    }, 100);
  }
}

// Close edit customer modal
function closeEditCustomerModal() {
  if (domCache['editCustomerModal']) {
    domCache['editCustomerModal'].style.display = 'none';
  }
}

// Save edited customer
async function saveEditedCustomer() {
  const customerCode = domCache['editCustomerCode']?.value;
  const displayName = domCache['editCustomerName']?.value?.trim();
  const address = domCache['editCustomerAddress']?.value?.trim();
  
  // Validation
  if (!customerCode) {
    alert('❌ お客様コードが見つかりません。');
    return;
  }
  
  if (!displayName) {
    alert('⚠️ お客様名を入力してください。');
    if (domCache['editCustomerName']) domCache['editCustomerName'].focus();
    return;
  }
  
  // Confirm with user
  const confirmMessage = `以下の内容でお客様情報を更新しますか？\n\n` +
                        `お客様コード: ${customerCode}\n` +
                        `お客様名: ${displayName}\n` +
                        `住所: ${address || '(なし)'}`;
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  try {
    logMessage(`📝 Updating customer: ${customerCode}...`);
    
    const response = await fetch(`${serverURL}/api/labelComparator/customers/${customerCode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName,
        address,
        updatedBy: currentUser
      })
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      logMessage(`✅ Customer updated: ${displayName}`);
      
      // Update local array
      const customer = availableCustomers.find(c => c.customerCode === customerCode);
      if (customer) {
        customer.displayName = displayName;
        customer.address = address;
      }
      
      // Refresh dropdown to show updated info
      populateCustomerDropdown();
      
      // Re-select the customer
      if (domCache['learningCustomerSelect']) {
        domCache['learningCustomerSelect'].value = customerCode;
      }
      
      // Close modal
      closeEditCustomerModal();
      
      // Success message
      alert(`✅ お客様「${displayName}」の情報を更新しました！`);
      
    } else {
      throw new Error(result.error || 'Failed to update customer');
    }
    
  } catch (error) {
    console.error('Error updating customer:', error);
    logMessage(`❌ Failed to update customer: ${error.message}`);
    alert(`❌ お客様情報の更新に失敗しました: ${error.message}`);
  }
}

// Make functions globally available
window.refreshCustomers = refreshCustomers;
window.showAddCustomerModal = showAddCustomerModal;
window.closeAddCustomerModal = closeAddCustomerModal;
window.saveNewCustomer = saveNewCustomer;
window.editSelectedCustomer = editSelectedCustomer;
window.closeEditCustomerModal = closeEditCustomerModal;
window.saveEditedCustomer = saveEditedCustomer;

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
  
  // Check if in test mode
  if (testMode) {
    stopTestMode();
    return;
  }
  
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

// Test learned patterns by scanning customer→internal pairs
let testMode = false;
let testCustomerQR = null;
let testResults = [];

async function testPattern() {
  console.log('🧪 testPattern() called');
  
  const customerType = domCache['learningCustomerSelect']?.value;
  if (!customerType) {
    alert('❌ お客様を選択してください');
    logMessage('❌ Please select a customer first');
    return;
  }
  
  // Check if pattern exists in MongoDB
  try {
    const response = await fetch(`${serverURL}/qr-learning/check-pattern/${customerType}`);
    const result = await response.json();
    
    if (!result.exists) {
      alert(`❌ ${customerType.toUpperCase()} の学習データが見つかりません\n\n先にパターン解析を実行してください。`);
      logMessage(`❌ No pattern found for ${customerType} in database`);
      return;
    }
    
    logMessage(`✅ Found pattern in database for ${customerType} (status: ${result.status})`);
    
  } catch (error) {
    console.error('Error checking pattern:', error);
    alert('❌ パターン確認エラー');
    return;
  }
  
  // Enter test mode
  testMode = true;
  testCustomerQR = null;
  testResults = [];
  collectionMode = null;
  scanningMode = 'customer';
  
  updateScanInstruction('🧪 Test Mode: Scan customer QR code');
  updateScanDetails('テストモード - お客様QRをスキャンしてください');
  
  // Disable collection buttons, enable stop test
  domCache['startCorrectPairs'].disabled = true;
  domCache['startMismatchPairs'].disabled = true;
  domCache['testPattern'].disabled = true;
  domCache['finishLearning'].disabled = false; // Use as "Stop Test"
  
  logMessage('🧪 テストモード開始 - お客様QRをスキャンしてください');
  playSuccessSound();
}

// Process QR in test mode
async function processTestScan(qrCode) {
  console.log('🧪 processTestScan called');
  console.log('Test scanningMode:', scanningMode);
  console.log('testCustomerQR:', testCustomerQR);
  console.log('Scanned QR:', qrCode.substring(0, 100));
  
  if (scanningMode === 'customer') {
    // First scan: Customer QR
    testCustomerQR = qrCode;
    scanningMode = 'internal';
    
    updateScanInstruction('🧪 Now scan the internal QR to verify');
    updateScanDetails(`お客様QR取得 - 対応する社内QRをスキャン`);
    
    logMessage(`✅ お客様QR取得: ${qrCode.substring(0, 50)}...`);
    playSuccessSound();
    
  } else if (scanningMode === 'internal') {
    // Second scan: Internal QR - validate the pair
    const internalQR = qrCode;
    const customerType = domCache['learningCustomerSelect']?.value;
    
    console.log('📤 Sending to server for extraction:');
    console.log('  Customer QR:', testCustomerQR);
    console.log('  Customer Type:', customerType);
    
    try {
      // Call server to extract product from customer QR
      const response = await fetch(`${serverURL}/qr-learning/extract-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerType: customerType,
          customerQR: testCustomerQR
        })
      });
      
      const result = await response.json();
      
      console.log('📥 Server response:', result);
      
      if (response.ok && result.success) {
        const extractedProduct = result.product;
        const actualProduct = internalQR.includes(',') ? internalQR.split(',')[0].trim() : internalQR.trim();
        
        const isMatch = extractedProduct === actualProduct;
        
        // Record test result
        const testResult = {
          id: Date.now(),
          customerQR: testCustomerQR,
          internalQR: internalQR,
          extractedProduct: extractedProduct,
          actualProduct: actualProduct,
          match: isMatch,
          timestamp: new Date().toISOString()
        };
        
        testResults.push(testResult);
        
        // Display result
        if (isMatch) {
          logMessage(`✅ 一致！ 抽出: ${extractedProduct} = 実際: ${actualProduct}`);
          updateScanDetails(`✅ 正解！ ${extractedProduct}`);
          playSuccessSound();
        } else {
          logMessage(`❌ 不一致！ 抽出: ${extractedProduct} ≠ 実際: ${actualProduct}`);
          updateScanDetails(`❌ 不正解！ 抽出: ${extractedProduct}, 実際: ${actualProduct}`);
          playErrorSound();
        }
        
        // Show test summary
        const totalTests = testResults.length;
        const correctTests = testResults.filter(r => r.match).length;
        const accuracy = ((correctTests / totalTests) * 100).toFixed(1);
        
        logMessage(`📊 テスト結果: ${correctTests}/${totalTests} 正解 (${accuracy}%)`);
        
      } else {
        logMessage(`❌ 抽出エラー: ${result.error || result.message}`);
        console.error('Extraction failed:', result);
        playErrorSound();
      }
      
    } catch (error) {
      console.error('Test error:', error);
      logMessage(`❌ テストエラー: ${error.message}`);
      playErrorSound();
    }
    
    // Reset for next test pair
    console.log('🔄 Resetting for next test pair');
    testCustomerQR = null;
    scanningMode = 'customer';
    
    updateScanInstruction('🧪 Scan next customer QR code (or click 学習完了 to stop)');
  }
}

// Stop test mode
function stopTestMode() {
  if (!testMode) return;
  
  testMode = false;
  testCustomerQR = null;
  scanningMode = null;
  
  // Show final test summary
  if (testResults.length > 0) {
    const totalTests = testResults.length;
    const correctTests = testResults.filter(r => r.match).length;
    const accuracy = ((correctTests / totalTests) * 100).toFixed(1);
    
    logMessage(`🏁 テスト完了！ 最終結果: ${correctTests}/${totalTests} 正解 (精度: ${accuracy}%)`);
    updateScanInstruction('Test completed');
    updateScanDetails(`テスト完了 - ${correctTests}/${totalTests} 正解 (${accuracy}%)`);
    
    // Show test results modal
    showTestResults();
  } else {
    logMessage('🏁 テスト終了 - テストなし');
    updateScanInstruction('Test stopped');
    updateScanDetails('テストモード終了');
  }
  
  // Re-enable buttons
  domCache['startCorrectPairs'].disabled = false;
  domCache['startMismatchPairs'].disabled = false;
  domCache['testPattern'].disabled = false;
  domCache['finishLearning'].disabled = true;
  
  playSuccessSound();
}

function showTestResults() {
  const totalTests = testResults.length;
  const correctTests = testResults.filter(r => r.match).length;
  const accuracy = ((correctTests / totalTests) * 100).toFixed(1);
  
  let resultsHTML = `
    <div class="mb-3 p-3 bg-white rounded-lg border-2 ${accuracy >= 90 ? 'border-green-500' : 'border-orange-500'}">
      <div class="text-lg font-bold mb-2">
        ${accuracy >= 90 ? '✅' : '⚠️'} 精度: ${accuracy}%
      </div>
      <div class="text-sm text-gray-600">
        正解: ${correctTests} / ${totalTests} テスト
      </div>
    </div>
    
    <div class="space-y-2 text-sm">
  `;
  
  testResults.forEach((result, index) => {
    const icon = result.match ? '✅' : '❌';
    const bgColor = result.match ? 'bg-green-100' : 'bg-red-100';
    
    resultsHTML += `
      <div class="${bgColor} p-2 rounded">
        <div class="font-medium">${icon} テスト ${index + 1}</div>
        <div class="text-xs text-gray-700 mt-1">
          抽出: ${result.extracted || 'エラー'}<br>
          実際: ${result.actual}
        </div>
        ${result.error ? `<div class="text-xs text-red-600 mt-1">エラー: ${result.error}</div>` : ''}
      </div>
    `;
  });
  
  resultsHTML += '</div>';
  
  if (domCache['testResults']) {
    domCache['testResults'].innerHTML = resultsHTML;
  }
  
  if (domCache['testModal']) {
    domCache['testModal'].style.display = 'flex';
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
window.testPattern = testPattern;
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