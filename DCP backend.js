//link for ip address database
const ipURL = 'https://script.google.com/macros/s/AKfycbyC6-KiT3xwGiahhzhB-L-OOL8ufG0WqnT5mjEelGBKGnbiqVAS6qjT78FlzBUHqTn3Gg/exec';

// link for pictures database
const picURL = 'https://script.google.com/macros/s/AKfycbwHUW1ia8hNZG-ljsguNq8K4LTPVnB6Ng_GLXIHmtJTdUgGGd2WoiQo9ToF-7PvcJh9bA/exec';

//link for live status (google sheets live status)
const googleSheetLiveStatusURL = 'https://script.google.com/macros/s/AKfycbwbL30hlX9nBlQH4dwxlbdxSM5kJtgtNEQJQInA1mgXlEhYJxFHykZkdXV38deR6P83Ow/exec';

// Link for Rikeshi (up/down color info) - This was missing in the original, adding it here.
const dbURL = 'https://script.google.com/macros/s/AKfycbx0qBw0_wF5X-hA2t1yY-d5h5M7Z_a8z_V9R5D6k/exec'; // Placeholder, replace with your actual URL if different.

const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";

// Global variable to track if sendtoNC button has been pressed
let sendtoNCButtonisPressed = false;

// Global variable to track which input field is currently using the worker modal
let currentModalInputField = null; // Can be 'worker' or 'kensa'

// ============================================
// SESSION ID MANAGEMENT SYSTEM
// ============================================
/**
 * Get current sessionID from localStorage
 * @returns {string|null} sessionID or null if not found
 */
function getSessionID() {
  return localStorage.getItem(`${uniquePrefix}sessionID`);
}

/**
 * Save sessionID to localStorage
 * @param {string} sessionID - The session ID to store
 */
function setSessionID(sessionID) {
  localStorage.setItem(`${uniquePrefix}sessionID`, sessionID);
  console.log(`📌 SessionID saved to localStorage: ${sessionID}`);
}

/**
 * Clear sessionID from localStorage (called on Submit/Reset)
 */
function clearSessionID() {
  const oldSessionID = localStorage.getItem(`${uniquePrefix}sessionID`);
  localStorage.removeItem(`${uniquePrefix}sessionID`);
  console.log(`🗑️ SessionID cleared from localStorage: ${oldSessionID}`);
}

/**
 * Generate new sessionID by calling backend for order number
 * @param {string} 背番号 - Kanban serial number
 * @param {string} 設備 - Machine/Equipment name
 * @param {string} 工場 - Factory name
 * @param {string} date - Date in yyyy-mm-dd format
 * @returns {Promise<string|null>} Generated sessionID or null on error
 */
async function generateSessionID(背番号, 設備, 工場, date) {
  try {
    const response = await fetch(`${serverURL}/api/generate-session-id?背番号=${encodeURIComponent(背番号)}&設備=${encodeURIComponent(設備)}&工場=${encodeURIComponent(工場)}&Date=${encodeURIComponent(date)}`);
    const data = await response.json();
    
    if (data.success) {
      console.log(`✅ Generated new sessionID: ${data.sessionID} (Order #${data.orderNumber})`);
      return data.sessionID;
    } else {
      console.error('❌ Failed to generate sessionID:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Error generating sessionID:', error);
    return null;
  }
}

// ============================================
// TABLET LOGGING SYSTEM WITH RETRY QUEUE
// ============================================

// Persistent queue for failed log entries
let logQueue = [];
const MAX_RETRY_ATTEMPTS = 5;
const INITIAL_RETRY_DELAY = 2000; // 2 seconds
let isProcessingQueue = false;

/**
 * Get the localStorage key for the log queue (dynamic based on uniquePrefix)
 */
function getLogQueueKey() {
  // uniquePrefix is defined later in the code, so we compute it here
  const pageName = location.pathname.split('/').pop();
  const currentSelectedFactory = document.getElementById('selected工場')?.value || '';
  const selectedMachine = new URLSearchParams(window.location.search).get('machine') || '';
  return `${pageName}_${currentSelectedFactory}_${selectedMachine}_logQueue`;
}

/**
 * Load pending logs from localStorage
 */
function loadLogQueue() {
  try {
    const saved = localStorage.getItem(getLogQueueKey());
    if (saved) {
      logQueue = JSON.parse(saved);
      console.log(`📦 Loaded ${logQueue.length} pending logs from queue`);
    }
  } catch (error) {
    console.error('❌ Error loading log queue:', error);
    logQueue = [];
  }
}

/**
 * Save pending logs to localStorage
 */
function saveLogQueue() {
  try {
    localStorage.setItem(getLogQueueKey(), JSON.stringify(logQueue));
  } catch (error) {
    console.error('❌ Error saving log queue:', error);
  }
}

/**
 * Add log entry to queue
 */
function addToLogQueue(logData) {
  const queueEntry = {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    logData: logData,
    attempts: 0,
    timestamp: new Date().toISOString(),
    nextRetryTime: Date.now()
  };
  
  logQueue.push(queueEntry);
  saveLogQueue();
  console.log(`📥 Added to queue: ${logData.Action} (Queue size: ${logQueue.length})`);
  
  // Start processing queue if not already running
  if (!isProcessingQueue) {
    processLogQueue();
  }
}

/**
 * Send log to server with timeout
 */
async function sendLogToServer(logData, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(`${serverURL}/api/tablet-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(logData),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      return { success: true };
    } else {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return { success: false, error: 'Request timeout' };
    }
    return { success: false, error: error.message };
  }
}

/**
 * Process the log queue - retry failed entries
 */
async function processLogQueue() {
  if (isProcessingQueue || logQueue.length === 0) {
    return;
  }
  
  isProcessingQueue = true;
  console.log(`🔄 Processing log queue (${logQueue.length} entries)...`);
  
  const now = Date.now();
  const entriesToProcess = logQueue.filter(entry => entry.nextRetryTime <= now);
  
  for (const entry of entriesToProcess) {
    entry.attempts++;
    
    console.log(`🔁 Retry attempt ${entry.attempts}/${MAX_RETRY_ATTEMPTS} for: ${entry.logData.Action}`);
    
    const result = await sendLogToServer(entry.logData);
    
    if (result.success) {
      // Success - remove from queue
      console.log(`✅ Successfully logged (retry): ${entry.logData.Action}`);
      logQueue = logQueue.filter(e => e.id !== entry.id);
      saveLogQueue();
    } else {
      // Failed - check if we should retry
      if (entry.attempts >= MAX_RETRY_ATTEMPTS) {
        console.error(`❌ Max retries reached for: ${entry.logData.Action} - Removing from queue`);
        logQueue = logQueue.filter(e => e.id !== entry.id);
        saveLogQueue();
      } else {
        // Calculate exponential backoff: 2s, 4s, 8s, 16s, 32s
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, entry.attempts - 1);
        entry.nextRetryTime = now + delay;
        saveLogQueue();
        console.warn(`⏳ Will retry in ${delay/1000}s: ${entry.logData.Action}`);
      }
    }
    
    // Small delay between processing entries
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  isProcessingQueue = false;
  
  // Schedule next queue check if there are still entries
  if (logQueue.length > 0) {
    const nextRetry = Math.min(...logQueue.map(e => e.nextRetryTime));
    const delayUntilNext = Math.max(1000, nextRetry - Date.now());
    setTimeout(processLogQueue, delayUntilNext);
    console.log(`⏰ Next queue check in ${(delayUntilNext/1000).toFixed(1)}s`);
  }
}

/**
 * Logs tablet actions to MongoDB tabletLogDB with guaranteed delivery
 * @param {string} action - Description of the action (e.g., "Scanned kanban", "Worker name selected")
 * @param {string} status - Status of the workflow (default: "in-progress", can be "Completed", "Reset")
 * @param {object} additionalData - Any extra data to log
 */
async function logTabletAction(action, status = 'in-progress', additionalData = {}) {
  try {
    const 背番号 = document.getElementById('sub-dropdown')?.value || '';
    const 品番 = document.getElementById('product-number')?.value || '';
    const 工場 = document.getElementById('selected工場')?.value || '';
    const 設備 = document.getElementById('process')?.value || '';
    const lotNumber = document.getElementById('Lot No.')?.value || '';
    
    // Don't log if machine info is missing - tablet not initialized yet
    if (!設備) {
      console.log('⚠️ Skipping log: Machine (設備) not selected yet');
      return;
    }
    
    // For most actions, 背番号 is required (except setup actions like checkbox toggle)
    const setupActions = ['Kensa mode checkbox toggled', 'Break time', 'Reset'];
    const isSetupAction = setupActions.some(setupAction => action.includes(setupAction));
    
    if (!背番号 && !isSetupAction) {
      console.log('⚠️ Skipping log: Kanban (背番号) not scanned yet');
      return;
    }
    
    // Get sessionID from localStorage
    let sessionID = getSessionID();
    
    // ✅ CRITICAL: sessionID is REQUIRED - Auto-generate if missing
    if (!sessionID) {
      console.warn(`⚠️ No sessionID found! Auto-generating for action: ${action}`);
      
      // Generate sessionID immediately
      const todayDate = new Date().toISOString().split('T')[0];
      sessionID = await generateSessionID(背番号 || 'setup', 設備, 工場, todayDate);
      
      if (sessionID) {
        setSessionID(sessionID);
        console.log(`✅ Emergency sessionID created: ${sessionID}`);
      } else {
        console.error(`❌ CRITICAL: Failed to generate sessionID for action: ${action}`);
        console.error('❌ Logging blocked - cannot proceed without sessionID');
        return; // Block logging if sessionID cannot be generated
      }
    }
    
    const logData = {
      背番号,
      品番,
      工場,
      設備,
      Action: action,
      Status: status,
      sessionID: sessionID,
      AdditionalData: additionalData
    };
    
    // Try to send immediately
    const result = await sendLogToServer(logData, 8000); // 8 second timeout
    
    if (result.success) {
      console.log(`📝 Tablet action logged: ${action}`);
    } else {
      // Failed - add to retry queue
      console.warn(`⚠️ Failed to log immediately: ${action} - Adding to queue`);
      console.warn(`⚠️ Error: ${result.error}`);
      addToLogQueue(logData);
    }
  } catch (error) {
    console.error('❌ Error in logTabletAction:', error);
    // Still try to queue it if we have the basic data
    try {
      const 背番号 = document.getElementById('sub-dropdown')?.value || '';
      const 品番 = document.getElementById('product-number')?.value || '';
      const 工場 = document.getElementById('selected工場')?.value || '';
      const 設備 = document.getElementById('process')?.value || '';
      const sessionID = getSessionID();
      
      if (設備 && sessionID) {
        addToLogQueue({
          背番号, 品番, 工場, 設備,
          Action: action,
          Status: status,
          sessionID: sessionID,
          AdditionalData: additionalData
        });
      }
    } catch (queueError) {
      console.error('❌ Failed to queue log entry:', queueError);
    }
  }
}

// Initialize queue system on page load
document.addEventListener('DOMContentLoaded', () => {
  loadLogQueue();
  if (logQueue.length > 0) {
    console.log(`🚀 Starting queue processor for ${logQueue.length} pending logs`);
    setTimeout(processLogQueue, 2000); // Start processing after 2 seconds
  }
});

//this code listens to incoming parameters passed
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

const selectedFactory = getQueryParam('filter');
const selectedMachine = getQueryParam('machine');

console.log("🔵 ========== SCRIPT INITIALIZATION ==========");
console.log("🔵 URL:", window.location.href);
console.log("🔵 selectedFactory:", selectedFactory);
console.log("🔵 selectedMachine:", selectedMachine);

// ===== GROUPED MACHINE DETECTION =====
// Check if this is a grouped machine page (decode URI to handle %20 spaces)
const decodedPath = decodeURIComponent(window.location.pathname);
const isGroupedMachinePage = decodedPath.includes('DCP Grouping');
console.log("🔵 Decoded pathname:", decodedPath);
console.log("🔵 isGroupedMachinePage:", isGroupedMachinePage);

let groupedMachines = []; // Array to store multiple machine names
let groupedMachineIPs = {}; // Object to store IPs: {machineA: "IP1", machineB: "IP2"}

// Parse comma-separated machines if grouped
if (selectedMachine && selectedMachine.includes(',')) {
  groupedMachines = selectedMachine.split(',').map(m => m.trim());
  console.log("✅ Grouped machines detected:", groupedMachines);
} else if (selectedMachine) {
  groupedMachines = [selectedMachine];
  console.log("🔵 Single machine detected:", groupedMachines);
} else {
  console.log("❌ No selectedMachine found");
}

// Set factory and machine values when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log("🔵 ========== Early DOMContentLoaded (factory/machine setup) ==========");
  console.log("🔵 selectedFactory:", selectedFactory);
  console.log("🔵 selectedMachine:", selectedMachine);
  console.log("🔵 groupedMachines at this point:", groupedMachines);
  
  if (selectedFactory) {
    const factoryInput = document.getElementById('selected工場');
    const nippoTitle = document.getElementById('nippoTitle');
    if (factoryInput) factoryInput.value = selectedFactory;
    if (nippoTitle) nippoTitle.textContent = selectedFactory + "日報";
    console.log("✅ kojo changed to: " + selectedFactory);
  }
  
  if (selectedMachine) {
    const processInput = document.getElementById('process');
    if (processInput) {
      processInput.value = selectedMachine;
      console.log("✅ machine set to: " + selectedMachine);
      
      // Create dynamic shot inputs after machine value is set
      setTimeout(() => {
        console.log("🔵 ⏰ setTimeout fired - About to call createGroupedShotInputs");
        console.log("🔵 groupedMachines before call:", groupedMachines);
        createGroupedShotInputs();
      }, 100);
    } else {
      console.log("❌ processInput element not found!");
    }
  } else {
    console.log("❌ selectedMachine is null/undefined");
  }
}, { once: true }); // Use once option to ensure this runs first

// Add CSS styles for time input fields and edit buttons
const timeInputStyles = `
<style>
  .time-input-wrapper {
    display: inline-block;
    position: relative;
    margin-bottom: 10px;
  }
  
  .time-input-wrapper input[type="time"] {
    padding: 5px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    transition: border-color 0.2s;
  }
  
  .time-input-wrapper input[type="time"].locked {
    background-color: #f8f9fa;
    border-color: #dee2e6;
    color: #495057;
  }
  
  .time-input-wrapper .edit-btn {
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
    margin-left: 5px;
    transition: background-color 0.2s;
    vertical-align: middle;
  }
  
  .time-input-wrapper .edit-btn:hover {
    background-color: #0069d9;
  }
</style>`;

// Inject styles into document head
document.head.insertAdjacentHTML('beforeend', timeInputStyles);

// Select all input, select, and button elements
const inputs = document.querySelectorAll('input, select, button,textarea');
const currentSelectedFactory = document.getElementById('selected工場').value; // Get the current factory value
const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
const uniquePrefix = `${pageName}_${currentSelectedFactory}_${selectedMachine}_`;

// Save the value of each input to localStorage on change
inputs.forEach(input => {
  input.addEventListener('input', () => {
    const key = `${uniquePrefix}${input.id || input.name}`; // Prefix key with pageName and selected工場
    if (key) {
      localStorage.setItem(key, input.value);
    }
  });

  if (input.type === 'checkbox' || input.type === 'radio') {
    input.addEventListener('change', () => {
      const key = `${uniquePrefix}${input.id || input.name}`;
      if (key) {
        localStorage.setItem(key, input.checked); // Save checkbox/radio state
      }
    });
  }
});

// Restore the values of input fields, images, and textContent from localStorage on page load
document.addEventListener('DOMContentLoaded', () => {
  getIP(); // ip address for machine
  document.getElementById('uploadingModal').style.display = 'none';
  const inputs = document.querySelectorAll('input, select, button, textarea'); // Get all input elements
  const images = document.querySelectorAll('img'); // Get all <img> elements
  const textElements = document.querySelectorAll('[id]'); // Get all elements with an ID
  const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
  const selected工場 = document.getElementById('selected工場')?.value; // Get the selected 工場 value
  const processElement = document.getElementById("process");
  const subDropdown = document.getElementById("sub-dropdown");

  if (!selected工場) {
    console.error("Selected 工場 is not set or found.");
    return;
  }
  
  // Explicitly restore sub-dropdown value first
  if (subDropdown) {
    const subDropdownKey = `${uniquePrefix}sub-dropdown`;
    const savedSubDropdownValue = localStorage.getItem(subDropdownKey);
    
    if (savedSubDropdownValue) {
      console.log(`Found saved sub-dropdown value: ${savedSubDropdownValue}`);
      
      // Wait for options to be populated before setting value
      setTimeout(() => {
        if ([...subDropdown.options].some(option => option.value === savedSubDropdownValue)) {
          subDropdown.value = savedSubDropdownValue;
          previousSubDropdownValue = savedSubDropdownValue; // Initialize previous value
          console.log(`Restored sub-dropdown to: ${savedSubDropdownValue}`);
          
          // Fetch product details after setting dropdown value
          fetchProductDetails();
        } else {
          console.error(`Option '${savedSubDropdownValue}' not found in sub-dropdown options.`);
        }
      }, 500);
    }
  }

  // Loop through all keys in localStorage
  Object.keys(localStorage).forEach(key => {
    // Check if the key belongs to the current HTML file and selected 工場
    if (key.startsWith(`${uniquePrefix}`)) {
      const savedValue = localStorage.getItem(key);

      if (savedValue !== null) {
        // Match each input with its respective localStorage key
        inputs.forEach(input => {
          const inputKey = `${uniquePrefix}${input.id || input.name}`;
          if (inputKey === key) {
            if (input.type === 'checkbox' || input.type === 'radio') {
              input.checked = savedValue === 'true'; // Restore checkbox/radio state
            } else if (input.tagName === 'SELECT') {
              // For select elements, wait for options to populate
              setTimeout(() => {
                if ([...input.options].some(option => option.value === savedValue)) {
                  input.value = savedValue; // Restore select value
                  console.log(`Restored ${input.id || input.name}:`, savedValue);
                  fetchProductDetails();

                } else {
                  console.error(`Option '${savedValue}' not found in select '${input.id || input.name}'.`);
                }
              }, 2000); // Adjust delay if options are populated dynamically
            } else {
              input.value = savedValue; // Restore value for text, hidden, and other inputs
            }
          }
        });

        // Restore textContent dynamically for all elements with IDs
        textElements.forEach(element => {
          const textKey = `${uniquePrefix}${element.id}.textContent`;
          if (key === textKey) {
            element.textContent = savedValue; // Restore textContent
            console.log(`Restored textContent for ${element.id}:`, savedValue);
          }
        });

        // Restore image sources dynamically
        images.forEach(image => {
          const imageKey = `${uniquePrefix}${image.id || image.name}.src`;
          if (key === imageKey) {
            image.src = savedValue; // Restore the image source
            image.style.display = 'block'; // Ensure the image is visible
            //console.log(`Restored ${image.id || image.name} image src:`, savedValue);
          }
        });
        updateTotal();
      }
    }
  });

  // Log the restored value for debugging (Optional)
  if (processElement) {
    console.log('Process value after restoration:', processElement.value); // Debugging the restored process value
  }

  // Calculate break time and trouble time after restoring values
  calculateTotalBreakTime();
  calculateTotalMachineTroubleTime();
  
  // Restore the sendtoNCButtonisPressed state
  const sendToNCKey = `${uniquePrefix}sendtoNCButtonisPressed`;
  const savedSendToNCState = localStorage.getItem(sendToNCKey);
  const currentSebanggo = document.getElementById('sub-dropdown')?.value;
  
  // Set up processing time inputs with edit buttons
  const startTimeInput = document.getElementById('Start Time');
  const endTimeInput = document.getElementById('End Time');
  
  if (startTimeInput) {
    // Wrap start time input in a container if not already wrapped
    if (!startTimeInput.closest('.time-input-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'time-input-wrapper';
      startTimeInput.parentNode.insertBefore(wrapper, startTimeInput);
      wrapper.appendChild(startTimeInput);
      
      // Add edit button
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'edit-btn';
      editBtn.id = 'edit-start-time';
      editBtn.textContent = 'Edit';
      editBtn.style.display = 'none';
      editBtn.onclick = function() { unlockProcessingTime('start'); };
      wrapper.appendChild(editBtn);
      
      // Update focus handler to use our custom handler
      startTimeInput.onfocus = function() { handleProcessingTimeFocus(this); };
      
      // Update lock status based on current value
      updateProcessingTimeLockStatus('start');
    }
  }
  
  if (endTimeInput) {
    // Wrap end time input in a container if not already wrapped
    if (!endTimeInput.closest('.time-input-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'time-input-wrapper';
      endTimeInput.parentNode.insertBefore(wrapper, endTimeInput);
      wrapper.appendChild(endTimeInput);
      
      // Add edit button
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'edit-btn';
      editBtn.id = 'edit-end-time';
      editBtn.textContent = 'Edit';
      editBtn.style.display = 'none';
      editBtn.onclick = function() { unlockProcessingTime('end'); };
      wrapper.appendChild(editBtn);
      
      // Update focus handler to use our custom handler
      endTimeInput.onfocus = function() { handleProcessingTimeFocus(this); };
      
      // Update lock status based on current value
      updateProcessingTimeLockStatus('end');
    }
  }
  
  // Initialize previous sebanggo if it doesn't exist
  if (!localStorage.getItem(`${uniquePrefix}previous-sebanggo`) && currentSebanggo) {
    localStorage.setItem(`${uniquePrefix}previous-sebanggo`, currentSebanggo);
    console.log(`Initialized previous-sebanggo to current value: ${currentSebanggo}`);
  }
  
  if (savedSendToNCState === 'true') {
    sendtoNCButtonisPressed = true;
    console.log("Restored sendtoNCButtonisPressed to true on page load");
  } else {
    sendtoNCButtonisPressed = false;
    localStorage.setItem(sendToNCKey, 'false'); // Ensure false state is saved
    console.log("Restored sendtoNCButtonisPressed to false on page load");
  }

  // Add event listeners to all break time inputs
  for (let i = 1; i <= 4; i++) {
    const startInput = document.getElementById(`break${i}-start`);
    const endInput = document.getElementById(`break${i}-end`);

    if (startInput && endInput) {
      startInput.addEventListener('change', function() {
        calculateTotalBreakTime();
        // Save to localStorage
        const key = `${uniquePrefix}${this.id}`;
        localStorage.setItem(key, this.value);
      });

      endInput.addEventListener('change', function() {
        calculateTotalBreakTime();
        // Save to localStorage
        const key = `${uniquePrefix}${this.id}`;
        localStorage.setItem(key, this.value);
      });
    }
  }

  // Initialize maintenance system
  loadMaintenanceRecords();
  
  // ============================================
  // STEP PERSISTENCE LOGIC - REMOVED
  // ============================================
  // Step persistence is now handled in window.addEventListener('load') 
  // to ensure dropdown is fully restored before checking
  // See bottom of file for step restoration logic
  
  // Initialize material label photo system
  loadMaterialLabelPhotos();

  // Add maintenance button
  const addMaintenanceBtn = document.getElementById('add-maintenance-btn');
  if (addMaintenanceBtn) {
    addMaintenanceBtn.addEventListener('click', () => showMaintenanceModal());
  }

  toggleInputs(); //enable or disable the kensa page
});

// this function fetches setsubi list (process.value)
async function fetchSetsubiList() {
  const factory = document.getElementById("selected工場").value;

  if (factory === '肥田瀬' || factory === '第二工場') {
    disableInputs();
    console.log("this is runned");
  }

  try {
    // Fetch data for the process dropdown
    const response = await fetch(`${serverURL}/getSetsubiList?factory=${encodeURIComponent(factory)}`);
    const data = await response.json();

    // Get unique values of `設備`
    const uniqueSetsubi = [...new Set(data.map(item => item.設備))];

    // Select the process dropdown element
    const processDropdown = document.getElementById("process");

    if (!processDropdown) {
      console.error("Process dropdown with id 'process' not found.");
      return;
    }

    // Clear any existing options
    processDropdown.innerHTML = "";

    // Populate the process dropdown with unique 設備 values
    uniqueSetsubi.forEach(equipment => {
      const option = document.createElement("option");
      option.value = equipment;
      option.textContent = equipment;
      processDropdown.appendChild(option);
    });

    console.log("Process dropdown populated with options.");

    // Automatically call fetchSebanggo to populate the sub-dropdown
    fetchSebanggo();

  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

// this function fetches sebanggo list
async function fetchSebanggo() {
  // Get the selected process from the process dropdown
  const 工場 = document.getElementById("selected工場").value;
  blankInfo();

  try {
    // Fetch 背番号 values from the server based on the selected process
    const response = await fetch(`${serverURL}/getSeBanggoListPress?工場=${encodeURIComponent(工場)}`);
    const data = await response.json();
    data.sort((a, b) => a.localeCompare(b, 'ja')); // 'ja' for Japanese sorting if needed // sort alphabetically

    // Get the sub-dropdown element
    const subDropdown = document.getElementById("sub-dropdown");

    // Clear any existing options in the sub-dropdown
    subDropdown.innerHTML = "";

    // Add a blank option at the top
    const blankOption = document.createElement("option");
    blankOption.value = "";
    blankOption.textContent = "Select 背番号";
    subDropdown.appendChild(blankOption);

    // Populate the sub-dropdown with new options based on the 背番号 values
    data.forEach(item => {
      const option = document.createElement("option");
      option.value = item;
      option.textContent = item;
      subDropdown.appendChild(option);
    });

    console.log("Sub-dropdown populated with 背番号 options:", data);

  } catch (error) {
    console.error("Error fetching 背番号 data:", error);
  }
}

// Call fetchSetsubiList when the page loads
document.addEventListener("DOMContentLoaded", fetchSetsubiList);

//blanks the info page
function blankInfo() {
  // Clear the value of the label with id "SRScode"
  //document.getElementById("SRScode").textContent = "";

  // Clear the values of all input fields
  document.getElementById("product-number").value = "";
  document.getElementById("model").value = "";
  document.getElementById("shape").value = "";
  document.getElementById("R-L").value = "";
  document.getElementById("material").value = "";
  document.getElementById("material-code").value = "";
  document.getElementById("material-color").value = "";
  document.getElementById("送りピッチ").textContent = ""; // Corrected to textContent for label
}

async function fetchProductDetails() {
  const serialNumber = document.getElementById("sub-dropdown").value;
  const factory = document.getElementById("selected工場").value;
  const dynamicImage = document.getElementById("dynamicImage");
  dynamicImage.src = "";

  if (!serialNumber) {
    console.error("Please select a valid 背番号.");
    blankInfo();
    return;
  }

  try {
    console.log(`Fetching product details for ${serialNumber}`);
    
    // Step 1: Try query by 背番号
    let response = await fetch(`${serverURL}/queries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dbName: "Sasaki_Coating_MasterDB",
        collectionName: "masterDB",
        query: {
          背番号: serialNumber
        }
      }),
    });

    // Check if response is ok before trying to parse JSON
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    let result = await response.json();

    // Step 2: If not found, try query by 品番
    if (!result || result.length === 0) {
      console.log(`No results found for 背番号: ${serialNumber}, trying 品番 instead`);
      
      const altRes = await fetch(`${serverURL}/queries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dbName: "Sasaki_Coating_MasterDB",
          collectionName: "masterDB",
          query: {
            品番: serialNumber
          }
        }),
      });

      // Check if alt response is ok
      if (!altRes.ok) {
        throw new Error(`Server returned ${altRes.status}: ${altRes.statusText}`);
      }

      const altResult = await altRes.json();

      if (altResult.length > 0) {
        console.log(`Found result using 品番: ${serialNumber}`);
        const matched = altResult[0];
        if (matched.背番号) {
          document.getElementById("sub-dropdown").value = matched.背番号;
        }
        result = [matched];
      }
    }

    // Step 3: Still no result
    if (!result || result.length === 0) {
      console.error(`No matching product found for ${serialNumber}`);
      blankInfo();
      return;
    }

    const data = result[0];
    console.log(`Successfully found product data for ${serialNumber}`);

    // Ensure we have valid data before populating fields
    if (!data) {
      throw new Error("Retrieved data is null or undefined");
    }

    // Populate fields
    document.getElementById("product-number").value = data.品番 || "";
    document.getElementById("model").value = data.モデル || "";
    document.getElementById("shape").value = data.形状 || "";
    document.getElementById("R-L").value = data["R/L"] || "";
    document.getElementById("material").value = data.材料 || "";
    document.getElementById("material-code").value = data.材料背番号 || "";
    document.getElementById("material-color").value = data.色 || "";
    document.getElementById("kataban").value = data.型番 || "";
    document.getElementById("収容数").value = data.収容数 || "";
    document.getElementById("送りピッチ").textContent = "送りピッチ: " + (data.送りピッチ || "");
    
    // Set 離型紙 value with Japanese/English labels
    const rikeshiValue = data.離型紙上下 || data["離型紙上/下"] || "";
    if (rikeshiValue === "上") {
      document.getElementById("rikeshitext").textContent = "上 (Up)";
    } else if (rikeshiValue === "下") {
      document.getElementById("rikeshitext").textContent = "下 (Down)";
    } else {
      document.getElementById("rikeshitext").textContent = rikeshiValue;
    }
    
    document.getElementById("SRS").value = data.SRS || "";

    // Set image
    if (data.imageURL) {
      dynamicImage.src = data.imageURL;
      dynamicImage.alt = "Product Image";
      dynamicImage.style.display = "block";
    } else {
      dynamicImage.src = "";
      dynamicImage.alt = "No Image Available";
      dynamicImage.style.display = "none";
    }

  } catch (error) {
    console.error("Error fetching product details:", error);
    blankInfo(); // Make sure we blank fields on error
    
    // Display user-friendly error
    const scanAlertModal = document.getElementById('scanAlertModal');
    const scanAlertText = document.getElementById('scanAlertText');
    
    if (scanAlertModal && scanAlertText) {
      scanAlertText.innerText = `製品情報の取得中にエラーが発生しました / Error fetching product details: ${error.message}`;
      scanAlertModal.style.display = 'block';
      
      const closeScanModalButton = document.getElementById('closeScanModalButton');
      if (closeScanModalButton) {
        closeScanModalButton.onclick = function() {
          scanAlertModal.style.display = 'none';
        };
      }
    }
  }
  // Call getRikeshi after product details are fetched
  //getRikeshi(serialNumber);
}

// Variable to store the previous dropdown value
let previousSubDropdownValue = document.getElementById("sub-dropdown").value;

// Trigger when 背番号 is selected - with leader verification
document.getElementById("sub-dropdown").addEventListener("change", function(event) {
  const currentValue = document.getElementById("sub-dropdown").value;
  const subDropdown = document.getElementById('sub-dropdown');
  
  // Check if value actually changed
  if (currentValue === previousSubDropdownValue) {
    return; // No change, exit early
  }
  
  // Immediately revert the dropdown to previous value
  subDropdown.value = previousSubDropdownValue;
  
  // User is trying to change the dropdown - trigger leader verification with the attempted value
  showLeaderVerification(currentValue);
});

// Global variable to hold the leader verification scanner
let leaderVerificationScanner = null;

// Function to show leader verification modal
function showLeaderVerification(attemptedValue) {
  const modal = document.getElementById('leaderVerificationModal');
  const statusText = document.getElementById('leaderVerificationStatus');
  const subDropdown = document.getElementById('sub-dropdown');
  
  // Reset status text
  statusText.textContent = 'リーダーのQRコードをスキャンしてください / Please scan leader QR code';
  statusText.style.color = '#2d5f4f';
  
  // Reset the warning text to original (for sub-dropdown flow)
  const modalContent = modal.querySelector('.modal-content');
  const warningTextElement = modalContent.querySelector('p[style*="font-size"]');
  
  if (warningTextElement) {
    // Restore original warning text
    warningTextElement.innerHTML = `価値観を変えることができるのはリーダーだけ<br>
        <span style="font-size: 14px;">Only leaders can change value</span>`;
    warningTextElement.style.fontSize = '15px';
    warningTextElement.style.margin = '8px 0';
    warningTextElement.style.color = '#666';
    warningTextElement.style.lineHeight = '1.5';
  }
  
  // Show modal
  modal.style.display = 'block';
  
  // Initialize QR scanner for leader verification
  leaderVerificationScanner = new Html5Qrcode("leaderQrReader");
  const html5QrCode = leaderVerificationScanner;
  
  html5QrCode.start(
    { facingMode: "environment" },
    { 
      fps: 30,
      qrbox: { width: 800, height: 800 },
      aspectRatio: 1.0,
      disableFlip: false,
      advanced: [{
        focusMode: "continuous",
        focusDistance: { ideal: 0 }
      }]
    },
    async (decodedText) => {
      console.log("Leader QR Code scanned:", decodedText);
      
      // Verify leader with backend
      try {
        const response = await fetch(`${serverURL}/verifyLeader`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: decodedText })
        });
        
        const result = await response.json();
        
        if (result.authorized) {
          // Leader verified successfully
          statusText.textContent = `✅ 認証成功！ / Verified: ${result.firstName} ${result.lastName} (${result.role})`;
          statusText.style.color = '#006400';
          
          // Stop scanner
          html5QrCode.stop().then(() => {
            // Close modal after short delay
            setTimeout(() => {
              modal.style.display = 'none';
              
              // Allow the change to happen
              previousSubDropdownValue = attemptedValue;
              subDropdown.value = attemptedValue;
              
              // Save the sub-dropdown value to localStorage
              localStorage.setItem(`${uniquePrefix}sub-dropdown`, attemptedValue);
              console.log(`Leader authorized change to: ${attemptedValue}`);
              
              // Apply the proper sendtoNCButtonisPressed logic
              NCPresstoFalse();
              
              // Fetch product details
              fetchProductDetails();
            }, 1500);
          }).catch(err => console.error("Error stopping scanner:", err));
        } else {
          // Not authorized
          statusText.textContent = `❌ 権限がありません / Not authorized: ${result.error}`;
          statusText.style.color = '#cc0000';
          
          // Revert dropdown to previous value
          subDropdown.value = previousSubDropdownValue;
        }
      } catch (error) {
        console.error("Error verifying leader:", error);
        statusText.textContent = '❌ エラーが発生しました / Error occurred during verification';
        statusText.style.color = '#cc0000';
        
        // Revert dropdown to previous value
        subDropdown.value = previousSubDropdownValue;
      }
    },
    (errorMessage) => {
      // QR scan error (ignore continuous scanning errors)
    }
  ).catch(err => {
    console.error("Error starting QR scanner:", err);
    statusText.textContent = '❌ カメラを起動できませんでした / Could not start camera';
    statusText.style.color = '#cc0000';
  });
  
  // Close button handler
  document.getElementById('closeLeaderVerificationModal').onclick = function() {
    // Stop the leader verification scanner and close modal
    if (leaderVerificationScanner) {
      leaderVerificationScanner.stop().then(() => {
        modal.style.display = 'none';
        // Revert dropdown to previous value
        subDropdown.value = previousSubDropdownValue;
        console.log("Leader verification cancelled, reverted to:", previousSubDropdownValue);
        leaderVerificationScanner = null;
      }).catch(err => {
        console.error("Error stopping scanner:", err);
        modal.style.display = 'none';
        subDropdown.value = previousSubDropdownValue;
        leaderVerificationScanner = null;
      });
    } else {
      modal.style.display = 'none';
      subDropdown.value = previousSubDropdownValue;
    }
  };
}

// Update previous value when scan button successfully changes the dropdown
function updatePreviousDropdownValue(newValue) {
  previousSubDropdownValue = newValue;
}

// Function to get link from Google Drive
function picLINK(headerValue) {
  fetch(`${picURL}?link=${headerValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text(); // Use .json() if your API returns JSON
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, ''); // Remove unnecessary quotes
      updateImageSrc(cleanedData);
      //console.log("image: " + cleanedData);
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

// Function to update the image src attribute
function updateImageSrc(link) {
  const imageElement = document.getElementById('dynamicImage');

  if (imageElement) {
    imageElement.src = `${link}&sz=s4000`; // Ensure valid URL structure
  } else {
    console.error("Error: Image element not found!");
  }
}

//function to manage sendtoNCButtonisPressed state when dropdown changes
function NCPresstoFalse() {
  checkValue();
  // Get current values
  const key = `${uniquePrefix}sendtoNCButtonisPressed`;
  const currentSebanggo = document.getElementById('sub-dropdown').value;
  const previousSebanggo = localStorage.getItem(`${uniquePrefix}previous-sebanggo`);
  
  console.log(`Dropdown changed: Previous=${previousSebanggo}, Current=${currentSebanggo}`);
  
  // Check if the selection has changed to a different value
  if (currentSebanggo !== previousSebanggo && currentSebanggo !== "Select 背番号") {
    // Different sebanggo selected, reset the state to false
    sendtoNCButtonisPressed = false;
    popupShown = false;
    localStorage.setItem(key, 'false');
    localStorage.setItem(`${uniquePrefix}previous-sebanggo`, currentSebanggo);
    console.log(`Reset sendtoNCButtonisPressed to false - sebanggo changed from ${previousSebanggo} to ${currentSebanggo}`);
  } 
  else if (currentSebanggo === "Select 背番号") {
    // "Select 背番号" was chosen, always reset to false
    sendtoNCButtonisPressed = false;
    popupShown = false;
    localStorage.setItem(key, 'false');
    localStorage.setItem(`${uniquePrefix}previous-sebanggo`, currentSebanggo);
    console.log(`Reset sendtoNCButtonisPressed to false - "Select 背番号" selected`);
  }
  else {
    // Same sebanggo selected again, preserve the current state
    const currentState = localStorage.getItem(key);
    sendtoNCButtonisPressed = currentState === 'true';
    console.log(`Preserved sendtoNCButtonisPressed state: ${sendtoNCButtonisPressed}`);
  }
}

// when time is pressed
// Set current time as default when time is pressed
function setDefaultTime(input) {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeValue = `${hours}:${minutes}`;
  input.value = timeValue;

  // Save the time to local storage with unique prefix
  localStorage.setItem(`${uniquePrefix}${input.id}`, timeValue);

  // Log time input based on type
  if (input.id === 'Start Time') {
    logTabletAction('Start time set', 'in-progress', {
      startTime: timeValue
    });
  } else if (input.id === 'End Time') {
    logTabletAction('End time set', 'in-progress', {
      endTime: timeValue
    });
  } else if (input.id.includes('break')) {
    logTabletAction(`Break time ${input.id} set`, 'in-progress', {
      breakTimeField: input.id,
      time: timeValue
    });
  } else if (input.id === 'KStart Time') {
    logTabletAction('Kensa start time set', 'in-progress', {
      kensaStartTime: timeValue
    });
  } else if (input.id === 'KEnd Time') {
    logTabletAction('Kensa end time set', 'in-progress', {
      kensaEndTime: timeValue
    });
  }

  // If this is a break time input, calculate total break time
  if (input.id.includes('break')) {
    calculateTotalBreakTime();
  }

  // If this is a trouble time input, calculate total trouble time
  if (input.id.includes('trouble')) {
    calculateTotalMachineTroubleTime();
  }

  // If this is the Start Time input, lock it to prevent accidental changes
  if (input.id === 'Start Time') {
    // Update lock status for start time
    setTimeout(() => {
      updateProcessingTimeLockStatus('start');
    }, 100);
  }

  // If this is the End Time input, lock it to prevent accidental changes
  if (input.id === 'End Time') {
    // Update lock status for end time
    setTimeout(() => {
      updateProcessingTimeLockStatus('end');
    }, 100);
  }
}

// Handle processing time input focus - check if locked before setting time
function handleProcessingTimeFocus(input) {
  // Check if the input is locked
  if (input.classList.contains('locked') || input.readOnly) {
    console.log(`🔒 Processing time input ${input.id} is locked - focus ignored to prevent accidental changes`);
    input.blur(); // Remove focus to prevent interaction
    return;
  }
  
  // If not locked, proceed with normal setDefaultTime behavior
  setDefaultTime(input);
}

// Function to reset individual break time
function resetBreakTime(breakNumber) {
  const startInput = document.getElementById(`break${breakNumber}-start`);
  const endInput = document.getElementById(`break${breakNumber}-end`);

  if (startInput && endInput) {
    // Log reset action with current values before clearing
    if (startInput.value || endInput.value) {
      logTabletAction(`Break time ${breakNumber} reset`, 'Reset', {
        breakNumber: breakNumber,
        previousStart: startInput.value,
        previousEnd: endInput.value
      });
    }
    
    // Clear the values
    startInput.value = '';
    endInput.value = '';

    // Create the unique prefix for localStorage
    const pageName = location.pathname.split('/').pop();
    const selected工場 = document.getElementById('selected工場').value;
    const selectedMachine = getQueryParam('machine');
    const prefix = `${pageName}_${selected工場}_${selectedMachine}_`;

    // Remove from localStorage
    const startKey = `${prefix}break${breakNumber}-start`;
    const endKey = `${prefix}break${breakNumber}-end`;
    localStorage.removeItem(startKey);
    localStorage.removeItem(endKey);

    // Recalculate total break time
    calculateTotalBreakTime();

    console.log(`Break time ${breakNumber} has been reset`);
  }
}

// Processing time lock functions
// Function to lock processing time inputs when they have values
function lockProcessingTime(timeType) {
  const timeInput = document.getElementById(timeType === 'start' ? 'Start Time' : 'End Time');
  const editBtn = document.getElementById(timeType === 'start' ? 'edit-start-time' : 'edit-end-time');

  if (timeInput) {
    // Add locked class and disable input
    timeInput.classList.add('locked');
    timeInput.readOnly = true;
    timeInput.style.pointerEvents = 'none';
    
    // Show edit button
    if (editBtn) {
      editBtn.style.display = 'inline-block';
    }
    
    console.log(`🔒 Processing ${timeType} time locked to prevent accidental changes`);
  }
}

// Function to unlock processing time inputs for editing
function unlockProcessingTime(timeType) {
  const timeInput = document.getElementById(timeType === 'start' ? 'Start Time' : 'End Time');
  const editBtn = document.getElementById(timeType === 'start' ? 'edit-start-time' : 'edit-end-time');

  if (timeInput) {
    // Remove locked class and enable input
    timeInput.classList.remove('locked');
    timeInput.readOnly = false;
    timeInput.style.pointerEvents = 'auto';
    
    // Hide edit button
    if (editBtn) {
      editBtn.style.display = 'none';
    }
    
    console.log(`🔓 Processing ${timeType} time unlocked for editing`);
  }
}

// Function to check and update lock status for processing times
function updateProcessingTimeLockStatus(timeType) {
  const timeInput = document.getElementById(timeType === 'start' ? 'Start Time' : 'End Time');
  
  if (timeInput) {
    const timeValue = timeInput.value;
    
    // Lock only if time has a value
    if (timeValue && timeValue.trim() !== '') {
      lockProcessingTime(timeType);
    } else {
      unlockProcessingTime(timeType);
    }
  }
}

// Function to update all processing time lock statuses
function updateAllProcessingTimeLockStatus() {
  updateProcessingTimeLockStatus('start');
  updateProcessingTimeLockStatus('end');
}

// Function to calculate total break time in minutes
function calculateTotalBreakTime() {
  let totalMinutes = 0;

  for (let i = 1; i <= 4; i++) {
    const startInput = document.getElementById(`break${i}-start`);
    const endInput = document.getElementById(`break${i}-end`);

    if (startInput && endInput) {
      const startTime = startInput.value;
      const endTime = endInput.value;

      if (startTime && endTime) {
        const start = new Date(`2000-01-01T${startTime}:00`);
        const end = new Date(`2000-01-01T${endTime}:00`);

        if (end > start) {
          const diffMs = end - start;
          const diffMinutes = Math.floor(diffMs / (1000 * 60));
          totalMinutes += diffMinutes;
        }
      }
    }
  }

  // Update the display and the input field
  const totalDisplay = document.getElementById('total-break-display');
  const breaktimeMins = document.getElementById('breaktime-mins');

  if (totalDisplay) {
    totalDisplay.textContent = `${totalMinutes}分`;
  }
  if (breaktimeMins) {
    breaktimeMins.value = totalMinutes;
  }

  // Save to localStorage with proper prefix
  const pageName = location.pathname.split('/').pop();
  const selected工場 = document.getElementById('selected工場')?.value;
  const selectedMachine = getQueryParam('machine');

  if (pageName && selected工場 && selectedMachine) {
    const prefix = `${pageName}_${selected工場}_${selectedMachine}_`;
    localStorage.setItem(`${prefix}breaktime-mins`, totalMinutes);
    localStorage.setItem(`${prefix}total-break-display`, `${totalMinutes}分`);
  }
  return totalMinutes; // Return total minutes for calculation in submit
}

// Dynamic Maintenance Time System
let maintenanceRecords = [];
let currentEditingIndex = -1;
let maintenancePhotos = []; // Array to store multiple photos for current maintenance
const MAX_MAINTENANCE_PHOTOS = 5; // Maximum photos per maintenance record

// Material Label Photo System
let materialLabelPhotos = []; // Array to store multiple material label photos
const MAX_MATERIAL_PHOTOS = 10; // Maximum number of photos allowed

// Load maintenance records from localStorage
function loadMaintenanceRecords() {
  const saved = localStorage.getItem(`${uniquePrefix}maintenanceRecords`);
  if (saved) {
    maintenanceRecords = JSON.parse(saved);
    renderMaintenanceRecords();
    calculateTotalMachineTroubleTime();
  }
}

// Save maintenance records to localStorage
function saveMaintenanceRecords() {
  localStorage.setItem(`${uniquePrefix}maintenanceRecords`, JSON.stringify(maintenanceRecords));
}

// Clear maintenance photos
function clearMaintenancePhotos() {
  maintenancePhotos = [];
  renderMaintenancePhotoThumbnails();
}

// Add photo to maintenance photos
function addMaintenancePhoto(base64Data) {
  if (maintenancePhotos.length >= MAX_MAINTENANCE_PHOTOS) {
    showAlert(`最大${MAX_MAINTENANCE_PHOTOS}枚まで撮影できます / Maximum ${MAX_MAINTENANCE_PHOTOS} photos allowed`);
    return false;
  }
  
  // SIMPLIFIED validation like test HTML - just check if it's not empty
  if (!base64Data || base64Data.length === 0) {
    console.error('❌ addMaintenancePhoto ERROR: Empty base64 data');
    showAlert('無効な画像データです。再試行してください。', false);
    return false;
  }
  
  console.log(`🔍 addMaintenancePhoto: Received ${base64Data.length} bytes of base64 data`);
  console.log(`🔍 addMaintenancePhoto: First 50 chars: ${base64Data.substring(0, 50)}`);
  
  const photoData = {
    base64: base64Data, // Clean base64 without data URL prefix  
    timestamp: Date.now(),
    id: `maintenance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    uploaded: false // Track upload status
  };
  
  maintenancePhotos.push(photoData);
  
  console.log(`📷 Photo added: ID=${photoData.id}, base64Length=${base64Data.length}, timestamp=${photoData.timestamp}`);
  
  renderMaintenancePhotoThumbnails();
  return true;
}

// Remove photo from maintenance photos
function removeMaintenancePhoto(index) {
  if (index >= 0 && index < maintenancePhotos.length) {
    maintenancePhotos.splice(index, 1);
    renderMaintenancePhotoThumbnails();
  }
}

// Render photo thumbnails in the modal
function renderMaintenancePhotoThumbnails() {
  const container = document.getElementById('maintenance-photo-thumbnails');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (maintenancePhotos.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #666; margin: 20px 0;">写真がありません / No photos</p>';
  } else {
    maintenancePhotos.forEach((photo, index) => {
      const thumbItem = document.createElement('div');
      thumbItem.style.cssText = `
        position: relative;
        display: inline-block;
        margin: 5px;
        border: 2px solid #ddd;
        border-radius: 5px;
        overflow: hidden;
        background: #f9f9f9;
      `;
      
      const img = document.createElement('img');
      // Use firebaseUrl if uploaded, otherwise use base64 data
      let imageSrc;
      if (photo.firebaseUrl && photo.uploaded) {
        imageSrc = photo.firebaseUrl;
      } else if (photo.base64) {
        // Use clean base64 data with proper data URL prefix for display
        imageSrc = `data:image/jpeg;base64,${photo.base64}`;
      } else {
        // Fallback for photos without either source
        console.warn('Photo has no displayable source:', photo);
        imageSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjQwIiB5PSI0NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5Ij5JbWFnZTwvdGV4dD4KPHR0ZXh0IHg9IjQwIiB5PSI1NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEwIiBmaWxsPSIjOTk5Ij5FcnJvcjwvdGV4dD4KPC9zdmc+'; // Placeholder SVG
      }
      img.src = imageSrc;
      img.style.cssText = `
        width: 80px;
        height: 80px;
        object-fit: cover;
        cursor: pointer;
        display: block;
      `;
      img.onclick = () => showMaintenancePhotoPreview(imageSrc);
      
      // Add error handling for failed image loads
      img.onerror = () => {
        console.error('Failed to load maintenance photo:', imageSrc);
        img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjQwIiB5PSI0NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5Ij5GYWlsZWQ8L3RleHQ+CjwvdGV4dD4KPC9zdmc+'; // Error placeholder
      };
      
      const removeBtn = document.createElement('button');
      removeBtn.innerHTML = '×';
      removeBtn.style.cssText = `
        position: absolute;
        top: 2px;
        right: 2px;
        background: #ff4444;
        color: white;
        border: none;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        font-size: 12px;
        cursor: pointer;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeMaintenancePhoto(index);
      };
      
      thumbItem.appendChild(img);
      thumbItem.appendChild(removeBtn);
      container.appendChild(thumbItem);
    });
  }
  
  // Update photo count display
  const photoCount = document.getElementById('maintenance-photo-count');
  if (photoCount) {
    photoCount.textContent = `${maintenancePhotos.length}/${MAX_MAINTENANCE_PHOTOS}`;
  }
}

