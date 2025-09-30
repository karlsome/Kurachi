const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";

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

// Save scan log to localStorage
function saveScanLog(logs) {
  localStorage.setItem(STORAGE_KEYS.SCAN_LOG, JSON.stringify(logs));
}

// Load form data from localStorage
function loadFormData() {
  const stored = localStorage.getItem(STORAGE_KEYS.FORM_DATA);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Error loading form data:', e);
      return {};
    }
  }
  return {};
}

// Save form data to localStorage
function saveFormData(data) {
  localStorage.setItem(STORAGE_KEYS.FORM_DATA, JSON.stringify(data));
}

// Insert log to database using /queries route
async function insertLogToDatabase(logData) {
  try {
    const response = await fetch(`${serverURL}/queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dbName: "submittedDB",
        collectionName: "labelComparatorLogDB",
        insertData: [logData]
      })
    });

    const result = await response.json();
    
    if (response.ok && result.insertedCount > 0) {
      console.log('Log successfully inserted to database');
      return true;
    } else {
      console.error('Failed to insert log:', result);
      return false;
    }
  } catch (error) {
    console.error('Error inserting log to database:', error);
    return false;
  }
}

// Process pending logs when online
async function processPendingLogs() {
  if (!isOnline || pendingLogs.length === 0) return;

  console.log(`Processing ${pendingLogs.length} pending logs...`);
  
  // Sort by timestamp to maintain order
  pendingLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  const logsToProcess = [...pendingLogs];
  const failedLogs = [];

  for (const log of logsToProcess) {
    const success = await insertLogToDatabase(log);
    if (!success) {
      failedLogs.push(log);
    }
  }

  // Update pending logs with only the failed ones
  pendingLogs = failedLogs;
  savePendingLogs();

  if (failedLogs.length === 0) {
    console.log('All pending logs processed successfully');
  } else {
    console.log(`${failedLogs.length} logs failed to process`);
  }
}

// Add log entry (handles both online and offline scenarios)
async function addLogEntry(customerProduct, ourProduct, isMatch, customerQR, ourQR) {
  const timestamp = new Date().toISOString();
  
  const logData = {
    timestamp: timestamp,
    品番_customer: customerProduct,
    品番_our: ourProduct,
    comparison_result: isMatch ? '一致' : '不一致',
    customer_qr: customerQR,
    our_qr: ourQR,
    is_match: isMatch,
    created_at: timestamp
  };

  if (isOnline) {
    // Try to insert directly to database
    const success = await insertLogToDatabase(logData);
    if (!success) {
      // If failed, add to pending logs
      pendingLogs.push(logData);
      savePendingLogs();
    }
  } else {
    // If offline, add to pending logs
    pendingLogs.push(logData);
    savePendingLogs();
  }
}

// Monitor network status
window.addEventListener('online', () => {
  isOnline = true;
  console.log('Network connection restored');
  processPendingLogs();
});

window.addEventListener('offline', () => {
  isOnline = false;
  console.log('Network connection lost');
});

document.addEventListener("DOMContentLoaded", () => {
  const logList = document.getElementById("logList");
  const scanStatus = document.getElementById("scanStatus");
  const alertSound = document.getElementById('alert-sound');
  const welcomeModal = document.getElementById('welcomeModal');
  const startButton = document.getElementById('startButton');
  
  // Show welcome modal on page load
  welcomeModal.style.display = 'flex';
  
  // Handle start button click
  startButton.addEventListener('click', () => {
    // Hide welcome modal
    welcomeModal.style.display = 'none';
    
    // Now that we have user interaction, initialize the audio
    if (alertSound) {
      // Play a silent sound to initialize audio
      alertSound.muted = true;
      alertSound.volume = 0;
      alertSound.play().then(() => {
        console.log("Audio successfully initialized");
      }).catch(error => {
        console.error("Audio initialization error:", error);
      });
    }
    
    // Focus on scanning area
    document.body.focus();
  });
  
  // Load pending logs and form data
  loadPendingLogs();
  
  // Restore form data if exists
  const savedFormData = loadFormData();
  if (savedFormData.customerQR) {
    document.getElementById("customerQR").value = savedFormData.customerQR;
  }
  if (savedFormData.ourQR) {
    document.getElementById("ourQR").value = savedFormData.ourQR;
  }
  
  // Restore scan log
  const savedLogs = loadScanLog();
  savedLogs.forEach(logHtml => {
    const li = document.createElement("li");
    li.innerHTML = logHtml;
    logList.appendChild(li);
  });
  
  // Process any pending logs if online
  if (isOnline) {
    processPendingLogs();
  }
  
  // State for bluetooth scanner input
  let scanBuffer = "";
  let scanTimeout;
  const SCAN_TIMEOUT = 100; // ms - typical bluetooth scanner sends data quickly

  function extractCustomerProduct(qr) {
    const parts = qr.trim().split(/\s+/);
    if (parts.length < 3) return null;
    const raw = parts[2];
    const productRaw = raw.substring(4, 14); // Corrected: 10 chars after '0019'
    const prefix = productRaw.slice(0, 5);   // GN519
    const suffix = productRaw.slice(5);      // 10260
    return prefix + '-' + suffix;
  }

  function extractOurProduct(qr) {
    return qr.split(',')[0].trim();
  }

  function detectQRType(qrCode) {
    // Check if it's our QR format (starts with GN and contains comma)
    if (qrCode.match(/^GN\d{3}-\d{5},\d+$/)) {
      return 'our';
    }
    
    // Check if it's customer QR format (three space-separated parts, third starts with 0019GN)
    const parts = qrCode.trim().split(/\s+/);
    if (parts.length >= 3 && parts[2].startsWith('0019GN')) {
      return 'customer';
    }
    
    return null;
  }

  function updateScanStatus(message, type = 'info') {
    if (scanStatus) {
      scanStatus.textContent = message;
      scanStatus.className = `text-center text-sm font-medium ${
        type === 'success' ? 'text-green-600' : 
        type === 'error' ? 'text-red-600' : 'text-blue-600'
      }`;
    }
  }

  function processScannedQR(qrCode) {
    const type = detectQRType(qrCode);
    
    if (!type) {
      updateScanStatus("❌ 不明なQRフォーマットです", 'error');
      return;
    }

    if (type === 'customer') {
      document.getElementById("customerQR").value = qrCode;
      updateScanStatus("✅ お客様QRをスキャンしました", 'success');
    } else {
      document.getElementById("ourQR").value = qrCode;
      updateScanStatus("✅ 社内QRをスキャンしました", 'success');
    }

    // Save form data for persistence
    saveFormData({
      customerQR: document.getElementById("customerQR").value,
      ourQR: document.getElementById("ourQR").value
    });

    // Auto-compare if both fields are filled
    const customerQR = document.getElementById("customerQR").value;
    const ourQR = document.getElementById("ourQR").value;
    
    if (customerQR && ourQR) {
      setTimeout(() => {
        compareQRs();
      }, 500); // Small delay to show the scan status
    }
  }

  function compareQRs() {
    const customerQR = document.getElementById("customerQR").value;
    const ourQR = document.getElementById("ourQR").value;
    const result = document.getElementById("result");
    const alertSound = document.getElementById('alert-sound');

    const customerProduct = extractCustomerProduct(customerQR);
    const ourProduct = extractOurProduct(ourQR);
    const timestamp = new Date().toLocaleString();

    if (!customerProduct || !ourProduct) {
      result.textContent = "❌ 製品番号の抽出に失敗しました";
      result.className = "mt-6 text-center text-lg font-semibold text-red-600";
      return;
    }

    const isMatch = customerProduct === ourProduct;

    if (isMatch) {
      result.textContent = "✅ 一致: " + customerProduct;
      result.className = "mt-6 text-center text-lg font-semibold text-green-600";
    } else {
      result.textContent = `❌ 不一致 お客様: ${customerProduct} 社内: ${ourProduct}`;
      result.className = "mt-6 text-center text-lg font-semibold text-red-600";
      
      // Play alert sound and show visual warning for mismatch
      playAlertSound();
      
      // Flash background
      document.body.classList.add('flash-red');
      
      // Show mismatch modal with details
      showMismatchModal(customerProduct, ourProduct);
    }

    // Add log entry to database (background operation)
    addLogEntry(customerProduct, ourProduct, isMatch, customerQR, ourQR);

    // Log the comparison to UI
    const logHtml = `<span class="text-gray-500">[${timestamp}]</span> 
                     お客様: <span class="font-medium">${customerProduct}</span>, 
                     社内: <span class="font-medium">${ourProduct}</span>, 
                     <span class="${isMatch ? 'text-green-600' : 'text-red-600'} font-semibold">
                       ${isMatch ? '一致' : '不一致'}
                     </span>`;
    
    const li = document.createElement("li");
    li.innerHTML = logHtml;
    logList.prepend(li);

    // Save log to localStorage for persistence
    const currentLogs = loadScanLog();
    currentLogs.unshift(logHtml);
    // Keep only last 50 logs in localStorage
    if (currentLogs.length > 50) {
      currentLogs.splice(50);
    }
    saveScanLog(currentLogs);

    // Only auto-clear if it's a match (mismatch requires user acknowledgment)
    if (isMatch) {
      setTimeout(() => {
        clearFields();
      }, 3000);
    }
  }
  
  // Play the alert sound
  function playAlertSound() {
    const alertSound = document.getElementById('alert-sound');
    if (alertSound) {
      // Unmute and play at full volume
      alertSound.muted = false;
      alertSound.volume = 1;
      alertSound.currentTime = 0; // Reset to start
      alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
    }
  }
  
  // Show mismatch modal with product details
  function showMismatchModal(customerProduct, ourProduct) {
    const modal = document.getElementById('mismatchModal');
    const message = document.getElementById('mismatchMessage');
    
    message.innerHTML = `
      <div class="text-left">
        <div class="mb-2">お客様製品番号: <span class="font-bold">${customerProduct}</span></div>
        <div>社内製品番号: <span class="font-bold">${ourProduct}</span></div>
      </div>
    `;
    
    modal.style.display = 'flex';
  }
  
  // Close mismatch modal and reset state
  window.closeMismatchModal = function() {
    const modal = document.getElementById('mismatchModal');
    const alertSound = document.getElementById('alert-sound');
    
    modal.style.display = 'none';
    document.body.classList.remove('flash-red');
    
    if (alertSound) {
      alertSound.muted = true;
      alertSound.pause();
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
    document.getElementById("customerQR").value = "";
    document.getElementById("ourQR").value = "";
    document.getElementById("result").textContent = "";
    
    // Reset visual alerts if any
    document.body.classList.remove('flash-red');
    
    // Clear saved form data
    saveFormData({
      customerQR: "",
      ourQR: ""
    });
    
    updateScanStatus("次のスキャンを待機中...");
  }

  // Global keyboard event listener for bluetooth scanner
  document.addEventListener('keydown', (e) => {
    // Ignore if user is typing in an input field manually
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    // Clear previous timeout
    clearTimeout(scanTimeout);

    // Handle Enter key (end of scan)
    if (e.key === 'Enter') {
      e.preventDefault();
      if (scanBuffer.trim()) {
        processScannedQR(scanBuffer.trim());
        scanBuffer = "";
      }
      return;
    }

    // Add character to buffer if it's printable
    if (e.key.length === 1) {
      e.preventDefault();
      scanBuffer += e.key;
      
      // Set timeout to process scan if no more input comes
      scanTimeout = setTimeout(() => {
        if (scanBuffer.trim()) {
          processScannedQR(scanBuffer.trim());
          scanBuffer = "";
        }
      }, SCAN_TIMEOUT);
    }
  });

  // Initialize
  updateScanStatus("スキャン待機中...");

  // Show pending logs count if any
  if (pendingLogs.length > 0) {
    console.log(`${pendingLogs.length} logs pending upload`);
  }

  // Periodic retry for pending logs (every 30 seconds)
  setInterval(() => {
    if (isOnline && pendingLogs.length > 0) {
      processPendingLogs();
    }
  }, 30000);

  // Expose functions for manual button click and debugging
  window.compareQRs = compareQRs;
  window.clearFields = clearFields;
  window.processPendingLogs = processPendingLogs;
  window.getPendingLogsCount = () => pendingLogs.length;
});