// Show full size photo preview
function showMaintenancePhotoPreview(imageDataURL) {
  // Create a modal for full preview
  const previewModal = document.createElement('div');
  previewModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10001;
  `;
  
  const img = document.createElement('img');
  img.src = imageDataURL;
  img.style.cssText = `
    max-width: 90%;
    max-height: 90%;
    object-fit: contain;
  `;
  
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.style.cssText = `
    position: absolute;
    top: 20px;
    right: 20px;
    background: #ff4444;
    color: white;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    font-size: 20px;
    cursor: pointer;
  `;
  
  closeBtn.onclick = () => document.body.removeChild(previewModal);
  previewModal.onclick = (e) => {
    if (e.target === previewModal) document.body.removeChild(previewModal);
  };
  
  previewModal.appendChild(img);
  previewModal.appendChild(closeBtn);
  document.body.appendChild(previewModal);
}

// Show maintenance modal
function showMaintenanceModal(editIndex = -1) {
  currentEditingIndex = editIndex;
  const isEditing = editIndex >= 0;
  
  // Clear or load existing photos
  if (isEditing && maintenanceRecords[editIndex] && maintenanceRecords[editIndex].photos) {
    maintenancePhotos = [...maintenanceRecords[editIndex].photos];
  } else {
    maintenancePhotos = [];
  }
  
  // Create modal
  const modal = document.createElement('div');
  modal.id = 'maintenanceModal';
  modal.className = 'maintenance-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    padding: 30px;
    border-radius: 10px;
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
  `;

  // Pre-fill data if editing
  let existingRecord = {};
  if (isEditing && maintenanceRecords[editIndex]) {
    existingRecord = maintenanceRecords[editIndex];
  }

  modalContent.innerHTML = `
    <h2 style="margin-top: 0; text-align: center;">
      ${isEditing ? '機械故障時間編集' : '機械故障時間追加'} / ${isEditing ? 'Edit Maintenance' : 'Add Maintenance'}
    </h2>
    
    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">開始時間 / Start Time:</label>
      <input type="time" id="maintenance-start" value="${existingRecord.startTime || ''}" 
             style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 5px;">
    </div>
    
    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">終了時間 / End Time:</label>
      <input type="time" id="maintenance-end" value="${existingRecord.endTime || ''}"
             style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 5px;">
    </div>
    
    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">理由・説明 / Reason/Comment:</label>
      <textarea id="maintenance-comment" rows="4" placeholder="機械故障の理由を入力してください..."
                style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 5px; resize: vertical;">${existingRecord.comment || ''}</textarea>
    </div>
    
    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 10px; font-weight: bold;">
        写真 / Photos (<span id="maintenance-photo-count">0/${MAX_MAINTENANCE_PHOTOS}</span>):
      </label>
      <div style="margin-bottom: 10px;">
        <button type="button" id="take-maintenance-photo" 
                style="padding: 10px 20px; background: #007cba; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">
          📷 写真を撮る / Take Photo
        </button>
        <button type="button" id="clear-maintenance-photos" 
                style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
          🗑️ 全削除 / Clear All
        </button>
      </div>
      <div id="maintenance-photo-thumbnails" style="border: 1px solid #ddd; border-radius: 5px; padding: 10px; min-height: 60px; background: #f9f9f9;">
        <!-- Photo thumbnails will be rendered here -->
      </div>
    </div>
    
    <div style="display: flex; gap: 10px; justify-content: flex-end;">
      <button type="button" id="cancel-maintenance" 
              style="padding: 10px 20px; background: #ccc; color: black; border: none; border-radius: 5px; cursor: pointer;">
        キャンセル / Cancel
      </button>
      ${isEditing ? `
        <button type="button" id="delete-maintenance" 
                style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
          削除 / Delete
        </button>
      ` : ''}
      <button type="button" id="save-maintenance" 
              style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer;">
        保存 / Save
      </button>
    </div>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Render existing photos
  renderMaintenancePhotoThumbnails();

  // Add event listeners
  setupMaintenanceModalEvents(modal, existingRecord);
}

// Setup modal event listeners
function setupMaintenanceModalEvents(modal, existingRecord) {
  const takePhotoBtn = modal.querySelector('#take-maintenance-photo');
  const clearPhotosBtn = modal.querySelector('#clear-maintenance-photos');
  const saveBtn = modal.querySelector('#save-maintenance');
  const cancelBtn = modal.querySelector('#cancel-maintenance');
  const deleteBtn = modal.querySelector('#delete-maintenance');

  // Take photo functionality
  takePhotoBtn.addEventListener('click', async () => {
    if (maintenancePhotos.length >= MAX_MAINTENANCE_PHOTOS) {
      showAlert(`最大${MAX_MAINTENANCE_PHOTOS}枚まで撮影できます / Maximum ${MAX_MAINTENANCE_PHOTOS} photos allowed`);
      return;
    }
    
    await openMaintenanceCamera();
  });

  // Clear all photos functionality
  clearPhotosBtn.addEventListener('click', () => {
    if (maintenancePhotos.length > 0) {
      if (confirm('すべての写真を削除しますか？ / Delete all photos?')) {
        clearMaintenancePhotos();
      }
    }
  });

  // Save functionality
  saveBtn.addEventListener('click', () => {
    const startTime = modal.querySelector('#maintenance-start').value;
    const endTime = modal.querySelector('#maintenance-end').value;
    const comment = modal.querySelector('#maintenance-comment').value;

    if (!startTime || !endTime) {
      showAlert('開始時間と終了時間を入力してください / Please enter start and end times');
      return;
    }

    if (!comment.trim()) {
      showAlert('理由・説明を入力してください / Please enter a reason/comment');
      return;
    }

    const record = {
      id: currentEditingIndex >= 0 ? maintenanceRecords[currentEditingIndex].id : Date.now(),
      startTime,
      endTime,
      comment: comment.trim(),
      photos: [...maintenancePhotos], // Store multiple photos
      timestamp: currentEditingIndex >= 0 ? maintenanceRecords[currentEditingIndex].timestamp : new Date().toISOString()
    };

    if (currentEditingIndex >= 0) {
      maintenanceRecords[currentEditingIndex] = record;
      // Log maintenance record edit
      logTabletAction('Maintenance record edited', 'Completed', {
        startTime: record.startTime,
        endTime: record.endTime,
        comment: record.comment,
        photoCount: record.photos.length
      });
    } else {
      maintenanceRecords.push(record);
      // Log maintenance record add
      logTabletAction('Maintenance record added', 'Completed', {
        startTime: record.startTime,
        endTime: record.endTime,
        comment: record.comment,
        photoCount: record.photos.length
      });
    }

    saveMaintenanceRecords();
    renderMaintenanceRecords();
    calculateTotalMachineTroubleTime();
    
    // Clear the working photos array
    maintenancePhotos = [];
    
    document.body.removeChild(modal);
  });

  // Cancel functionality
  cancelBtn.addEventListener('click', () => {
    // Clear the working photos array
    maintenancePhotos = [];
    document.body.removeChild(modal);
  });

  // Delete functionality
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (confirm('この機械故障記録を削除しますか？ / Delete this maintenance record?')) {
        const deletedRecord = maintenanceRecords[currentEditingIndex];
        // Log maintenance record delete
        logTabletAction('Maintenance record deleted', 'Reset', {
          startTime: deletedRecord.startTime,
          endTime: deletedRecord.endTime,
          comment: deletedRecord.comment
        });
        
        maintenanceRecords.splice(currentEditingIndex, 1);
        saveMaintenanceRecords();
        renderMaintenanceRecords();
        calculateTotalMachineTroubleTime();
        
        // Clear the working photos array
        maintenancePhotos = [];
        
        document.body.removeChild(modal);
      }
    });
  }

  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      // Clear the working photos array
      maintenancePhotos = [];
      document.body.removeChild(modal);
    }
  });
}

// === Material Label Photo Functions ===
function clearMaterialLabelPhotos() {
  materialLabelPhotos = [];
  renderMaterialPhotoThumbnails();
  updateMaterialPhotoCount();
}

async function addMaterialLabelPhoto(photoDataURL) {
  if (materialLabelPhotos.length >= MAX_MATERIAL_PHOTOS) {
    alert(`最大${MAX_MATERIAL_PHOTOS}枚まで撮影できます / Maximum ${MAX_MATERIAL_PHOTOS} photos allowed`);
    return false;
  }
  
  console.log('Adding material label photo:', typeof photoDataURL, photoDataURL ? photoDataURL.substring(0, 50) + '...' : 'undefined');
  
  // Handle both base64 string and data URL formats
  let base64Data = photoDataURL;
  let displayURL;
  
  if (typeof photoDataURL === 'string') {
    if (photoDataURL.startsWith('data:image')) {
      // This is a full data URL
      displayURL = photoDataURL;
      base64Data = photoDataURL.split(',')[1];
      console.log('Extracted base64 data from data URL');
    } else {
      // Assume this is already base64 data
      displayURL = `data:image/jpeg;base64,${photoDataURL}`;
      console.log('Created display URL from base64 data');
    }
  } else {
    console.error('Invalid photo data provided to addMaterialLabelPhoto');
    return false;
  }

  // Compress image for localStorage to avoid quota issues
  // Original size
  const originalSize = (base64Data.length * 3 / 4 / 1024).toFixed(2);
  console.log(`Original material photo size: ${originalSize} KB`);
  
  // Compress to 60% quality, max 800px for localStorage storage
  const compressedDataURL = await compressBase64Image(displayURL, 800, 0.6);
  const compressedBase64 = compressedDataURL.split(',')[1] || compressedDataURL;
  const compressedSize = (compressedBase64.length * 3 / 4 / 1024).toFixed(2);
  console.log(`Compressed for localStorage: ${compressedSize} KB (${((1 - compressedBase64.length / base64Data.length) * 100).toFixed(1)}% reduction)`);

  const photoData = {
    base64: compressedBase64,  // Store compressed version
    timestamp: new Date().toISOString(),
    displayURL: compressedDataURL  // Also use compressed for display
  };

  materialLabelPhotos.push(photoData);
  console.log(`Added material label photo #${materialLabelPhotos.length}`);
  
  // Log material label photo capture
  logTabletAction('Material label photo captured', 'in-progress', {
    photoNumber: materialLabelPhotos.length,
    totalPhotos: materialLabelPhotos.length,
    timestamp: photoData.timestamp
  });
  
  renderMaterialPhotoThumbnails();
  updateMaterialPhotoCount();
  updateMaterialLabelElement();
  
  // Save to localStorage (now with compressed images)
  const key = `${uniquePrefix}materialLabelPhotos`;
  try {
    localStorage.setItem(key, JSON.stringify(materialLabelPhotos));
    console.log(`Saved ${materialLabelPhotos.length} compressed material photos to localStorage`);
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded! Cannot save material photos.');
      showAlert('ストレージ容量不足です。古い写真を削除してください / Storage full! Please delete old photos.');
      // Remove the photo we just added since we can't save it
      materialLabelPhotos.pop();
      renderMaterialPhotoThumbnails();
      updateMaterialPhotoCount();
      return false;
    }
    throw error;
  }
  
  return true;
}

function removeMaterialLabelPhoto(index) {
  if (index >= 0 && index < materialLabelPhotos.length) {
    const removedPhoto = materialLabelPhotos[index];
    materialLabelPhotos.splice(index, 1);
    
    // Log material label photo removal
    logTabletAction('Material label photo removed', 'in-progress', {
      photoIndex: index + 1,
      remainingPhotos: materialLabelPhotos.length,
      timestamp: removedPhoto.timestamp
    });
    
    // Save updated array to localStorage
    const key = `${uniquePrefix}materialLabelPhotos`;
    localStorage.setItem(key, JSON.stringify(materialLabelPhotos));
    renderMaterialPhotoThumbnails();
    updateMaterialPhotoCount();
  }
}

function renderMaterialPhotoThumbnails() {
  console.log('Rendering material photo thumbnails');
  
  // Use existing HTML structure (defined in HTML)
  const container = document.getElementById('material-photo-thumbnails');
  const photoCountSpan = document.getElementById('material-photo-count');
  
  if (!container) {
    console.error('material-photo-thumbnails container not found in HTML - this element should exist in DCP iReporter.html');
    console.log('Creating fallback container...');
    
    // Create fallback container dynamically
    const fallbackContainer = document.createElement('div');
    fallbackContainer.id = 'material-photo-thumbnails';
    fallbackContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0;';
    
    // Try to find the material label button area
    const makerButton = document.getElementById('makerLabelButton');
    if (makerButton && makerButton.parentElement) {
      makerButton.parentElement.appendChild(fallbackContainer);
      console.log('Created fallback material-photo-thumbnails container');
      
      // Also create photo count if missing
      if (!photoCountSpan) {
        const countDiv = document.createElement('div');
        countDiv.id = 'material-photo-count';
        countDiv.style.cssText = 'margin: 10px 0; font-weight: bold; color: #007cba;';
        makerButton.parentElement.insertBefore(countDiv, fallbackContainer);
      }
      
      // Retry rendering now that container exists
      return renderMaterialPhotoThumbnails();
    } else {
      console.error('Could not create fallback container - makerLabelButton not found');
      return;
    }
  }
  
  // Clear existing thumbnails
  container.innerHTML = '';
  
  // Update photo count display
  if (photoCountSpan) {
    photoCountSpan.textContent = `Photo ${materialLabelPhotos.length}/${MAX_MATERIAL_PHOTOS}`;
    photoCountSpan.style.display = materialLabelPhotos.length > 0 ? 'inline' : 'none';
  }
  
  // Hide/show container based on photo count
  if (materialLabelPhotos.length === 0) {
    container.style.display = 'none';
    console.log('No material label photos to display');
  } else {
    container.style.display = 'flex';
    console.log(`Rendering ${materialLabelPhotos.length} material label photos`);
    
    materialLabelPhotos.forEach((photo, index) => {
      const thumbItem = document.createElement('div');
      thumbItem.style.cssText = `
        position: relative;
        display: inline-block;
        margin: 5px;
      `;
      
      const img = document.createElement('img');
      
      // Determine image source
      let imageSrc;
      if (photo.displayURL) {
        imageSrc = photo.displayURL;
      } else if (photo.firebaseURL) {
        imageSrc = photo.firebaseURL;
      } else if (photo.base64) {
        imageSrc = `data:image/jpeg;base64,${photo.base64}`;
      } else {
        imageSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjQwIiB5PSI0NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5Ij5JbWFnZTwvdGV4dD4KPHR0ZXh0IHg9IjQwIiB5PSI1NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEwIiBmaWxsPSIjOTk5Ij5FcnJvcjwvdGV4dD4KPC9zdmc+';
      }
      
      img.src = imageSrc;
      img.style.cssText = `
        width: 80px;
        height: 80px;
        object-fit: cover;
        cursor: pointer;
        display: block;
        border: 2px solid #ddd;
        border-radius: 5px;
      `;
      img.onclick = () => showMaterialPhotoPreview(imageSrc);
      
      // Add error handling
      img.onerror = () => {
        console.error('Failed to load material label photo:', imageSrc);
        img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjQwIiB5PSI0NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5Ij5FcnJvcjwvdGV4dD4KPC9zdmc+';
      };
      
      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '×';
      deleteBtn.style.cssText = `
        position: absolute;
        top: -5px;
        right: -5px;
        background: #ff4444;
        color: white;
        border: none;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        font-size: 14px;
        cursor: pointer;
        line-height: 1;
      `;
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('Delete this material label photo?')) {
          removeMaterialLabelPhoto(index);
        }
      };
      
      thumbItem.appendChild(img);
      thumbItem.appendChild(deleteBtn);
      container.appendChild(thumbItem);
    });
  }
}

function showMaterialPhotoPreview(imageDataURL) {
  const previewModal = document.createElement('div');
  previewModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10001;
  `;
  
  const img = document.createElement('img');
  img.src = imageDataURL;
  img.style.cssText = `
    max-width: 90%;
    max-height: 90%;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  `;
  
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.style.cssText = `
    position: absolute;
    top: 20px;
    right: 20px;
    background: #ff4444;
    color: white;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    font-size: 20px;
    cursor: pointer;
  `;
  
  closeBtn.onclick = () => document.body.removeChild(previewModal);
  previewModal.onclick = (e) => {
    if (e.target === previewModal) document.body.removeChild(previewModal);
  };
  
  previewModal.appendChild(img);
  previewModal.appendChild(closeBtn);
  document.body.appendChild(previewModal);
}

function updateMaterialPhotoCount() {
  const countElement = document.getElementById('material-photo-count');
  const statusLabel = document.getElementById('makerLabel');
  const statusLabelJP = document.getElementById('材料ラベル_L');
  
  if (countElement) {
    countElement.textContent = `Photo ${materialLabelPhotos.length}/${MAX_MATERIAL_PHOTOS}`;
    countElement.style.display = materialLabelPhotos.length > 0 ? 'block' : 'none';
  }
  
  // Update Material Label status based on photo count
  const hasPhotos = materialLabelPhotos.length > 0;
  
  if (statusLabel) {
    statusLabel.textContent = hasPhotos ? 'TRUE' : 'FALSE';
  }
  
  if (statusLabelJP) {
    statusLabelJP.textContent = hasPhotos ? 'TRUE' : 'FALSE';
  }
  
  // Update the hidden 材料ラベル element as well (for compatibility)
  updateMaterialLabelElement();
}

// Function to load material label photos from localStorage
function loadMaterialLabelPhotos() {
  console.log('Loading material label photos from localStorage');
  const key = `${uniquePrefix}materialLabelPhotos`;
  const saved = localStorage.getItem(key);
  
  if (saved) {
    try {
      materialLabelPhotos = JSON.parse(saved);
      console.log(`Loaded ${materialLabelPhotos.length} material label photos from localStorage`);
      
      // Ensure photos have proper displayURL format if missing
      materialLabelPhotos = materialLabelPhotos.map(photo => {
        // Fix missing displayURL if needed
        if (!photo.displayURL && photo.base64) {
          photo.displayURL = `data:image/jpeg;base64,${photo.base64}`;
        }
        return photo;
      });
      
      // Update UI with the loaded photos
      renderMaterialPhotoThumbnails();
      updateMaterialPhotoCount();
      updateMaterialLabelElement();
      
      // Force an additional render after a short delay to ensure UI is updated
      setTimeout(() => {
        renderMaterialPhotoThumbnails();
        updateMaterialLabelElement();
        console.log('Completed delayed rendering of material label photos');
      }, 1000);
      
    } catch (error) {
      console.error('Error loading material label photos from localStorage:', error);
      materialLabelPhotos = [];
    }
  } else {
    console.log('No material label photos found in localStorage');
    materialLabelPhotos = [];
  }
}

// Function to update the hidden 材料ラベル element for compatibility
function updateMaterialLabelElement() {
  // Try different possible selectors for material label image element
  const makerPic = document.getElementById('材料ラベル') || 
                  document.querySelector('img[id="材料ラベル"]') || 
                  document.querySelector('img[name="材料ラベル"]');
  
  if (!makerPic) {
    console.warn('Could not find 材料ラベル element to update. Creating one if needed.');
    
    // Try to find a parent element to attach to
    const makerLabelButton = document.getElementById('makerLabelButton');
    const makerLabelArea = document.querySelector('div:has(> #材料ラベル_L)') || 
                          makerLabelButton?.parentElement;
                          
    if (makerLabelArea) {
      // Create the image element if it doesn't exist
      const newImg = document.createElement('img');
      newImg.id = '材料ラベル';
      newImg.style.cssText = 'max-width: 200px; max-height: 200px; margin-top: 10px; display: none;';
      
      // Insert after the button's parent div or at the end of the target area
      makerLabelArea.appendChild(newImg);
      console.log('Created new 材料ラベル image element');
      
      // Now use the newly created element
      updateMaterialLabelElement();
      return;
    } else {
      console.error('Could not find appropriate parent for 材料ラベル element');
      return;
    }
  }
  
  // Try different possible selectors for material label status elements
  const materialLabelJP = document.getElementById('材料ラベル_L');
  const materialLabelEN = document.getElementById('makerLabel');
  
  console.log('Material label elements found for update:', {
    '材料ラベル': !!makerPic,
    '材料ラベル_L': !!materialLabelJP,
    'makerLabel': !!materialLabelEN
  });
  
  if (materialLabelPhotos.length > 0) {
    // Use the first photo to set the legacy element
    const photo = materialLabelPhotos[0];
    let src;
    
    if (photo.displayURL) {
      src = photo.displayURL;
      console.log('Using displayURL for material label');
    } else if (photo.firebaseURL) {
      src = photo.firebaseURL;
      console.log('Using firebaseURL for material label');
    } else if (photo.base64) {
      src = `data:image/jpeg;base64,${photo.base64}`;
      console.log('Using base64 data for material label');
    } else {
      console.warn('No valid image source found in photo object');
      return;
    }
    
    try {
      // Set the image source and make it visible
      makerPic.src = src;
      makerPic.style.display = 'block';
      
      // Save to localStorage for persistence across refreshes
      localStorage.setItem(`${uniquePrefix}材料ラベル.src`, src);
      
      // Update all possible label status elements
      if (materialLabelJP) {
        materialLabelJP.textContent = 'TRUE';
        localStorage.setItem(`${uniquePrefix}材料ラベル_L.textContent`, 'TRUE');
      }
      
      if (materialLabelEN) {
        materialLabelEN.textContent = 'TRUE';
        localStorage.setItem(`${uniquePrefix}makerLabel.textContent`, 'TRUE');
      }
      
      console.log('Successfully updated 材料ラベル element with first material photo');
    } catch (error) {
      console.error('Error setting material label image:', error);
    }
  } else {
    // No photos, clear the element
    try {
      makerPic.src = '';
      makerPic.style.display = 'none';
      
      // Update localStorage
      localStorage.removeItem(`${uniquePrefix}材料ラベル.src`);
      
      // Update all possible label status elements
      if (materialLabelJP) {
        materialLabelJP.textContent = 'FALSE';
        localStorage.setItem(`${uniquePrefix}材料ラベル_L.textContent`, 'FALSE');
      }
      
      if (materialLabelEN) {
        materialLabelEN.textContent = 'FALSE';
        localStorage.setItem(`${uniquePrefix}makerLabel.textContent`, 'FALSE');
      }
      
      console.log('Cleared 材料ラベル element (no photos)');
    } catch (error) {
      console.error('Error clearing material label image:', error);
    }
  }
}

// Render maintenance records as clickable items
function renderMaintenanceRecords() {
  const container = document.getElementById('maintenance-records-container');
  if (!container) {
    console.error('Maintenance records container not found');
    return;
  }

  container.innerHTML = '';

  maintenanceRecords.forEach((record, index) => {
    const recordElement = document.createElement('div');
    recordElement.className = 'maintenance-record-item';
    recordElement.style.cssText = `
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 5px;
      padding: 10px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: background-color 0.2s;
    `;

    const duration = calculateDuration(record.startTime, record.endTime);
    const photoCount = record.photos ? record.photos.length : 0;
    const photoIndicator = photoCount > 0 ? `📷 ${photoCount}` : '';
    
    recordElement.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="flex: 1;">
          <strong>${record.startTime} - ${record.endTime}</strong> (${duration}分)
          <br>
          <small style="color: #666;">${record.comment}</small>
        </div>
        <div style="color: #007cba; font-size: 14px;">
          ${photoIndicator}
        </div>
      </div>
    `;

    recordElement.addEventListener('click', () => showMaintenanceModal(index));
    recordElement.addEventListener('mouseenter', () => {
      recordElement.style.backgroundColor = '#e9ecef';
    });
    recordElement.addEventListener('mouseleave', () => {
      recordElement.style.backgroundColor = '#f8f9fa';
    });

    container.appendChild(recordElement);
  });
}

// Calculate duration between start and end time
function calculateDuration(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  
  const start = new Date(`2000-01-01T${startTime}:00`);
  const end = new Date(`2000-01-01T${endTime}:00`);
  
  if (end > start) {
    return Math.floor((end - start) / (1000 * 60));
  }
  return 0;
}

// Calculate total maintenance time
function calculateTotalMachineTroubleTime() {
  let totalMinutes = 0;

  maintenanceRecords.forEach(record => {
    totalMinutes += calculateDuration(record.startTime, record.endTime);
  });

  const totalElement = document.getElementById('total-trouble-display');
  if (totalElement) {
    totalElement.textContent = `${totalMinutes}分`;
  }

  const troubleTimeDisplay = document.getElementById('trouble-time-display');
  if (troubleTimeDisplay) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    troubleTimeDisplay.value = `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
  }

  // Save to localStorage
  const pageName = location.pathname.split('/').pop();
  const selected工場 = document.getElementById('selected工場')?.value;
  const selectedMachine = getQueryParam('machine');

  if (pageName && selected工場 && selectedMachine) {
    const prefix = `${pageName}_${selected工場}_${selectedMachine}_`;
    localStorage.setItem(`${prefix}total-trouble-display`, `${totalMinutes}分`);
    localStorage.setItem(`${prefix}trouble-time-mins`, totalMinutes);
  }
  
  return totalMinutes;
}


// Upload maintenance photos to Firebase via server endpoint
// Legacy uploadMaintenancePhotos function removed - now using atomic submission via /submitToDCP

async function testMaintenanceData() {
  const selectedSebanggo = document.getElementById("sub-dropdown").value;
  const currentDate = document.getElementById("Lot No.").value;
  const selectedWorker = document.getElementById("Machine Operator").value;
  const selectedFactory = document.getElementById("selected工場").value;
  const selectedMachine = document.getElementById("process").value;

  console.log("🧪 Testing maintenance data transmission...");
  console.log("🔍 Values from frontend:", {
    selectedSebanggo: `"${selectedSebanggo}"`,
    currentDate: `"${currentDate}"`,
    selectedWorker: `"${selectedWorker}"`,
    selectedFactory: `"${selectedFactory}"`,
    selectedMachine: `"${selectedMachine}"`
  });

  try {
    const testPayload = {
      factory: selectedFactory,
      machine: selectedMachine,
      worker: selectedWorker,
      sebanggo: selectedSebanggo,
      date: currentDate
    };

    console.log("🧪 Sending test payload:", JSON.stringify(testPayload, null, 2));

    const testResponse = await fetch(`${serverURL}/testMaintenanceData`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });
    
    const testResult = await testResponse.json();
    console.log("🧪 Test response received:", testResult);
    alert("Check console for test results");
  } catch (error) {
    console.error("🧪 Test failed:", error);
    alert("Test failed: " + error.message);
  }
}

// Legacy functions for compatibility (keep these as they are)
function resetMachineTrouble(troubleNumber) {
  // This function is kept for backward compatibility but now just opens the maintenance modal
  showMaintenanceModal();
}

function resetTroubleTime(troubleNumber) {
  // This function is kept for backward compatibility but now just opens the maintenance modal
  showMaintenanceModal();
}


// When date is pressed or on page load, set current date as default
// Set current date as default when date is pressed or on page load
function setDefaultDate(input) {

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateValue = `${year}-${month}-${day}`;
  input.value = dateValue;

  // Save the date to local storage with unique prefix
  localStorage.setItem(`${uniquePrefix}${input.id}`, dateValue);
}

// Set current date as default on page load
document.addEventListener("DOMContentLoaded", function() {
  const dateInput = document.getElementById("Lot No.");
  setDefaultDate(dateInput);
});

//Get worker list
document.addEventListener("DOMContentLoaded", async function() {
  const selectedFactory = document.getElementById("selected工場").value;

  if (selectedFactory) {
    try {
      const response = await fetch(`${serverURL}/getWorkerNames?selectedFactory=${encodeURIComponent(selectedFactory)}`);
      if (!response.ok) throw new Error("Failed to fetch worker names");

      const workerNames = await response.json();
      
      // Store worker names for modal
      workerNamesData = workerNames;
      
      const dataList = document.getElementById("machine-operator-suggestions");
      dataList.innerHTML = ""; // Clear any existing options

      workerNames.forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        dataList.appendChild(option);
      });
    } catch (error) {
      console.error("Error fetching worker names:", error);
    }
  }
});

//function for plus minus button
function incrementCounter(counterId) {
  const counterElement = document.getElementById(`counter-${counterId}`);
  let currentValue = parseInt(counterElement.value, 10);
  currentValue += 1;
  counterElement.value = currentValue;

  // Save the updated value to local storage with the unique prefix
  localStorage.setItem(`${uniquePrefix}counter-${counterId}`, currentValue);

  // Log counter increment
  logTabletAction(`Counter ${counterId} incremented`, 'in-progress', {
    counterId: counterId,
    newValue: currentValue
  });

  updateTotal();
}

function decrementCounter(counterId) {
  const counterElement = document.getElementById(`counter-${counterId}`);
  let currentValue = parseInt(counterElement.value, 10);
  if (currentValue > 0) {
    currentValue -= 1;
    counterElement.value = currentValue;

    // Save the updated value to local storage with the unique prefix
    localStorage.setItem(`${uniquePrefix}counter-${counterId}`, currentValue);

    // Log counter decrement
    logTabletAction(`Counter ${counterId} decremented`, 'in-progress', {
      counterId: counterId,
      newValue: currentValue
    });

    updateTotal();
  }
}

// Helper function to handle alert modal display
function showAlert(message) {
  const alertSound = document.getElementById('alert-sound');
  const scanAlertModal = document.getElementById('scanAlertModal');
  document.getElementById('scanAlertText').innerText = message;
  scanAlertModal.style.display = 'block';

  if (alertSound) {
    alertSound.muted = false; // Unmute to alert user
    alertSound.volume = 1; // Set full volume
    alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
  }

  document.body.classList.add('flash-red');

  const closeScanModalButton = document.getElementById('closeScanModalButton');
  closeScanModalButton.onclick = function() {
    scanAlertModal.style.display = 'none';
    alertSound.pause();
    alertSound.currentTime = 0; // Reset sound to the beginning
    alertSound.muted = true; // Mute again for next time
    document.body.classList.remove('flash-red');
  };
}

// Worker Name Selection Modal Functionality
let workerNamesData = [];
const RECENT_WORKERS_KEY = 'recentWorkerNames';
const MAX_RECENT_WORKERS = 6;

// Get recent workers from localStorage
function getRecentWorkers() {
  const recent = localStorage.getItem(RECENT_WORKERS_KEY);
  return recent ? JSON.parse(recent) : [];
}

// Add worker to recent list
function addToRecentWorkers(name) {
  if (!name || name.trim() === '') return; // Don't add empty names
  
  let recent = getRecentWorkers();
  
  // Remove if already exists
  recent = recent.filter(w => w !== name);
  
  // Add to beginning
  recent.unshift(name);
  
  // Keep only max recent
  recent = recent.slice(0, MAX_RECENT_WORKERS);
  
  localStorage.setItem(RECENT_WORKERS_KEY, JSON.stringify(recent));
}

// Remove worker from recent list
function removeFromRecentWorkers(name) {
  let recent = getRecentWorkers();
  recent = recent.filter(w => w !== name);
  localStorage.setItem(RECENT_WORKERS_KEY, JSON.stringify(recent));
  renderWorkerNames(); // Re-render to update UI
}

// Group names alphabetically
function groupNamesByLetter(names) {
  const grouped = {};
  
  names.forEach(name => {
    // Get first character (handle Japanese, English, etc.)
    let firstChar = name.charAt(0).toUpperCase();
    
    // For Japanese characters, try to group by first character
    if (firstChar.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/)) {
      // Japanese character - use as is
      firstChar = name.charAt(0);
    } else if (firstChar.match(/[A-Z]/)) {
      // English letter - use uppercase
      firstChar = firstChar.toUpperCase();
    } else {
      // Other characters - group under '#'
      firstChar = '#';
    }
    
    if (!grouped[firstChar]) {
      grouped[firstChar] = [];
    }
    grouped[firstChar].push(name);
  });
  
  // Sort each group
  Object.keys(grouped).forEach(key => {
    grouped[key].sort();
  });
  
  return grouped;
}

// Render worker names in modal
function renderWorkerNames() {
  const container = document.getElementById('workerNamesContainer');
  container.innerHTML = '';
  
  // Get recent workers
  const recentWorkers = getRecentWorkers();
  
  // Add recent section if there are recent workers
  if (recentWorkers.length > 0) {
    const recentSection = document.createElement('div');
    recentSection.className = 'worker-section recent-section';
    
    const header = document.createElement('div');
    header.className = 'worker-section-header';
    header.textContent = '⭐ 最近使用 / Recent';
    recentSection.appendChild(header);
    
    const grid = document.createElement('div');
    grid.className = 'worker-names-grid';
    
    recentWorkers.forEach(name => {
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'worker-name-btn';
      btn.textContent = name;
      btn.onclick = () => selectWorkerName(name);
      
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-recent-btn';
      deleteBtn.innerHTML = '×';
      deleteBtn.onclick = (e) => {
        e.stopPropagation(); // Prevent selecting the worker
        removeFromRecentWorkers(name);
      };
      
      wrapper.appendChild(btn);
      wrapper.appendChild(deleteBtn);
      grid.appendChild(wrapper);
    });
    
    recentSection.appendChild(grid);
    container.appendChild(recentSection);
  }
  
  // Group all names alphabetically
  const grouped = groupNamesByLetter(workerNamesData);
  const sortedKeys = Object.keys(grouped).sort();
  
  // Render each alphabetical group
  sortedKeys.forEach(letter => {
    const section = document.createElement('div');
    section.className = 'worker-section';
    
    const header = document.createElement('div');
    header.className = 'worker-section-header';
    header.textContent = letter;
    section.appendChild(header);
    
    const grid = document.createElement('div');
    grid.className = 'worker-names-grid';
    
    grouped[letter].forEach(name => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'worker-name-btn';
      btn.textContent = name;
      btn.onclick = () => selectWorkerName(name);
      grid.appendChild(btn);
    });
    
    section.appendChild(grid);
    container.appendChild(section);
  });
}

// Select worker name
function selectWorkerName(name) {
  const input = document.getElementById('Machine Operator');
  input.value = name;
  
  // Add to recent workers
  addToRecentWorkers(name);
  
  // Save to localStorage (programmatic changes don't trigger 'input' event)
  const pageName = location.pathname.split('/').pop();
  const currentSelectedFactory = document.getElementById('selected工場')?.value;
  const currentSelectedMachine = getQueryParam('machine');
  if (pageName && currentSelectedFactory && currentSelectedMachine) {
    const key = `${pageName}_${currentSelectedFactory}_${currentSelectedMachine}_${input.id || input.name}`;
    localStorage.setItem(key, name);
    console.log('Worker name saved to localStorage:', key, '=', name);
  }
  
  // Log worker name selection
  logTabletAction('Worker name selected', 'in-progress', {
    workerName: name
  });
  
  // Close modal
  closeWorkerModal();
  
  // Trigger change event
  input.dispatchEvent(new Event('change'));
}

// Open worker modal
function openWorkerModal() {
  currentModalInputField = 'worker'; // Track which field opened the modal
  const modal = document.getElementById('workerNameModal');
  modal.style.display = 'block';
  renderWorkerNames();
}

// Close worker modal
function closeWorkerModal() {
  const modal = document.getElementById('workerNameModal');
  modal.style.display = 'none';
}

// Initialize worker name modal (runs after DOMContentLoaded)
setTimeout(function() {
  const workerInput = document.getElementById('Machine Operator');
  const closeModalBtn = document.getElementById('closeWorkerModal');
  const manualEntryBtn = document.getElementById('manualEntryBtn');
  
  // Open modal when clicking on worker input (only if readonly)
  if (workerInput) {
    // Prevent default keyboard from showing on mobile
    workerInput.addEventListener('click', function(e) {
      // Only open modal if input is readonly (not in manual entry mode)
      if (workerInput.readOnly && workerNamesData.length > 0) {
        e.preventDefault();
        openWorkerModal();
      }
    });
    
    // Also open on focus
    workerInput.addEventListener('focus', function(e) {
      // Only open modal if input is readonly (not in manual entry mode)
      if (workerInput.readOnly && workerNamesData.length > 0) {
        e.preventDefault();
        openWorkerModal();
      }
    });
    
    // Prevent keyboard from showing on touch devices
    workerInput.addEventListener('touchstart', function(e) {
      // Only prevent and open modal if input is readonly
      if (workerInput.readOnly && workerNamesData.length > 0) {
        e.preventDefault();
        openWorkerModal();
      }
    });
  }
  
  // Close modal button
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeWorkerModal);
  }
  
  // Manual entry button - close modal and let user type
  if (manualEntryBtn) {
    manualEntryBtn.addEventListener('click', function() {
      // Determine which input field to enable for manual entry
      const targetInput = currentModalInputField === 'kensa' 
        ? document.getElementById('Kensa Name')
        : document.getElementById('Machine Operator');
      
      // Close the modal
      if (currentModalInputField === 'kensa') {
        closeKensaModal();
      } else {
        closeWorkerModal();
      }
      
      if (targetInput) {
        // Remove readonly and datalist to allow free typing
        targetInput.removeAttribute('list');
        targetInput.removeAttribute('readonly');
        targetInput.readOnly = false;
        targetInput.style.cursor = 'text';
        targetInput.placeholder = currentModalInputField === 'kensa' 
          ? 'Type inspector name manually...'
          : 'Type worker name manually...';
        
        // Clear current value and focus after modal closes
        setTimeout(function() {
          targetInput.value = '';
          targetInput.focus();
          
          // Trigger click to ensure keyboard shows on mobile
          targetInput.click();
        }, 100);
      }
    });
  }
  
  // Close modal when clicking outside
  const modal = document.getElementById('workerNameModal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeWorkerModal();
      }
    });
  }
  
  // Save manually entered worker name to recents when user finishes typing
  if (workerInput) {
    workerInput.addEventListener('blur', function() {
      const enteredName = workerInput.value.trim();
      if (enteredName && !workerInput.readOnly) {
        // Only save if user manually typed (not readonly)
        addToRecentWorkers(enteredName);
      }
    });
    
    // Also save on Enter key
    workerInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        const enteredName = workerInput.value.trim();
        if (enteredName && !workerInput.readOnly) {
          addToRecentWorkers(enteredName);
        }
      }
    });
  }
}, 100);

// Initialize Kensa Name modal (same as worker modal but for inspector)
setTimeout(function() {
  const kensaInput = document.getElementById('Kensa Name');
  const enableInputsCheckbox = document.getElementById('enable-inputs');
  
  if (!kensaInput) return; // Element doesn't exist, skip
  
  // Function to check if kensa is enabled
  function isKensaEnabled() {
    return enableInputsCheckbox && enableInputsCheckbox.checked;
  }
  
  // Open worker modal when clicking on kensa input (only if checkbox is checked)
  if (kensaInput) {
    // Prevent default keyboard from showing on mobile
    kensaInput.addEventListener('click', function(e) {
      // Only open modal if checkbox is checked and input is readonly
      if (isKensaEnabled() && kensaInput.readOnly && workerNamesData.length > 0) {
        e.preventDefault();
        openKensaModal();
      }
    });
    
    // Also open on focus
    kensaInput.addEventListener('focus', function(e) {
      // Only open modal if checkbox is checked and input is readonly
      if (isKensaEnabled() && kensaInput.readOnly && workerNamesData.length > 0) {
        e.preventDefault();
        openKensaModal();
      }
    });
    
    // Prevent keyboard from showing on touch devices
    kensaInput.addEventListener('touchstart', function(e) {
      // Only prevent and open modal if checkbox is checked and input is readonly
      if (isKensaEnabled() && kensaInput.readOnly && workerNamesData.length > 0) {
        e.preventDefault();
        openKensaModal();
      }
    });
    
    // Save manually entered kensa name to recents when user finishes typing
    kensaInput.addEventListener('blur', function() {
      const enteredName = kensaInput.value.trim();
      if (enteredName && !kensaInput.readOnly && isKensaEnabled()) {
        // Only save if user manually typed (not readonly) and checkbox is checked
        addToRecentWorkers(enteredName);
      }
    });
    
    // Also save on Enter key
    kensaInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        const enteredName = kensaInput.value.trim();
        if (enteredName && !kensaInput.readOnly && isKensaEnabled()) {
          addToRecentWorkers(enteredName);
        }
      }
    });
  }
}, 100);

// Select kensa name (inspector)
function selectKensaName(name) {
  const input = document.getElementById('Kensa Name');
  if (!input) return;
  
  input.value = name;
  
  // Add to recent workers
  addToRecentWorkers(name);
  
  // Log inspector name selection
  logTabletAction('Inspector name selected', 'in-progress', {
    inspectorName: name
  });
  
  // Close modal
  closeKensaModal();
  
  // Trigger change event
  input.dispatchEvent(new Event('change'));
}

// Open kensa modal (reuses worker modal)
function openKensaModal() {
  currentModalInputField = 'kensa'; // Track which field opened the modal
  const modal = document.getElementById('workerNameModal');
  modal.style.display = 'block';
  renderKensaNames();
}

// Close kensa modal
function closeKensaModal() {
  const modal = document.getElementById('workerNameModal');
  modal.style.display = 'none';
}

// Render kensa names (similar to renderWorkerNames but calls selectKensaName)
function renderKensaNames() {
  const container = document.getElementById('workerNamesContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Get recent workers
  const recentWorkers = getRecentWorkers();
  
  // Create recent section if there are recent workers
  if (recentWorkers.length > 0) {
    const recentSection = document.createElement('div');
    recentSection.className = 'worker-section recent-section';
    
    const recentHeader = document.createElement('div');
    recentHeader.className = 'worker-section-header';
    recentHeader.textContent = '最近使用 / Recent';
    recentSection.appendChild(recentHeader);
    
    const recentGrid = document.createElement('div');
    recentGrid.className = 'worker-names-grid';
    
    recentWorkers.forEach(name => {
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'worker-name-btn';
      btn.textContent = name;
      btn.onclick = () => selectKensaName(name);
      
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-recent-btn';
      deleteBtn.textContent = '×';
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        removeFromRecentWorkers(name);
        renderKensaNames(); // Re-render
      };
      
      wrapper.appendChild(btn);
      wrapper.appendChild(deleteBtn);
      recentGrid.appendChild(wrapper);
    });
    
    recentSection.appendChild(recentGrid);
    container.appendChild(recentSection);
  }
  
  // Create all workers section
  const allSection = document.createElement('div');
  allSection.className = 'worker-section';
  
  const allHeader = document.createElement('div');
  allHeader.className = 'worker-section-header';
  allHeader.textContent = 'すべての作業者 / All Workers';
  allSection.appendChild(allHeader);
  
  const allGrid = document.createElement('div');
  allGrid.className = 'worker-names-grid';
  
  workerNamesData.forEach(name => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'worker-name-btn';
    btn.textContent = name;
    btn.onclick = () => selectKensaName(name);
    allGrid.appendChild(btn);
  });
  
  allSection.appendChild(allGrid);
  container.appendChild(allSection);
  
  // Update modal button handlers for kensa
  const closeModalBtn = document.getElementById('closeWorkerModal');
  const manualEntryBtn = document.getElementById('manualEntryBtn');
  
  // Note: Manual entry button handler is set globally in the initialization
  // No need to override it here, it will use currentModalInputField to determine which field to edit
}

// Updates cycle times for pressDB and kensaDB
function updateCycleTime() {
  // PressDB cycle time
  const startTime = document.getElementById("Start Time").value;
  const endTime = document.getElementById("End Time").value;
  const quantity = parseInt(document.getElementById("ProcessQuantity").value, 10) || 1; // Avoid division by 0

  if (startTime && endTime) {
    const start = new Date(`1970-01-01T${startTime}:00Z`);
    const end = new Date(`1970-01-01T${endTime}:00Z`);

    // Calculate difference in milliseconds and convert to seconds
    const diffInSeconds = (end - start) / 1000;

    // Calculate cycle time (in seconds per item)
    const cycleTime = diffInSeconds / quantity;

    // Update the Cycle Time field in the form
    document.getElementById("cycleTime").value = cycleTime.toFixed(2);
  }

  // KensaDB cycle time (only if elements exist)
  const kStartTimeElement = document.getElementById("KStart Time");
  const kEndTimeElement = document.getElementById("KEnd Time");
  const totalElement = document.getElementById("total");
  
  if (kStartTimeElement && kEndTimeElement && totalElement) {
    const kStartTime = kStartTimeElement.value;
    const kEndTime = kEndTimeElement.value;
    const kQuantity = parseInt(totalElement.value, 10) || 1; // Total quantity for kensaDB

    if (kStartTime && kEndTime) {
      const kStart = new Date(`1970-01-01T${kStartTime}:00Z`);
      const kEnd = new Date(`1970-01-01T${kEndTime}:00Z`);

      // Calculate difference in milliseconds and convert to seconds
      const kDiffInSeconds = (kEnd - kStart) / 1000;

      // Calculate cycle time (in seconds per item)
      const cycleTimeK = kDiffInSeconds / kQuantity;

      // Update the Cycle Time K field in the form
      const cycleTimeKElement = document.getElementById("cycleTimeK");
      if (cycleTimeKElement) {
        cycleTimeKElement.value = cycleTimeK.toFixed(2);
      }
    }
  }
}

//scan BUtton javascript
document.getElementById('scan-button').addEventListener('click', function() {
  const qrScannerModal = document.getElementById('qrScannerModal');
  const scanAlertModal = document.getElementById('scanAlertModal');
  const scanAlertText = document.getElementById('scanAlertText');
  const html5QrCode = new Html5Qrcode("qrReader");
  const alertSound = document.getElementById('alert-sound');

  // Preload the alert sound without playing it
  if (alertSound) {
    alertSound.muted = true; // Mute initially to preload
    alertSound.loop = false; // Disable looping
    alertSound.load(); // Preload the audio file
  }

  // Show the modal
  qrScannerModal.style.display = 'block';

  // Start QR code scanning with near-focus detection (optimized for 10-inch tablet)
  html5QrCode.start(
    {
      facingMode: "environment"
    }, {
      fps: 30,
      qrbox: {
        width: 800,
        height: 800
      },
      aspectRatio: 1.0,
      disableFlip: false,
      advanced: [{
        focusMode: "continuous",
        focusDistance: { ideal: 0 }
      }]
    },
    async qrCodeMessage => {
      const subDropdown = document.getElementById('sub-dropdown');
      const options = [...subDropdown.options].map(option => option.value);

      console.log("Scanned QR Code:", qrCodeMessage);
      
      // Save current state of sendtoNCButtonisPressed before potentially changing dropdown
      const currentState = localStorage.getItem(`${uniquePrefix}sendtoNCButtonisPressed`);
      console.log("Current sendtoNCButtonisPressed state before scan:", currentState);
      
      // Check if the scanned QR code does NOT exist in the dropdown options
      if (!options.includes(qrCodeMessage)) {
        // Display error modal
        scanAlertText.innerText = "背番号が存在しません。 / Sebanggo does not exist.";
        scanAlertModal.style.display = 'block';

        // Play alert sound
        if (alertSound) {
          alertSound.muted = false; // Unmute to alert user
          alertSound.volume = 1; // Set full volume
          alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
        }

        // Add blinking red background
        document.body.classList.add('flash-red');

        const closeScanModalButton = document.getElementById('closeScanModalButton');
        closeScanModalButton.onclick = function() {
          scanAlertModal.style.display = 'none';
          alertSound.pause();
          alertSound.currentTime = 0; // Reset sound to the beginning
          alertSound.muted = true; // Mute again for next time
          document.body.classList.remove('flash-red');
        };

        // Stop QR scanning
        html5QrCode.stop().then(() => {
          qrScannerModal.style.display = 'none';
        }).catch(err => console.error("Failed to stop scanning:", err));

        return;
      }

      // If QR code matches an option, set the dropdown value and close scanner
      if (subDropdown && subDropdown.value !== qrCodeMessage) {
        // Save current button state before changing dropdown
        const key = `${uniquePrefix}sendtoNCButtonisPressed`;
        const currentButtonState = localStorage.getItem(key);
        console.log(`Saving current button state before changing dropdown: ${currentButtonState}`);
        
        try {
          // First stop the QR scanner to prevent continued scanning during processing
          await html5QrCode.stop();
          qrScannerModal.style.display = 'none';
          
          // Update the previous dropdown value to allow this change (bypassing leader verification)
          updatePreviousDropdownValue(qrCodeMessage);
          
          // Now that the scanner is closed, change dropdown value
          console.log(`Setting sub-dropdown value to: ${qrCodeMessage}`);
          subDropdown.value = qrCodeMessage;
          
          // Save the dropdown value to localStorage so it persists on refresh
          localStorage.setItem(`${uniquePrefix}sub-dropdown`, qrCodeMessage);
          
          // Call fetchProductDetails but don't reset button state
          await fetchProductDetails();
          
          // Restore button state if it was true (do this after product details are fetched)
          if (currentButtonState === 'true') {
            localStorage.setItem(key, 'true');
            sendtoNCButtonisPressed = true;
            console.log("Restored sendtoNCButtonisPressed to true after QR scan");
          }
        } catch (err) {
          console.error("Error processing QR code:", err);
          // Ensure QR scanner is stopped even if there's an error
          html5QrCode.stop().catch(stopErr => console.error("Error stopping QR scanner:", stopErr));
          qrScannerModal.style.display = 'none';
        }

        return;
      }
    }
  ).catch(err => {
    console.error("Failed to start scanning:", err);
  });

  // Close the QR scanner modal
  document.getElementById('closeQRScannerModal').onclick = function() {
    html5QrCode.stop().then(() => {
      qrScannerModal.style.display = 'none';
    }).catch(err => console.error("Failed to stop scanning:", err));
  };

  // Close scanner if user clicks outside the modal
  window.onclick = function(event) {
    if (event.target == qrScannerModal) {
      html5QrCode.stop().then(() => {
        qrScannerModal.style.display = 'none';
      }).catch(err => console.error("Failed to stop scanning:", err));
    }
  };
});

// CSS for blinking red background and success animation
const style = document.createElement('style');
style.innerHTML = `
.flash-red {
  animation: flash-red 1s infinite;
}

@keyframes flash-red {
  50% {
    background-color: red;
  }
}

.flash-green {
  animation: flash-green 0.5s ease-in-out;
}

@keyframes flash-green {
  0%, 100% {
    background-color: transparent;
  }
  50% {
    background-color: rgba(76, 175, 80, 0.3);
  }
}

.success-checkmark {
  display: inline-block;
  font-size: 48px;
  color: #4CAF50;
  animation: checkmark-pop 0.3s ease-in-out;
}

@keyframes checkmark-pop {
  0% {
    transform: scale(0);
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

.material-code-blink {
  animation: materialBlink 1s ease-in-out infinite;
  display: inline-block;
  font-size: 1.8em;
  font-weight: 900;
  color: #dc3545;
}

@keyframes materialBlink {
  0%, 49% {
    opacity: 1;
  }
  50%, 100% {
    opacity: 0.15;
  }
}
`;
document.head.appendChild(style);

// Global reference for lot scanner
window.lotHtml5QrCode = null;

// Scan Lot Button functionality (only if button exists)
const scanLotButton = document.getElementById('scan-lot');
if (scanLotButton) {
  scanLotButton.addEventListener('click', function() {
    const scanLotModal = document.getElementById('scanLotModal');
    const scanLotStatus = document.getElementById('scanLotStatus');
    const materialCodeInput = document.getElementById('material-code');
    const materialLotInput = document.getElementById('材料ロット');
    const html5QrCode = new Html5Qrcode("lotQrReader");
  
  // Store reference globally
  window.lotHtml5QrCode = html5QrCode;

  // Reset status
  scanLotStatus.textContent = '';
  scanLotStatus.style.color = '#666';

  // Show modal
  scanLotModal.style.display = 'block';

  // Start QR code scanning with near-focus detection (optimized for 10-inch tablet)
  html5QrCode.start(
    { facingMode: "environment" },
    { 
      fps: 30,
      qrbox: { width: 800, height: 800 },
      aspectRatio: 1.0,
      disableFlip: false,
      advanced: [{
        focusMode: "continuous",
        focusDistance: { ideal: 0 }
      }]
    },
    async (qrCodeMessage) => {
      console.log("Scanned Lot QR Code:", qrCodeMessage);

      try {
        // ✅ IMMEDIATELY stop the scanner to prevent multiple scans
        await html5QrCode.stop();
        
        // Parse QR code: "97B,251020-1,12000"
        const parts = qrCodeMessage.split(',');
        
        if (parts.length < 2) {
          throw new Error('Invalid QR code format');
        }

        const scannedMaterialCode = parts[0].trim();
        const lotNumber = parts[1].trim();
        // parts[2] is ignored for now

        // Get Material Code from the form (may contain comma-separated values)
        const materialCodeString = materialCodeInput ? materialCodeInput.value.trim() : '';

        console.log("Comparison:", { scannedMaterialCode, materialCodeString, lotNumber });

        // Validate Material Code using new multi-value support
        const validation = validateMaterialCode(scannedMaterialCode, materialCodeString);
        
        console.log("Lot Scanner Validation:", {
          scanned: scannedMaterialCode,
          allValidCodes: validation.allCodes,
          isValid: validation.isValid,
          matchedCode: validation.matchedCode
        });

        // Compare Material Codes
        if (!validation.isValid) {
          // Material code mismatch - show error
          const expectedDisplay = formatMaterialCodesForDisplay(materialCodeString);
          
          scanLotStatus.innerHTML = '<span style="color: #e74c3c;">❌ 材料コードが一致しません<br>Material code mismatch</span>';
          
          // Use showAlert function
          showAlert(`材料コードが一致しません / Material code mismatch\n\nExpected: ${expectedDisplay}\nScanned: ${scannedMaterialCode}`);
          
          // Close modal
          scanLotModal.style.display = 'none';
          return;
        }
        
        // Log which specific code was matched
        console.log(`Lot scanner: Material code validated successfully. Matched: ${validation.matchedCode}`);

        // Material code matches - add lot number using the new system
        const success = addScannedLot(lotNumber);
        
        if (!success) {
          // Duplicate
          scanLotStatus.innerHTML = '<span style="color: #f39c12;">⚠️ このロット番号は既に追加されています<br>Lot number already added</span>';
          
          // Close after showing message briefly
          setTimeout(() => {
            scanLotModal.style.display = 'none';
          }, 1500);
          
          return;
        }

        // Show success animation
        scanLotStatus.innerHTML = '<span class="success-checkmark">✓</span><br><span style="color: #4CAF50; font-weight: bold;">成功！ / Success!</span>';
        document.body.classList.add('flash-green');

        // Close modal after short delay
        setTimeout(() => {
          document.body.classList.remove('flash-green');
          scanLotModal.style.display = 'none';
        }, 1000);

      } catch (error) {
        console.error("Error processing lot QR code:", error);
        scanLotStatus.innerHTML = '<span style="color: #e74c3c;">❌ QRコードの処理エラー<br>QR code processing error</span>';
        
        showAlert('QRコードの形式が正しくありません / Invalid QR code format');
        
        // Scanner already stopped, just close modal
        scanLotModal.style.display = 'none';
      }
    },
    (errorMessage) => {
      // QR scan error (ignore continuous scanning errors)
    }
  ).catch(err => {
    console.error("Failed to start lot scanning:", err);
    scanLotStatus.innerHTML = '<span style="color: #e74c3c;">❌ カメラを起動できませんでした<br>Could not start camera</span>';
  });

  // Close button handler
  document.getElementById('closeScanLotModal').onclick = function() {
    html5QrCode.stop().then(() => {
      scanLotModal.style.display = 'none';
    }).catch(err => {
      console.error("Failed to stop scanning:", err);
      scanLotModal.style.display = 'none';
    });
  };
  });
}

// ===== MATERIAL LOT TRACKING SYSTEM =====
// Track lots with their source (scanned vs manual)
let materialLots = []; // Array of {lotNumber: string, source: 'scanned'|'manual'}
let manualEntryAllowed = false; // Flag for override mode

// Load lots from localStorage
function loadMaterialLots() {
  const savedLots = localStorage.getItem(`${uniquePrefix}材料ロット-data`);
  if (savedLots) {
    try {
      materialLots = JSON.parse(savedLots);
      renderMaterialLotTags();
      updateMaterialLotInput();
    } catch (e) {
      console.error("Error loading material lots:", e);
      materialLots = [];
    }
  }
}

// Save lots to localStorage
function saveMaterialLots() {
  localStorage.setItem(`${uniquePrefix}材料ロット-data`, JSON.stringify(materialLots));
  updateMaterialLotInput();
}

// Update the hidden input value (comma-separated)
function updateMaterialLotInput() {
  const materialLotInput = document.getElementById('材料ロット');
  if (materialLotInput) {
    materialLotInput.value = materialLots.map(lot => lot.lotNumber).join(',');
  }
}

// Render lot tags
function renderMaterialLotTags() {
  const tagsContainer = document.getElementById('材料ロット-tags');
  if (!tagsContainer) return;

  tagsContainer.innerHTML = '';

  materialLots.forEach((lot, index) => {
    const tag = document.createElement('div');
    tag.style.cssText = `
      display: inline-flex;
      align-items: center;
      background: ${lot.source === 'scanned' ? '#f44336' : '#4CAF50'};
      color: white;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 14px;
      gap: 8px;
    `;

    const lotText = document.createElement('span');
    lotText.textContent = lot.lotNumber;
    tag.appendChild(lotText);

    // Add delete button (only for manual lots)
    if (lot.source === 'manual') {
      const deleteBtn = document.createElement('span');
      deleteBtn.textContent = '×';
      deleteBtn.style.cssText = `
        cursor: pointer;
        font-size: 18px;
        font-weight: bold;
        margin-left: 4px;
      `;
      deleteBtn.onclick = () => {
        materialLots.splice(index, 1);
        saveMaterialLots();
        renderMaterialLotTags();
      };
      tag.appendChild(deleteBtn);
    } else {
      // Show × but disabled for scanned lots
      const disabledX = document.createElement('span');
      disabledX.textContent = '×';
      disabledX.style.cssText = `
        font-size: 18px;
        font-weight: bold;
        margin-left: 4px;
        opacity: 0.3;
        cursor: not-allowed;
      `;
      tag.appendChild(disabledX);
    }

    tagsContainer.appendChild(tag);
  });
}

// Add scanned lot
function addScannedLot(lotNumber) {
  // Check for maximum limit (10 lots)
  if (materialLots.length >= 10) {
    showAlert(`最大10個のロット番号のみ追加可能です\n\nMaximum 10 lot numbers allowed\n\nCurrent: ${materialLots.length} lots`);
    return false; // At maximum
  }
  // Check for duplicates
  if (materialLots.some(lot => lot.lotNumber === lotNumber)) {
    return false; // Duplicate
  }
  materialLots.push({ lotNumber, source: 'scanned' });
  saveMaterialLots();
  renderMaterialLotTags();
  return true; // Success
}

// Add manual lot
function addManualLot(lotNumber) {
  if (!lotNumber || !lotNumber.trim()) return false;
  lotNumber = lotNumber.trim();
  
  // Check for maximum limit (10 lots)
  if (materialLots.length >= 10) {
    showAlert(`最大10個のロット番号のみ追加可能です\n\nMaximum 10 lot numbers allowed\n\nCurrent: ${materialLots.length} lots`);
    return false; // At maximum
  }
  // Check for duplicates
  if (materialLots.some(lot => lot.lotNumber === lotNumber)) {
    return false; // Duplicate
  }
  materialLots.push({ lotNumber, source: 'manual' });
  saveMaterialLots();
  renderMaterialLotTags();
  return true; // Success
}

// Intercept 材料ロット input click to open QR scanner instead of keypad
const materialLotInput = document.getElementById('材料ロット');
if (materialLotInput) {
  // Flag to control if we should allow keypad
  let allowKeypadForManualEntry = false;
  
  materialLotInput.addEventListener('focus', (e) => {
    // If manual entry is allowed, let the keypad open naturally
    if (allowKeypadForManualEntry) {
      return; // Let the default behavior happen (keypad opens)
    }
    
    // Check if sub-dropdown has a value
    const subDropdown = document.getElementById('sub-dropdown');
    if (!subDropdown || !subDropdown.value) {
      // No value in sub-dropdown, just blur and do nothing
      e.preventDefault();
      materialLotInput.blur();
      showAlert('Please select a product code first / まず製品コードを選択してください');
      return;
    }
    
    // Block keypad and open QR scanner
    e.preventDefault();
    materialLotInput.blur();
    document.getElementById('scan-lot').click();
  });
  
  // Store reference to allow keypad function
  window.enableManualLotEntry = function() {
    allowKeypadForManualEntry = true;
    
    // Store current lots before opening keypad
    const lotsBeforeKeypad = materialLots.map(lot => lot.lotNumber);
    
    // Open the keypad directly in NEW ENTRY MODE (starts empty, appends on confirm)
    window.openDirectNumericKeypad('材料ロット', true);
    
    // Set up listener for when keypad closes to detect new lots
    const checkForNewLot = setInterval(() => {
      const keypadModal = document.getElementById('numericKeypadModalDirect');
      const isKeypadOpen = keypadModal && keypadModal.style.display === 'block';
      
      // Only check after keypad is closed
      if (!isKeypadOpen) {
        const currentValue = materialLotInput.value;
        const valuesInInput = currentValue ? currentValue.split(',').map(v => v.trim()).filter(v => v) : [];
        
        // Check if there's a new lot added (compare with lots before keypad)
        const newLots = valuesInInput.filter(lot => lot && !lotsBeforeKeypad.includes(lot));
        
        if (newLots.length > 0) {
          // New lot(s) added via keypad - add as blue tags
          newLots.forEach(lotNumber => {
            const success = addManualLot(lotNumber);
            if (success) {
              console.log("Manual lot added as blue tag:", lotNumber);
            }
          });
        }
        
        // Disable manual entry mode and stop checking
        allowKeypadForManualEntry = false;
        clearInterval(checkForNewLot);
      }
    }, 300);
  };
}

// Override button - Leader verification for manual entry
document.getElementById('overrideLotButton').addEventListener('click', function() {
  const scanLotModal = document.getElementById('scanLotModal');
  const leaderVerificationModal = document.getElementById('leaderVerificationModal');
  const leaderVerificationStatus = document.getElementById('leaderVerificationStatus');
  
  // Close scan lot modal first
  if (window.lotHtml5QrCode) {
    window.lotHtml5QrCode.stop().catch(err => console.error("Error stopping lot scanner:", err));
  }
  scanLotModal.style.display = 'none';
  
  // Get material code from input
  const materialCodeInput = document.getElementById('material-code');
  const materialCode = materialCodeInput ? materialCodeInput.value.trim() : 'N/A';
  
  // Find and update the warning text to show material code instead
  const modalContent = leaderVerificationModal.querySelector('.modal-content');
  const warningTextElement = modalContent.querySelector('p[style*="color: #666"]');
  
  if (warningTextElement) {
    // Replace the warning text with blinking material code
    warningTextElement.innerHTML = `<span class="material-code-blink">材料: ${materialCode} / Material Code: ${materialCode}</span>`;
    warningTextElement.style.fontSize = '18px';
    warningTextElement.style.margin = '15px 0';
  }
  
  // Show leader verification modal
  leaderVerificationStatus.textContent = 'リーダーのQRコードをスキャンしてください / Please scan leader QR code';
  leaderVerificationStatus.style.color = '#2d5f4f';
  leaderVerificationModal.style.display = 'block';
  
  // Use global scanner variable for leader verification
  leaderVerificationScanner = new Html5Qrcode("leaderQrReader");
  
  leaderVerificationScanner.start(
    { facingMode: "environment" },
    { 
      fps: 30,
      qrbox: { width: 800, height: 800 },
      aspectRatio: 1.0,
      disableFlip: false,
      advanced: [{
        focusMode: "continuous",
        focusDistance: { ideal: 0 }
      }]
    },
    async (decodedText) => {
      console.log("Leader QR Code scanned for override:", decodedText);
      
      try {
        const response = await fetch(`${serverURL}/verifyLeader`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: decodedText })
        });
        
        const result = await response.json();
        
        if (result.authorized) {
          leaderVerificationStatus.textContent = `✅ 認証成功！ / Verified! Opening keypad...`;
          leaderVerificationStatus.style.color = '#006400';
          
          leaderVerificationScanner.stop().then(() => {
            setTimeout(() => {
              leaderVerificationModal.style.display = 'none';
              leaderVerificationScanner = null;
              
              // Enable keypad for manual entry
              if (window.enableManualLotEntry) {
                window.enableManualLotEntry();
              }
            }, 1000);
          }).catch(err => console.error("Error stopping scanner:", err));
        } else {
          leaderVerificationStatus.textContent = `❌ 権限がありません / Not authorized`;
          leaderVerificationStatus.style.color = '#cc0000';
        }
      } catch (error) {
        console.error("Error verifying leader for override:", error);
        leaderVerificationStatus.textContent = '❌ エラーが発生しました / Error occurred';
        leaderVerificationStatus.style.color = '#cc0000';
      }
    },
    (errorMessage) => {
      // QR scan error (ignore continuous scanning errors)
    }
  ).catch(err => {
    console.error("Error starting QR scanner:", err);
    leaderVerificationStatus.textContent = '❌ カメラを起動できませんでした / Could not start camera';
    leaderVerificationStatus.style.color = '#cc0000';
  });
  
  // Set up cancel button handler for override flow
  document.getElementById('closeLeaderVerificationModal').onclick = function() {
    if (leaderVerificationScanner) {
      leaderVerificationScanner.stop().then(() => {
        leaderVerificationModal.style.display = 'none';
        leaderVerificationScanner = null;
        console.log("Leader verification cancelled from override flow");
      }).catch(err => {
        console.error("Error stopping scanner:", err);
        leaderVerificationModal.style.display = 'none';
        leaderVerificationScanner = null;
      });
    } else {
      leaderVerificationModal.style.display = 'none';
    }
  };
});

// Load lots on page load
document.addEventListener('DOMContentLoaded', () => {
  loadMaterialLots();
});

// Function to reset everything and reload the page
function resetForm() {
  // Log reset action with current values BEFORE clearing session
  const current背番号 = document.getElementById('sub-dropdown')?.value || '';
  const current品番 = document.getElementById('product-number')?.value || '';
  const current工場 = document.getElementById('selected工場')?.value || '';
  const current設備 = document.getElementById('process')?.value || '';
  
  // Log if we have machine info at minimum (before clearing session)
  if (current設備 && (current背番号 || current品番 || current工場)) {
    logTabletAction('Reset button pressed', 'Reset', {
      previous背番号: current背番号,
      previous品番: current品番,
      previous工場: current工場,
      previous設備: current設備
    });
  }
  
  // Clear session AFTER logging
  clearSessionID();

  const excludedInputs = ['process', 'languageSelector']; // IDs or names of inputs to exclude from reset

  // Preserve language preference
  const currentLanguage = localStorage.getItem('appLanguage');

  // Clear all form inputs with unique prefix except excluded ones
  const inputs = document.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    const key = `${uniquePrefix}${input.id || input.name}`;
    if (!excludedInputs.includes(input.id) && !excludedInputs.includes(input.name)) {
      localStorage.removeItem(key);
      input.value = ''; // Reset input value
    }
  });

  // Clear counters with unique prefix
  for (let i = 1; i <= 20; i++) { // Adjusted loop to clear all counter values
    const key = `${uniquePrefix}counter-${i}`;
    localStorage.removeItem(key);
    const counterElement = document.getElementById(`counter-${i}`);
    if (counterElement) {
      counterElement.value = '0'; // Reset counter display
    }
  }

  // Clear break time inputs and total
  for (let i = 1; i <= 4; i++) {
    localStorage.removeItem(`${uniquePrefix}break${i}-start`);
    localStorage.removeItem(`${uniquePrefix}break${i}-end`);
  }
  localStorage.removeItem(`${uniquePrefix}breaktime-mins`);
  localStorage.removeItem(`${uniquePrefix}total-break-display`);

  // Clear machine trouble inputs and total
  for (let i = 1; i <= 4; i++) {
    localStorage.removeItem(`${uniquePrefix}trouble${i}-start`);
    localStorage.removeItem(`${uniquePrefix}trouble${i}-end`);
  }
  localStorage.removeItem(`${uniquePrefix}trouble-time-mins`);
  localStorage.removeItem(`${uniquePrefix}total-trouble-display`);
  
  // Clear maintenance records
  localStorage.removeItem(`${uniquePrefix}maintenanceRecords`);
  maintenanceRecords = [];
  
  // Clear material label photos
  localStorage.removeItem(`${uniquePrefix}materialLabelPhotos`);
  materialLabelPhotos = [];
  renderMaterialPhotoThumbnails();
  updateMaterialPhotoCount();


  // Reset all textContent elements
  const textContentElements = document.querySelectorAll('[id]'); // Select all elements with an ID
  textContentElements.forEach(element => {
    const textKey = `${uniquePrefix}${element.id}.textContent`;
    if (localStorage.getItem(textKey)) {
      localStorage.removeItem(textKey); // Remove from localStorage
      element.textContent = ''; // Reset to default empty textContent
      console.log(`Reset textContent for element with ID: ${element.id}`);
    }
  });

  // Reset all <img> elements
  const images = document.querySelectorAll('img'); // Get all <img> elements
  images.forEach(image => {
    const imageKey = `${uniquePrefix}${image.id || image.name}.src`;
    localStorage.removeItem(imageKey); // Remove image source from localStorage
    image.src = ''; // Reset the image source
    image.style.display = 'none'; // Hide the image
    console.log(`Reset image ${image.id || image.name}`);
  });
  
  // Explicitly reset the sendtoNCButtonisPressed state
  sendtoNCButtonisPressed = false;
  localStorage.setItem(`${uniquePrefix}sendtoNCButtonisPressed`, 'false');
  localStorage.removeItem(`${uniquePrefix}previous-sebanggo`);
  console.log('Reset button pressed: Set sendtoNCButtonisPressed to false');

  // Restore language preference after reset
  if (currentLanguage) {
    localStorage.setItem('appLanguage', currentLanguage);
  }

  // Reload the page - the load event will broadcast clear if dropdown is empty
  window.location.reload();
}

// Print label using "Smooth Print" app for mobile devices
function printLabel() {
  const alertSound = document.getElementById('alert-sound');
  const scanAlertModal = document.getElementById('scanAlertModal');
  const scanAlertText = document.getElementById('scanAlertText');
  const 背番号 = document.getElementById("sub-dropdown").value;

  // Preload the alert sound without playing it
  if (alertSound) {
    alertSound.muted = true; // Mute initially to preload
    alertSound.loop = false; // Disable looping
    alertSound.load(); // Preload the audio file
  }

  // Check if 背番号 is selected
  if (!背番号) {
    // Show alert modal
    scanAlertText.innerText = '背番号が必要です。 / Sebanggo is required.';
    scanAlertModal.style.display = 'block';

    // Play alert sound
    if (alertSound) {
      alertSound.muted = false; // Unmute to alert user
      alertSound.volume = 1; // Set full volume
      alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
    }

    // Add blinking red background
    document.body.classList.add('flash-red');

    // Close modal on button click
    const closeScanModalButton = document.getElementById('closeScanModalButton');
    closeScanModalButton.onclick = function() {
      scanAlertModal.style.display = 'none';
      alertSound.pause();
      alertSound.currentTime = 0; // Reset sound to the beginning
      alertSound.muted = true; // Mute again for next time
      document.body.classList.remove('flash-red');
    };

    return; // Stop the submission process
  }

  // List of 背番号 values requiring 収容数 selection
  const specialValues = ["P05K", "P06K", "P07K", "P08K", "P13K", "P14K", "P15K", "P16K", "UFS5", "UFS6", "UFS7", "UFS8", "URB5", "URB6", "URB7", "URB8"];

  // Check if 背番号 matches special values
  if (specialValues.includes(背番号)) {
    // Create and show a modal for 収容数 selection
    const modal = document.createElement('div');
    modal.classList.add('modal');
    modal.style.display = 'flex';
    modal.style.position = 'fixed';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.flexDirection = 'column';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.padding = '30px';
    modal.style.backgroundColor = 'white';
    modal.style.boxShadow = '0 0 15px rgba(0, 0, 0, 0.5)';
    modal.style.borderRadius = '10px';

    const message = document.createElement('p');
    message.innerText = '収容数を選んでください / Please choose the value for Quantity';
    message.style.fontSize = '24px';
    message.style.textAlign = 'center';
    message.style.marginBottom = '20px';
    modal.appendChild(message);

    const button50 = document.createElement('button');
    button50.innerText = '50';
    button50.style.margin = '10px';
    button50.style.padding = '15px 30px';
    button50.style.fontSize = '20px';
    button50.style.cursor = 'pointer';
    button50.style.borderRadius = '5px';
    button50.onclick = () => {
      redirectWith収容数(50);
    };
    modal.appendChild(button50);

    const button100 = document.createElement('button');
    button100.innerText = '100';
    button100.style.margin = '10px';
    button100.style.padding = '15px 30px';
    button100.style.fontSize = '20px';
    button100.style.cursor = 'pointer';
    button100.style.borderRadius = '5px';
    button100.onclick = () => {
      redirectWith収容数(100);
    };
    modal.appendChild(button100);

    const button200 = document.createElement('button');
    button200.innerText = '200';
    button200.style.margin = '10px';
    button200.style.padding = '15px 30px';
    button200.style.fontSize = '20px';
    button200.style.cursor = 'pointer';
    button200.style.borderRadius = '5px';
    button200.onclick = () => {
      redirectWith収容数(200);
    };
    modal.appendChild(button200);

    document.body.appendChild(modal);

    function redirectWith収容数(value) {
      document.body.removeChild(modal); // Remove modal

      // Retrieve dynamic values from the form
      const 品番 = document.getElementById("product-number").value;
      const 車型 = document.getElementById("model").value;
      const R_L = document.getElementById("R-L").value;
      const 材料 = document.getElementById("material").value;
      const 色 = document.getElementById("material-color").value;
      const extension = document.getElementById("Labelextension").value;
      const Date2 = document.getElementById('Lot No.').value;
      const 品番収容数 = `${品番},${value}`;
      const SRS = document.getElementById("SRS").value;
      const 設備名 = document.getElementById("process").value;
      let filename = "";

      // Get current time for DateT
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const currentTime = `${hours}:${minutes}`;

      const WorkDate = extension ? `${Date2} - ${extension} - ${currentTime}` : `${Date2} - ${currentTime}`;

      // Smooth Print URL scheme
      if (SRS === "有り") {
        filename = "SRS3.lbx";
      } else if (背番号 === "NC2") {
        filename = "NC21.lbx"
      } else {
        filename = "sample6.lbx";
      }
      const size = "RollW62";
      const copies = 1;
      const url =
        `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=${encodeURIComponent(copies)}` +
        `&text_品番=${encodeURIComponent(品番)}` +
        `&text_車型=${encodeURIComponent(車型)}` +
        `&text_収容数=${encodeURIComponent(value)}` +
        `&text_背番号=${encodeURIComponent(背番号)}` +
        `&text_RL=${encodeURIComponent(R_L)}` +
        `&text_材料=${encodeURIComponent(材料)}` +
        `&text_色=${encodeURIComponent(色)}` +
        `&text_DateT=${encodeURIComponent(WorkDate)}` +
        `&text_setsubi=${encodeURIComponent(設備名)}` +
        `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

      console.log(WorkDate);
      window.location.href = url; // Redirect to Smooth Print
    }

    return; // Stop the submission process until user chooses 収容数
  }

  // Default process for other 背番号 values
  const 品番 = document.getElementById("product-number").value;
  const 車型 = document.getElementById("model").value;
  const 収容数 = document.getElementById("収容数").value;
  const R_L = document.getElementById("R-L").value;
  const 材料 = document.getElementById("material").value;
  const 色 = document.getElementById("material-color").value;
  const extension = document.getElementById("Labelextension").value;
  const Date2 = document.getElementById('Lot No.').value;
  const 品番収容数 = `${品番},${収容数}`;
  const SRS = document.getElementById("SRS").value;
  const 設備名 = document.getElementById("process").value;
  let filename = "";

  // Get current time for DateT
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${hours}:${minutes}`;

  const WorkDate = extension ? `${Date2} - ${extension} - ${currentTime}` : `${Date2} - ${currentTime}`;

  if (SRS === "有り") {
    filename = "SRS3.lbx";
  } else if (背番号 === "NC2") {
    filename = "NC21.lbx"
  } else {
    filename = "sample6.lbx";
  }

  const size = "RollW62";
  const copies = 1;
  const url =
    `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=${encodeURIComponent(copies)}` +
    `&text_品番=${encodeURIComponent(品番)}` +
    `&text_車型=${encodeURIComponent(車型)}` +
    `&text_収容数=${encodeURIComponent(収容数)}` +
    `&text_背番号=${encodeURIComponent(背番号)}` +
    `&text_RL=${encodeURIComponent(R_L)}` +
    `&text_材料=${encodeURIComponent(材料)}` +
    `&text_色=${encodeURIComponent(色)}` +
    `&text_DateT=${encodeURIComponent(WorkDate)}` +
    `&text_setsubi=${encodeURIComponent(設備名)}` +
    `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

  console.log(WorkDate);
  window.location.href = url;
}

// Take photo hatsumono and atomono and label
// Helper function to convert File to base64 string
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

// Mapping of buttons to labels and images
const buttonMappings = [{
  buttonId: 'hatsumonoButton',
  labelId: 'hatsumonoLabel',
  imgId: 'hatsumonoPic',
  labelText: '初物チェック',
  fileInputId: 'hatsumonoFileInput'
}, {
  buttonId: 'atomonoButton',
  labelId: 'atomonoLabel',
  imgId: 'atomonoPic',
  labelText: '終物チェック',
  fileInputId: 'atomonoFileInput'
}, {
  buttonId: 'makerLabelButton',
  labelId: '材料ラベル_L',
  imgId: '材料ラベル',
  labelText: '材料ラベル',
  fileInputId: 'makerLabelFileInput'
}, ];

// Device detection
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Compress image function
async function compressBase64Image(base64DataURL, maxWidth = 1024, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // Calculate new dimensions
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Compress with specified quality
      const compressedDataURL = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataURL);
    };
    
    img.onerror = (error) => {
      console.error('Error loading image for compression:', error);
      reject(error);
    };
    
    img.src = base64DataURL;
  });
}

// Create hidden file inputs for each button
buttonMappings.forEach(mapping => {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = mapping.fileInputId;
  fileInput.accept = 'image/*';
  if (isMobileDevice()) {
    fileInput.capture = 'camera'; // Trigger native camera on mobile
  }
  // On desktop, don't set capture attribute - allows file browser
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
});

// Create webcam modal for desktop use
const webcamModalHTML = `
<div id="webcamModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 10000; justify-content: center; align-items: center;">
  <div style="background: white; padding: 20px; border-radius: 10px; max-width: 800px; width: 90%; text-align: center;">
    <h2 id="webcamModalTitle" style="margin-top: 0;">写真撮影 / Take Photo</h2>
    <video id="webcamVideo" autoplay playsinline style="width: 100%; max-width: 640px; border: 2px solid #333; border-radius: 8px; background: #000;"></video>
    <canvas id="webcamCanvas" style="display: none;"></canvas>
    <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
      <button id="captureWebcamBtn" style="padding: 12px 24px; font-size: 16px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;">
        📸 撮影 / Capture
      </button>
      <button id="closeWebcamBtn" style="padding: 12px 24px; font-size: 16px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer;">
        ✕ 閉じる / Close
      </button>
    </div>
  </div>
</div>`;

document.body.insertAdjacentHTML('beforeend', webcamModalHTML);

let webcamStream = null;
let currentButtonId = null;
let currentPhotoMapping = null;

// Webcam functions
async function openWebcamModal(mapping) {
  const modal = document.getElementById('webcamModal');
  const video = document.getElementById('webcamVideo');
  const title = document.getElementById('webcamModalTitle');
  
  currentPhotoMapping = mapping;
  // Keep currentButtonId set (it was set before calling this function)
  title.textContent = `写真撮影: ${mapping.labelText} / Take Photo: ${mapping.labelText}`;
  modal.style.display = 'flex';
  
  console.log(`Opening webcam for ${mapping.labelText}, buttonId: ${currentButtonId}`);
  
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
    });
    video.srcObject = webcamStream;
    console.log('📹 Webcam opened successfully');
  } catch (error) {
    console.error('❌ Error accessing webcam:', error);
    closeWebcamModal();
    showAlert('カメラにアクセスできませんでした。ファイルを選択してください。\n\nCannot access camera. Please select a file instead.');
  }
}

function closeWebcamModal() {
  const modal = document.getElementById('webcamModal');
  const video = document.getElementById('webcamVideo');
  
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }
  
  video.srcObject = null;
  modal.style.display = 'none';
  currentPhotoMapping = null;
  console.log('📹 Webcam closed');
}

async function captureFromWebcam() {
  const video = document.getElementById('webcamVideo');
  const canvas = document.getElementById('webcamCanvas');
  const ctx = canvas.getContext('2d');
  
  // Set canvas dimensions to match video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Draw video frame to canvas
  ctx.drawImage(video, 0, 0);
  
  // Convert to base64
  const base64Image = canvas.toDataURL('image/jpeg', 0.95);
  
  console.log(`📸 Captured from webcam: ${(base64Image.length / 1024).toFixed(2)} KB`);
  console.log(`Current mapping:`, currentPhotoMapping);
  console.log(`Current buttonId:`, currentButtonId);
  
  // Save these before closeWebcamModal() resets them
  const savedMapping = currentPhotoMapping;
  const savedButtonId = currentButtonId;
  
  // Close webcam
  closeWebcamModal();
  
  // Check if this is for material label (multi-photo system)
  if (savedButtonId === 'makerLabelButton') {
    console.log('📸 Processing material label photo (multi-photo system)');
    
    const added = await addMaterialLabelPhoto(base64Image);
    
    if (added) {
      console.log('✅ Successfully added material label photo from webcam');
      
      updateMaterialLabelElement();
      
      setTimeout(() => {
        renderMaterialPhotoThumbnails();
        updateMaterialPhotoCount();
        localStorage.setItem(`${uniquePrefix}materialLabelPhotos`, JSON.stringify(materialLabelPhotos));
        updateMaterialLabelElement();
      }, 100);
      
      logTabletAction('Photo captured: 材料ラベル (webcam)', 'in-progress', {
        photoType: '材料ラベル',
        photoCount: materialLabelPhotos.length
      });
    } else {
      showAlert(`最大${MAX_MATERIAL_PHOTOS}枚までです / Maximum ${MAX_MATERIAL_PHOTOS} photos allowed`);
    }
  } else if (savedMapping && savedButtonId) {
    // Process single photo for 初物 or 終物
    console.log('✅ Processing single photo for', savedMapping.labelText);
    await processPhotoCapture(base64Image, savedMapping, savedButtonId);
  } else {
    console.error('❌ Missing mapping or buttonId for webcam capture');
  }
}

// Setup webcam modal buttons
document.getElementById('captureWebcamBtn').addEventListener('click', captureFromWebcam);
document.getElementById('closeWebcamBtn').addEventListener('click', closeWebcamModal);

// Shared function to process photo capture (from webcam or file)
async function processPhotoCapture(base64Image, mapping, buttonId) {
  try {
    console.log(`📸 Processing photo for ${mapping.labelText}...`);
    console.log(`   - Button ID: ${buttonId}`);
    console.log(`   - Image ID: ${mapping.imgId}`);
    console.log(`   - Label ID: ${mapping.labelId}`);
    
    // Update photo preview immediately
    const photoPreview = document.getElementById(mapping.imgId);
    console.log(`   - Photo element found: ${!!photoPreview}`);
    
    if (photoPreview) {
      photoPreview.src = base64Image;
      photoPreview.style.display = 'block';
      
      console.log(`   - Set src (${(base64Image.length / 1024).toFixed(2)} KB) and display: block`);
      
      // Compress image before saving to localStorage to avoid quota issues
      const compressedImage = await compressBase64Image(base64Image, 1024, 0.7);
      const photoPreviewKey = `${uniquePrefix}${mapping.imgId}.src`;
      localStorage.setItem(photoPreviewKey, compressedImage);
      console.log(`✅ Saved compressed image to localStorage for ${mapping.imgId} (${(compressedImage.length / 1024).toFixed(2)} KB)`);
    } else {
      console.error(`❌ Photo preview element not found: ${mapping.imgId}`);
    }
    
    // Update label to TRUE
    const label = document.getElementById(mapping.labelId);
    console.log(`   - Label element found: ${!!label}`);
    
    if (label) {
      label.textContent = 'TRUE';
      const labelKey = `${uniquePrefix}${mapping.labelId}.textContent`;
      localStorage.setItem(labelKey, label.textContent);
      console.log(`✅ Updated ${mapping.labelId} to TRUE`);
    } else {
      console.error(`❌ Label element not found: ${mapping.labelId}`);
    }
    
    // Log photo capture
    logTabletAction(`Photo captured: ${mapping.labelText}`, 'in-progress', {
      photoType: mapping.labelText,
      buttonId: buttonId
    });
    
    currentButtonId = null;
    
  } catch (error) {
    console.error(`❌ Error processing ${mapping.labelText}:`, error);
    showAlert(`写真撮影エラー: ${error.message}`);
    currentButtonId = null;
  }
}

// Show photo option modal (webcam or file)
function showPhotoOptionModal(mapping, buttonId, fileInput) {
  currentButtonId = buttonId;
  
  // On mobile, directly use file input (native camera)
  if (isMobileDevice()) {
    fileInput.click();
    return;
  }
  
  // On desktop, show option modal
  const optionModal = document.createElement('div');
  optionModal.style.cssText = 'display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; justify-content: center; align-items: center;';
  optionModal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 10px; max-width: 500px; width: 90%; text-align: center;">
      <h2 style="margin-top: 0;">${mapping.labelText}</h2>
      <p style="color: #666; margin-bottom: 30px;">写真の取得方法を選択してください<br>Choose how to capture photo</p>
      <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
        <button id="useWebcamBtn" style="padding: 15px 25px; font-size: 16px; background: #2196F3; color: white; border: none; border-radius: 5px; cursor: pointer; min-width: 180px;">
          📹 カメラで撮影<br><span style="font-size: 13px;">Use Webcam</span>
        </button>
        <button id="chooseFileBtn" style="padding: 15px 25px; font-size: 16px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; min-width: 180px;">
          📁 ファイルを選択<br><span style="font-size: 13px;">Choose File</span>
        </button>
      </div>
      <button id="cancelOptionBtn" style="margin-top: 20px; padding: 10px 20px; font-size: 14px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer;">
        ✕ キャンセル / Cancel
      </button>
    </div>
  `;
  
  document.body.appendChild(optionModal);
  
  // Button handlers
  document.getElementById('useWebcamBtn').addEventListener('click', () => {
    document.body.removeChild(optionModal);
    openWebcamModal(mapping);
  });
  
  document.getElementById('chooseFileBtn').addEventListener('click', () => {
    document.body.removeChild(optionModal);
    fileInput.click();
  });
  
  document.getElementById('cancelOptionBtn').addEventListener('click', () => {
    document.body.removeChild(optionModal);
    currentButtonId = null;
  });
}

// Handle hatsumonoButton and atomonoButton with smart photo capture
['hatsumonoButton', 'atomonoButton'].forEach(buttonId => {
  const button = document.getElementById(buttonId);
  if (!button) return;
  
  const mapping = buttonMappings.find(m => m.buttonId === buttonId);
  if (!mapping) return;
  
  const fileInput = document.getElementById(mapping.fileInputId);
  if (!fileInput) return;
  
  // Button click shows options or triggers native camera
  button.addEventListener('click', () => {
    const subDropdown = document.getElementById('sub-dropdown');
    const selectedValue = subDropdown?.value;

    if (!selectedValue) {
      // Trigger modal message instead of alert
      const scanAlertModal = document.getElementById('scanAlertModal');
      const scanAlertText = document.getElementById('scanAlertText');
      const alertSound = document.getElementById('alert-sound');

      scanAlertText.innerText = '背番号を選択してください / Please select a Sebanggo first.';
      scanAlertModal.style.display = 'block';

      // Flash body and sub-dropdown
      document.body.classList.add('flash-red');
      subDropdown.classList.add('flash-red-border');

      // Play alert sound
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(err => console.error("Failed to play sound:", err));
      }

      // Set modal close behavior
      const closeScanModalButton = document.getElementById('closeScanModalButton');
      closeScanModalButton.onclick = function() {
        scanAlertModal.style.display = 'none';
        document.body.classList.remove('flash-red');
        subDropdown.classList.remove('flash-red-border');

        if (alertSound) {
          alertSound.pause();
          alertSound.currentTime = 0;
          alertSound.muted = true;
        }
      };

      return; // stop further action
    }

    // If value is selected, show photo options
    showPhotoOptionModal(mapping, buttonId, fileInput);
  });
  
  // Handle file selection from file browser
  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      // Convert to base64
      const base64Image = await fileToBase64(file);
      console.log(`📸 Original image size: ${(base64Image.length / 1024).toFixed(2)} KB`);
      
      // Process the photo
      await processPhotoCapture(base64Image, mapping, currentButtonId);
      
      // Reset file input
      event.target.value = '';
      
    } catch (error) {
      console.error(`❌ Error capturing ${mapping.labelText}:`, error);
      showAlert(`写真撮影エラー: ${error.message}`);
      event.target.value = '';
      currentButtonId = null;
    }
  });
});

// Handle makerLabelButton with multi-photo functionality using native camera
const makerLabelButton = document.getElementById('makerLabelButton');
if (makerLabelButton) {
  const mapping = buttonMappings.find(m => m.buttonId === 'makerLabelButton');
  const fileInput = mapping ? document.getElementById(mapping.fileInputId) : null;
  
  if (fileInput) {
    // Button click triggers file input
    makerLabelButton.addEventListener('click', () => {
      const subDropdown = document.getElementById('sub-dropdown');
      const selectedValue = subDropdown?.value;

      if (!selectedValue) {
        // Trigger modal message instead of alert
        const scanAlertModal = document.getElementById('scanAlertModal');
        const scanAlertText = document.getElementById('scanAlertText');
        const alertSound = document.getElementById('alert-sound');

        scanAlertText.innerText = '背番号を選択してください / Please select a Sebanggo first.';
        scanAlertModal.style.display = 'block';

        // Flash body and sub-dropdown
        document.body.classList.add('flash-red');
        subDropdown.classList.add('flash-red-border');

        // Play alert sound
        if (alertSound) {
          alertSound.muted = false;
          alertSound.volume = 1;
          alertSound.play().catch(err => console.error("Failed to play sound:", err));
        }

        // Set modal close behavior
        const closeScanModalButton = document.getElementById('closeScanModalButton');
        closeScanModalButton.onclick = function() {
          scanAlertModal.style.display = 'none';
          document.body.classList.remove('flash-red');
          subDropdown.classList.remove('flash-red-border');

          if (alertSound) {
            alertSound.pause();
            alertSound.currentTime = 0;
            alertSound.muted = true;
          }
        };

        return; // stop further action
      }

      // Show photo options modal for material label
      showPhotoOptionModalForMaterial(mapping, fileInput);
    });
    
    // Handle file selection from file browser for material label
    fileInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      
      try {
        console.log('📸 Processing material label photo...');
        
        // Convert to base64 for localStorage (full quality)
        const base64Image = await fileToBase64(file);
        
        // Add to material label photos array
        const added = await addMaterialLabelPhoto(base64Image);
        
        if (added) {
          console.log('✅ Successfully added material label photo');
          
          // Update all material label elements
          updateMaterialLabelElement();
          
          // Render thumbnails and update counts
          setTimeout(() => {
            renderMaterialPhotoThumbnails();
            updateMaterialPhotoCount();
            
            // Save to localStorage
            localStorage.setItem(`${uniquePrefix}materialLabelPhotos`, JSON.stringify(materialLabelPhotos));
            
            // Update legacy element for compatibility
            updateMaterialLabelElement();
          }, 100);
          
          // Log photo capture
          logTabletAction('Photo captured: 材料ラベル', 'in-progress', {
            photoType: '材料ラベル',
            photoCount: materialLabelPhotos.length
          });
        } else {
          showAlert(`最大${MAX_MATERIAL_PHOTOS}枚までです / Maximum ${MAX_MATERIAL_PHOTOS} photos allowed`);
        }
        
        // Reset file input
        event.target.value = '';
        currentButtonId = null;
        
      } catch (error) {
        console.error('❌ Error capturing material label photo:', error);
        showAlert(`写真撮影エラー: ${error.message}`);
        event.target.value = '';
        currentButtonId = null;
      }
    });
  }
}

// Photo option modal for material label (with webcam support)
function showPhotoOptionModalForMaterial(mapping, fileInput) {
  currentButtonId = 'makerLabelButton';
  
  // On mobile, directly use file input (native camera)
  if (isMobileDevice()) {
    fileInput.click();
    return;
  }
  
  // On desktop, show option modal
  const optionModal = document.createElement('div');
  optionModal.style.cssText = 'display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; justify-content: center; align-items: center;';
  optionModal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 10px; max-width: 500px; width: 90%; text-align: center;">
      <h2 style="margin-top: 0;">${mapping.labelText}</h2>
      <p style="color: #666; margin-bottom: 30px;">写真の取得方法を選択してください<br>Choose how to capture photo</p>
      <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
        <button id="useMaterialWebcamBtn" style="padding: 15px 25px; font-size: 16px; background: #2196F3; color: white; border: none; border-radius: 5px; cursor: pointer; min-width: 180px;">
          📹 カメラで撮影<br><span style="font-size: 13px;">Use Webcam</span>
        </button>
        <button id="chooseMaterialFileBtn" style="padding: 15px 25px; font-size: 16px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; min-width: 180px;">
          📁 ファイルを選択<br><span style="font-size: 13px;">Choose File</span>
        </button>
      </div>
      <button id="cancelMaterialOptionBtn" style="margin-top: 20px; padding: 10px 20px; font-size: 14px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer;">
        ✕ キャンセル / Cancel
      </button>
    </div>
  `;
  
  document.body.appendChild(optionModal);
  
  // Button handlers
  document.getElementById('useMaterialWebcamBtn').addEventListener('click', () => {
    document.body.removeChild(optionModal);
    openWebcamModalForMaterial(mapping);
  });
  
  document.getElementById('chooseMaterialFileBtn').addEventListener('click', () => {
    document.body.removeChild(optionModal);
    fileInput.click();
  });
  
  document.getElementById('cancelMaterialOptionBtn').addEventListener('click', () => {
    document.body.removeChild(optionModal);
    currentButtonId = null;
  });
}

// Open webcam modal for material label
async function openWebcamModalForMaterial(mapping) {
  const modal = document.getElementById('webcamModal');
  const video = document.getElementById('webcamVideo');
  const title = document.getElementById('webcamModalTitle');
  
  currentPhotoMapping = mapping;
  currentButtonId = 'makerLabelButton'; // Set this explicitly
  title.textContent = `写真撮影: ${mapping.labelText} (${materialLabelPhotos.length + 1}/${MAX_MATERIAL_PHOTOS}) / Take Photo`;
  modal.style.display = 'flex';
  
  // Start webcam
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
    });
    video.srcObject = webcamStream;
    console.log('📹 Webcam opened for material label');
  } catch (error) {
    console.error('❌ Error accessing webcam:', error);
    closeWebcamModal();
    showAlert('カメラにアクセスできませんでした。ファイルを選択してください。\n\nCannot access camera. Please select a file instead.');
  }
}

// Legacy message handler (kept for backward compatibility if captureImage.html is still used elsewhere)
// NEW: Native camera system above replaces this for 初物/終物/材料ラベル
window.addEventListener('message', async function(event) {
  if (event.origin === window.location.origin) {
    const data = event.data;
    
    // First, preserve the sub-dropdown value if it exists
    const subDropdown = document.getElementById('sub-dropdown');
    const selectedSubDropdownValue = subDropdown?.value;
    if (selectedSubDropdownValue) {
      localStorage.setItem(`${uniquePrefix}sub-dropdown`, selectedSubDropdownValue);
      console.log(`Preserved sub-dropdown value: ${selectedSubDropdownValue}`);
    }

    if (data.image && currentButtonId) {
      try {
        // Handle material label photos separately using the multi-photo system
        if (currentButtonId === 'makerLabelButton') {
          console.log('Processing material label photo from popup window');
          
          // Log elements for debugging
          const materialLabelJP = document.getElementById('材料ラベル_L');
          const materialLabelEN = document.getElementById('makerLabel');
          const materialImg = document.getElementById('材料ラベル');
          
          console.log('Material label elements found:', {
            '材料ラベル_L': !!materialLabelJP,
            'makerLabel': !!materialLabelEN,
            '材料ラベル': !!materialImg
          });
          
          // Create/ensure elements exist if they don't
          if (!materialLabelJP && !materialLabelEN) {
            console.warn('Material label status elements not found, attempting to create...');
            
            // Find a place to add them if they don't exist
            const makerLabelButton = document.getElementById('makerLabelButton');
            if (makerLabelButton && makerLabelButton.parentElement) {
              const container = document.createElement('div');
              container.style.cssText = 'margin: 5px 0;';
              
              const jpLabel = document.createElement('span');
              jpLabel.id = '材料ラベル_L';
              jpLabel.textContent = 'FALSE';
              jpLabel.style.cssText = 'display: none;'; // Hidden by default
              
              const enLabel = document.createElement('span');
              enLabel.id = 'makerLabel';
              enLabel.textContent = 'FALSE';
              enLabel.style.cssText = 'display: none;'; // Hidden by default
              
              container.appendChild(jpLabel);
              container.appendChild(enLabel);
              
              makerLabelButton.parentElement.appendChild(container);
              console.log('Created material label status elements');
            }
          }
          
          // We pass the full data URL to addMaterialLabelPhoto
          const added = await addMaterialLabelPhoto(data.image);
          
          if (added) {
            console.log('Successfully added material label photo');
            
            // Update all possible material label elements to ensure compatibility
            // Update the legacy single image element
            updateMaterialLabelElement();
            
            // Force render thumbnails to make sure they appear
            setTimeout(() => {
              renderMaterialPhotoThumbnails();
              updateMaterialPhotoCount(); // Make sure counts are updated
              
              // Re-save all material label data to ensure it persists
              localStorage.setItem(`${uniquePrefix}materialLabelPhotos`, JSON.stringify(materialLabelPhotos));
              
              // Double check elements are properly updated
              updateMaterialLabelElement();
            }, 500);
          }
          
          // Reset the current button ID after processing
          currentButtonId = null;
          return;
        }
        
        // Handle other buttons with original functionality
        // Find the mapping for the current button
        const mapping = buttonMappings.find(({
          buttonId
        }) => buttonId === currentButtonId);
  
        if (mapping) {
          const {
            labelId,
            imgId
          } = mapping;
  
          // Update photo preview
          const photoPreview = document.getElementById(imgId);
          if (photoPreview) {
            photoPreview.src = data.image;
            photoPreview.style.display = 'block';
            
            // Save image source to localStorage
            const photoPreviewKey = `${uniquePrefix}${imgId}.src`;
            localStorage.setItem(photoPreviewKey, photoPreview.src);
            console.log(`Updated and saved image for ${imgId}`);
          } else {
            console.error(`Image element ${imgId} not found`);
          }
  
          // Update the associated label to TRUE
          const label = document.getElementById(labelId);
          if (label) {
            label.textContent = 'TRUE';
            
            // Save label textContent to localStorage
            const labelKey = `${uniquePrefix}${labelId}.textContent`;
            localStorage.setItem(labelKey, label.textContent);
            console.log(`Updated and saved ${labelId} as TRUE`);
            
            // Log photo capture
            const photoType = mapping.labelText;
            logTabletAction(`Photo captured: ${photoType}`, 'in-progress', {
              photoType: photoType,
              buttonId: currentButtonId
            });
          } else {
            console.error(`Label element ${labelId} not found`);
          }
        } else {
          console.error(`No mapping found for button ID ${currentButtonId}`);
        }
      } catch (error) {
        console.error('Error processing image from popup:', error);
      } finally {
        // Reset the current button ID after processing
        currentButtonId = null;
        
        // Double check the sub-dropdown value is preserved
        if (selectedSubDropdownValue && subDropdown) {
          setTimeout(() => {
            subDropdown.value = selectedSubDropdownValue;
            console.log(`Re-applied sub-dropdown value: ${selectedSubDropdownValue}`);
            
            // Make sure the "send to machine" button isn't reset
            const sendtoNCKey = `${uniquePrefix}sendtoNCButtonisPressed`;
            const savedSendToNCState = localStorage.getItem(sendtoNCKey);
            if (savedSendToNCState === 'true') {
              sendtoNCButtonisPressed = true;
              console.log("Preserved sendtoNCButtonisPressed state");
            }
          }, 100);
        }
      }
    }
  }
});

// Upload Photo Function for multiple images
function uploadPhotou() {
  const selectedSebanggo = document.getElementById("sub-dropdown").value;
  const currentDate = document.getElementById("Lot No.").value;
  const selectedWorker = document.getElementById("Machine Operator").value;
  const selectedFactory = document.getElementById("selected工場").value;
  const selectedMachine = document.getElementById("process").value;

  // Mapping of images to their respective IDs
  const imageMappings = [{
    imgId: 'hatsumonoPic',
    label: '初物チェック'
  }, {
    imgId: 'atomonoPic',
    label: '終物チェック'
  }, {
    imgId: '材料ラベル',
    label: '材料ラベル'
  }, ];

  imageMappings.forEach(({
    imgId,
    label
  }) => {
    const photoPreview = document.getElementById(imgId);

    if (!photoPreview || !photoPreview.src) {
      console.error(`No photo preview available for ${label}`);
      return;
    }

    // Convert the image to a blob
    fetch(photoPreview.src)
      .then(response => response.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = function() {
          const base64data = reader.result.split(',')[1]; // Get the base64 encoded string

          const formData = new FormData();
          formData.append('imageBlob', base64data);
          formData.append(
            'fileName',
            `${selectedSebanggo}_${currentDate}_${selectedWorker}_${selectedFactory}_${selectedMachine}_${label}.jpg`
          );
          formData.append('mimeType', blob.type);
          formData.append('selectedFactory', selectedFactory);

          // Send the blob to Apps Script via POST request
          fetch(
              'https://script.google.com/macros/s/AKfycbxDWa2RTdI2_aHBgzq9GA9GtQx5MrwqaRnW4F26VZdoptwJ1Pg_Enr_xI3vw1t7WHYbTw/exec', {
                method: 'POST',
                body: formData,
              }
            )
            .then((response) => response.text()) // Fetch raw text response
            .then((text) => {
              console.log(`Raw response for ${label}:`, text); // Log the raw response
              try {
                const data = JSON.parse(text); // Attempt to parse JSON
                if (data.status === 'success') {
                  console.log(`File uploaded successfully for ${label}: ` + data.fileUrl);
                } else {
                  console.error(`Upload failed for ${label}: ` + data.message);
                }
              } catch (error) {
                console.error(`Error parsing JSON for ${label}:`, error);
              }
            })
            .catch((error) => {
              console.error(`Error uploading file for ${label}: `, error);
            });
        };
        reader.readAsDataURL(blob);
      })
      .catch((error) => console.error(`Error converting image to blob for ${label}: `, error));
  });
}

//Submit Button

// document.getElementById('submit').addEventListener('click', async (event) => {
//   event.preventDefault();
//   updateCycleTime();

//   const hatsumono = document.getElementById("hatsumonoLabel").textContent;
//   const atomono = document.getElementById("atomonoLabel").textContent;
//   const isToggleChecked = document.getElementById('enable-inputs').checked;

//   const alertSound = document.getElementById('alert-sound');
//   const scanAlertModal = document.getElementById('scanAlertModal');
//   const scanAlertText = document.getElementById('scanAlertText');
//   const uploadingModal = document.getElementById('uploadingModal');

//   const shotInput = document.getElementById('shot');

//   // Add this validation for the 'shot' field
//   if (!shotInput.value || parseInt(shotInput.value) < 1) {
//     showAlert('ショット数 (Shot Count) is required and must be at least 1.');
//     shotInput.focus();
//     return; // Stop form submission
//   }

//   // Show loading modal
//   uploadingModal.style.display = 'flex';

//   const makerPic = document.getElementById('材料ラベル');
//   if (!makerPic || !makerPic.src || makerPic.style.display === 'none') {
//     uploadingModal.style.display = 'none';
//     showAlert("材料ラベルの写真を撮影してください / Please capture the 材料ラベル image");
//     return;
//   }

//   try {
//     const 品番 = document.getElementById('product-number').value;
//     const 背番号 = document.getElementById('sub-dropdown').value;
//     const 工場 = document.getElementById('selected工場').value;
//     const 設備 = document.getElementById('process').value;
//     const Process_Quantity = parseInt(document.getElementById('ProcessQuantity').value, 10) || 0;
//     const 疵引不良 = parseInt(document.getElementById('counter-18').value, 10) || 0;
//     const 加工不良 = parseInt(document.getElementById('counter-19').value, 10) || 0;
//     const その他 = parseInt(document.getElementById('counter-20').value, 10) || 0;
//     const Total_NG = 疵引不良 + 加工不良 + その他;
//     const Total_PressDB = Process_Quantity - Total_NG;
//     const Worker_Name = document.getElementById('Machine Operator').value;
//     const WorkDate = document.getElementById('Lot No.').value;
//     const Time_start = document.getElementById('Start Time').value;
//     const Time_end = document.getElementById('End Time').value;
//     const 材料ロット = document.getElementById('材料ロット').value;
//     const Spare = parseInt(document.getElementById('在庫').value, 10) || 0;
//     const Comment = document.querySelector('textarea[name="Comments1"]').value;
//     const Cycle_Time = parseFloat(document.getElementById('cycleTime').value) || 0;
//     const ショット数 = parseInt(document.getElementById('shot').value, 10) || 0;

//     // Collect break time data
//     const breakTimeData = {
//       break1: {
//         start: document.getElementById('break1-start')?.value || '',
//         end: document.getElementById('break1-end')?.value || ''
//       },
//       break2: {
//         start: document.getElementById('break2-start')?.value || '',
//         end: document.getElementById('break2-end')?.value || ''
//       },
//       break3: {
//         start: document.getElementById('break3-start')?.value || '',
//         end: document.getElementById('break3-end')?.value || ''
//       },
//       break4: {
//         start: document.getElementById('break4-start')?.value || '',
//         end: document.getElementById('break4-end')?.value || ''
//       }
//     };

//     // Calculate total break time in minutes
//     const totalBreakMinutes = calculateTotalBreakTime();
//     const totalBreakHours = totalBreakMinutes / 60;

//     // Calculate total machine trouble/maintenance time in minutes
//     const totalTroubleMinutes = calculateTotalMachineTroubleTime();
//     const totalTroubleHours = totalTroubleMinutes / 60;

//     // Upload maintenance photos before submitting
//     if (maintenanceRecords.length > 0) {
//       console.log(`📸 Uploading maintenance photos for ${maintenanceRecords.length} maintenance records...`);
//       await uploadMaintenancePhotos();
//       console.log("✅ Maintenance photo upload process completed");
//     }

//     // Prepare maintenance data for submission (only Firebase URLs, no base64)
//     const maintenanceDataForSubmission = {
//       records: maintenanceRecords.map(record => ({
//         id: record.id,
//         startTime: record.startTime,
//         endTime: record.endTime,
//         comment: record.comment,
//         timestamp: record.timestamp,
//         // Only include Firebase URLs, not base64 data
//         photos: record.photos ? record.photos.map(photo => ({
//           id: photo.id,
//           timestamp: photo.timestamp,
//           firebaseUrl: photo.firebaseUrl,
//           uploaded: photo.uploaded,
//           uploadError: photo.uploadError
//         })).filter(photo => photo.firebaseUrl) : [] // Only include photos with Firebase URLs
//       })),
//       totalMinutes: totalTroubleMinutes,
//       totalHours: totalTroubleHours
//     };

//     console.log("📊 Maintenance data prepared for submission:", {
//       recordCount: maintenanceDataForSubmission.records.length,
//       totalPhotosWithUrls: maintenanceDataForSubmission.records.reduce((sum, record) => sum + record.photos.length, 0),
//       totalMinutes: totalTroubleMinutes
//     });

//     // Calculate total work hours (Time_end - Time_start - break time - maintenance time)
//     let totalWorkHours = 0;
//     if (Time_start && Time_end) {
//       const startWork = new Date(`2000-01-01T${Time_start}:00`);
//       const endWork = new Date(`2000-01-01T${Time_end}:00`);

//       if (endWork > startWork) {
//         const workDiffMs = endWork - startWork;
//         const workHours = workDiffMs / (1000 * 60 * 60); // Convert to hours
//         totalWorkHours = Math.max(0, workHours - totalBreakHours - totalTroubleHours); // Subtract break and maintenance time, ensure not negative
//       }
//     }

//     // Log the calculations for debugging
//     console.log('Time Calculations:', {
//       totalBreakMinutes,
//       totalBreakHours: totalBreakHours.toFixed(2),
//       totalMaintenanceMinutes: totalTroubleMinutes,
//       totalMaintenanceHours: totalTroubleHours.toFixed(2),
//       workTimeWithoutBreakAndMaintenance: totalWorkHours.toFixed(2),
//       startTime: Time_start,
//       endTime: Time_end,
//       maintenanceRecordsCount: maintenanceRecords.length
//     });

//     if (!背番号) {
//       uploadingModal.style.display = 'none';
//       scanAlertText.innerText = '背番号が必要です。 / Sebanggo is required.';
//       scanAlertModal.style.display = 'block';
//       if (alertSound) {
//         alertSound.muted = false;
//         alertSound.volume = 1;
//         alertSound.play().catch(console.error);
//       }
//       document.body.classList.add('flash-red');
//       document.getElementById('closeScanModalButton').onclick = function() {
//         scanAlertModal.style.display = 'none';
//         alertSound.pause();
//         alertSound.currentTime = 0;
//         alertSound.muted = true;
//         document.body.classList.remove('flash-red');
//       };
//       return;
//     }

//     // Upload images and map to data
//     const uploadedImages = await collectImagesForUpload();
//     const pressDBData = {
//       品番,
//       背番号,
//       設備,
//       Total: Total_PressDB,
//       工場,
//       Worker_Name,
//       Process_Quantity,
//       Date: WorkDate,
//       Time_start,
//       Time_end,
//       材料ロット,
//       疵引不良,
//       加工不良,
//       その他,
//       Total_NG,
//       Spare,
//       Comment,
//       Cycle_Time,
//       ショット数,
//       Break_Time_Data: breakTimeData,
//       Total_Break_Minutes: totalBreakMinutes,
//       Total_Break_Hours: parseFloat(totalBreakHours.toFixed(2)),
//       Maintenance_Data: maintenanceDataForSubmission,
//       Total_Trouble_Minutes: totalTroubleMinutes,
//       Total_Trouble_Hours: parseFloat(totalTroubleHours.toFixed(2)),
//       Total_Work_Hours: parseFloat(totalWorkHours.toFixed(2))
//     };

//     uploadedImages.forEach(img => {
//       if (img.label === "初物チェック") {
//         pressDBData["初物チェック画像"] = img.url;
//       } else if (img.label === "終物チェック") {
//         pressDBData["終物チェック画像"] = img.url;
//       } else if (img.label === "材料ラベル") {
//         pressDBData["材料ラベル画像"] = img.url;
//       }
//     });

//     // Attach base64 for backend processing
//     pressDBData.images = uploadedImages;

//     const pressDBResponse = await fetch(`${serverURL}/submitTopressDBiReporter`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify(pressDBData),
//     });

//     if (!pressDBResponse.ok) {
//       const errorData = await pressDBResponse.json();
//       throw new Error(errorData.error || 'Failed to save data to pressDB');
//     }

//     // Optionally submit to kensaDB
//     if (isToggleChecked) {
//       const counters = Array.from({
//         length: 12
//       }, (_, i) => {
//         const counter = document.getElementById(`counter-${i + 1}`);
//         return parseInt(counter?.value || 0, 10);
//       });

//       const Total_NG_Kensa = counters.reduce((sum, val) => sum + val, 0);
//       const Total_KensaDB = Total_PressDB - Total_NG_Kensa;

//       const kensaDBData = {
//         品番,
//         背番号,
//         工場,
//         Total: Total_KensaDB,
//         Worker_Name,
//         Process_Quantity,
//         Remaining_Quantity: Total_PressDB,
//         Date: WorkDate,
//         Time_start,
//         Time_end,
//         設備,
//         Cycle_Time,
//         製造ロット: 材料ロット,
//         Comment,
//         Spare,
//         Counters: counters.reduce((acc, val, i) => {
//           acc[`counter-${i + 1}`] = val;
//           return acc;
//         }, {}),
//         Total_NG: Total_NG_Kensa,
//         Break_Time_Data: breakTimeData,
//         Total_Break_Minutes: totalBreakMinutes,
//         Total_Break_Hours: parseFloat(totalBreakHours.toFixed(2)),
//         Maintenance_Data: maintenanceDataForSubmission,
//         Total_Trouble_Minutes: totalTroubleMinutes,
//         Total_Trouble_Hours: parseFloat(totalTroubleHours.toFixed(2)),
//         Total_Work_Hours: parseFloat(totalWorkHours.toFixed(2))
//       };

//       const kensaDBResponse = await fetch(`${serverURL}/submitToKensaDBiReporter`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json'
//         },
//         body: JSON.stringify(kensaDBData),
//       });

//       if (!kensaDBResponse.ok) {
//         const errorData = await kensaDBResponse.json();
//         throw new Error(errorData.error || 'Failed to save data to kensaDB');
//       }
//     }

//     setTimeout(() => {
//       uploadingModal.style.display = 'none';
//       scanAlertText.innerText = 'Form submitted successfully / 保存しました';
//       scanAlertModal.style.display = 'block';
//       document.body.classList.add('flash-green');
//       document.getElementById('closeScanModalButton').onclick = function() {
//         scanAlertModal.style.display = 'none';
//         document.body.classList.remove('flash-green');
//         window.location.reload();
//         resetForm();
//       };
//     }, 3000);

//   } catch (error) {
//     console.error('Error during submission:', error);
//     uploadingModal.style.display = 'none';
//     scanAlertText.innerText = 'An error occurred. Please try again.';
//     scanAlertModal.style.display = 'block';
//     if (alertSound) {
//       alertSound.muted = false;
//       alertSound.volume = 1;
//       alertSound.play().catch(console.error);
//     }
//     document.body.classList.add('flash-red');
//     document.getElementById('closeScanModalButton').onclick = function() {
//       scanAlertModal.style.display = 'none';
//       alertSound.pause();
//       alertSound.currentTime = 0;
//       alertSound.muted = true;
//       document.body.classList.remove('flash-red');
//     };
//   }
// });

// ==================== DATE CHOICE MODAL ====================
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ensureDateChoiceModal() {
  let modal = document.getElementById('dateChoiceModal');
  if (modal) {
    return modal;
  }

  modal = document.createElement('div');
  modal.id = 'dateChoiceModal';
  modal.style.cssText = `
    display: none;
    position: fixed;
    z-index: 10050;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.7);
    justify-content: center;
    align-items: center;
  `;

  modal.innerHTML = `
    <div style="
      background: white;
      padding: 25px;
      border-radius: 12px;
      width: 90%;
      max-width: 520px;
      text-align: center;
      box-shadow: 0 6px 20px rgba(0,0,0,0.25);
      position: relative;
    ">
      <button id="closeDateChoiceModal" style="
        position: absolute;
        top: 8px;
        right: 10px;
        background: transparent;
        border: none;
        font-size: 24px;
        font-weight: bold;
        color: #666;
        cursor: pointer;
        line-height: 1;
      ">×</button>
      <style>
        @keyframes dateBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0.2; }
        }
        .date-mismatch {
          color: #dc3545;
          font-weight: 800;
          animation: dateBlink 1s infinite;
        }
        .date-mismatch-button {
          font-weight: 800;
          animation: dateBlink 1s infinite;
        }
        .date-btn-label {
          line-height: 1;
          margin: 0;
          padding: 0;
          display: block;
        }
        .date-btn-date {
          line-height: 1;
          margin: 0;
          padding: 0;
          display: block;
        }
      </style>
      <h2 style="margin: 0 0 10px;">日付確認 / Date Confirmation</h2>
      <p id="dateChoiceMessage" style="margin: 0 0 20px; color: #444; line-height: 1.5;"></p>
      <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
        <button id="useEnteredDateBtn" style="
          width: 160px;
          height: 160px;
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          white-space: nowrap;
          gap: 0;
          padding: 6px 10px;
        ">Entered Date</button>
        <button id="useCurrentDateBtn" style="
          width: 160px;
          height: 160px;
          background: #28a745;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          white-space: nowrap;
          gap: 0;
          padding: 6px 10px;
        ">Current Date</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
}

function showDateChoiceModal(enteredDate, currentDate) {
  return new Promise((resolve) => {
    const modal = ensureDateChoiceModal();
    const message = modal.querySelector('#dateChoiceMessage');
    const enteredBtn = modal.querySelector('#useEnteredDateBtn');
    const currentBtn = modal.querySelector('#useCurrentDateBtn');
    const closeBtn = modal.querySelector('#closeDateChoiceModal');

    message.innerHTML = `入力日付: <strong class="date-mismatch">${enteredDate}</strong><br>現在日付: <strong>${currentDate}</strong><br><br>どちらの日付を使用しますか？<br>Which date should be used?`;
    enteredBtn.innerHTML = `<span class="date-btn-label">Entered</span><span class="date-btn-date date-mismatch-button">${enteredDate}</span>`;
    currentBtn.innerHTML = `<span class="date-btn-label">Current</span><span class="date-btn-date">${currentDate}</span>`;

    const cleanup = () => {
      enteredBtn.onclick = null;
      currentBtn.onclick = null;
      closeBtn.onclick = null;
      modal.style.display = 'none';
    };

    enteredBtn.onclick = () => {
      cleanup();
      resolve('entered');
    };

    currentBtn.onclick = () => {
      cleanup();
      resolve('current');
    };

    closeBtn.onclick = () => {
      cleanup();
      resolve('cancel');
    };

    modal.style.display = 'flex';
  });
}

// Locate your document.getElementById('submit').addEventListener('click', async (event) => { ... }
document.getElementById('submit').addEventListener('click', async (event) => {
    event.preventDefault();
    updateCycleTime();

    const hatsumono = document.getElementById("hatsumonoLabel").textContent;
    const atomono = document.getElementById("atomonoLabel").textContent;
    const enableInputsElement = document.getElementById('enable-inputs');
    const isToggleChecked = enableInputsElement ? enableInputsElement.checked : false;

    const alertSound = document.getElementById('alert-sound');
    const scanAlertModal = document.getElementById('scanAlertModal');
    const scanAlertText = document.getElementById('scanAlertText');
    const uploadingModal = document.getElementById('uploadingModal');

    const shotInput = document.getElementById('shot');

    if (!shotInput.value || parseInt(shotInput.value) < 1) {
        showAlert('ショット数 (Shot Count) is required and must be at least 1.');
        shotInput.focus();
        return;
    }

    uploadingModal.style.display = 'flex';

    // Use the new material label photo system for validation
    if (materialLabelPhotos.length === 0) {
        // Check legacy system as fallback
        const makerPic = document.getElementById('材料ラベル');
        if (!makerPic || !makerPic.src || makerPic.src === '' || makerPic.src === 'data:,' || makerPic.style.display === 'none') {
            console.error("材料ラベル validation failed - no photos in either system:", {
                newSystemPhotoCount: materialLabelPhotos.length,
                legacyExists: !!makerPic,
                legacyHasSrc: !!(makerPic && makerPic.src),
                legacySrc: makerPic ? makerPic.src.substring(0, 30) + '...' : 'none',
                legacyDisplay: makerPic ? makerPic.style.display : 'N/A'
            });
            uploadingModal.style.display = 'none';
            showAlert("材料ラベルの写真を撮影してください / Please capture the 材料ラベル image");
            return;
        }
    }
    
    console.log("材料ラベル validation passed:", {
        newSystemPhotoCount: materialLabelPhotos.length
    });

    try {
        const 品番 = document.getElementById('product-number').value;
        const 背番号 = document.getElementById('sub-dropdown').value;
        const 工場 = document.getElementById('selected工場').value;
        const 設備 = document.getElementById('process').value;
        const Process_Quantity = parseInt(document.getElementById('ProcessQuantity').value, 10) || 0;
        const 疵引不良 = parseInt(document.getElementById('counter-18').value, 10) || 0;
        const 加工不良 = parseInt(document.getElementById('counter-19').value, 10) || 0;
        const その他 = parseInt(document.getElementById('counter-20').value, 10) || 0;
        const Total_NG = 疵引不良 + 加工不良 + その他;
        const Total_PressDB = Process_Quantity - Total_NG;
        const Worker_Name = document.getElementById('Machine Operator').value;
        let WorkDate = document.getElementById('Lot No.').value;
        const Time_start = document.getElementById('Start Time').value;
        const Time_end = document.getElementById('End Time').value;
        const 材料ロット = document.getElementById('材料ロット').value;
        const Spare = parseInt(document.getElementById('在庫').value, 10) || 0;
        const Comment = document.querySelector('textarea[name="Comments1"]').value;
        const Cycle_Time = parseFloat(document.getElementById('cycleTime').value) || 0;
        const ショット数 = parseInt(document.getElementById('shot').value, 10) || 0;

        // ==================== VALIDATION SECTION ====================
        // Validate all required fields before submission

        // 1. Check required fields
        if (!品番 || 品番.trim() === '') {
            uploadingModal.style.display = 'none';
            showAlert('品番が必要です / Product Number is required');
            document.getElementById('product-number').focus();
            return;
        }

        if (!背番号 || 背番号.trim() === '') {
            uploadingModal.style.display = 'none';
            showAlert('背番号が必要です / Sebanggo is required');
            document.getElementById('sub-dropdown').focus();
            return;
        }

        if (!工場 || 工場.trim() === '') {
            uploadingModal.style.display = 'none';
            showAlert('工場が必要です / Factory is required');
            document.getElementById('selected工場').focus();
            return;
        }

        if (!設備 || 設備.trim() === '') {
            uploadingModal.style.display = 'none';
            showAlert('設備が必要です / Equipment is required');
            document.getElementById('process').focus();
            return;
        }

        if (!Process_Quantity || Process_Quantity <= 0) {
            uploadingModal.style.display = 'none';
            showAlert('加工数（良品）が必要です / Process Quantity is required and must be greater than 0');
            document.getElementById('ProcessQuantity').focus();
            return;
        }

        if (!Worker_Name || Worker_Name.trim() === '') {
            uploadingModal.style.display = 'none';
            showAlert('作業者名が必要です / Worker Name is required');
            document.getElementById('Machine Operator').focus();
            return;
        }

        if (!WorkDate || WorkDate.trim() === '') {
            uploadingModal.style.display = 'none';
            showAlert('加工日が必要です / Work Date is required');
            document.getElementById('Lot No.').focus();
            return;
        }

        // Compare entered date vs current date and ask user which to use
        const currentDate = getTodayDateString();
        if (WorkDate !== currentDate) {
          uploadingModal.style.display = 'none';
          const choice = await showDateChoiceModal(WorkDate, currentDate);
          if (choice === 'cancel') {
            return;
          }
          if (choice === 'current') {
            WorkDate = currentDate;
            const dateInput = document.getElementById('Lot No.');
            if (dateInput) {
              dateInput.value = currentDate;
              localStorage.setItem(`${uniquePrefix}${dateInput.id}`, currentDate);
            }
          }
          uploadingModal.style.display = 'flex';
        }

        if (!材料ロット || 材料ロット.trim() === '') {
            uploadingModal.style.display = 'none';
            showAlert('材料ロットが必要です / Material Lot is required');
            document.getElementById('材料ロット').focus();
            return;
        }

        // ==================== NEW: Validate Material Label Photos vs Lot Count ====================
        // Count unique lot numbers (comma-separated values)
        const lotNumbers = 材料ロット.split(',').map(lot => lot.trim()).filter(lot => lot !== '');
        const uniqueLotCount = lotNumbers.length;
        const materialPhotoCount = materialLabelPhotos.length;

        console.log('Material lot validation:', {
            材料ロット,
            lotNumbers,
            uniqueLotCount,
            materialPhotoCount
        });

        // Check if material label photo count is sufficient
        if (materialPhotoCount < uniqueLotCount) {
            uploadingModal.style.display = 'none';
            showAlert(
                `材料ラベルの写真が不足しています\n\n` +
                `ロット数: ${uniqueLotCount}個\n` +
                `写真数: ${materialPhotoCount}枚\n\n` +
                `各ロットの材料ラベル写真を撮影してください\n\n` +
                `---\n\n` +
                `Insufficient material label photos\n\n` +
                `Lot count: ${uniqueLotCount}\n` +
                `Photo count: ${materialPhotoCount}\n\n` +
                `Please capture a material label photo for each lot`
            );
            
            // Log the validation failure
            logTabletAction('Material label photo validation failed', 'error', {
                lotCount: uniqueLotCount,
                photoCount: materialPhotoCount,
                lotNumbers: lotNumbers
            });
            
            return;
        }

        console.log('✅ Material label photo validation passed:', {
            uniqueLotCount,
            materialPhotoCount
        });
        // ==================== END Material Label Photos Validation ====================

        // 2. Validate Time fields
        if (!Time_start || Time_start.trim() === '') {
            uploadingModal.style.display = 'none';
            showAlert('加工開始時間が必要です / Start Time is required');
            document.getElementById('Start Time').focus();
            return;
        }

        if (!Time_end || Time_end.trim() === '') {
            uploadingModal.style.display = 'none';
            showAlert('加工終了時間が必要です / End Time is required');
            document.getElementById('End Time').focus();
            return;
        }

        // 3. Validate Time_start < Time_end and Time_start ≠ Time_end
        const startTimeDate = new Date(`2000-01-01T${Time_start}:00`);
        const endTimeDate = new Date(`2000-01-01T${Time_end}:00`);

        if (Time_start === Time_end) {
            uploadingModal.style.display = 'none';
            showAlert('加工開始時間と加工終了時間は同じにできません\n\nStart Time and End Time cannot be the same\n\n開始: ' + Time_start + '\n終了: ' + Time_end);
            document.getElementById('End Time').focus();
            return;
        }

        if (startTimeDate >= endTimeDate) {
            uploadingModal.style.display = 'none';
            showAlert('加工開始時間は加工終了時間より前である必要があります\n\nStart Time must be before End Time\n\n開始: ' + Time_start + '\n終了: ' + Time_end);
            document.getElementById('End Time').focus();
            return;
        }

        console.log('✅ All required fields validated successfully');
        // ==================== END VALIDATION SECTION ====================

        const breakTimeData = {
            break1: { start: document.getElementById('break1-start')?.value || '', end: document.getElementById('break1-end')?.value || '' },
            break2: { start: document.getElementById('break2-start')?.value || '', end: document.getElementById('break2-end')?.value || '' },
            break3: { start: document.getElementById('break3-start')?.value || '', end: document.getElementById('break3-end')?.value || '' },
            break4: { start: document.getElementById('break4-start')?.value || '', end: document.getElementById('break4-end')?.value || '' }
        };

        const totalBreakMinutes = calculateTotalBreakTime();
        const totalBreakHours = totalBreakMinutes / 60;

        const totalTroubleMinutes = calculateTotalMachineTroubleTime();
        const totalTroubleHours = totalTroubleMinutes / 60;

        // Prepare maintenance images data for the new submitToDCP route with compression
        const maintenanceImages = [];
        
        if (maintenanceRecords.length > 0) {
            console.log(`📸 Preparing ${maintenanceRecords.length} maintenance records for submission...`);
            
            for (const record of maintenanceRecords) {
                if (record.photos && record.photos.length > 0) {
                    for (const photo of record.photos) {
                        if (photo.base64 && photo.id && photo.timestamp) {
                            // Ensure base64 data has proper data URL prefix
                            const photoDataURL = photo.base64.startsWith('data:') 
                                ? photo.base64 
                                : `data:image/jpeg;base64,${photo.base64}`;
                            
                            // Compress maintenance photo for upload (80% quality, max 1024px)
                            const originalSize = (photo.base64.length / 1024).toFixed(2);
                            const compressedDataURL = await compressBase64Image(photoDataURL, 1024, 0.8);
                            const compressedSize = (compressedDataURL.length / 1024).toFixed(2);
                            console.log(`Maintenance photo ${photo.id}: ${originalSize} KB → ${compressedSize} KB`);
                            
                            // Extract just the base64 part (remove data:image/jpeg;base64, prefix) for server upload
                            const compressedBase64Only = compressedDataURL.split(',')[1] || compressedDataURL;
                            
                            maintenanceImages.push({
                                base64: compressedBase64Only, // Server expects base64 without prefix
                                id: photo.id,
                                timestamp: photo.timestamp,
                                maintenanceRecordId: record.id
                            });
                        }
                    }
                }
            }
            
            console.log(`📊 Prepared ${maintenanceImages.length} maintenance images for upload (compressed)`);
        }

        // Prepare maintenance data structure (without photos - they'll be added by server)
        const maintenanceDataForSubmission = {
            records: maintenanceRecords.map(record => ({
                id: record.id,
                startTime: record.startTime,
                endTime: record.endTime,
                comment: record.comment,
                timestamp: record.timestamp
                // photos will be populated by the server after upload
            })),
            totalMinutes: totalTroubleMinutes,
            totalHours: totalTroubleHours
        };

        console.log("📊 Maintenance data prepared for submission:", {
            recordCount: maintenanceDataForSubmission.records.length,
            totalImages: maintenanceImages.length,
            totalMinutes: totalTroubleMinutes
        });

        let totalWorkHours = 0;
        if (Time_start && Time_end) {
            const startWork = new Date(`2000-01-01T${Time_start}:00`);
            const endWork = new Date(`2000-01-01T${Time_end}:00`);
            if (endWork > startWork) {
                const workDiffMs = endWork - startWork;
                const workHours = workDiffMs / (1000 * 60 * 60);
                totalWorkHours = Math.max(0, workHours - totalBreakHours - totalTroubleHours);
            }
        }
        console.log('Time Calculations:', {
            totalBreakMinutes, totalBreakHours: totalBreakHours.toFixed(2),
            totalMaintenanceMinutes: totalTroubleMinutes, totalMaintenanceHours: totalTroubleHours.toFixed(2),
            workTimeWithoutBreakAndMaintenance: totalWorkHours.toFixed(2),
            startTime: Time_start, endTime: Time_end, maintenanceRecordsCount: maintenanceRecords.length
        });

        if (!背番号) {
            uploadingModal.style.display = 'none';
            scanAlertText.innerText = '背番号が必要です。 / Sebanggo is required.';
            scanAlertModal.style.display = 'block';
            if (alertSound) { alertSound.muted = false; alertSound.volume = 1; alertSound.play().catch(console.error); }
            document.body.classList.add('flash-red');
            document.getElementById('closeScanModalButton').onclick = function() {
                scanAlertModal.style.display = 'none'; alertSound.pause(); alertSound.currentTime = 0;
                alertSound.muted = true; document.body.classList.remove('flash-red');
            };
            return;
        }

        const uploadedImages = await collectImagesForUpload();
        
        // Process all material label photos from the new system with compression
        const materialLabelImages = [];
        
        console.log(`📸 Processing ${materialLabelPhotos.length} material label photos for submission`);
        console.log('Material photos array:', materialLabelPhotos.map((p, i) => ({ index: i, hasBase64: !!p.base64, timestamp: p.timestamp })));
        
        // Convert all material label photos to the format expected by server (with compression)
        for (let i = 0; i < materialLabelPhotos.length; i++) {
            const photo = materialLabelPhotos[i];
            if (!photo.base64) {
                console.warn(`⚠️ Skipping material label photo ${i} - no base64 data`);
                continue;
            }
            
            // Ensure base64 data has proper data URL prefix
            const photoDataURL = photo.base64.startsWith('data:') 
                ? photo.base64 
                : `data:image/jpeg;base64,${photo.base64}`;
            
            // Compress material label photo for upload (80% quality, max 1024px)
            const originalSize = (photo.base64.length / 1024).toFixed(2);
            const compressedDataURL = await compressBase64Image(photoDataURL, 1024, 0.8);
            const compressedSize = (compressedDataURL.length / 1024).toFixed(2);
            console.log(`✅ Material label ${i+1}/${materialLabelPhotos.length}: ${originalSize} KB → ${compressedSize} KB`);
            
            // Extract just the base64 part (remove data:image/jpeg;base64, prefix) for server upload
            const compressedBase64Only = compressedDataURL.split(',')[1] || compressedDataURL;
            
            materialLabelImages.push({
                base64: compressedBase64Only, // Server expects base64 without prefix
                id: `material-label-${i}-${photo.timestamp || new Date().getTime()}`,
                timestamp: photo.timestamp || new Date().getTime(),
                description: `材料ラベル ${i+1}/${materialLabelPhotos.length}`
            });
            
            console.log(`   📦 Added to upload queue: ${(compressedBase64Only.length / 1024).toFixed(2)} KB compressed`);
        }
        
        console.log(`📊 Total material label images prepared for upload: ${materialLabelImages.length}`);
        
        // Fallback to legacy method if no photos in new system
        if (materialLabelImages.length === 0) {
            const makerPic = document.getElementById('材料ラベル');
            
            // Only process if the image element exists and has content
            if (makerPic && makerPic.src && makerPic.src !== '' && makerPic.src !== 'data:,' && makerPic.style.display !== 'none') {
                try {
                    console.log("No photos in new system - Processing legacy material label image");
                    const response = await fetch(makerPic.src);
                    const blob = await response.blob();
                    const base64Data = await blobToBase64(blob);
                    
                    // Add material label as a separate entry with timestamp for uniqueness
                    materialLabelImages.push({
                        base64: base64Data,
                        id: 'material-label-legacy-' + new Date().getTime(),
                        timestamp: new Date().getTime(),
                        description: '材料ラベル (Legacy)'
                    });
                    
                    console.log(`Legacy material label image processed: ${(base64Data.length / 1024).toFixed(2)} KB`);
                } catch (error) {
                    console.error("Error processing legacy material label image:", error);
                }
            } else {
                console.warn("Material label image not available in either system");
            }
        }
        
        // Prepare data for the new submitToDCP route
        const dcpSubmissionData = {
            品番, 背番号, 設備, Total: Total_PressDB, 工場, Worker_Name, Process_Quantity, Date: WorkDate,
            Time_start, Time_end, 材料ロット, 疵引不良, 加工不良, その他, Total_NG, Spare, Comment,
            Cycle_Time, ショット数, Break_Time_Data: breakTimeData,
            Total_Break_Minutes: totalBreakMinutes, Total_Break_Hours: parseFloat(totalBreakHours.toFixed(2)),
            Maintenance_Data: maintenanceDataForSubmission,
            Total_Trouble_Minutes: totalTroubleMinutes, Total_Trouble_Hours: parseFloat(totalTroubleHours.toFixed(2)),
            Total_Work_Hours: parseFloat(totalWorkHours.toFixed(2)),
            
            // Include image data
            images: uploadedImages, // Cycle check images (existing logic)
            maintenanceImages: maintenanceImages, // Maintenance images
            materialLabelImages: materialLabelImages, // NEW: Special handling for material label
            
            // Include toggle state and counter data for kensaDB
            isToggleChecked: isToggleChecked
        };

        // Add counter data if toggle is checked
        if (isToggleChecked) {
            const counters = Array.from({ length: 12 }, (_, i) => {
                const counter = document.getElementById(`counter-${i + 1}`);
                return parseInt(counter?.value || 0, 10);
            });
            dcpSubmissionData.Counters = counters.reduce((acc, val, i) => {
                acc[`counter-${i + 1}`] = val;
                return acc;
            }, {});
        }

        console.log("🚀 Submitting to new DCP route:", {
            品番, 背番号, 工場, 設備, Worker_Name,
            cycleCheckImages: uploadedImages.length,
            maintenanceImages: maintenanceImages.length,
            materialLabelImages: materialLabelImages.length, // ✅ Added logging for material labels
            maintenanceRecords: maintenanceDataForSubmission.records.length,
            isToggleChecked
        });
        
        console.log('📋 Material label images being sent:', materialLabelImages.map(img => ({ 
            id: img.id, 
            size: (img.base64.length / 1024).toFixed(2) + ' KB',
            description: img.description 
        })));

        // Submit to the new combined route
        const dcpResponse = await fetch(`${serverURL}/submitToDCP`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dcpSubmissionData)
        });

        if (!dcpResponse.ok) {
            const errorData = await dcpResponse.json();
            throw new Error(errorData.message || 'Failed to submit DCP data');
        }

        const dcpResult = await dcpResponse.json();
        console.log("✅ DCP submission successful:", dcpResult);

        // Log submit button action ONLY after successful submission
        logTabletAction('Submit button pressed', 'Completed', { 
            shotCount: shotInput.value,
            品番,
            背番号,
            工場,
            設備,
            processQuantity: Process_Quantity,
            totalNG: Total_NG
        });
        
        // Clear session ONLY after successful submission
        clearSessionID();

        setTimeout(() => {
            uploadingModal.style.display = 'none'; scanAlertText.innerText = 'Form submitted successfully / 保存しました';
            scanAlertModal.style.display = 'block'; document.body.classList.add('flash-green');
            
            // Auto-close after 5 seconds to prevent duplicate submissions
            const autoCloseTimer = setTimeout(() => {
                scanAlertModal.style.display = 'none'; document.body.classList.remove('flash-green');
                window.location.reload(); resetForm();
            }, 5000);
            
            // Allow manual close by clicking the × button
            document.getElementById('closeScanModalButton').onclick = function() {
                clearTimeout(autoCloseTimer); // Cancel auto-close if user clicks manually
                scanAlertModal.style.display = 'none'; document.body.classList.remove('flash-green');
                window.location.reload(); resetForm();
            };
        }, 3000);

    } catch (error) {
        console.error('Error during submission:', error);
        uploadingModal.style.display = 'none'; scanAlertText.innerText = 'An error occurred. Please try again.';
        scanAlertModal.style.display = 'block';
        if (alertSound) { alertSound.muted = false; alertSound.volume = 1; alertSound.play().catch(console.error); }
        document.body.classList.add('flash-red');
        document.getElementById('closeScanModalButton').onclick = function() {
            scanAlertModal.style.display = 'none'; alertSound.pause(); alertSound.currentTime = 0;
            alertSound.muted = true; document.body.classList.remove('flash-red');
        };
    }
});

// Image Collection with Base64 + Metadata (with compression for upload)
async function collectImagesForUpload() {
  const selectedSebanggo = document.getElementById("sub-dropdown").value;
  const currentDate = document.getElementById("Lot No.").value;
  const selectedWorker = document.getElementById("Machine Operator").value;
  const selectedFactory = document.getElementById("selected工場").value;
  const selectedMachine = document.getElementById("process").value;

  const imageMappings = [{
    imgId: 'hatsumonoPic',
    label: '初物チェック'
  }, {
    imgId: 'atomonoPic',
    label: '終物チェック'
  }];

  const imagesToUpload = [];

  // Debug logging for image element existence
  console.log("Checking image elements:");
  for (const { imgId, label } of imageMappings) {
    const photoPreview = document.getElementById(imgId);
    console.log(`Image element '${imgId}' (${label}): ${photoPreview ? 'Found' : 'Not found'}, ` + 
                `Has src: ${photoPreview && photoPreview.src ? 'Yes' : 'No'}, ` +
                `Display: ${photoPreview ? photoPreview.style.display : 'N/A'}`);
  }

  // Process regular cycle check images (hatsumono and atomono) with compression
  let imageIndex = 0; // Counter to ensure unique timestamps
  for (const { imgId, label } of imageMappings) {
    const photoPreview = document.getElementById(imgId);
    // Skip if element doesn't exist, has no src, or is hidden
    if (!photoPreview || !photoPreview.src || photoPreview.src === '' || photoPreview.src === 'data:,' || 
        photoPreview.style.display === 'none') {
      console.log(`Skipping ${label} image: not available or hidden`);
      continue;
    }

    try {
      console.log(`Processing ${label} image from element: ${imgId}`);
      
      // Get original image (should be a data URL)
      const originalDataURL = photoPreview.src;
      const originalSize = (originalDataURL.length / 1024).toFixed(2);
      console.log(`Original ${label}: ${originalSize} KB`);
      
      // Compress for upload (80% quality, max 1024px)
      const compressedDataURL = await compressBase64Image(originalDataURL, 1024, 0.8);
      const compressedSize = (compressedDataURL.length / 1024).toFixed(2);
      console.log(`Compressed ${label}: ${compressedSize} KB`);
      
      // Extract just the base64 part (remove data:image/jpeg;base64, prefix) for server upload
      const compressedBase64Only = compressedDataURL.split(',')[1] || compressedDataURL;

      // Create unique ID using label, timestamp, and index to prevent overwrites
      const uniqueId = `${imgId}-${Date.now()}-${imageIndex++}`;
      
      imagesToUpload.push({
        base64: compressedBase64Only, // Server expects base64 without prefix
        label,
        id: uniqueId, // Add unique ID for each image
        imgId: imgId, // Keep original imgId for reference
        factory: selectedFactory,
        machine: selectedMachine,
        worker: selectedWorker,
        date: currentDate,
        sebanggo: selectedSebanggo,
        timestamp: Date.now() + imageIndex // Ensure unique timestamp by adding index
      });
      
      console.log(`✅ Added ${label} to upload queue with unique ID: ${uniqueId}`);
    } catch (error) {
      console.error(`Error processing ${label} image:`, error);
    }
  }
  
  // NOTE: Material label photos are processed separately in materialLabelImages array
  // and sent via dcpSubmissionData.materialLabelImages, not in the images array.
  // This avoids duplicate processing and ensures all photos are uploaded correctly.
  console.log('Material label photos are processed separately in materialLabelImages array');

  return imagesToUpload;
}

// Blob to base64 conversion
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function toggleInputs() {
  const enableInputsCheckbox = document.getElementById('enable-inputs');
  if (!enableInputsCheckbox) {
    // Element doesn't exist (e.g., in DCP Grouping.html), skip this function
    return;
  }
  
  var isChecked = enableInputsCheckbox.checked;
  
  // Log checkbox toggle action
  logTabletAction('Kensa mode checkbox toggled', isChecked ? 'Completed' : 'Reset', { kensaEnabled: isChecked });
  
  var inputs = document.querySelectorAll('#Kensa\\ Name, #KDate, #KStart\\ Time, #KEnd\\ Time,.plus-btn,.minus-btn, textarea[name="Comments2"], #在庫');

  inputs.forEach(function(input) {
    input.disabled = !isChecked;
  });

  // Enable or disable only counters 1 to 12 when the checkbox is checked
  for (let i = 1; i <= 12; i++) {
    var plusBtn = document.querySelector(`#counter-box-${i} .plus-btn`);
    var minusBtn = document.querySelector(`#counter-box-${i} .minus-btn`);
    if (plusBtn) plusBtn.disabled = !isChecked;
    if (minusBtn) minusBtn.disabled = !isChecked;
  }

  // Ensure plus and minus buttons of 18, 19, and 20 remain functional
  [18, 19, 20].forEach(function(counterId) {
    var plusBtn = document.querySelector(`#counter-box-${counterId} .plus-btn`);
    var minusBtn = document.querySelector(`#counter-box-${counterId} .minus-btn`);
    if (plusBtn) plusBtn.disabled = false;
    if (minusBtn) minusBtn.disabled = false;
  });

  // Set hidden input value based on checkbox status
  document.getElementById('検査STATUS').value = isChecked ? "TRUE" : "false";
}

//LIVE STATUS function
// this function sends the post command to google sheet live status
function updateSheetStatus(selectedValue, machineName) {
  const selectedFactory = document.getElementById('hidden工場').value;
  fetch(googleSheetLiveStatusURL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'current': selectedValue,
        'machine': machineName,
        'factory': selectedFactory
      })
    })
    .then(response => response.text())
    .then(data => {
      console.log(data);
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

//this function sends request to nc cutter's pC (supports single or multiple machines)
async function sendtoNC(selectedValue) {

  //sendCommand("off"); // this is for arduino (emergency button)
  
  // Validate grouped shot inputs if present (REMOVED - validation happens in Step 3 modal workflow)
  // const groupedInputs = document.querySelectorAll('.grouped-shot-input');
  // if (groupedInputs.length > 0) {
  //   let hasEmptyInput = false;
  //   let emptyMachines = [];
  //   
  //   groupedInputs.forEach(input => {
  //     const value = parseInt(input.value, 10);
  //     if (!value || value <= 0) {
  //       hasEmptyInput = true;
  //       // Extract machine name from id (e.g., "shot-OZNC04" -> "OZNC04")
  //       const machineName = input.id.replace('shot-', '');
  //       emptyMachines.push(machineName);
  //     }
  //   });
  //   
  //   if (hasEmptyInput) {
  //     window.alert(`全ての機械のショット数を入力してください\nPlease enter shot count for all machines:\n${emptyMachines.join(', ')}`);
  //     return;
  //   }
  // }
  
  sendtoNCButtonisPressed = true;

  // Save to localStorage with a unique key format
  const key = `${uniquePrefix}sendtoNCButtonisPressed`;
  localStorage.setItem(key, 'true'); // Save the value with the unique key
  
  const ipAddress = document.getElementById('ipInfo').value;
  console.log(ipAddress);
  const currentSebanggo = document.getElementById('sub-dropdown').value;
  
  // Also store the current sebanggo as the "previous" sebanggo to track changes
  localStorage.setItem(`${uniquePrefix}previous-sebanggo`, currentSebanggo);
  console.log(`Send to Machine button pressed. Set state to true for ${currentSebanggo}`);
  //window.alert(machineName + currentSebanggo);
  if (!currentSebanggo) {
    window.alert("Please select product first / 背番号選んでください");
    return;
  }

  // Show progress bar at top of page
  const progressBar = document.getElementById('sendingProgressBar');
  if (progressBar) {
    progressBar.classList.remove('hide');
    progressBar.classList.add('show');
  }

  // Check if this is grouped machines (by page detection OR comma-separated IPs)
  const hasMultipleIPs = ipAddress && ipAddress.includes(',');
  const hasGroupedMachines = Object.keys(groupedMachineIPs).length > 1;
  
  if ((isGroupedMachinePage && hasGroupedMachines) || hasMultipleIPs) {
    // Ensure we have machine IPs populated
    let machineIPMap = {};
    
    if (hasGroupedMachines) {
      machineIPMap = groupedMachineIPs;
    } else if (hasMultipleIPs) {
      // Parse comma-separated IPs and machines
      const ips = ipAddress.split(',').map(ip => ip.trim());
      const machines = groupedMachines.length > 0 ? groupedMachines : 
                      document.getElementById('process').value.split(',').map(m => m.trim());
      
      // Create mapping
      machines.forEach((machine, index) => {
        if (ips[index]) {
          machineIPMap[machine] = ips[index];
        }
      });
    }
    
    console.log("🔵 Sending to multiple machines:", machineIPMap);
    
    // Store machine group globally for individual send modal
    window.currentMachineGroup = Object.entries(machineIPMap).map(([name, ip]) => ({ name, ip }));
    console.log("💾 Stored currentMachineGroup:", window.currentMachineGroup);
    
    // Update progress bar text for multiple machines
    const progressText = progressBar?.querySelector('span');
    if (progressText) {
      progressText.textContent = `Sending to ${Object.keys(machineIPMap).length} machines...`;
    }
    
    // Send command to each machine
    const sendPromises = Object.entries(machineIPMap).map(async ([machine, ip]) => {
      const url = `http://${ip}:5000/request?filename=${currentSebanggo}.pce`;
      
      try {
        console.log(`📤 Sending to ${machine} (${ip}): ${url}`);
        
        const response = await fetch(url, {
          method: 'GET',
          mode: 'no-cors'
        });
        
        console.log(`✅ Command sent successfully to ${machine}`);
        return { machine, success: true };
        
      } catch (error) {
        console.error(`❌ Failed to send command to ${machine}:`, error);
        
        // Fallback: Try opening in new tab if fetch fails
        console.log(`Trying fallback method for ${machine}...`);
        try {
          const newTab = window.open(url, '_blank');
          setTimeout(() => {
            if (newTab) newTab.close();
          }, 5000);
          return { machine, success: true, fallback: true };
        } catch (fallbackError) {
          console.error(`Fallback also failed for ${machine}:`, fallbackError);
          return { machine, success: false };
        }
      }
    });
    
    // Wait for all commands to complete
    try {
      const results = await Promise.all(sendPromises);
      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Sent to ${successCount}/${results.length} machines successfully`);
      
      // Check if any failed
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) {
        console.warn('⚠️ Failed machines:', failed.map(f => f.machine).join(', '));
      }
      
      // Always show manual send modal for grouped machines (for user verification)
      if (typeof showManualSendModal === 'function') {
        setTimeout(() => showManualSendModal(currentSebanggo), 1000);
      }
      
    } catch (error) {
      console.error('Error sending to multiple machines:', error);
    }
    
    // Hide progress bar after 7 seconds
    setTimeout(() => {
      if (progressBar) {
        progressBar.classList.remove('show');
        progressBar.classList.add('hide');
        setTimeout(() => {
          progressBar.classList.remove('hide');
          progressBar.style.display = 'none';
        }, 300);
      }
    }, 7000);
    
  } else {
    // Single machine - original logic
    const url = `http://${ipAddress}:5000/request?filename=${currentSebanggo}.pce`;
    
    try {
      console.log(`Sending command to mini PC: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        mode: 'no-cors'
      });
      
      console.log('Command sent successfully to mini PC');
      
      // Hide progress bar after 4 seconds
      setTimeout(() => {
        if (progressBar) {
          progressBar.classList.remove('show');
          progressBar.classList.add('hide');
          setTimeout(() => {
            progressBar.classList.remove('hide');
            progressBar.style.display = 'none';
          }, 300);
        }
      }, 4000);
      
    } catch (error) {
      console.error('Failed to send command to mini PC:', error);
      
      // Hide progress bar on error
      if (progressBar) {
        progressBar.classList.remove('show');
        progressBar.classList.add('hide');
        setTimeout(() => {
          progressBar.classList.remove('hide');
          progressBar.style.display = 'none';
        }, 300);
      }
      
      // Fallback: Try opening in new tab if fetch fails
      console.log('Fetch failed, trying fallback method...');
      const newTab = window.open(url, '_blank');
      setTimeout(() => {
        newTab.close();
      }, 5000);
    }
  }
}

// Send to NC button - triggers 3-step modal workflow OR individual send modal
document.getElementById('sendtoNC').addEventListener('click', async function() {
  // Check if this is a single machine (DCP iReporter) or grouped machines (DCP Grouping)
  const machineName = document.getElementById('process').value;
  const isSingleMachine = !isGroupedMachinePage && !machineName.includes(',');
  
  if (isSingleMachine) {
    // Single machine (DCP iReporter) - send directly
    const currentSebanggo = document.getElementById('sub-dropdown').value;
    
    if (!currentSebanggo) {
      showAlert('背番号を選んでください / Please select sebanggo first');
      return;
    }
    
    // Log send to machine action (main button)
    await logTabletAction('Send to machine pressed (Main button)', 'in-progress', {
      sebanggo: currentSebanggo,
      source: 'Main Send to Machine button'
    });
    
    // Send directly to machine
    await sendtoNC(currentSebanggo);
  } else {
    // Grouped machines (DCP Grouping) - use 3-step modal workflow
    // Check if 3-step workflow was completed (sendtoNCButtonisPressed === true)
    if (sendtoNCButtonisPressed) {
      // 3-step workflow was completed, show individual send modal
      showIndividualSendModal();
    } else {
      // 3-step workflow not completed, show Step 1 modal
      showStep1Modal();
    }
  }
});

// Function to handle printing
function runPrintFunction() {
  const ipAddress = document.getElementById('ipInfo').value;
  const printerHostname = document.getElementById('printerHostname').value;

  // Get the value of the hidden input field
  const printerCode = document.getElementById('printerCode').value;
  console.log("printerhostname: " + printerHostname);
  const url = `http://${ipAddress}:5001/print?text=${printerCode}&hostname=${printerHostname}`; //no need for raspberry pi anymore

  // Open a new tab with the desired URL
  const newWindow = window.open(url, '_blank', 'width=100,height=100,left=-1000,top=-1000');

  // Close the window after 5 seconds
  setTimeout(() => {
    if (newWindow) {
      newWindow.close();
    }
  }, 5000);
}

// this updates the total quantity
function updateTotal() {
  // Get the value of Process Quantity
  const processQuantity = parseInt(document.getElementById('ProcessQuantity').value, 10) || 0;

  // Initialize Total_NG
  let totalNG = 0;

  // Sum values from counter-1 to counter-12
  for (let i = 1; i <= 12; i++) {
    const counterValue = parseInt(document.getElementById(`counter-${i}`).value, 10) || 0;
    totalNG += counterValue;
  }

  // Add values from counter-18 to counter-20
  for (let i = 18; i <= 20; i++) {
    const counterValue = parseInt(document.getElementById(`counter-${i}`).value, 10) || 0;
    totalNG += counterValue;
  }

  // Update the Total_NG field
  const totalNGElement = document.getElementById('Total_NG');
  if (totalNGElement) {
    totalNGElement.value = totalNG;
  }

  // Calculate Total
  const total = processQuantity - totalNG;

  // Update the Total field
  const totalElement = document.getElementById('total');
  if (totalElement) {
    totalElement.value = total;
  }
}

// Attach updateTotal to relevant events
document.getElementById('ProcessQuantity').addEventListener('input', updateTotal);

// Attach the event listener to all relevant counter fields
for (let i = 1; i <= 12; i++) {
  document.getElementById(`counter-${i}`).addEventListener('input', updateTotal);
}
for (let i = 18; i <= 20; i++) {
  document.getElementById(`counter-${i}`).addEventListener('input', updateTotal);
}

// Function to fetch ip address (supports single or multiple machines)
function getIP() {
  const ipInput = document.getElementById('ipInfo');
  const machineName = document.getElementById('process').value;
  
  // Check if this is grouped machines (either by page detection or comma in machine name)
  const hasMultipleMachines = (isGroupedMachinePage && groupedMachines.length > 1) || 
                              (machineName && machineName.includes(','));
  
  if (hasMultipleMachines) {
    // Ensure groupedMachines array is populated
    const machines = groupedMachines.length > 0 ? groupedMachines : machineName.split(',').map(m => m.trim());
    console.log("🔵 Fetching IPs for grouped machines:", machines);
    
    // Fetch IP for each machine individually
    const ipPromises = machines.map(machine => 
      fetch(`${ipURL}?filter=${machine}`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Network response was not ok for ${machine}: ${response.statusText}`);
          }
          return response.text();
        })
        .then(data => {
          const cleanedData = data.replace(/"/g, '');
          groupedMachineIPs[machine] = cleanedData;
          console.log(`📍 IP for ${machine}: ${cleanedData}`);
          return { machine, ip: cleanedData };
        })
        .catch(error => {
          console.error(`Error fetching IP for ${machine}:`, error);
          return { machine, ip: null };
        })
    );
    
    // Wait for all IPs to be fetched
    Promise.all(ipPromises).then(results => {
      console.log("✅ All IPs fetched:", groupedMachineIPs);
      // Store comma-separated IPs in the hidden input for reference
      const ips = results.map(r => r.ip).filter(ip => ip).join(',');
      ipInput.value = ips;
      
      // Store machine group globally for individual send modal
      window.currentMachineGroup = results
        .filter(r => r.ip) // Only include machines with valid IPs
        .map(r => ({ name: r.machine, ip: r.ip }));
      console.log("💾 Stored currentMachineGroup on page load:", window.currentMachineGroup);
    });
    
  } else {
    // Single machine - original logic
    fetch(`${ipURL}?filter=${machineName}`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok ' + response.statusText);
        }
        return response.text();
      })
      .then(data => {
        const cleanedData = data.replace(/"/g, '');
        ipInput.value = cleanedData;
        console.log(`📍 IP for ${machineName}: ${cleanedData}`);
      })
      .catch(error => {
        console.error('Error:', error);
      });
  }
}

// Add logging for Comments textarea inputs (on blur - when user finishes typing)
document.addEventListener('DOMContentLoaded', () => {
  // Log Comments1 (main comments) - only when focus leaves the textarea
  const comments1 = document.querySelector('textarea[name="Comments1"]');
  if (comments1) {
    comments1.addEventListener('blur', function() {
      // Only log if there's actual content
      if (this.value.trim().length > 0) {
        logTabletAction('Comments entered', 'in-progress', {
          commentLength: this.value.length,
          hasContent: true,
          comment: this.value
        });
      }
    });
  }
  
  // Log Comments2 (kensa section comments) - only when focus leaves the textarea
  const comments2 = document.querySelector('textarea[name="Comments2"]');
  if (comments2) {
    comments2.addEventListener('blur', function() {
      // Only log if there's actual content
      if (this.value.trim().length > 0) {
        logTabletAction('Kensa comments entered', 'in-progress', {
          commentLength: this.value.length,
          hasContent: true,
          comment: this.value
        });
      }
    });
  }
});

// Add logging for regular shot input (single machine mode)
document.addEventListener('DOMContentLoaded', () => {
  const regularShotInput = document.getElementById('shot');
  if (regularShotInput && !regularShotInput.readOnly) {
    // Only add listener if it's not in grouped mode (readOnly is set in grouped mode)
    regularShotInput.addEventListener('input', function() {
      logTabletAction('Shot count set', 'in-progress', {
        shotCount: this.value
      });
    });
  }
});

// Function to create dynamic shot count inputs for grouped machines
function createGroupedShotInputs() {
  console.log("🔵 ========== createGroupedShotInputs called ==========");
  console.log("🔵 Current URL:", window.location.href);
  console.log("🔵 Pathname:", window.location.pathname);
  
  const shotSection = document.getElementById('shotCountSection');
  
  if (!shotSection) {
    console.log("❌ shotCountSection not found!");
    return;
  }
  
  console.log("✅ shotCountSection found");
  console.log("🔵 isGroupedMachinePage:", isGroupedMachinePage);
  console.log("🔵 groupedMachines:", groupedMachines);
  console.log("🔵 groupedMachines.length:", groupedMachines.length);
  console.log("🔵 groupedMachines type:", typeof groupedMachines);
  console.log("🔵 Is Array?", Array.isArray(groupedMachines));

  // Check if this is a grouped machine page with multiple machines
  if (isGroupedMachinePage && groupedMachines.length > 1) {
    console.log("✅✅✅ Condition met! Creating shot count inputs for grouped machines:", groupedMachines);
    
    // Clear existing content
    shotSection.innerHTML = '';
    
    // Add title
    const title = document.createElement('label');
    title.style.cssText = 'display: block; font-weight: bold; margin-bottom: 15px; color: white;';
    title.innerHTML = 'ショット数 (Shot Count) <span style="color: #ffeb3b;">- Per Machine</span>';
    shotSection.appendChild(title);
    
    // Create container for machine inputs
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px;';
    
    // Create input for each machine
    groupedMachines.forEach((machine, index) => {
      const machineDiv = document.createElement('div');
      machineDiv.style.cssText = 'display: flex; align-items: center; gap: 10px; background: rgba(255, 255, 255, 0.1); padding: 10px; border-radius: 5px;';
      
      const label = document.createElement('label');
      label.style.cssText = 'min-width: 120px; color: white; font-weight: 600;';
      label.textContent = `${machine}:`;
      
      const input = document.createElement('input');
      input.type = 'number';
      input.id = `shot-${machine}`;
      input.className = 'grouped-shot-input';
      input.placeholder = '0';
      input.min = '0';
      input.value = ''; // Start with blank value
      input.readOnly = true; // Make readonly so keypad is used
      input.style.cssText = 'flex: 1; padding: 8px; border: 2px solid #007bff; border-radius: 3px; cursor: pointer; background-color: #f0f8ff;';
      
      // Restore value from localStorage
      const savedValue = localStorage.getItem(`${uniquePrefix}shot-${machine}`);
      if (savedValue) {
        input.value = savedValue;
      }
      
      // Add click event to open keypad
      input.addEventListener('click', function() {
        window.openDirectNumericKeypad(`shot-${machine}`);
      });
      
      // Add input event listener for when keypad updates the value
      input.addEventListener('input', function() {
        // Save to localStorage
        localStorage.setItem(`${uniquePrefix}shot-${machine}`, this.value);
        
        // Log shot count change for this machine
        logTabletAction(`Shot count set for ${machine}`, 'in-progress', {
          machine: machine,
          shotCount: this.value
        });
        
        // Update total
        updateTotalShot();
      });
      
      machineDiv.appendChild(label);
      machineDiv.appendChild(input);
      container.appendChild(machineDiv);
    });
    
    shotSection.appendChild(container);
    
    // Add total display
    const totalDiv = document.createElement('div');
    totalDiv.style.cssText = 'display: flex; align-items: center; gap: 10px; background: rgba(76, 175, 80, 0.2); padding: 12px; border-radius: 5px; border: 2px solid #4CAF50; margin-top: 10px;';
    
    const totalLabel = document.createElement('label');
    totalLabel.style.cssText = 'min-width: 120px; color: #4CAF50; font-weight: bold; font-size: 16px;';
    totalLabel.textContent = '合計 (Total):';
    
    const totalInput = document.createElement('input');
    totalInput.type = 'number';
    totalInput.id = 'shot';
    totalInput.name = 'shot';
    totalInput.readOnly = true;
    totalInput.value = '0';
    totalInput.style.cssText = 'flex: 1; padding: 10px; border: 2px solid #4CAF50; border-radius: 3px; background: white; font-weight: bold; font-size: 16px;';
    
    totalDiv.appendChild(totalLabel);
    totalDiv.appendChild(totalInput);
    shotSection.appendChild(totalDiv);
    
    // Initial calculation to set total from restored values
    updateTotalShot();
    
  } else {
    // Single machine - keep original input
    console.log("❌ Condition NOT met - using standard shot input");
    console.log("   Reason: isGroupedMachinePage =", isGroupedMachinePage, "AND groupedMachines.length =", groupedMachines.length);
  }
  console.log("🔵 ========== createGroupedShotInputs finished ==========");
}

// Function to update total shot count
function updateTotalShot() {
  const groupedInputs = document.querySelectorAll('.grouped-shot-input');
  let total = 0;
  
  groupedInputs.forEach(input => {
    const value = parseInt(input.value, 10) || 0;
    total += value;
  });
  
  const totalInput = document.getElementById('shot');
  if (totalInput) {
    totalInput.value = total;
    // Save total to localStorage
    localStorage.setItem(`${uniquePrefix}shot`, total);
    
    // Log total shot count update
    logTabletAction('Total shot count calculated', 'in-progress', {
      totalShot: total,
      individualMachines: Array.from(groupedInputs).map(input => ({
        machine: input.id.replace('shot-', ''),
        count: parseInt(input.value, 10) || 0
      }))
    });
  }
  
  console.log(`📊 Shot count updated - Total: ${total}`);
}

// Function to fetch rikeshi up or down color info
function getRikeshi(headerValue) {
  const factoryValue = document.getElementById('selected工場').value; // Get the factory value, corrected to selected工場
  const rikeshiInfo = document.getElementById("rikeshitext");
  // Assuming rikeshiInput is defined somewhere or passed as an argument. If not, it's a global variable or part of this scope.
  // For now, let's assume it's like ipInput, directly referencing an element.
  const rikeshiInput = document.getElementById("rikeshi"); // Assuming 'rikeshi' is the ID of a hidden input for the value itself.

  fetch(`${dbURL}?rikeshi=${headerValue}&factory=${factoryValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, '');
      rikeshiInput.value = cleanedData;
      if (cleanedData == "上") {
        rikeshiInfo.textContent = cleanedData + " - Release paper UP";
      } else if (cleanedData == "下") {
        rikeshiInfo.textContent = cleanedData + " - Release paper DOWN";
      } else {
        rikeshiInfo.textContent = cleanedData; // For other cases or empty
      }

      sendtoShowVideo(cleanedData);
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

//this function is just to send value of showVideo which is either rikeshidown or up
function sendtoShowVideo(rikeshivalue) {

  if (rikeshivalue == "下") {
    showVideo('rikeshidown');
  } else if (rikeshivalue == "上") {
    showVideo('rikeshiup');
  }
}

// this code is to show video either up or down rikeshi
let videoTimeout;
let isRikeshiPlaying = false; // Flag to check if rikeshi.mp4 is already playing

function showVideo(videoToShowId) {
  const videoContainer = document.getElementById('videoContainer');
  const videoToShow = document.getElementById(videoToShowId);
  const allVideos = document.querySelectorAll('.video-element');

  // Hide all video elements and pause them
  allVideos.forEach(video => {
    video.classList.add('hidden');
    video.classList.remove('active-video');
    video.pause();
    video.currentTime = 0;
  });

  // Show the video container and the specific video
  videoContainer.classList.remove('hidden');
  videoToShow.classList.remove('hidden');
  videoToShow.classList.add('active-video');

  // Set playback speed to 1.8x
  videoToShow.playbackRate = 1.8;

  // Autoplay the video
  videoToShow.play();

  // Clear any existing timeout and set a new one
  clearTimeout(videoTimeout);
  videoTimeout = setTimeout(closeVideoPopup, 4000);
}

function closeVideoPopup() {
  window.alert("CONFIRM RELEASE PAPER DIRECTION");
  window.alert("離型紙セット確認する事");
  const videoContainer = document.getElementById('videoContainer');
  const allVideos = document.querySelectorAll('.video-element');

  // Hide the video container and all videos
  videoContainer.classList.add('hidden');
  allVideos.forEach(video => {
    video.classList.add('hidden');
    video.pause();
    video.currentTime = 0;
  });

  // Reset the flag
  isRikeshiPlaying = false;
}

//this function is for ARDUINO command (command value should be "on" or "off")
async function sendCommand(command) {
  const ipAddress = document.getElementById('ipInfo').value;
  const url = `http://${ipAddress}:5000/control?command=${encodeURIComponent(command)}`;

  // Get the existing hidden iframe or create one if it doesn't exist
  let iframe = document.getElementById('hiddenIframe');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'hiddenIframe';
    iframe.style.display = 'none'; // Make the iframe invisible
    document.body.appendChild(iframe);
  }

  // Set the iframe source to the URL
  iframe.src = url;

  // Remove the iframe after 2 seconds
  setTimeout(() => {
    iframe.src = ''; // Clear the iframe source
  }, 1000);
}

// this function waits for 1 mins to see if send to NC button is pressed, if not it will pop up and force the user to send to machine
var popupShown = false;
var audio = new Audio('src/alert.mp3');
audio.loop = true; // Set the audio to loop

// Function to show the popup
function showPopup() {
  //sendCommand('on');
  console.log("LED on");

  if (!popupShown) {
    // Create the popup elements
    var popup = document.createElement('div');
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.padding = '20px';
    popup.style.backgroundColor = 'white';
    popup.style.border = '1px solid black';
    popup.style.zIndex = '1000';

    var message = document.createElement('p');
    message.textContent = 'Please press "send to machine" button! GAGO! / "send to machine" ボタンを押してください';
    popup.appendChild(message);

    var button = document.createElement('button');
    button.textContent = 'Send to Machine';
    button.onclick = function() {
      sendtoNCButtonisPressed = true;

      // Save to localStorage with a unique key format
      const selected工場 = document.getElementById('selected工場').value; // Get the current factory value
      const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
      const key = `${uniquePrefix}sendtoNCButtonisPressed`;
      localStorage.setItem(key, 'true'); // Save the value with the unique key

      sendtoNC(); // Call the sendtoNC function
      console.log("sendtoNC function called");
      document.body.removeChild(popup);
      audio.pause(); // Stop the audio
      audio.currentTime = 0; // Reset the audio to the beginning
    };
    popup.appendChild(button);

    document.body.appendChild(popup);
    popupShown = true; // Set the flag to true after showing the popup
    audio.play(); // Play the audio
  }
}

// Function to check the value every 1 minute
// TEMPORARILY DISABLED - Timer that shows popup if "Send to Machine" not pressed
function checkValue() {
  console.log("checkValue() called - Timer temporarily disabled");
  // var interval = setInterval(function() {
  //   console.log("selectedFactory: " + selectedFactory);
  //   if (selectedFactory !== "小瀬") {
  //     return; // Skip the check if selectedFactory is not "小瀬"
  //   }

  //   const selected工場 = document.getElementById('selected工場').value; // Get the current factory value
  //   const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
  //   const key = `${uniquePrefix}sendtoNCButtonisPressed`;

  //   if (localStorage.getItem(key) === null) {
  //     return; // Skip the check if the key is not present in local storage
  //   }
  //   var sendtoNCButtonisPressed = localStorage.getItem(key) === 'true'; // Retrieve the value from local storage
  //   console.log("sendtoNCButtonisPressed: " + sendtoNCButtonisPressed);

  //   if (sendtoNCButtonisPressed) {
  //     clearInterval(interval); // Stop checking if the value is true
  //   } else {
  //     // Get the sub-dropdown value
  //     const subDropdownValue = document.getElementById('sub-dropdown').value;

  //     // Check if sub-dropdown value is in its default state
  //     if (!subDropdownValue || subDropdownValue === "Select 背番号") {
  //       console.log("Sub-dropdown is in its default state. Skipping showPopup.");
  //       return; // Do not call showPopup if the value is default
  //     }
  //     console.log("Sub-dropdown value is not default. Showing popup.");

  //     showPopup();
  //   }
  // }, 30000); // 30000 milliseconds = 30 seconds
}

// Run the checkValue function when the page loads
// TEMPORARILY DISABLED - Timer functionality
window.onload = checkValue;

// Maintenance Camera Functionality
let maintenanceCameraStream = null;

// Open camera in modal for maintenance photos
async function openMaintenanceCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showAlert("カメラ機能はこのブラウザではサポートされていません。(Camera features are not supported in this browser.)", true);
    return;
  }

  // Create camera modal
  const cameraModal = document.createElement('div');
  cameraModal.id = 'maintenanceCameraModal';
  cameraModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10002;
  `;

  const cameraContent = document.createElement('div');
  cameraContent.style.cssText = `
    background: white;
    padding: 20px;
    border-radius: 10px;
    text-align: center;
    max-width: 90%;
    max-height: 90%;
  `;

  cameraContent.innerHTML = `
    <h3 style="margin-top: 0;">機械故障写真撮影 / Maintenance Photo Capture</h3>
    <video id="maintenanceVideoFeed" autoplay playsinline style="max-width: 100%; max-height: 400px; border: 2px solid #ddd; border-radius: 5px;"></video>
    <br><br>
    <button id="maintenanceCaptureBtn" style="padding: 15px 30px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px; font-size: 16px;">📷 撮影 / Capture</button>
    <button id="maintenanceCloseCameraBtn" style="padding: 15px 30px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">閉じる / Close</button>
    <canvas id="maintenanceCaptureCanvas" style="display: none;"></canvas>
  `;

  cameraModal.appendChild(cameraContent);
  document.body.appendChild(cameraModal);

  const videoFeed = document.getElementById('maintenanceVideoFeed');
  const captureBtn = document.getElementById('maintenanceCaptureBtn');
  const closeCameraBtn = document.getElementById('maintenanceCloseCameraBtn');
  const captureCanvas = document.getElementById('maintenanceCaptureCanvas');

  // Camera constraints
  const constraints = {
    video: { 
      facingMode: { ideal: "environment" }, 
      width: { ideal: 1280 }, 
      height: { ideal: 720 } 
    },
    audio: false
  };

  try {
    maintenanceCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    console.warn("Environment camera failed, trying user camera:", e);
    constraints.video.facingMode = { ideal: "user" };
    try {
      maintenanceCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.error("Error accessing camera: ", err);
      showAlert("カメラにアクセスできませんでした。設定を確認してください。", true);
      document.body.removeChild(cameraModal);
      return;
    }
  }

  if (maintenanceCameraStream && videoFeed) {
    videoFeed.srcObject = maintenanceCameraStream;
    videoFeed.onloadedmetadata = () => {
      // TEMPORARY: Force exact same approach as working test HTML
      captureCanvas.width = videoFeed.videoWidth;
      captureCanvas.height = videoFeed.videoHeight;
      console.log(`🔍 Canvas initialized: ${captureCanvas.width}x${captureCanvas.height} (exact same as test HTML)`);
    };
  }

  // Capture button functionality
  captureBtn.addEventListener('click', () => {
    if (!maintenanceCameraStream || !videoFeed) {
      console.error("Stream or video not ready for snapshot");
      closeMaintenanceCamera(cameraModal);
      return;
    }

    if (maintenancePhotos.length >= MAX_MAINTENANCE_PHOTOS) {
      showAlert(`最大${MAX_MAINTENANCE_PHOTOS}枚までです。(Max ${MAX_MAINTENANCE_PHOTOS} photos allowed.)`, false);
      closeMaintenanceCamera(cameraModal);
      return;
    }

    // Validate video before capture
    if (videoFeed.readyState !== videoFeed.HAVE_ENOUGH_DATA) {
      console.warn("⚠️ Video feed not ready for capture");
      showAlert("カメラの準備ができていません。しばらく待ってから再試行してください。", false);
      return;
    }

    // Create a NEW canvas for each capture (exactly like test HTML)
    const freshCanvas = document.createElement('canvas');
    freshCanvas.width = videoFeed.videoWidth;
    freshCanvas.height = videoFeed.videoHeight;
    
    console.log(`🔍 DCP Fresh canvas created: ${freshCanvas.width}x${freshCanvas.height} (video: ${videoFeed.videoWidth}x${videoFeed.videoHeight})`);

    const context = freshCanvas.getContext('2d');
    if (!context) {
      console.error("Failed to get 2D context from fresh canvas.");
      closeMaintenanceCamera(cameraModal);
      return;
    }

    context.drawImage(videoFeed, 0, 0, freshCanvas.width, freshCanvas.height);
    
    // Use the EXACT same approach as the working test
    const imageDataURL = freshCanvas.toDataURL('image/jpeg', 0.8);
    console.log(`🔍 DCP Canvas capture:`, {
      canvasSize: `${freshCanvas.width}x${freshCanvas.height}`,
      videoSize: `${videoFeed.videoWidth}x${videoFeed.videoHeight}`,
      dataURLLength: imageDataURL.length,
      startsWithDataURL: imageDataURL.startsWith('data:image/jpeg;base64,')
    });
    
    // Validate data URL format
    if (!imageDataURL.startsWith('data:image/jpeg;base64,')) {
      console.error('❌ Invalid data URL format:', imageDataURL.substring(0, 100));
      showAlert('画像キャプチャに失敗しました。再試行してください。', false);
      closeMaintenanceCamera(cameraModal);
      return;
    }
    
    // Extract clean base64 data WITHOUT the data URL prefix (same as test)
    const base64Data = imageDataURL.split(',')[1];
    console.log(`🔍 DCP Extracted clean base64 length: ${base64Data.length}`);
    console.log(`🔍 DCP Base64 first 50 chars: ${base64Data.substring(0, 50)}`);
    console.log(`🔍 DCP Using video dimensions: ${videoFeed.videoWidth}x${videoFeed.videoHeight}`);
    console.log(`🔍 DCP Canvas dimensions: ${captureCanvas.width}x${captureCanvas.height}`);
    
    // Validate base64 data
    if (!base64Data || base64Data.length === 0) {
      console.error('❌ Empty base64 data');
      showAlert('画像データが無効です。再試行してください。', false);
      closeMaintenanceCamera(cameraModal);
      return;
    }

    // Client-side validation like the test
    try {
      const buffer = atob(base64Data);
      console.log(`🔍 DCP Client validation: Successfully decoded ${buffer.length} bytes`);
      console.log(`🔍 DCP Buffer first 10 bytes: [${Array.from(buffer.slice(0, 10)).map(b => b.charCodeAt(0)).join(', ')}]`);
      
      // Check JPEG headers
      const firstByte = buffer.charCodeAt(0);
      const secondByte = buffer.charCodeAt(1);
      console.log(`🔍 DCP JPEG header check: [${firstByte}, ${secondByte}] (should be [255, 216])`);
      
      if (firstByte !== 255 || secondByte !== 216) {
        console.warn('⚠️ DCP WARNING: Invalid JPEG header detected!');
      } else {
        console.log('✅ DCP Valid JPEG header confirmed');
      }
    } catch (error) {
      console.error('❌ DCP ERROR: Invalid base64 data - ' + error.message);
      showAlert('画像データが無効です。再試行してください。', false);
      closeMaintenanceCamera(cameraModal);
      return;
    }

    // Add photo with clean base64 data (same as test)
    const success = addMaintenancePhoto(base64Data);
    
    if (success) {
      console.log('✅ Photo successfully added to maintenance photos');
      // Close camera after successful capture
      closeMaintenanceCamera(cameraModal);
    } else {
      showAlert('写真の追加に失敗しました。', false);
    }
  });

  // Close camera button functionality
  closeCameraBtn.addEventListener('click', () => {
    closeMaintenanceCamera(cameraModal);
  });

  // Close on background click
  cameraModal.addEventListener('click', (e) => {
    if (e.target === cameraModal) {
      closeMaintenanceCamera(cameraModal);
    }
  });
}

// Close maintenance camera and cleanup
function closeMaintenanceCamera(cameraModal) {
  if (maintenanceCameraStream) {
    maintenanceCameraStream.getTracks().forEach(track => track.stop());
    maintenanceCameraStream = null;
  }
  
  const videoFeed = document.getElementById('maintenanceVideoFeed');
  if (videoFeed) {
    videoFeed.srcObject = null;
  }
  
  if (cameraModal && cameraModal.parentNode) {
    document.body.removeChild(cameraModal);
  }
}
// === Numeric Keypad Functions for ショット数 ===
let currentNumericInputId = null;

// This function is no longer used - using direct HTML implementation instead
function createNumericKeypadModal() {
  // This function is intentionally left empty to avoid creating duplicate keypads
  console.log("Using direct HTML implementation instead of createNumericKeypadModal");
  return;
  
  // Create header
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
  `;
  
  // Original implementation removed to avoid creating duplicate keypads
  
  // Original implementation removed to avoid creating duplicate keypads
  
  // Original implementation removed to avoid creating duplicate keypads
}

function openNumericKeypad(inputId) {
  // Redirect to the direct implementation
  window.openDirectNumericKeypad(inputId);
}

function closeNumericKeypad() {
  // Redirect to the direct implementation
  window.closeDirectNumericKeypad();
}

function addToNumericDisplay(digit) {
  // Redirect to the direct implementation
  window.addToDirectNumericDisplay(digit);
}

function clearNumericDisplay() {
  // Redirect to the direct implementation
  window.clearDirectNumericDisplay();
}

function backspaceNumericDisplay() {
  // Redirect to the direct implementation
  window.backspaceDirectNumericDisplay();
}

function confirmNumericInput() {
  // Redirect to the direct implementation
  window.confirmDirectNumericInput();
}

// The original keydown handler is no longer needed as we're using the direct implementation

// Initialize numeric keypad and set up shot input field - simplified to avoid duplicate modals
function initNumericKeypad() {
  // We're now only using the direct implementation
  console.log("Numeric keypad initialization using direct implementation only");
  
  // No need to do anything here as the shot input is already configured in the load event handler
}

// Define direct keypad functions in the global scope first
window.openDirectNumericKeypad = function(inputId, isNewEntryMode = false) {
  window.currentDirectInputId = inputId;
  window.isNewEntryMode = isNewEntryMode; // Store the mode
  const modal = document.getElementById('numericKeypadModalDirect');
  const display = document.getElementById('numericDisplayDirect');
  const currentInput = document.getElementById(inputId);
  
  if (modal && display && currentInput) {
    // If new entry mode, start with empty display, otherwise show current value
    display.value = isNewEntryMode ? '' : (currentInput.value || '');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    // Update keypad title based on which input field was clicked
    const keypadTitle = modal.querySelector('h2');
    if (keypadTitle) {
      if (inputId === 'shot') {
        keypadTitle.textContent = 'ショット数を入力';
      } else if (inputId === '材料ロット') {
        keypadTitle.textContent = '材料ロットを入力';
      } else if (inputId === 'ProcessQuantity') {
        keypadTitle.textContent = '加工数 (良品) + NG:を入力';
      }
    }
    
    // Show/hide the hyphen button based on input field
    const hyphenButton = document.getElementById('hyphenButton');
    if (hyphenButton) {
      if (inputId === '材料ロット') {
        hyphenButton.style.display = 'block';
      } else {
        hyphenButton.style.display = 'none';
      }
    }
    
    // Setup keyboard event handling for the keypad
    window.directKeypadKeydownHandler = function(event) {
      if (modal.style.display === 'block') {
        event.preventDefault(); // Prevent default keyboard behavior
        
        if (event.key >= '0' && event.key <= '9') {
          window.addToDirectNumericDisplay(event.key);
        } else if (event.key === 'Backspace') {
          window.backspaceDirectNumericDisplay();
        } else if (event.key === 'Enter') {
          window.confirmDirectNumericInput();
        } else if (event.key === 'Escape') {
          window.closeDirectNumericKeypad();
        } else if (event.key === 'Delete' || event.key.toLowerCase() === 'c') {
          window.clearDirectNumericDisplay();
        } else if (event.key === '-' && inputId === '材料ロット') {
          window.addToDirectNumericDisplay('-');
        } else if (event.key === ' ') {
          window.addToDirectNumericDisplay(' ');
        }
      }
    };
    
    // Add the keyboard event listener
    document.addEventListener('keydown', window.directKeypadKeydownHandler);
  }
};

window.closeDirectNumericKeypad = function() {
  const modal = document.getElementById('numericKeypadModalDirect');
  if (modal) {
    modal.style.display = 'none';
    window.currentDirectInputId = null;
    document.body.style.overflow = 'auto';
    
    // Remove the keyboard event handler
    if (window.directKeypadKeydownHandler) {
      document.removeEventListener('keydown', window.directKeypadKeydownHandler);
      window.directKeypadKeydownHandler = null;
    }
  }
};

window.addToDirectNumericDisplay = function(digit) {
  const display = document.getElementById('numericDisplayDirect');
  if (display) {
    display.value += digit;
  }
};

window.clearDirectNumericDisplay = function() {
  const display = document.getElementById('numericDisplayDirect');
  if (display) {
    display.value = '';
  }
};

window.backspaceDirectNumericDisplay = function() {
  const display = document.getElementById('numericDisplayDirect');
  if (display) {
    display.value = display.value.slice(0, -1);
  }
};

window.confirmDirectNumericInput = function() {
  if (!window.currentDirectInputId) return;
  
  const display = document.getElementById('numericDisplayDirect');
  const targetInput = document.getElementById(window.currentDirectInputId);
  
  if (display && targetInput) {
    const value = display.value;
    
    // Different validation based on input type
    if (window.currentDirectInputId === '材料ロット') {
      // For material lot, allow numbers, hyphens, spaces, and blank values
      if (value !== '' && !/^[0-9\-\s]*$/.test(value)) {
        if (typeof showAlert === 'function') {
          showAlert('数字、ハイフン、スペースのみを入力してください');
        } else {
          window.alert('数字、ハイフン、スペースのみを入力してください');
        }
        return;
      }
      // Allow blank value - no validation needed
    } else if (window.currentDirectInputId === 'shot') {
      // For shot count, allow numbers, spaces, and blank values
      // If not blank, validate as a number (after removing spaces)
      if (value !== '') {
        const numericValue = value.replace(/\s/g, '');
        if (numericValue !== '' && (isNaN(numericValue) || parseInt(numericValue) < 0)) {
          if (typeof showAlert === 'function') {
            showAlert('有効な数字を入力してください');
          } else {
            window.alert('有効な数字を入力してください');
          }
          return;
        }
      }
      // Allow blank value - no validation needed
    } else {
      // For other inputs, allow blank values and positive numbers
      if (value !== '' && (isNaN(value) || parseInt(value) < 0)) {
        if (typeof showAlert === 'function') {
          showAlert('有効な数字を入力してください');
        } else {
          window.alert('有効な数字を入力してください');
        }
        return;
      }
    }
    
    // Handle new entry mode for 材料ロット
    if (window.isNewEntryMode && window.currentDirectInputId === '材料ロット') {
      // In new entry mode, append the new lot to existing lots with comma
      const existingValue = targetInput.value;
      if (existingValue && value) {
        // Append with comma
        targetInput.value = existingValue + ',' + value;
      } else if (value) {
        // No existing value, just set the new value
        targetInput.value = value;
      }
      // If value is empty, don't change anything
    } else {
      // Normal mode - replace the value
      targetInput.value = value;
    }
    
    // Get the current uniquePrefix for localStorage
    const pageName = location.pathname.split('/').pop();
    const currentSelectedFactory = document.getElementById('selected工場')?.value;
    const selectedMachine = document.getElementById('process')?.value;
    const uniquePrefix = `${pageName}_${currentSelectedFactory}_${selectedMachine}_`;
    
    // Save to localStorage with the unique key format
    const key = `${uniquePrefix}${targetInput.id}`;
    localStorage.setItem(key, targetInput.value);
    
    // Log the input action for shot count
    if (window.currentDirectInputId === 'shot') {
      logTabletAction('ショット数 input', 'Completed', { shotCount: targetInput.value });
    }
    
    // Trigger the input event to handle any event listeners
    const event = new Event('input', { bubbles: true });
    targetInput.dispatchEvent(event);
    
    window.closeDirectNumericKeypad();
  }
};

// Run initialization after page is fully loaded to ensure it runs after other DOM events
window.addEventListener('load', function() {
  // Update processing time lock statuses
  updateAllProcessingTimeLockStatus();
  
  // Create a completely different implementation of the modal as direct HTML
  const modalHTML = `
    <div id="numericKeypadModalDirect" style="
      display: none;
      position: fixed;
      z-index: 10000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.7);
    ">
      <div style="
        background-color: #fefefe;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 20px;
        border: 1px solid #888;
        width: 320px;
        max-width: 90%;
        border-radius: 10px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: bold; color: #333;">ショット数を入力</h2>
          <span onclick="window.closeDirectNumericKeypad()" style="color: #aaa; float: right; font-size: 28px; font-weight: bold; cursor: pointer;">&times;</span>
        </div>
        
        <div style="margin-bottom: 15px;">
          <input type="text" id="numericDisplayDirect" readonly style="
            width: 100%;
            padding: 12px;
            font-size: 28px;
            text-align: right;
            border: 2px solid #007bff;
            border-radius: 5px;
            margin-bottom: 15px;
            background-color: #f8f9fa;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
          ">
        </div>
        
        <div id="keypadContainerDirect" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
          <!-- Number buttons will be added via JavaScript -->
        </div>
        
        <button onclick="window.confirmDirectNumericInput()" style="
          width: 100%;
          padding: 15px;
          margin-top: 15px;
          font-size: 20px;
          font-weight: bold;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          transition: background-color 0.2s;
        ">確認</button>
      </div>
    </div>
  `;
  
  // Inject the HTML directly into the body
  const modalContainer = document.createElement('div');
  modalContainer.innerHTML = modalHTML;
  document.body.appendChild(modalContainer.firstElementChild);
  
  // Add number buttons dynamically
  const keypadContainer = document.getElementById('keypadContainerDirect');
  if (keypadContainer) {
    // Add number buttons 1-9
    for (let i = 1; i <= 9; i++) {
      const btn = document.createElement('button');
      btn.textContent = i.toString();
      const digit = i.toString(); // Capture the current value in a closure
      btn.onclick = function() { window.addToDirectNumericDisplay(digit); };
      btn.style.cssText = `
        padding: 15px;
        font-size: 24px;
        background-color: #f1f1f1;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        transition: background-color 0.2s;
      `;
      // Add touch feedback
      btn.addEventListener('touchstart', function() {
        this.style.backgroundColor = '#d0d0d0';
      });
      btn.addEventListener('touchend', function() {
        this.style.backgroundColor = '#f1f1f1';
      });
      keypadContainer.appendChild(btn);
    }
    
    // Add C, 0, and backspace buttons
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'C';
    clearBtn.onclick = function() { window.clearDirectNumericDisplay(); };
    clearBtn.style.cssText = `
      padding: 15px;
      font-size: 24px;
      background-color: #ffcccc;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
    `;
    // Add touch feedback
    clearBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#ff9999';
    });
    clearBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#ffcccc';
    });
    
    const zeroBtn = document.createElement('button');
    zeroBtn.textContent = '0';
    zeroBtn.onclick = function() { window.addToDirectNumericDisplay('0'); };
    zeroBtn.style.cssText = `
      padding: 15px;
      font-size: 24px;
      background-color: #f1f1f1;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
    `;
    // Add touch feedback
    zeroBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#d0d0d0';
    });
    zeroBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#f1f1f1';
    });
    
    const backBtn = document.createElement('button');
    backBtn.innerHTML = '&#9003;';
    backBtn.onclick = function() { window.backspaceDirectNumericDisplay(); };
    backBtn.style.cssText = `
      padding: 15px;
      font-size: 24px;
      background-color: #f1f1f1;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
    `;
    // Add touch feedback
    backBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#d0d0d0';
    });
    backBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#f1f1f1';
    });
    
    // Create hyphen button for material lot input
    const hyphenBtn = document.createElement('button');
    hyphenBtn.textContent = '-';
    hyphenBtn.id = 'hyphenButton';
    hyphenBtn.onclick = function() { window.addToDirectNumericDisplay('-'); };
    hyphenBtn.style.cssText = `
      padding: 15px;
      font-size: 24px;
      background-color: #e0e0ff;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
      display: none; // Initially hidden, shown only for material lot input
    `;
    // Add touch feedback
    hyphenBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#c0c0ff';
    });
    hyphenBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#e0e0ff';
    });
    
    // Create space button
    const spaceBtn = document.createElement('button');
    spaceBtn.textContent = 'Space';
    spaceBtn.id = 'spaceButton';
    spaceBtn.onclick = function() { window.addToDirectNumericDisplay(' '); };
    spaceBtn.style.cssText = `
      padding: 15px;
      font-size: 20px;
      background-color: #e0ffec;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
    `;
    // Add touch feedback
    spaceBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#c0ffd8';
    });
    spaceBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#e0ffec';
    });
    
    // Append all buttons
    keypadContainer.appendChild(clearBtn);
    keypadContainer.appendChild(zeroBtn);
    keypadContainer.appendChild(backBtn);
    keypadContainer.appendChild(hyphenBtn); // Add hyphen button to the keypad
    keypadContainer.appendChild(spaceBtn); // Add space button to the keypad
  }
  
  // Functions have been moved to the global scope before the load event
  
  // Configure the shot input with the direct keypad
  const shotInput = document.getElementById('shot');
  if (shotInput) {
    shotInput.readOnly = true;
    
    // Use a more robust event attachment
    if (shotInput.addEventListener) {
      shotInput.addEventListener('click', function() {
        window.openDirectNumericKeypad('shot');
      });
    } else {
      // Fallback for older browsers
      shotInput.onclick = function() {
        window.openDirectNumericKeypad('shot');
      };
    }
    
    // Style the input
    shotInput.style.cssText = `
      cursor: pointer;
      background-color: #f0f8ff;
      border: 2px solid #007bff;
      border-radius: 5px;
      padding: 8px 10px;
      font-size: 16px;
      width: 100%;
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="%23007bff"><path d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 4h4v4H5V6zm0 6h4v4H5v-4zm6-6h4v4h-4V6zm6 0h2v4h-2V6zm-6 6h4v4h-4v-4zm6 0h2v4h-2v-4z"/></svg>');
      background-repeat: no-repeat;
      background-position: right 8px center;
      background-size: 16px 16px;
      padding-right: 30px;
    `;
    
    console.log('Shot input configured with direct keypad');
  }
  
  // Configure ProcessQuantity input with the direct keypad
  const processQuantityInput = document.getElementById('ProcessQuantity');
  if (processQuantityInput) {
    processQuantityInput.readOnly = true;
    
    // Use a more robust event attachment
    if (processQuantityInput.addEventListener) {
      processQuantityInput.addEventListener('click', function() {
        window.openDirectNumericKeypad('ProcessQuantity');
      });
    } else {
      // Fallback for older browsers
      processQuantityInput.onclick = function() {
        window.openDirectNumericKeypad('ProcessQuantity');
      };
    }
    
    // Style the input
    processQuantityInput.style.cssText = `
      cursor: pointer;
      background-color: #f0f8ff;
      border: 2px solid #007bff;
      border-radius: 5px;
      padding: 8px 10px;
      font-size: 16px;
      width: 100%;
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="%23007bff"><path d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 4h4v4H5V6zm0 6h4v4H5v-4zm6-6h4v4h-4V6zm6 0h2v4h-2V6zm-6 6h4v4h-4v-4zm6 0h2v4h-2v-4z"/></svg>');
      background-repeat: no-repeat;
      background-position: right 8px center;
      background-size: 16px 16px;
      padding-right: 30px;
    `;
    
    console.log('ProcessQuantity input configured with direct keypad');
  }
  
  // Configure 在庫 (Spare) input with the direct keypad
  const spareInput = document.getElementById('在庫');
  if (spareInput) {
    spareInput.readOnly = true;
    
    // Use a more robust event attachment
    if (spareInput.addEventListener) {
      spareInput.addEventListener('click', function() {
        window.openDirectNumericKeypad('在庫');
      });
    } else {
      // Fallback for older browsers
      spareInput.onclick = function() {
        window.openDirectNumericKeypad('在庫');
      };
    }
    
    // Style the input
    spareInput.style.cssText = `
      cursor: pointer;
      background-color: #f0f8ff;
      border: 2px solid #007bff;
      border-radius: 5px;
      padding: 8px 10px;
      font-size: 16px;
      width: 100%;
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="%23007bff"><path d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 4h4v4H5V6zm0 6h4v4H5v-4zm6-6h4v4h-4V6zm6 0h2v4h-2V6zm-6 6h4v4h-4v-4zm6 0h2v4h-2v-4z"/></svg>');
      background-repeat: no-repeat;
      background-position: right 8px center;
      background-size: 16px 16px;
      padding-right: 30px;
    `;
    
    console.log('Spare (在庫) input configured with direct keypad');
    
    // Add logging when spare value changes
    spareInput.addEventListener('input', function() {
      logTabletAction('Spare count set', 'in-progress', {
        spareCount: this.value
      });
    });
  }
  
  // Configure material lot input - DISABLED, now using QR scanner with override
  // const materialLotInput = document.getElementById('材料ロット');
  // if (materialLotInput) {
  //   materialLotInput.readOnly = true;
  //   
  //   // Use a more robust event attachment
  //   if (materialLotInput.addEventListener) {
  //     materialLotInput.addEventListener('click', function() {
  //       window.openDirectNumericKeypad('材料ロット');
  //     });
  //   } else {
  //     // Fallback for older browsers
  //     materialLotInput.onclick = function() {
  //       window.openDirectNumericKeypad('材料ロット');
  //     };
  //   }
  //   
  //   // Style the input
  //   materialLotInput.style.cssText = `
  //     cursor: pointer;
  //     background-color: #f0f8ff;
  //     border: 2px solid #007bff;
  //     border-radius: 5px;
  //     padding: 8px 10px;
  //     font-size: 16px;
  //     width: 100%;
  //     background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="%23007bff"><path d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 4h4v4H5V6zm0 6h4v4H5v-4zm6-6h4v4h-4V6zm6 0h2v4h-2V6zm-6 6h4v4h-4v-4zm6 0h2v4h-2v-4z"/></svg>');
  //     background-repeat: no-repeat;
  //     background-position: right 8px center;
  //     background-size: 16px 16px;
  //     padding-right: 30px;
  //   `;
  //   
  //   console.log('Material lot input configured with direct keypad');
  // }
  
  // Also run the original initialization
  initNumericKeypad();
});

// ============================================
// 3-STEP MODAL VERIFICATION SYSTEM
// ============================================

// Global variables for step tracking
let step1Scanner = null;
let step2Scanner = null;
let currentStep = 0;

// Global variable to store fetched product details
let currentProductDetails = {
  sebanggo: '',
  hinban: '',
  materialCode: ''
};

// Function to get machine name
function getMachineName() {
  return document.getElementById('process')?.value || 'MACHINE';
}

// Helper function to parse and validate material codes (case-sensitive)
// Returns: { isValid: boolean, matchedCode: string|null, allCodes: string[] }
function validateMaterialCode(scannedCode, expectedCodeString) {
  if (!expectedCodeString) {
    return { isValid: false, matchedCode: null, allCodes: [] };
  }
  
  // Split by comma and trim whitespace
  const allCodes = expectedCodeString.split(',').map(code => code.trim()).filter(code => code);
  
  // Case-sensitive exact match
  const matchedCode = allCodes.find(code => code === scannedCode);
  
  return {
    isValid: !!matchedCode,
    matchedCode: matchedCode || null,
    allCodes: allCodes
  };
}

// Helper function to format material codes for display
// Example: "MA44,MA90" -> "MA44 or MA90"
function formatMaterialCodesForDisplay(materialCodeString) {
  if (!materialCodeString) {
    return '';
  }
  
  const codes = materialCodeString.split(',').map(code => code.trim()).filter(code => code);
  
  if (codes.length === 0) {
    return '';
  } else if (codes.length === 1) {
    return codes[0];
  } else {
    return codes.join(' or ');
  }
}

// Function to save current step to localStorage
function saveCurrentStep(step) {
  currentStep = step;
  const key = `${uniquePrefix}currentStep`;
  console.log('Saving step:', step, 'with key:', key);
  localStorage.setItem(key, step);
}

// Function to get current step from localStorage
function getCurrentStepFromStorage() {
  const key = `${uniquePrefix}currentStep`;
  const saved = localStorage.getItem(key);
  console.log('Getting step from key:', key, '→ value:', saved);
  return saved ? parseInt(saved) : 0;
}

// Function to show Step 1 Modal
function showStep1Modal() {
  const modal = document.getElementById('step1Modal');
  const machineName = document.getElementById('step1MachineName');
  const content = document.getElementById('step1Content');
  const scanner = document.getElementById('step1Scanner');
  
  machineName.textContent = getMachineName();
  content.style.display = 'flex';
  scanner.style.display = 'none';
  modal.style.display = 'block';
  saveCurrentStep(1);
}

// Function to show Step 2 Modal
function showStep2Modal() {
  const modal = document.getElementById('step2Modal');
  const machineName = document.getElementById('step2MachineName');
  const content = document.getElementById('step2Content');
  const scanner = document.getElementById('step2Scanner');
  
  // Use cached product details instead of reading from DOM
  document.getElementById('step2Sebanggo').textContent = currentProductDetails.sebanggo;
  document.getElementById('step2Hinban').textContent = currentProductDetails.hinban;
  // Format material codes for display: "MA44,MA90" -> "MA44 or MA90"
  document.getElementById('step2Material').textContent = formatMaterialCodesForDisplay(currentProductDetails.materialCode);
  
  machineName.textContent = getMachineName();
  content.style.display = 'flex';
  scanner.style.display = 'none';
  modal.style.display = 'block';
  saveCurrentStep(2);
}

// Function to show Step 3 Modal
function showStep3Modal() {
  const modal = document.getElementById('step3Modal');
  const machineName = document.getElementById('step3MachineName');
  
  // Use cached product details instead of reading from DOM
  document.getElementById('step3Sebanggo').textContent = currentProductDetails.sebanggo;
  document.getElementById('step3Hinban').textContent = currentProductDetails.hinban;
  // Format material codes for display: "MA44,MA90" -> "MA44 or MA90"
  document.getElementById('step3Material').textContent = formatMaterialCodesForDisplay(currentProductDetails.materialCode);
  
  machineName.textContent = getMachineName();
  modal.style.display = 'block';
  saveCurrentStep(3);
}

// Function to close all step modals
function closeAllStepModals() {
  document.getElementById('step1Modal').style.display = 'none';
  document.getElementById('step2Modal').style.display = 'none';
  document.getElementById('step3Modal').style.display = 'none';
  
  // Stop any running scanners
  if (step1Scanner) {
    step1Scanner.stop().catch(err => console.error("Error stopping step1 scanner:", err));
    step1Scanner = null;
  }
  if (step2Scanner) {
    step2Scanner.stop().catch(err => console.error("Error stopping step2 scanner:", err));
    step2Scanner = null;
  }
}

// Function to reset all steps
function resetAllSteps() {
  closeAllStepModals();
  
  // Clear sub-dropdown
  const subDropdown = document.getElementById('sub-dropdown');
  if (subDropdown) {
    subDropdown.selectedIndex = 0;
  }
  
  // Clear material lots
  materialLots = [];
  saveMaterialLots();
  renderMaterialLotTags();
  
  // Clear product details cache
  currentProductDetails = {
    sebanggo: '',
    hinban: '',
    materialCode: ''
  };
  
  // Clear cached product details from localStorage
  localStorage.removeItem(`${uniquePrefix}cached-sebanggo`);
  localStorage.removeItem(`${uniquePrefix}cached-hinban`);
  localStorage.removeItem(`${uniquePrefix}cached-materialCode`);
  
  // Reset step to 0 and clear from localStorage
  saveCurrentStep(0);
  
  // Call resetForm() to clear all form data
  resetForm();
}

// Step 1: Start Scan Button
document.getElementById('startStep1Scan').addEventListener('click', function(event) {
  event.preventDefault(); // Prevent form submission
  
  const content = document.getElementById('step1Content');
  const scanner = document.getElementById('step1Scanner');
  
  // Stop any active alert sound and close alert modal
  const alertSound = document.getElementById('alert-sound');
  const scanAlertModal = document.getElementById('scanAlertModal');
  if (alertSound) {
    alertSound.pause();
    alertSound.currentTime = 0;
    alertSound.muted = true;
  }
  if (scanAlertModal) {
    scanAlertModal.style.display = 'none';
  }
  // Remove red flash effect
  document.body.classList.remove('flash-red');
  
  // Clear any previous error messages
  const errorMsg = document.getElementById('step1ErrorMsg');
  if (errorMsg) {
    errorMsg.style.display = 'none';
  }
  
  content.style.display = 'none';
  scanner.style.display = 'block';
  
  step1Scanner = new Html5Qrcode("step1QrReader");
  
  step1Scanner.start(
    { facingMode: "environment" },
    { 
      fps: 30,
      qrbox: { width: 1000, height: 1000 },
      aspectRatio: 1.0,
      disableFlip: false,
      advanced: [{
        focusMode: "continuous",
        focusDistance: { ideal: 0 }
      }]
    },
    async (qrCodeMessage) => {
      console.log("Step 1 QR Scanned:", qrCodeMessage);
      
      const subDropdown = document.getElementById('sub-dropdown');
      const options = [...subDropdown.options].map(option => option.value);
      
      if (!options.includes(qrCodeMessage)) {
        // Stop scanner
        await step1Scanner.stop();
        step1Scanner = null;
        
        // Hide scanner, show button again
        scanner.style.display = 'none';
        content.style.display = 'flex';
        
        // Show error message in modal
        const errorMsg = document.getElementById('step1ErrorMsg');
        const errorText = errorMsg.querySelector('p');
        errorText.innerHTML = `❌ <strong>背番号が存在しません / Sebanggo does not exist</strong><br><br>Scanned: <code style="background: #f8f9fa; padding: 2px 8px; border-radius: 4px;">${qrCodeMessage}</code>`;
        errorMsg.style.display = 'block';
        
        // Also show alert with red flash and sound
        showAlert(`❌ 背番号が存在しません / Sebanggo does not exist\n\nScanned: ${qrCodeMessage}`);
        
        return;
      }
      
      // Stop scanner
      await step1Scanner.stop();
      step1Scanner = null;
      
      // Set dropdown value
      subDropdown.value = qrCodeMessage;
      
      // Update previous value for leader verification
      if (typeof updatePreviousDropdownValue === 'function') {
        updatePreviousDropdownValue(qrCodeMessage);
      }
      
      // Save to localStorage
      localStorage.setItem(`${uniquePrefix}sub-dropdown`, qrCodeMessage);
      
      // Fetch product details
      await fetchProductDetails();
      
      // Cache product details after fetching
      currentProductDetails = {
        sebanggo: qrCodeMessage,
        hinban: document.getElementById('product-number')?.value || '',
        materialCode: document.getElementById('material-code')?.value || ''
      };
      
      console.log('Cached product details:', currentProductDetails);
      
      // Save cached product details to localStorage
      localStorage.setItem(`${uniquePrefix}cached-sebanggo`, currentProductDetails.sebanggo);
      localStorage.setItem(`${uniquePrefix}cached-hinban`, currentProductDetails.hinban);
      localStorage.setItem(`${uniquePrefix}cached-materialCode`, currentProductDetails.materialCode);
      
      // 🔴 BROADCAST SCAN TO SSE - Send to machine display page (includes logging)
      const machineNameForSSE = getMachineName(); // Get the current machine name (e.g., "OZNC04,OZNC06" or "OZNC09")
      const currentFactory = document.getElementById('selected工場')?.value || '';
      
      // Generate sessionID for this scan session
      const current設備 = document.getElementById('process')?.value || '';
      const todayDate = new Date().toISOString().split('T')[0];
      const newSessionID = await generateSessionID(
        currentProductDetails.sebanggo,
        current設備,
        currentFactory,
        todayDate
      );
      
      if (newSessionID) {
        setSessionID(newSessionID);
        console.log('✅ New session started:', newSessionID);
      } else {
        console.warn('⚠️ Failed to generate sessionID');
      }
      
      // 🔊 GROUPED MACHINE SUPPORT
      // If using DCP Grouping.html with grouped machines (e.g., "OZNC04,OZNC06"),
      // server will split and send SSE to both machines
      // If using DCP iReporter.html with solo machines (e.g., "OZNC09"),
      // server will send SSE to only that single machine
      if (machineNameForSSE) {
        const isGrouped = machineNameForSSE.includes(',');
        const machineList = machineNameForSSE.split(',').map(m => m.trim());
        console.log(`📡 Broadcasting QR scan to ${isGrouped ? 'grouped' : 'solo'} machine(s):`, machineList);
        
        fetch(`${serverURL}/api/broadcast-scan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            machineId: machineNameForSSE, // Full string sent (e.g., "OZNC04,OZNC06" or "OZNC09")
            sebanggo: currentProductDetails.sebanggo,
            hinban: currentProductDetails.hinban,
            timestamp: new Date().toISOString(),
            additionalData: {
              materialCode: currentProductDetails.materialCode,
              factory: currentFactory,
              工場: currentFactory,
              sessionID: newSessionID
            }
          })
        })
        .then(response => response.json())
        .then(data => {
          console.log('✅ SSE Broadcast successful:', data);
        })
        .catch(error => {
          console.error('❌ SSE Broadcast failed:', error);
          // Don't block the workflow if broadcast fails
        });
      }
      
      // Apply NC button logic
      NCPresstoFalse();
      
      // Close Step 1, Open Step 2
      document.getElementById('step1Modal').style.display = 'none';
      showStep2Modal();
    },
    (errorMessage) => {
      // Ignore scan errors
    }
  ).catch(err => {
    console.error("Failed to start Step 1 scanner:", err);
    showAlert('カメラを起動できませんでした / Could not start camera');
  });
});

// Step 2: Start Scan Button
document.getElementById('startStep2Scan').addEventListener('click', function(event) {
  event.preventDefault(); // Prevent form submission
  
  const content = document.getElementById('step2Content');
  const scanner = document.getElementById('step2Scanner');
  
  // Stop any active alert sound and close alert modal
  const alertSound = document.getElementById('alert-sound');
  const scanAlertModal = document.getElementById('scanAlertModal');
  if (alertSound) {
    alertSound.pause();
    alertSound.currentTime = 0;
    alertSound.muted = true;
  }
  if (scanAlertModal) {
    scanAlertModal.style.display = 'none';
  }
  // Remove red flash effect
  document.body.classList.remove('flash-red');
  
  // Clear any previous error messages
  const errorMsg = document.getElementById('step2ErrorMsg');
  if (errorMsg) {
    errorMsg.style.display = 'none';
  }
  
  content.style.display = 'none';
  scanner.style.display = 'block';
  
  step2Scanner = new Html5Qrcode("step2QrReader");
  
  step2Scanner.start(
    { facingMode: "environment" },
    { 
      fps: 30,
      qrbox: { width: 800, height: 800 },
      aspectRatio: 1.0,
      disableFlip: false,
      advanced: [{
        focusMode: "continuous",
        focusDistance: { ideal: 0 }
      }]
    },
    async (qrCodeMessage) => {
      console.log("Step 2 QR Scanned:", qrCodeMessage);
      
      try {
        // Parse QR code: "Z1Z9,250805-5,500"
        const parts = qrCodeMessage.split(',');
        
        if (parts.length < 2) {
          // Stop scanner
          await step2Scanner.stop();
          step2Scanner = null;
          
          // Hide scanner, show button again
          scanner.style.display = 'none';
          content.style.display = 'flex';
          
          // Show error in modal
          const errorMsg = document.getElementById('step2ErrorMsg');
          const errorText = errorMsg.querySelector('p');
          errorText.innerHTML = `❌ <strong>QRコードの形式が正しくありません / Invalid QR code format</strong><br><br>Scanned: <code style="background: #f8f9fa; padding: 2px 8px; border-radius: 4px;">${qrCodeMessage}</code><br><br>Expected format: <code style="background: #f8f9fa; padding: 2px 8px; border-radius: 4px;">MaterialCode,LotNumber,Quantity</code>`;
          errorMsg.style.display = 'block';
          
          // Also show alert with red flash and sound
          showAlert(`❌ QRコードの形式が正しくありません / Invalid QR code format\n\nScanned: ${qrCodeMessage}\n\nExpected format: MaterialCode,LotNumber,Quantity`);
          
          return;
        }

        const scannedMaterialCode = parts[0].trim();
        const lotNumber = parts[1].trim();
        
        // Validate Material Code using cached product details with new multi-value support
        const expectedMaterialCodeString = currentProductDetails.materialCode || '';
        const validation = validateMaterialCode(scannedMaterialCode, expectedMaterialCodeString);
        
        console.log("Material Code Comparison:", { 
          scanned: scannedMaterialCode, 
          expected: expectedMaterialCodeString,
          allValidCodes: validation.allCodes,
          isValid: validation.isValid,
          matchedCode: validation.matchedCode
        });
        
        if (!validation.isValid) {
          // Stop scanner
          await step2Scanner.stop();
          step2Scanner = null;
          
          // Hide scanner, show button again
          scanner.style.display = 'none';
          content.style.display = 'flex';
          
          // Format expected codes for display
          const expectedDisplay = formatMaterialCodesForDisplay(expectedMaterialCodeString);
          
          // Show error in modal
          const errorMsg = document.getElementById('step2ErrorMsg');
          const errorText = errorMsg.querySelector('p');
          errorText.innerHTML = `❌ <strong>材料コードが一致しません / Material code mismatch</strong><br><br>Expected: <code style="background: #e8f5e9; padding: 2px 8px; border-radius: 4px; color: #2e7d32;">${expectedDisplay}</code><br>Scanned: <code style="background: #ffebee; padding: 2px 8px; border-radius: 4px; color: #c62828;">${scannedMaterialCode}</code><br><br>Please scan the correct material lot.`;
          errorMsg.style.display = 'block';
          
          // Also show alert with red flash and sound
          showAlert(`❌ 材料コードが一致しません / Material code mismatch\n\nExpected: ${expectedDisplay}\nScanned: ${scannedMaterialCode}\n\nPlease scan the correct material lot.`);
          
          return;
        }
        
        // Log which specific code was matched
        console.log(`Material code validated successfully. Matched: ${validation.matchedCode}`);
        
        // Store the actual scanned material code (not all valid codes, just the one scanned)
        // This could be used later if needed for tracking which specific code was used
        const actualScannedCode = validation.matchedCode;
        
        // Add scanned lot to the material lot input
        const success = addScannedLot(lotNumber);
        
        if (!success) {
          // Lot already exists - show info message but don't treat as error
          console.log("Lot already added, but material code is correct. Proceeding to Step 3.");
          
          // Show info in modal (yellow box with informational message)
          const errorMsg = document.getElementById('step2ErrorMsg');
          const errorText = errorMsg.querySelector('p');
          errorText.innerHTML = `⚠️ <strong>このロット番号は既に追加されています / Lot number already added</strong><br><br>Lot: <code style="background: #f8f9fa; padding: 2px 8px; border-radius: 4px;">${lotNumber}</code><br><br>Material code is correct. Proceeding to next step...`;
          errorMsg.style.display = 'block';
          
          // Stop scanner and move to Step 3 after a short delay
          await step2Scanner.stop();
          step2Scanner = null;
          
          setTimeout(() => {
            document.getElementById('step2Modal').style.display = 'none';
            showStep3Modal();
          }, 2000); // 2 second delay to show the message
          
          return;
        }
        
        // Success - stop scanner and move to Step 3
        await step2Scanner.stop();
        step2Scanner = null;
        
        console.log("Lot added successfully:", lotNumber);
        
        // Log material lot scan action
        await logTabletAction('Scanned material lot (Step 2)', 'in-progress', {
          lotNumber: lotNumber,
          materialCode: actualScannedCode,
          allMaterialLots: materialLots.map(l => l.lotNumber).join(', ')
        });
        
        document.getElementById('step2Modal').style.display = 'none';
        showStep3Modal();
        
      } catch (error) {
        console.error("Error processing lot QR code:", error);
        
        // Stop scanner if still running
        if (step2Scanner) {
          await step2Scanner.stop();
          step2Scanner = null;
        }
        
        // Hide scanner, show button again
        scanner.style.display = 'none';
        content.style.display = 'flex';
        
        // Show error in modal
        const errorMsg = document.getElementById('step2ErrorMsg');
        const errorText = errorMsg.querySelector('p');
        errorText.innerHTML = `❌ <strong>QRコードの処理エラー / QR code processing error</strong><br><br>${error.message}`;
        errorMsg.style.display = 'block';
        
        // Also show alert with red flash and sound
        showAlert(`❌ QRコードの処理エラー / QR code processing error\n\n${error.message}`);
      }
    },
    (errorMessage) => {
      // Ignore scan errors
    }
  ).catch(err => {
    console.error("Failed to start Step 2 scanner:", err);
    showAlert('カメラを起動できませんでした / Could not start camera');
  });
});

// Step 2: Override Button (Manual Entry with Leader Verification)
document.getElementById('overrideStep2').addEventListener('click', function(event) {
  event.preventDefault(); // Prevent form submission
  
  const step2Modal = document.getElementById('step2Modal');
  const leaderVerificationModal = document.getElementById('leaderVerificationModal');
  const leaderVerificationStatus = document.getElementById('leaderVerificationStatus');
  const materialLotInput = document.getElementById('材料ロット');
  
  // Stop Step 2 scanner if running
  if (step2Scanner) {
    step2Scanner.stop().catch(err => console.error("Error stopping step2 scanner:", err));
    step2Scanner = null;
  }
  
  // Close Step 2 modal
  step2Modal.style.display = 'none';
  
  // Get material code from input (may contain comma-separated values)
  const materialCodeInput = document.getElementById('material-code');
  const materialCodeString = materialCodeInput ? materialCodeInput.value.trim() : 'N/A';
  const materialCodeDisplay = formatMaterialCodesForDisplay(materialCodeString);
  
  // Find and update the warning text to show material code with blinking
  const modalContent = leaderVerificationModal.querySelector('.modal-content');
  const warningTextElement = modalContent.querySelector('p[style*="font-size"], p[style*="color: #666"]');
  
  if (warningTextElement) {
    // Replace the warning text with blinking material code (formatted for multiple codes)
    warningTextElement.innerHTML = `<span class="material-code-blink">材料: ${materialCodeDisplay} / Material Code: ${materialCodeDisplay}</span>`;
    warningTextElement.style.fontSize = '18px';
    warningTextElement.style.margin = '15px 0';
  }
  
  // Show leader verification modal
  leaderVerificationStatus.textContent = 'リーダーのQRコードをスキャンしてください / Please scan leader QR code';
  leaderVerificationStatus.style.color = '#2d5f4f';
  leaderVerificationModal.style.display = 'block';
  
  // Start leader verification scanner
  let leaderScanner = new Html5Qrcode("leaderQrReader");
  
  leaderScanner.start(
    { facingMode: "environment" },
    { 
      fps: 30,
      qrbox: { width: 800, height: 800 },
      aspectRatio: 1.0,
      disableFlip: false,
      advanced: [{
        focusMode: "continuous",
        focusDistance: { ideal: 0 }
      }]
    },
    async (decodedText) => {
      console.log("Leader QR Code scanned for Step 2 override:", decodedText);
      
      try {
        const response = await fetch(`${serverURL}/verifyLeader`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: decodedText })
        });
        
        const result = await response.json();
        
        if (result.authorized) {
          leaderVerificationStatus.textContent = `✅ 認証成功！ / Verified! Opening keypad...`;
          leaderVerificationStatus.style.color = '#006400';
          
          leaderScanner.stop().then(() => {
            setTimeout(() => {
              leaderVerificationModal.style.display = 'none';
              
              // Open keypad for manual lot entry
              const currentLots = materialLotInput.value ? materialLotInput.value.split(',').map(v => v.trim()).filter(v => v) : [];
              
              // Open keypad in new entry mode
              window.openDirectNumericKeypad('材料ロット', true);
              
              // Monitor keypad closure and capture the entered value
              const checkKeypadClosure = setInterval(() => {
                const keypadModal = document.getElementById('numericKeypadModalDirect');
                const isKeypadOpen = keypadModal && keypadModal.style.display === 'block';
                
                if (!isKeypadOpen) {
                  clearInterval(checkKeypadClosure);
                  
                  // Get the newly entered value
                  const newValue = materialLotInput.value;
                  const newLots = newValue ? newValue.split(',').map(v => v.trim()).filter(v => v && !currentLots.includes(v)) : [];
                  
                  if (newLots.length > 0) {
                    // Add the manual lot as a blue tag (visually different)
                    const lotNumber = newLots[0]; // Take the first new lot
                    
                    // Add to material lots array with manual flag
                    if (window.addManualLot) {
                      window.addManualLot(lotNumber);
                      console.log("Manual lot added via Step 2 override:", lotNumber);
                    }
                    
                    // Automatically proceed to Step 3
                    setTimeout(() => {
                      showStep3Modal();
                    }, 500);
                  } else {
                    // No lot entered, return to Step 2
                    showStep2Modal();
                  }
                }
              }, 300);
              
            }, 1000);
          }).catch(err => console.error("Error stopping leader scanner:", err));
        } else {
          leaderVerificationStatus.textContent = `❌ 権限がありません / Not authorized`;
          leaderVerificationStatus.style.color = '#cc0000';
          
          // Return to Step 2 after 2 seconds
          setTimeout(() => {
            leaderScanner.stop().then(() => {
              leaderVerificationModal.style.display = 'none';
              showStep2Modal();
            }).catch(err => console.error("Error stopping scanner:", err));
          }, 2000);
        }
      } catch (error) {
        console.error("Error verifying leader:", error);
        leaderVerificationStatus.textContent = `❌ エラーが発生しました / Error occurred`;
        leaderVerificationStatus.style.color = '#cc0000';
        
        // Return to Step 2 after 2 seconds
        setTimeout(() => {
          leaderScanner.stop().then(() => {
            leaderVerificationModal.style.display = 'none';
            showStep2Modal();
          }).catch(err => console.error("Error stopping scanner:", err));
        }, 2000);
      }
    },
    (errorMessage) => {
      // Ignore scan errors
    }
  ).catch(err => {
    console.error("Failed to start leader verification scanner:", err);
    showAlert('カメラを起動できませんでした / Could not start camera');
    leaderVerificationModal.style.display = 'none';
    showStep2Modal();
  });
  
  // Set up cancel button handler for Step 2 override flow
  document.getElementById('closeLeaderVerificationModal').onclick = function() {
    if (leaderScanner) {
      leaderScanner.stop().then(() => {
        leaderVerificationModal.style.display = 'none';
        leaderScanner = null;
        showStep2Modal(); // Return to Step 2 modal
      }).catch(err => {
        console.error("Error stopping leader scanner:", err);
        leaderVerificationModal.style.display = 'none';
        leaderScanner = null;
        showStep2Modal(); // Return to Step 2 modal anyway
      });
    } else {
      leaderVerificationModal.style.display = 'none';
      showStep2Modal(); // Return to Step 2 modal
    }
  };
});

// Step 3: Send to Machine Button
document.getElementById('startStep3Send').addEventListener('click', async function(event) {
  event.preventDefault(); // Prevent form submission
  
  try {
    // Get the current 背番号
    const currentSebanggo = document.getElementById('sub-dropdown').value;
    
    if (!currentSebanggo) {
      showAlert('背番号を選んでください / Please select sebanggo first');
      return;
    }
    
    // Close Step 3 modal immediately (sending in background)
    document.getElementById('step3Modal').style.display = 'none';
    
    // Log send to machine action (Step 3)
    await logTabletAction('Send to machine pressed (Step 3)', 'in-progress', {
      背番号: currentSebanggo,
      source: 'Step 3 Modal'
    });
    
    // Clear cached product details from localStorage
    localStorage.removeItem(`${uniquePrefix}cached-sebanggo`);
    localStorage.removeItem(`${uniquePrefix}cached-hinban`);
    localStorage.removeItem(`${uniquePrefix}cached-materialCode`);
    
    // Mark workflow as complete
    saveCurrentStep(0);
    
    // Call the sendtoNC function (sends in background with progress bar)
    await sendtoNC(currentSebanggo);
    
  } catch (error) {
    console.error("Error sending to machine:", error);
    showAlert('送信エラー / Send error');
  }
});

// Reset buttons
document.getElementById('resetStep1').addEventListener('click', function(event) {
  event.preventDefault(); // Prevent form submission
  resetAllSteps();
});
document.getElementById('resetStep2').addEventListener('click', function(event) {
  event.preventDefault(); // Prevent form submission
  resetAllSteps();
});
document.getElementById('resetStep3').addEventListener('click', function(event) {
  event.preventDefault(); // Prevent form submission
  resetAllSteps();
});

// ============================================
// Individual Machine Send Modal (after 3-step workflow)
// ============================================

function showIndividualSendModal() {
  const modal = document.getElementById('individualSendModal');
  const machineList = document.getElementById('individualMachineList');
  
  if (!modal || !machineList) return;
  
  // Clear previous content
  machineList.innerHTML = '';
  
  // Get the machine config from global variables
  const machines = window.currentMachineGroup || [];
  // Get the 背番号 (sebanggo) value for the filename
  const sebanggo = document.getElementById('sub-dropdown').value;
  const ncFilename = sebanggo ? `${sebanggo}.pce` : 'program.pce';
  
  if (machines.length === 0) {
    machineList.innerHTML = '<p style="text-align: center; color: #999;">No machines configured</p>';
    modal.style.display = 'flex';
    return;
  }
  
  // Create a card for each machine
  machines.forEach((machine, index) => {
    const card = document.createElement('div');
    card.style.cssText = 'border: 2px solid #ddd; border-radius: 10px; padding: 20px; background: #f8f9fa;';
    
    const machineName = document.createElement('div');
    machineName.style.cssText = 'font-size: 20px; font-weight: 600; color: #333; margin-bottom: 10px;';
    machineName.textContent = `${machine.name} (${machine.ip})`;
    
    const statusIndicator = document.createElement('div');
    statusIndicator.id = `sendStatus-${index}`;
    statusIndicator.style.cssText = 'display: none; margin-bottom: 10px; padding: 8px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 5px; color: #155724; font-weight: 600; text-align: center;';
    statusIndicator.innerHTML = '✓ Sent / 送信完了';
    
    const sendButton = document.createElement('button');
    sendButton.type = 'button';
    sendButton.id = `sendBtn-${index}`;
    sendButton.style.cssText = 'background: #2196F3; color: white; border: none; padding: 15px 30px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 600; width: 100%; transition: all 0.3s;';
    sendButton.innerHTML = `Send to ${machine.name}<br><span style="font-size: 14px;">送信</span>`;
    
    sendButton.addEventListener('click', async function() {
      await sendToIndividualMachine(machine, ncFilename, index);
    });
    
    card.appendChild(machineName);
    card.appendChild(statusIndicator);
    card.appendChild(sendButton);
    machineList.appendChild(card);
  });
  
  // Show the modal
  modal.style.display = 'flex';
}

async function sendToIndividualMachine(machine, ncFilename, index) {
  const sendButton = document.getElementById(`sendBtn-${index}`);
  const statusIndicator = document.getElementById(`sendStatus-${index}`);
  
  if (!sendButton) return;
  
  // Disable button
  sendButton.disabled = true;
  sendButton.style.opacity = '0.6';
  sendButton.style.cursor = 'not-allowed';
  sendButton.innerHTML = 'Sending... / 送信中...';
  
  // Use the same URL format as Step 3 modal (port 5000 with /request?filename=)
  const ncProgramUrl = `http://${machine.ip}:5000/request?filename=${ncFilename}`;
  
  try {
    // Try background fetch first
    const response = await fetch(ncProgramUrl, {
      method: 'GET',
      mode: 'no-cors' // This prevents CORS errors but doesn't return response data
    });
    
    console.log(`Sent to ${machine.name} (${machine.ip}) via fetch`);
    
    // Show success indicator
    statusIndicator.style.display = 'block';
    sendButton.style.display = 'none';
    
  } catch (error) {
    console.error(`Fetch failed for ${machine.name}, trying new tab fallback:`, error);
    
    // Fallback: Open in new tab
    const newTab = window.open(ncProgramUrl, '_blank', 'width=100,height=100,left=-1000,top=-1000');
    
    if (newTab) {
      setTimeout(() => {
        try {
          newTab.close();
        } catch (e) {
          console.log('Could not close tab automatically');
        }
      }, 3000);
      
      // Show success indicator
      statusIndicator.style.display = 'block';
      sendButton.style.display = 'none';
    } else {
      // Could not send
      sendButton.disabled = false;
      sendButton.style.opacity = '1';
      sendButton.style.cursor = 'pointer';
      sendButton.innerHTML = `Send to ${machine.name}<br><span style="font-size: 14px;">送信 (Retry)</span>`;
      alert('Could not send. Please check popup blocker.');
    }
  }
}

// Close button for individual send modal
document.getElementById('closeIndividualSendModal')?.addEventListener('click', function() {
  document.getElementById('individualSendModal').style.display = 'none';
});

// Close modal when clicking outside
document.getElementById('individualSendModal')?.addEventListener('click', function(e) {
  if (e.target === this) {
    this.style.display = 'none';
  }
});

// Auto-show modal on page load based on workflow state
window.addEventListener('load', function() {
  setTimeout(() => {
    const subDropdown = document.getElementById('sub-dropdown');
    const savedStep = getCurrentStepFromStorage();
    
    console.log('=== 3-Step Modal Auto-Load Debug ===');
    console.log('Dropdown value:', subDropdown?.value);
    console.log('Dropdown selectedIndex:', subDropdown?.selectedIndex);
    console.log('Saved step from localStorage:', savedStep);
    
    // 🔴 SSE BROADCAST ON PAGE LOAD
    const machineNameForSSE = getMachineName();
    
    // If sub-dropdown is empty, always start at Step 1 AND broadcast clear
    if (!subDropdown.value || subDropdown.selectedIndex === 0) {
      console.log('Empty dropdown detected - showing Step 1 and broadcasting clear');
      saveCurrentStep(0);
      
      // Broadcast clear message to pdfDisplayer(s)
      // If grouped machine (OZNC04,OZNC06), broadcasts to both
      // If solo machine (OZNC09), broadcasts to only that one
      if (machineNameForSSE) {
        const machineIds = machineNameForSSE.split(',').map(m => m.trim());
        console.log(`🔊 Broadcasting clear action to ${machineIds.length} machine(s):`, machineIds);
        
        fetch(`${serverURL}/api/broadcast-scan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            machineId: machineNameForSSE, // Send full string (e.g., "OZNC04,OZNC06" or "OZNC09")
            sebanggo: '',
            hinban: '',
            timestamp: new Date().toISOString(),
            additionalData: {
              action: 'clear'
            }
          })
        })
        .then(response => response.json())
        .then(data => console.log('✅ SSE Clear broadcast on load successful:', data))
        .catch(error => console.error('❌ SSE Clear broadcast on load failed:', error));
      }
      
      showStep1Modal();
      return;
    }
    
    // If workflow was incomplete (step 1, 2, or 3), restart from Step 1
    if (savedStep === 1 || savedStep === 2 || savedStep === 3) {
      // Restore product details from DOM
      currentProductDetails = {
        sebanggo: subDropdown.value,
        hinban: document.getElementById('product-number')?.value || '',
        materialCode: document.getElementById('material-code')?.value || ''
      };
      
      console.log('Incomplete workflow detected (step ' + savedStep + ') - Restarting from Step 1');
      console.log('Product details:', currentProductDetails);
      
      // Always restart from Step 1 for incomplete workflows
      showStep1Modal();
    } else if (savedStep === 0) {
      // Workflow was completed (or never started) - don't show modal
      console.log('Workflow complete (step 0) - No modal shown');
    } else {
      console.log('Unknown savedStep:', savedStep);
    }
  }, 2000); // Increased timeout to 2 seconds to ensure dropdown is fully restored
});

// ==========================
// GROUPED MACHINES MANUAL SEND MODAL
// ==========================

// Function to show manual send modal (for grouped machines when auto-send fails)
function showManualSendModal(sebanggo) {
  if (!isGroupedMachinePage || Object.keys(groupedMachineIPs).length === 0) {
    console.log('Not a grouped machine page or no IPs available');
    return;
  }
  
  const modal = document.getElementById('manualSendModal');
  if (!modal) {
    console.error('Manual send modal not found in HTML');
    return;
  }
  
  const container = document.getElementById('machineLinksContainer');
  if (!container) {
    console.error('Machine links container not found');
    return;
  }
  
  // Update filename display
  const filenameDisplay = document.getElementById('manualSendFilename');
  if (filenameDisplay) {
    filenameDisplay.textContent = `${sebanggo}.pce`;
  }
  
  // Clear previous content
  container.innerHTML = '';
  
  // Create a button for each machine
  Object.entries(groupedMachineIPs).forEach(([machine, ip]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = `
      background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
      color: white;
      border: none;
      padding: 15px 30px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 16px;
      font-weight: 600;
      transition: all 0.3s;
      box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
      width: 100%;
      text-align: center;
    `;
    button.innerHTML = `
      <div style="font-size: 18px; margin-bottom: 5px;"><strong>${machine}</strong></div>
      <div style="font-size: 14px; opacity: 0.9;">IP: ${ip}</div>
    `;
    button.onmouseover = () => {
      button.style.background = 'linear-gradient(135deg, #1976D2 0%, #1565C0 100%)';
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.4)';
    };
    button.onmouseout = () => {
      button.style.background = 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)';
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 2px 8px rgba(33, 150, 243, 0.3)';
    };
    button.onclick = () => {
      const url = `http://${ip}:5000/request?filename=${sebanggo}.pce`;
      console.log(`📤 Manual send to ${machine}: ${url}`);
      const newTab = window.open(url, '_blank');
      setTimeout(() => {
        if (newTab) newTab.close();
      }, 3000);
      
      // Visual feedback
      button.style.background = '#4CAF50';
      button.innerHTML = `
        <div style="font-size: 18px; margin-bottom: 5px;"><strong>${machine}</strong></div>
        <div style="font-size: 14px;">✅ Sent!</div>
      `;
      setTimeout(() => {
        button.style.background = 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)';
        button.innerHTML = `
          <div style="font-size: 18px; margin-bottom: 5px;"><strong>${machine}</strong></div>
          <div style="font-size: 14px; opacity: 0.9;">IP: ${ip}</div>
        `;
      }, 2000);
    };
    container.appendChild(button);
  });
  
  // Show the modal
  modal.style.display = 'flex';
  console.log('✅ Manual send modal shown');
}

// Close manual send modal
const closeManualSendBtn = document.getElementById('closeManualSendModal');
if (closeManualSendBtn) {
  closeManualSendBtn.addEventListener('click', function() {
    const modal = document.getElementById('manualSendModal');
    if (modal) {
      modal.style.display = 'none';
    }
  });
}

// Close modal when clicking outside
const manualSendModal = document.getElementById('manualSendModal');
if (manualSendModal) {
  manualSendModal.addEventListener('click', function(event) {
    if (event.target === manualSendModal) {
      manualSendModal.style.display = 'none';
    }
  });
}