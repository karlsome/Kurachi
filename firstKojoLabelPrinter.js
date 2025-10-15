// === Global Variables and Initial Setup ===
const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";
const picURL = 'https://script.google.com/macros/s/AKfycbwHUW1ia8hNZG-ljsguNq8K4LTPVnB6Ng_GLXIHmtJTdUgGGd2WoiQo9ToF-7PvcJh9bA/exec';

let isHandlingScan = false; // Global flag to prevent re-entrant scan handling
let pageName = ''; // To be set on DOMContentLoaded
let currentSelectedKojo = ''; // To be set on DOMContentLoaded
let uniquePrefix = ''; // To be set on DOMContentLoaded

// Function to update uniquePrefix when factory selection might change
function updateUniquePrefix() {
    pageName = location.pathname.split('/').pop() || 'unknownPage';
    const kojoEl = document.getElementById('selected工場');
    currentSelectedKojo = kojoEl ? kojoEl.value : 'unknownKojo';
    uniquePrefix = `${pageName}_${currentSelectedKojo}_`;
}


// === Utility Functions ===
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

function showModalAlert(message, isError = true, duration = null) {
    const scanAlertModal = document.getElementById('scanAlertModal');
    const scanAlertText = document.getElementById('scanAlertText');
    const alertSound = document.getElementById('alert-sound');
    const modalTitle = scanAlertModal ? scanAlertModal.querySelector('h2') : null;
    const closeButton = document.getElementById('closeScanModalButton');


    if(scanAlertModal && scanAlertText && modalTitle && closeButton) {
        modalTitle.textContent = isError ? 'エラー (Error)' : '情報 (Info)';
        scanAlertText.innerText = message;
        scanAlertModal.style.display = 'block';
        
        if (isError && alertSound) {
            alertSound.muted = false;
            alertSound.volume = 1;
            alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
            document.body.classList.add('flash-red');
        }

        const closeAction = () => {
            scanAlertModal.style.display = 'none';
            if (isError && alertSound) {
                alertSound.pause();
                alertSound.currentTime = 0;
                alertSound.muted = true;
                document.body.classList.remove('flash-red');
            }
        };

        closeButton.onclick = closeAction;

        if (duration && typeof duration === 'number' && duration > 0) {
            setTimeout(() => {
                // Only close if the modal is still visible (user might have closed it manually)
                if (scanAlertModal.style.display === 'block') {
                    closeAction();
                }
            }, duration);
        }

    } else {
        alert(message); 
        console.warn("Modal elements not found for showModalAlert. IDs: scanAlertModal, scanAlertText, alert-sound, closeScanModalButton, h2 within modal.");
    }
}


// === Local Storage Management ===
function saveToLocalStorage(key, value) {
    if (key && uniquePrefix) { 
        localStorage.setItem(uniquePrefix + key, value);
    }
}
function getFromLocalStorage(key) {
    return uniquePrefix ? localStorage.getItem(uniquePrefix + key) : null;
}
function removeFromLocalStorage(key) {
    if (uniquePrefix && key) localStorage.removeItem(uniquePrefix + key);
}

// === Event Listeners for Input Saving ===
function setupInputSaving() {
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        const eventType = (input.type === 'checkbox' || input.type === 'radio') ? 'change' : 'input';
        input.addEventListener(eventType, () => {
            const valueToSave = (input.type === 'checkbox' || input.type === 'radio') ? input.checked : input.value;
            saveToLocalStorage(input.id || input.name, valueToSave);
        });
    });
}

// === Restore Values on Page Load ===
async function restoreValuesFromLocalStorage() {
    updateUniquePrefix(); 
    const inputs = document.querySelectorAll('input, select, textarea');
    Object.keys(localStorage).forEach(fullKey => {
        if (fullKey.startsWith(uniquePrefix)) {
            const savedValue = localStorage.getItem(fullKey);
            const inputKeyWithoutPrefix = fullKey.substring(uniquePrefix.length);
            
            inputs.forEach(input => {
                if ((input.id && input.id === inputKeyWithoutPrefix) || (input.name && input.name === inputKeyWithoutPrefix)) {
                    if (input.type === 'checkbox' || input.type === 'radio') {
                        input.checked = savedValue === 'true';
                    } else if (input.tagName === 'SELECT') {
                        setTimeout(() => { 
                            if ([...input.options].some(option => option.value === savedValue)) {
                                input.value = savedValue;
                            }
                        }, 50); 
                    } else {
                        input.value = savedValue;
                    }
                }
            });
        }
    });

    // ✅ Wait for dropdown to be populated first
    await populateSubDropdown();

    const restoredSubDropdownValue = getFromLocalStorage('sub-dropdown');
    const subDropdown = document.getElementById('sub-dropdown');
    if (subDropdown && restoredSubDropdownValue) {
        if ([...subDropdown.options].some(opt => opt.value === restoredSubDropdownValue)) {
            subDropdown.value = restoredSubDropdownValue;
            if (typeof handleScannedQR === 'function') {
                 handleScannedQR(restoredSubDropdownValue); 
            }
        } else {
            console.warn(`Restored value "${restoredSubDropdownValue}" no longer in sub-dropdown. Clearing.`);
            removeFromLocalStorage('sub-dropdown'); 
        }
    }
}


// === Dropdown Population ===
async function populateSubDropdown() {
  const subDropdown = document.getElementById('sub-dropdown');
  if (!subDropdown) {
      console.error("sub-dropdown element not found.");
      return;
  }

  const queryPayload = {
    dbName: "submittedDB",
    collectionName: "materialRequestDB",
    aggregation: [
      // { $match: { STATUS: { $ne: "Completed" } } }, // REMOVED: Now shows all items
      { $group: { _id: "$品番" } }, 
      { $sort: { _id: 1 } }, 
      { $project: { "品番": "$_id", "_id": 0 } }
    ]
  };

  try {
    const response = await fetch(`${serverURL}/queries`, { 
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(queryPayload),
    });
    if (!response.ok) throw new Error(`Failed to fetch 品番 list: ${response.statusText}`);
    const data = await response.json();
    
    const unique品番 = data.map(item => item.品番).filter(品番 => 品番 && !品番.startsWith("Z"));

    subDropdown.innerHTML = ''; 
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '品番を選択 / Select 品番';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    subDropdown.appendChild(defaultOption);
    unique品番.forEach(品番 => {
      const option = document.createElement('option');
      option.value = 品番;
      option.textContent = 品番;
      subDropdown.appendChild(option);
    });
  } catch (error) {
    console.error('Error populating 品番 dropdown:', error);
    showModalAlert("品番リストの読み込みに失敗しました。", true);
  }
}

// === Product Details Fetching ===
function blankInfo() {
  document.getElementById("材料背番号").value = "";
  document.getElementById("status").value = "";
  document.getElementById("品名").value = "";
  document.getElementById("material").value = "";
  document.getElementById("material-color").value = "";
  document.getElementById("length").value = "50"; 
  document.getElementById("order").value = "";
  document.getElementById("printTimes").value = "1";
  const printTimesDisplay = document.getElementById("printTimesDisplay");
  if (printTimesDisplay) printTimesDisplay.innerText = "1";
  document.getElementById("printStatus").value = "0 / 0";
  document.getElementById("targetProductionCount").value = "0";
  document.getElementById("SRS").value = "無し";
  const dynamicImage = document.getElementById("dynamicImage");
  if (dynamicImage) {
    dynamicImage.src = "";
    dynamicImage.style.display = 'none';
  }
  if(window.clearTakenPictures && typeof window.clearTakenPictures === 'function') {
      window.clearTakenPictures();
  }
  // ✅ Clear the selected production order
  selectedProductionOrder = null;
  // ✅ Clear special QR state
  window.currentSpecialQR = null;
}

// === Global variable to store the selected 生産順番 ===
let selectedProductionOrder = null;

// === Production Order Selection Modal Functions ===
function showProductionOrderModal(documents, 品番, sagyoubiForQuery) {
  return new Promise((resolve) => {
    console.log("📋 showProductionOrderModal called with documents:", documents);
    
    const modal = document.getElementById('productionOrderModal');
    if (!modal) {
      console.error("❌ productionOrderModal not found in HTML");
      alert("Modal not found!");
      resolve(null);
      return;
    }
    
    const modalContent = modal.querySelector('.production-order-list');
    if (!modalContent) {
      console.error("❌ production-order-list not found in modal");
      alert("Modal content not found!");
      resolve(null);
      return;
    }
    
    console.log("✅ Modal elements found, clearing content...");
    modalContent.innerHTML = '';
    
    // Sort documents by 生産順番 for better UX
    const sortedDocs = documents.sort((a, b) => {
      const orderA = parseInt(a.生産順番, 10) || 0;
      const orderB = parseInt(b.生産順番, 10) || 0;
      return orderA - orderB;
    });
    
    console.log("📊 Sorted documents:", sortedDocs.map(doc => ({ 生産順番: doc.生産順番, STATUS: doc.STATUS })));
    
    sortedDocs.forEach((doc, index) => {
      console.log(`🔘 Creating button for document ${index}:`, { 生産順番: doc.生産順番, STATUS: doc.STATUS });
      
      const button = document.createElement('button');
      button.className = 'production-order-option';
      button.style.display = 'block';
      button.style.width = '100%';
      button.style.marginBottom = '10px';
      button.style.padding = '15px';
      button.style.background = '#0174b3';
      button.style.color = 'white';
      button.style.border = '2px solid #0aa5ff';
      button.style.borderRadius = '8px';
      button.style.cursor = 'pointer';
      
      const status = doc.STATUS || "未設定";
      const statusClass = status === "Completed" ? "completed" : "active";
      
      button.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="font-weight: bold;">生産順番: ${doc.生産順番}</span>
          <span style="background: ${status === "Completed" ? "#28a745" : "#ffc107"}; color: ${status === "Completed" ? "white" : "black"}; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${status}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px;">
          <span>生産数: ${doc.生産数 || 'N/A'}</span>
          <span>納期: ${doc.納期 || 'N/A'}</span>
        </div>
      `;
      
      button.addEventListener('click', () => {
        console.log(`✅ User selected production order: ${doc.生産順番}`);
        selectedProductionOrder = doc.生産順番; // ✅ Store the selected production order
        modal.style.display = 'none';
        resolve(doc);
      });
      
      modalContent.appendChild(button);
      console.log(`✅ Button ${index} appended to modal`);
    });
    
    // Add cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'キャンセル';
    cancelButton.style.background = '#dc3545';
    cancelButton.style.color = 'white';
    cancelButton.style.border = '2px solid #dc3545';
    cancelButton.style.padding = '12px 20px';
    cancelButton.style.borderRadius = '8px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.style.marginTop = '10px';
    cancelButton.style.width = '100%';
    cancelButton.addEventListener('click', () => {
      console.log("❌ User cancelled production order selection");
      modal.style.display = 'none';
      resolve(null);
    });
    modalContent.appendChild(cancelButton);
    console.log("✅ Cancel button added");
    
    console.log("✅ Showing modal...");
    modal.style.display = 'flex';
    
    // Additional debugging
    console.log("Modal style after setting:", modal.style.display);
    console.log("Modal computed style:", window.getComputedStyle(modal).display);
    console.log("Modal content children count:", modalContent.children.length);
  });
}

async function fetchProductDetails() {
  const selected品番Value = document.getElementById("sub-dropdown").value; 
  blankInfo(); 

  if (!selected品番Value) {
    return;
  }
  
  document.getElementById("品名").value = selected品番Value; 
  saveToLocalStorage('品名', selected品番Value);

  const today = new Date();
  const yearToday = String(today.getFullYear()).slice(-2);
  const monthToday = String(today.getMonth() + 1).padStart(2, '0');
  const dayToday = String(today.getDate()).padStart(2, '0');
  const sagyoubiForQuery = `${yearToday}${monthToday}${dayToday}`;

  try {
    // ✅ First, get ALL documents matching 品番 and 作業日 (including completed ones)
    const requestQueryPayload = {
      dbName: "submittedDB",
      collectionName: "materialRequestDB",
      query: { "品番": selected品番Value, "作業日": sagyoubiForQuery }
    };
    const requestResponse = await fetch(`${serverURL}/queries`, { 
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestQueryPayload),
    });
    if (!requestResponse.ok) throw new Error(`materialRequestDB fetch failed: ${requestResponse.statusText}`);
    
    const requestData = await requestResponse.json();
    if (!Array.isArray(requestData)) {
        console.error("Received non-array requestData:", requestData);
        throw new Error("Invalid data format received for material request.");
    }
    
    let request = null;
    
    // ✅ If multiple documents found, show modal for user to choose
    if (requestData.length > 1) {
      console.log(`Found ${requestData.length} documents for 品番: ${selected品番Value}, 作業日: ${sagyoubiForQuery}`);
      console.log("Documents:", requestData.map(doc => ({ 生産順番: doc.生産順番, STATUS: doc.STATUS })));
      
      const selectedDoc = await showProductionOrderModal(requestData, selected品番Value, sagyoubiForQuery);
      if (!selectedDoc) {
        console.log("User cancelled production order selection");
        return; // User cancelled
      }
      request = selectedDoc;
    } else if (requestData.length === 1) {
      // Only one document found, use it directly
      request = requestData[0];
      selectedProductionOrder = request.生産順番; // ✅ Store the production order
    } else {
      // No documents found for today
      request = null;
      selectedProductionOrder = null; // ✅ Clear the production order
    }
    
    let matched材料品番 = request ? request.材料品番 : null;

    if (!matched材料品番 && (!request || requestData.length === 0) ) { 
        const anyRequestQuery = {
            dbName: "submittedDB", collectionName: "materialRequestDB", 
            aggregation: [ {$match: {"品番": selected品番Value}}, {$sort: {"作業日": -1}}, {$limit: 1}, {$project: {"材料品番":1, "_id":0}} ]
        };
        const anyRequestResponse = await fetch(`${serverURL}/queries`, { 
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(anyRequestQuery),
        });
        if (anyRequestResponse.ok) {
            const anyRequestData = await anyRequestResponse.json();
            if (Array.isArray(anyRequestData) && anyRequestData.length > 0 && anyRequestData[0].材料品番) {
                matched材料品番 = anyRequestData[0].材料品番;
            } else if (!Array.isArray(anyRequestData)){
                 console.error("Received non-array anyRequestData:", anyRequestData);
            }
        }
    }

    if (!matched材料品番) {
        showModalAlert(`材料品番が見つかりませんでした。品番: ${selected品番Value}`, false);
        picLINK(selected品番Value); 
        return;
    }
    
    // ✅ NEW: Query materialMasterDB2 instead of materialDB
    const materialQueryPayload = {
      dbName: "Sasaki_Coating_MasterDB", collectionName: "materialMasterDB2", query: { "品番": selected品番Value }
    };
    const materialResponse = await fetch(`${serverURL}/queries`, { 
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(materialQueryPayload),
    });
    if (!materialResponse.ok) throw new Error(`materialMasterDB2 fetch failed: ${materialResponse.statusText}`);
    
    const materialData = await materialResponse.json();
    if (!Array.isArray(materialData)) {
        console.error("Received non-array materialData:", materialData);
        throw new Error("Invalid data format received for material details.");
    }

    if (materialData.length === 0) { 
      showModalAlert(`材料DBに詳細が見つかりません。品番: ${selected品番Value}`, true);
      return;
    }

    // ✅ NEW: Use first match (materialMasterDB2 should have unique 品番)
    let material = materialData[0];
    console.log(`Using material from materialMasterDB2 for 品番: ${selected品番Value}`);

    // ✅ NEW FIELD MAPPINGS for materialMasterDB2
    document.getElementById("材料背番号").value = material.ラベル品番 || "";  // ← ラベル品番
    document.getElementById("材料品番").value = material.品番 || "";  // ← 品番
    document.getElementById("品名").value = material.品名 || "";  // ← 品名
    document.getElementById("material").value = material.構成品番 || "";  // ← 構成品番
    document.getElementById("material-color").value = material.NMOJI_色コード || "";  // ← NMOJI_色コード
    const materialLength = parseInt(material.梱包数, 10) || 50;  // ← 梱包数 (packaging quantity)
    document.getElementById("length").value = materialLength;
    document.getElementById("SRS").value = "無し"; // Default value for now

    // Update image using imageURL from materialDB
    const dynamicImage = document.getElementById("dynamicImage");
    if (dynamicImage) {
      if (material.imageURL && material.imageURL.trim() !== "") {
        dynamicImage.src = material.imageURL;
        dynamicImage.style.display = 'block';
      } else {
        dynamicImage.src = "";
        dynamicImage.style.display = 'none';
      }
    }

    if (request) {
        const statusInput = document.getElementById("status");
        if (!request.STATUS || request.STATUS.trim() === "" || request.STATUS === "加工中") {
             statusInput.value = "加工中";
        } else if (request.STATUS === "Completed") {
            statusInput.value = "完了";
        } else {
            statusInput.value = request.STATUS;
        }

        const orderNum = parseInt(request.生産順番, 10);
        const orderValForLabelText = !isNaN(orderNum) ? Math.floor(orderNum / 10) : "";
        document.getElementById("order").value = orderValForLabelText;
        
        const 生産数 = parseInt(request.生産数, 10); 
        const 梱包数 = parseInt(material.梱包数, 10); // ✅ NEW: Get 梱包数 from materialMasterDB2
        let targetForCompletion = 0; 

        // ✅ NEW CALCULATION: 生産数 / 梱包数
        if (!isNaN(生産数) && !isNaN(梱包数) && 梱包数 > 0) {
            targetForCompletion = Math.ceil(生産数 / 梱包数);
            console.log("生産数:", 生産数, "梱包数:", 梱包数, "Calculated target (生産数/梱包数):", targetForCompletion);
        } else {
            console.warn("Invalid 生産数 or 梱包数 for target calculation. Defaulting target to 0.");
        }
        
        document.getElementById("targetProductionCount").value = targetForCompletion;

        const currentPrints = parseInt(request.TotalLabelsPrintedForOrder, 10) || 0;
        document.getElementById("printStatus").value = `${currentPrints} / ${targetForCompletion}`;
        console.log(`Current prints: ${currentPrints}, Target for completion (生産数/梱包数): ${targetForCompletion}`);
        
    } else {
        document.getElementById("status").value = "本日リクエストなし";
        document.getElementById("printStatus").value = `0 / 0`;
        document.getElementById("targetProductionCount").value = "0";
        document.getElementById("order").value = ""; 
    }
  } catch (error) {
    console.error("Error in fetchProductDetails:", error);
    showModalAlert(`製品詳細の取得エラー: ${error.message}`, true);
  }
}


function picLINK(headerValue) {
  if (!headerValue) return;
  fetch(`${picURL}?link=${headerValue}`)
    .then(response => {
      if (!response.ok) throw new Error('Pic link fetch error: ' + response.statusText);
      return response.text();
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, ''); 
      updateImageSrc(cleanedData);
    })
    .catch(error => console.error('Error fetching image link:', error));
}

function updateImageSrc(link) {
  const imageElement = document.getElementById('dynamicImage');
  if (imageElement) {
    if (link && link !== "No Image Link Found" && link.toLowerCase() !== "not found") { 
        imageElement.src = `${link}&sz=s4000`; 
        imageElement.style.display = 'block';
    } else {
        imageElement.src = "";
        imageElement.style.display = 'none';
    }
  }
}

// === Date/Time Utilities ===
function setDefaultDate(input) {
  if (input && !input.value) { 
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    input.value = `${year}-${month}-${day}`;
    saveToLocalStorage(input.id || input.name, input.value);
  }
}

// === Scan Handling ===
const scanButton = document.getElementById('scan-button');
if (scanButton) {
    scanButton.addEventListener('click', () => {
        const scanOptionModal = document.getElementById('scanOptionModal');
        if (scanOptionModal) scanOptionModal.style.display = 'block';
    });
}


function startCameraScanner() {
  const qrScannerModal = document.getElementById('qrScannerModal');
  const qrReaderDiv = document.getElementById('qrReader');
  if (!qrReaderDiv || !qrScannerModal) {
      showModalAlert("QRリーダーまたはモーダル要素が見つかりません。", true);
      return;
  }
  const html5QrCode = new Html5Qrcode("qrReader");
  const scanOptionModal = document.getElementById('scanOptionModal');
  if(scanOptionModal) scanOptionModal.style.display = 'none';
  qrScannerModal.style.display = 'block';

  html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      qrCodeMessage => {
          html5QrCode.stop().then(() => {
              if(qrScannerModal) qrScannerModal.style.display = 'none';
          }).catch(err => console.error("Error stopping camera QR scanner:", err));
          if (typeof handleScannedQR === 'function') handleScannedQR(qrCodeMessage);
      }
  ).catch(err => {
      console.error("Failed to start QR scanning:", err);
      showModalAlert("QRスキャナーの起動に失敗しました。", true);
      if(qrScannerModal) qrScannerModal.style.display = 'none';
  });
  const closeQRModalButton = document.getElementById('closeQRScannerModal');
    if(closeQRModalButton) {
        closeQRModalButton.onclick = () => {
            html5QrCode.stop().then(() => {
                if(qrScannerModal) qrScannerModal.style.display = 'none';
            }).catch(err => console.error("Error stopping camera QR scanner on close:", err));
        };
    }
}

let bluetoothInputBuffer = "";
let bluetoothScannerTimeout = null;

function handleBluetoothKeyDown(event) {
    if (event.key === "Enter") {
        event.preventDefault(); 
        if (bluetoothInputBuffer.trim() !== "") {
            let cleanedQR = bluetoothInputBuffer.trim().replace(/\(/g, "*");
            console.log("Bluetooth Scanned QR Code:", cleanedQR);
            if (typeof handleScannedQR === 'function') handleScannedQR(cleanedQR);
        }
        stopBluetoothScannerListening(); 
    } else if (event.key.length === 1) { 
        bluetoothInputBuffer += event.key;
    } else if (event.key === "Tab" && bluetoothInputBuffer.trim() !== "") {
        event.preventDefault();
        let cleanedQR = bluetoothInputBuffer.trim().replace(/\(/g, "*");
        console.log("Bluetooth Scanned QR Code (via Tab):", cleanedQR);
        if (typeof handleScannedQR === 'function') handleScannedQR(cleanedQR);
        stopBluetoothScannerListening();
    }

    if (bluetoothScannerTimeout) clearTimeout(bluetoothScannerTimeout);
    if (bluetoothInputBuffer.length > 0) { 
        bluetoothScannerTimeout = setTimeout(() => {
            if (bluetoothInputBuffer.trim() !== "") { 
                console.log("Bluetooth scanner input timed out, processing buffer:", bluetoothInputBuffer);
                let cleanedQR = bluetoothInputBuffer.trim().replace(/\(/g, "*");
                if (typeof handleScannedQR === 'function') handleScannedQR(cleanedQR);
            }
            stopBluetoothScannerListening(); 
        }, 1000); 
    }
}

function startBluetoothScanner() {
  const bluetoothScannerModal = document.getElementById('bluetoothScannerModal');
  const scanOptionModal = document.getElementById('scanOptionModal');
  if(scanOptionModal) scanOptionModal.style.display = 'none';
  if(bluetoothScannerModal) bluetoothScannerModal.style.display = 'block';
  bluetoothInputBuffer = ""; 
  document.addEventListener("keydown", handleBluetoothKeyDown);
  console.log("Bluetooth scanner listening started...");
}
function stopBluetoothScannerListening() {
    document.removeEventListener("keydown", handleBluetoothKeyDown);
    if (bluetoothScannerTimeout) clearTimeout(bluetoothScannerTimeout);
    bluetoothInputBuffer = "";
    const bluetoothScannerModal = document.getElementById('bluetoothScannerModal');
    if(bluetoothScannerModal) bluetoothScannerModal.style.display = 'none';
    console.log("Bluetooth scanner listening stopped.");
}

// === Special QR Code Logic ===
function checkSpecialQRPattern(qrValue) {
  // Define the special QR patterns with wildcard support
  //kinuura label
  const specialPatterns = [
    "CNU/C2E2SB*/D/***WA8",
    "CNU/C2Z1YG*/D/***WA8", 
    "CNU/CMX70B*GD/***W48",
    "CNU/CMH70G*GD/***W48",
    "CNU/BLZ02B*GD/***W48",
    "CNU/85ULBB*GD/***W48",
    "CNU/B0474B*GD/***W*6"
  ];

  // Convert pattern to regex (escape special chars and replace * with .)
  function patternToRegex(pattern) {
    // Escape special regex characters except *
    let escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Replace * with . to match any single character
    escaped = escaped.replace(/\*/g, '.');
    // Return as regex with ^ and $ for exact match
    return new RegExp(`^${escaped}$`);
  }

  // Check if QR matches any special pattern
  for (const pattern of specialPatterns) {
    const regex = patternToRegex(pattern);
    if (regex.test(qrValue)) {
      console.log(`Special QR pattern matched: ${pattern} -> ${qrValue}`);
      return true;
    }
  }
  return false;
}

async function handleSpecialQR(qrCodeMessage) {
  console.log("Processing special QR code:", qrCodeMessage);
  
  try {
    // ✅ STEP 1: First check materialRequestDB (same as normal flow)
    const today = new Date();
    const yearToday = String(today.getFullYear()).slice(-2);
    const monthToday = String(today.getMonth() + 1).padStart(2, '0');
    const dayToday = String(today.getDate()).padStart(2, '0');
    const sagyoubiForQuery = `${yearToday}${monthToday}${dayToday}`;

    // Look for the special QR code as 品番 in materialRequestDB
    const requestQueryPayload = {
      dbName: "submittedDB",
      collectionName: "materialRequestDB",
      query: { "品番": qrCodeMessage, "作業日": sagyoubiForQuery }
    };
    
    const requestResponse = await fetch(`${serverURL}/queries`, { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify(requestQueryPayload),
    });
    
    if (!requestResponse.ok) {
      throw new Error(`materialRequestDB fetch failed: ${requestResponse.statusText}`);
    }
    
    const requestData = await requestResponse.json();
    if (!Array.isArray(requestData)) {
      console.error("Received non-array requestData:", requestData);
      throw new Error("Invalid data format received for material request.");
    }

    let request = null;
    let matched材料品番 = null;

    // ✅ STEP 2: Handle multiple requests (same logic as normal flow)
    if (requestData.length > 1) {
      console.log(`Found ${requestData.length} documents for special QR: ${qrCodeMessage}, 作業日: ${sagyoubiForQuery}`);
      const selectedDoc = await showProductionOrderModal(requestData, qrCodeMessage, sagyoubiForQuery);
      if (!selectedDoc) {
        console.log("User cancelled production order selection");
        return false;
      }
      request = selectedDoc;
      selectedProductionOrder = request.生産順番;
      matched材料品番 = request.材料品番;
    } else if (requestData.length === 1) {
      request = requestData[0];
      selectedProductionOrder = request.生産順番;
      matched材料品番 = request.材料品番;
    } else {
      // No requests found for today, try to get most recent one
      selectedProductionOrder = null;
      const anyRequestQuery = {
        dbName: "submittedDB", 
        collectionName: "materialRequestDB", 
        aggregation: [ 
          {$match: {"品番": qrCodeMessage}}, 
          {$sort: {"作業日": -1}}, 
          {$limit: 1}, 
          {$project: {"材料品番":1, "_id":0}} 
        ]
      };
      const anyRequestResponse = await fetch(`${serverURL}/queries`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(anyRequestQuery),
      });
      if (anyRequestResponse.ok) {
        const anyRequestData = await anyRequestResponse.json();
        if (Array.isArray(anyRequestData) && anyRequestData.length > 0 && anyRequestData[0].材料品番) {
          matched材料品番 = anyRequestData[0].材料品番;
        }
      }
    }

    // ✅ STEP 3: Fetch from materialMasterDB2 using 品番 matching QR code
    console.log("Fetching material from materialMasterDB2 for special QR:", qrCodeMessage);
    const specialMaterialQuery = {
      dbName: "Sasaki_Coating_MasterDB", 
      collectionName: "materialMasterDB2", 
      query: { "品番": qrCodeMessage }
    };
    
    const specialResponse = await fetch(`${serverURL}/queries`, { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify(specialMaterialQuery),
    });
    
    if (!specialResponse.ok) {
      throw new Error(`Special materialMasterDB2 fetch failed: ${specialResponse.statusText}`);
    }
    
    const specialData = await specialResponse.json();
    if (!Array.isArray(specialData) || specialData.length === 0) {
      showModalAlert(`特殊QRコードに対応する材料が見つかりません: ${qrCodeMessage}`, true);
      return false;
    }
    
    // Use the first match from materialMasterDB2
    const specialQRMaterial = specialData[0];
    console.log("Found material in materialMasterDB2 for special QR:", specialQRMaterial);

    // ✅ STEP 5: Populate form fields using materialMasterDB2 data
    document.getElementById("材料背番号").value = specialQRMaterial.ラベル品番 || "";  // ← ラベル品番
    document.getElementById("材料品番").value = specialQRMaterial.品番 || "";  // ← 品番 (the QR value)
    document.getElementById("品名").value = specialQRMaterial.品名 || "";  // ← 品名
    document.getElementById("material").value = specialQRMaterial.構成品番 || "";  // ← 構成品番
    document.getElementById("material-color").value = specialQRMaterial.NMOJI_色コード || "";  // ← NMOJI_色コード
    const materialLength = parseInt(specialQRMaterial.梱包数, 10) || 50;  // ← 梱包数 (packaging quantity)
    document.getElementById("length").value = materialLength;
    document.getElementById("SRS").value = "無し"; // Default value

    // Handle image using imageURL from materialMasterDB2
    const dynamicImage = document.getElementById("dynamicImage");
    if (dynamicImage) {
      if (specialQRMaterial.imageURL && specialQRMaterial.imageURL.trim() !== "") {
        dynamicImage.src = specialQRMaterial.imageURL;
        dynamicImage.style.display = 'block';
      } else {
        dynamicImage.src = "";
        dynamicImage.style.display = 'none';
      }
    }

    // ✅ STEP 6: Handle request data with new calculation
    if (request) {
      const statusInput = document.getElementById("status");
      if (!request.STATUS || request.STATUS.trim() === "" || request.STATUS === "加工中") {
        statusInput.value = "加工中";
      } else if (request.STATUS === "Completed") {
        statusInput.value = "完了";
      } else {
        statusInput.value = request.STATUS;
      }

      const orderNum = parseInt(request.生産順番, 10);
      const orderValForLabelText = !isNaN(orderNum) ? Math.floor(orderNum / 10) : "";
      document.getElementById("order").value = orderValForLabelText;
      
      const 生産数 = parseInt(request.生産数, 10);
      const 梱包数 = parseInt(specialQRMaterial.梱包数, 10); // ✅ NEW: Get 梱包数 from materialMasterDB2
      let targetForCompletion = 0;

      // ✅ NEW CALCULATION: 生産数 / 梱包数
      if (!isNaN(生産数) && !isNaN(梱包数) && 梱包数 > 0) {
        targetForCompletion = Math.ceil(生産数 / 梱包数);
        console.log("Special QR - 生産数:", 生産数, "梱包数:", 梱包数, "Target:", targetForCompletion);
      }
      
      document.getElementById("targetProductionCount").value = targetForCompletion;
      const currentPrints = parseInt(request.TotalLabelsPrintedForOrder, 10) || 0;
      document.getElementById("printStatus").value = `${currentPrints} / ${targetForCompletion}`;
    } else {
      document.getElementById("status").value = "本日リクエストなし";
      document.getElementById("printStatus").value = `0 / 0`;
      document.getElementById("targetProductionCount").value = "0";
      document.getElementById("order").value = "";
    }

    // ✅ Add the special QR value to dropdown and select it
    const subDropdown = document.getElementById('sub-dropdown');
    if (subDropdown && qrCodeMessage) {
      const existingOption = Array.from(subDropdown.options).find(opt => opt.value === qrCodeMessage);
      
      if (!existingOption) {
        const newOption = document.createElement('option');
        newOption.value = qrCodeMessage;
        newOption.textContent = `${qrCodeMessage} (特殊QR)`;
        subDropdown.appendChild(newOption);
      }
      
      subDropdown.value = qrCodeMessage;
      saveToLocalStorage('sub-dropdown', qrCodeMessage);
    }

    // ✅ Store the special QR flag for printing with materialMasterDB2 data
    console.log("Special QR material data from materialMasterDB2:", {
      品番: specialQRMaterial.品番,
      お客様品番: specialQRMaterial.お客様品番,
      品名: specialQRMaterial.品名,
      ラベル品番: specialQRMaterial.ラベル品番,
      構成品番: specialQRMaterial.構成品番,
      梱包数: specialQRMaterial.梱包数
    });
    
    window.currentSpecialQR = {
      isSpecial: true,
      qrValue: qrCodeMessage,
      materialData: specialQRMaterial,
      requestData: request // Store the request data as well
    };

    showModalAlert(`特殊QRコード処理完了: ${qrCodeMessage}`, false, 3000);
    return true;

  } catch (error) {
    console.error("Error in handleSpecialQR:", error);
    showModalAlert(`特殊QRコード処理エラー: ${error.message}`, true);
    return false;
  }
}


async function handleScannedQR(qrCodeMessage) {
  if (isHandlingScan) {
    console.warn("Scan handling already in progress. Ignoring new scan:", qrCodeMessage);
    return;
  }
  isHandlingScan = true;
  console.log("Handling Scanned QR:", qrCodeMessage);

  try {
    // ✅ CHECK FOR SPECIAL QR PATTERNS FIRST
    if (checkSpecialQRPattern(qrCodeMessage)) {
      console.log("Special QR pattern detected, processing with normal flow but special printing...");
      const success = await handleSpecialQR(qrCodeMessage);
      return; // Special QR uses its own complete flow
    }

    // ✅ NORMAL QR PROCESSING (existing logic)
    const subDropdown = document.getElementById('sub-dropdown');
    if (!subDropdown) {
        console.error("sub-dropdown not found");
        return;
    }
    
    if (subDropdown.options.length <= 1 || ![...subDropdown.options].map(o => o.value).includes(qrCodeMessage)) {
        console.log("Populating dropdown or scanned value not found, re-populating...");
        await populateSubDropdown(); 
    }
    const options = [...subDropdown.options].map(option => option.value);

    if (!options.includes(qrCodeMessage)) {
      showModalAlert(`品番 "${qrCodeMessage}" はリストにありません。(品番 "${qrCodeMessage}" is not in the list.)`, true);
      return;
    }
    
    // Clear any previous special QR data
    window.currentSpecialQR = null;
    
    if (subDropdown.value !== qrCodeMessage) {
      subDropdown.value = qrCodeMessage;
      saveToLocalStorage('sub-dropdown', qrCodeMessage);
    }
    await fetchProductDetails(); 
    
  } catch (error) {
    console.error("Error in handleScannedQR:", error);
    showModalAlert(`スキャン処理エラー: ${error.message}`, true);
  } finally {
    isHandlingScan = false;
  }
}

// === Print Logic ===
function showPrintConfirmationModal() {
  const selectedValue = document.getElementById('sub-dropdown')?.value;
  const 品名Value = document.getElementById('品名')?.value;
  const statusValue = document.getElementById('status')?.value;
  const printTimesDisplay = document.getElementById('printTimesDisplay');
  const printTimesInput = document.getElementById('printTimes');
  const targetCountInput = document.getElementById('targetProductionCount');
  const printConfirmationModal = document.getElementById('printConfirmationModal');
  const currentPrintedEl = document.getElementById("printStatus");
  const orderValue = document.getElementById("order")?.value;

  console.log(orderValue, "Order Value for print confirmation modal");
  
  // ✅ Check for special QR case or regular dropdown selection
  const isSpecialQR = window.currentSpecialQR && window.currentSpecialQR.isSpecial;
  if (!selectedValue && !isSpecialQR) {
    showModalAlert('品番を選択してください。(Please select a 品番.)', true);
    return;
  }
  
  // ✅ For special QR, ensure we have 品名 filled
  if (isSpecialQR && !品名Value) {
    showModalAlert('特殊QRコードの品名が設定されていません。', true);
    return;
  }
  if (statusValue === "完了" || statusValue === "Completed") {
    showModalAlert('この品番は既に完了しています。印刷はできません。(This item is already completed. Printing not allowed.)', false);
    return;
  }
   if (statusValue === "本日リクエストなし") {
    // Log what the values would have been if printing was allowed
    console.log("=== NO WORK REQUEST FOR TODAY - POTENTIAL PRINT VALUES ===");
    
    // Get all the form values that would be used for printing
    const potentialPrintValues = {
      品番: document.getElementById("品番")?.value || "",
      材料背番号: document.getElementById("材料背番号")?.value || "",
      品名: document.getElementById("品名")?.value || "",
      色: document.getElementById("material-color")?.value || "",
      length: document.getElementById("length")?.value || "",
      収容数: document.getElementById("order")?.value || "",
      isSpecialQR: window.currentSpecialQR && window.currentSpecialQR.isSpecial
    };
    
    // If this is a special QR code, add more detailed information
    if (window.currentSpecialQR && window.currentSpecialQR.isSpecial) {
      const specialMaterial = window.currentSpecialQR.materialData;
      
      console.log("Special QR values that would be used (if allowed to print):", {
        // Standard form fields
        formValues: potentialPrintValues,
        
        // Special QR specific details
        specialQR: {
          qrValue: window.currentSpecialQR.qrValue,
          お客様品番: specialMaterial.お客様品番 || "未設定",
          品名: specialMaterial.品名 || "",
          材料背番号: specialMaterial.材料背番号 || "",
          length: specialMaterial.length || "",
          色: specialMaterial.色 || ""
        },
        
        // How the print fields would be constructed
        potentialPrintFields: {
          品番: specialMaterial.お客様品番 || window.currentSpecialQR.qrValue || potentialPrintValues.品番,
          背番号: specialMaterial.品名 || "",
          収容数: "N/A (No 生産順番 available without today's request)",
          色: specialMaterial.色 || potentialPrintValues.色,
          barcode: specialMaterial.お客様品番 || window.currentSpecialQR.qrValue || potentialPrintValues.品番
        }
      });
      
      // Generate a sample of what the URL would have looked like
      const sampleFilename = "kinuuraLabel.lbx";
      const sampleLotNo = "SAMPLE-LOT";
      const sampleURL = `http://localhost:8088/print?filename=${encodeURIComponent(sampleFilename)}&size=RollW62&copies=1` +
        `&text_品番=${encodeURIComponent(specialMaterial.お客様品番 || window.currentSpecialQR.qrValue || "")}` +
        `&text_背番号=${encodeURIComponent(specialMaterial.品名 || "")}` +
        `&text_収容数=N/A&text_色=${encodeURIComponent(specialMaterial.色 || "")}` +
        `&text_DateT=${encodeURIComponent(sampleLotNo)}&barcode_barcode=${encodeURIComponent(specialMaterial.お客様品番 || window.currentSpecialQR.qrValue || "")}`;
        
      console.log("Sample URL that would have been generated:", sampleURL);
    } else {
      console.log("Regular (non-Special QR) values that would be used (if allowed to print):", potentialPrintValues);
    }
    
    showModalAlert('本日の作業リクエストがありません。印刷はできません。(No work request for today. Printing not allowed.)', false);
    return;
  }

  if(printTimesDisplay && printTimesInput && targetCountInput && printConfirmationModal && currentPrintedEl) {
    const targetForCompletion = parseInt(targetCountInput.value, 10); 
    const currentPrinted = parseInt(currentPrintedEl.value.split(' / ')[0], 10) || 0;
    
    let defaultPrintQty = 1; 

    if (!isNaN(targetForCompletion) && targetForCompletion > 0) {
        defaultPrintQty = targetForCompletion - currentPrinted;
        if (defaultPrintQty <= 0) { 
            defaultPrintQty = targetForCompletion; 
        }
    }
    defaultPrintQty = Math.max(1, defaultPrintQty); 


    printTimesInput.value = defaultPrintQty;
    printTimesDisplay.innerText = defaultPrintQty;
    saveToLocalStorage('printTimes', defaultPrintQty); 
    printConfirmationModal.style.display = 'block';
  } else {
      console.error("One or more elements for print confirmation modal are missing.");
      showModalAlert("印刷確認の準備に失敗しました。", true);
  }
}

function incrementPrintTimes() {
  const printTimesInput = document.getElementById('printTimes');
  const printTimesDisplay = document.getElementById('printTimesDisplay');
  if(!printTimesInput || !printTimesDisplay) return;

  let currentCopies = parseInt(printTimesInput.value, 10) || 0;
  currentCopies++;
  printTimesInput.value = currentCopies;
  printTimesDisplay.innerText = currentCopies;
  saveToLocalStorage('printTimes', currentCopies);
}

function decrementPrintTimes() {
  const printTimesInput = document.getElementById('printTimes');
  const printTimesDisplay = document.getElementById('printTimesDisplay');
  if(!printTimesInput || !printTimesDisplay) return;

  let currentCopies = parseInt(printTimesInput.value, 10) || 1;
  if (currentCopies > 1) currentCopies--;
  printTimesInput.value = currentCopies;
  printTimesDisplay.innerText = currentCopies;
  saveToLocalStorage('printTimes', currentCopies);
}

function confirmPrint() {
    
  const printConfirmationModal = document.getElementById('printConfirmationModal');
  const printingStatusModal = document.getElementById('printingStatusModal');
  if(printConfirmationModal) printConfirmationModal.style.display = 'none';
  if(printingStatusModal) printingStatusModal.style.display = 'block';
  if(typeof printLabel === 'function') printLabel();
}


//this is good printing but not include logs per print
// async function printLabel() {
//   const printingStatusModal = document.getElementById('printingStatusModal');
//   const printCompletionModal = document.getElementById('printCompletionModal');
  
//   const 材料背番号 = document.getElementById("材料背番号")?.value || "";
//   const 品番 = document.getElementById("品名")?.value; 
//   const 色 = document.getElementById("material-color")?.value || "";
//   const length = document.getElementById("length")?.value || "50";
//   const orderVal = document.getElementById("order")?.value || ""; 
//   const copiesToPrintNow = parseInt(document.getElementById("printTimes")?.value, 10) || 1;

//   if (!品番) { 
//     showModalAlert('品番が選択されていません。(Product Number is not selected.)', true);
//     if(printingStatusModal) printingStatusModal.style.display = 'none';
//     return;
//   }
//    if (!材料背番号 && 品番) {
//        console.warn("材料背番号 is missing, using 品番 for barcode part 1 if needed.");
//    }


//   const storageKey = `${uniquePrefix}${品番}_printData`; 
//   const lotDateInputElement = document.getElementById('Lot No.');
//   if (!lotDateInputElement) {
//       showModalAlert('日付入力フィールドが見つかりません。', true);
//       if(printingStatusModal) printingStatusModal.style.display = 'none';
//       return;
//   }
//   const lotDateInput = lotDateInputElement.value; 
//   const dateParts = lotDateInput.split("-");
//   if (dateParts.length < 3) {
//       showModalAlert('日付の形式が無効です。YYYY-MM-DD形式で入力してください。', true);
//       if(printingStatusModal) printingStatusModal.style.display = 'none';
//       return;
//   }
//   const sagyoubi_yyMMdd = `${dateParts[0].slice(-2)}${dateParts[1]}${dateParts[2]}`;

//   let printSessionData = JSON.parse(localStorage.getItem(storageKey)) || { date: sagyoubi_yyMMdd, extension: 0 };
//   if (printSessionData.date !== sagyoubi_yyMMdd) { 
//     printSessionData = { date: sagyoubi_yyMMdd, extension: 0 };
//   }

//   const ua = navigator.userAgent.toLowerCase();
//   const isIOS = /iphone|ipad|ipod/.test(ua);
//   let printedLotNumbers = [];
//   let printSuccessCount = 0;

//   for (let i = 1; i <= copiesToPrintNow; i++) {
//     printSessionData.extension++;
//     const currentExtension = printSessionData.extension;
//     const currentLotNo = `${sagyoubi_yyMMdd}-${currentExtension}`;
//     printedLotNumbers.push(currentLotNo);

//     const barcodeValuePart1 = 材料背番号 || 品番; 
//     const barcodeFullValue = `${barcodeValuePart1},${currentLotNo},${length}`;

//     let filename = "";
//     const srsStatusElement = document.getElementById("SRS");
//     const srsStatus = srsStatusElement ? srsStatusElement.value : "無し";

//     if (srsStatus === "有り") filename = "SRS3.lbx";
//     else if (材料背番号 === "NC2") filename = "NC21.lbx"; 
//     else filename = "firstkojo3.lbx";
    
//     let url = "";
//     if (isIOS) {
//       url = `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=RollW62&copies=1` +
//             `&text_品番=${encodeURIComponent(品番)}` +
//             `&text_背番号=${encodeURIComponent(材料背番号)}` + 
//             `&text_収容数=${encodeURIComponent(orderVal)}` + 
//             `&text_色=${encodeURIComponent(色)}` +
//             `&text_DateT=${encodeURIComponent(currentLotNo)}` +
//             `&barcode_barcode=${encodeURIComponent(barcodeFullValue)}`;
//       console.log(`[iOS] Attempting print via URL scheme: ${i}/${copiesToPrintNow}`);
//       window.location.href = url; 
//       printSuccessCount++; 
//       if (i < copiesToPrintNow) await new Promise(resolve => setTimeout(resolve, 3500)); 
//     } else { 
//       url = `http://localhost:8088/print?filename=${encodeURIComponent(filename)}&size=RollW62&copies=1` +
//             `&text_品番=${encodeURIComponent(品番)}` +
//             `&text_背番号=${encodeURIComponent(材料背番号)}` +
//             `&text_収容数=${encodeURIComponent(orderVal)}` +
//             `&text_色=${encodeURIComponent(色)}` +
//             `&text_DateT=${encodeURIComponent(currentLotNo)}` +
//             `&barcode_barcode=${encodeURIComponent(barcodeFullValue)}`;
//       console.log(`[Desktop/Android] Print ${i}/${copiesToPrintNow}:`, url);
//       try {
//         const response = await Promise.race([
//           fetch(url).then(res => res.text()),
//           new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 700000))
//         ]);
//         if (response.includes("<result>SUCCESS</result>")) {
//           console.log(`Print ${i} successful.`);
//           printSuccessCount++;
//         } else {
//           throw new Error(response.includes("PrinterStatusErrorCoverOpen") ? "Printer Cover Open" : "Printer Error: " + response.substring(0, 100));
//         }
//         if (i < copiesToPrintNow) await new Promise(resolve => setTimeout(resolve, 1500)); 
//       } catch (error) {
//         showModalAlert(`印刷エラー (${i}/${copiesToPrintNow}): ${error.message}`, true);
//         if(printingStatusModal) printingStatusModal.style.display = 'none';
//         localStorage.setItem(storageKey, JSON.stringify(printSessionData)); 
//         return; 
//       }
//     }
//   }

//   localStorage.setItem(storageKey, JSON.stringify(printSessionData)); 

//   if (printSuccessCount > 0) {
//     const imagesToSubmit = (typeof window.getTakenPictures === 'function') ? window.getTakenPictures() : [];
//     await updateMongoDBAfterPrint(品番, sagyoubi_yyMMdd, printedLotNumbers, imagesToSubmit, printSuccessCount);
//   }

//   if(printingStatusModal) printingStatusModal.style.display = 'none';
//   if (printSuccessCount === copiesToPrintNow || (printSuccessCount > 0 && isIOS)) {
//     if(printCompletionModal) printCompletionModal.style.display = 'block';
//     if (isIOS && printSuccessCount < copiesToPrintNow) {
//         showModalAlert(`${printSuccessCount}件のラベル印刷を開始しました。(Initiated printing for ${printSuccessCount} labels. Please check Brother app for remaining.)`, false);
//     }
//   }
//   if(typeof fetchProductDetails === 'function') await fetchProductDetails(); 
// }




// //added log per print to mongoDB
// async function printLabel() {
//   const printingStatusModal = document.getElementById('printingStatusModal');
//   const printCompletionModal = document.getElementById('printCompletionModal');

//   const 材料背番号 = document.getElementById("材料背番号")?.value || "";
//   const 品番 = document.getElementById("品名")?.value;
//   const 色 = document.getElementById("material-color")?.value || "";
//   const length = document.getElementById("length")?.value || "50";
//   const orderVal = document.getElementById("order")?.value || "";
//   const copiesToPrintNow = parseInt(document.getElementById("printTimes")?.value, 10) || 1;

//   if (!品番) {
//     showModalAlert('品番が選択されていません。(Product Number is not selected.)', true);
//     if (printingStatusModal) printingStatusModal.style.display = 'none';
//     return;
//   }

//   const storageKey = `${uniquePrefix}${品番}_printData`;
//   const lotDateInputElement = document.getElementById('Lot No.');
//   if (!lotDateInputElement) {
//     showModalAlert('日付入力フィールドが見つかりません。', true);
//     if (printingStatusModal) printingStatusModal.style.display = 'none';
//     return;
//   }

//   const lotDateInput = lotDateInputElement.value;
//   const dateParts = lotDateInput.split("-");
//   if (dateParts.length < 3) {
//     showModalAlert('日付の形式が無効です。YYYY-MM-DD形式で入力してください。', true);
//     if (printingStatusModal) printingStatusModal.style.display = 'none';
//     return;
//   }

//   const sagyoubi_yyMMdd = `${dateParts[0].slice(-2)}${dateParts[1]}${dateParts[2]}`;
//   let printSessionData = JSON.parse(localStorage.getItem(storageKey)) || { date: sagyoubi_yyMMdd, extension: 0 };
//   if (printSessionData.date !== sagyoubi_yyMMdd) {
//     printSessionData = { date: sagyoubi_yyMMdd, extension: 0 };
//     localStorage.setItem(storageKey, JSON.stringify(printSessionData));
//   }

//   const ua = navigator.userAgent.toLowerCase();
//   const isIOS = /iphone|ipad|ipod/.test(ua);
//   let printedLotNumbers = [];
//   let printSuccessCount = 0;

//   for (let i = 1; i <= copiesToPrintNow; i++) {
//     printSessionData.extension++;
//     const currentExtension = printSessionData.extension;
//     const currentLotNo = `${sagyoubi_yyMMdd}-${currentExtension}`;
//     printedLotNumbers.push(currentLotNo);
//     const barcodeValuePart1 = 材料背番号 || 品番;
//     const barcodeFullValue = `${barcodeValuePart1},${currentLotNo},${length}`;
//     const srsStatus = document.getElementById("SRS")?.value;
//     let filename = srsStatus === "有り" ? "SRS3.lbx" : (材料背番号 === "NC2" ? "NC21.lbx" : "firstkojo3.lbx");

//     if (isIOS) {
//       const url = `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=RollW62&copies=1` +
//         `&text_品番=${encodeURIComponent(品番)}&text_背番号=${encodeURIComponent(材料背番号)}` +
//         `&text_収容数=${encodeURIComponent(orderVal)}&text_色=${encodeURIComponent(色)}` +
//         `&text_DateT=${encodeURIComponent(currentLotNo)}&barcode_barcode=${encodeURIComponent(barcodeFullValue)}`;
//       window.location.href = url;
//       printSuccessCount++;
//       await new Promise(resolve => setTimeout(resolve, 3500));
//     } else {
//       const url = `http://localhost:8088/print?filename=${encodeURIComponent(filename)}&size=RollW62&copies=1` +
//         `&text_品番=${encodeURIComponent(品番)}&text_背番号=${encodeURIComponent(材料背番号)}` +
//         `&text_収容数=${encodeURIComponent(orderVal)}&text_色=${encodeURIComponent(色)}` +
//         `&text_DateT=${encodeURIComponent(currentLotNo)}&barcode_barcode=${encodeURIComponent(barcodeFullValue)}`;
//       try {
//         const response = await Promise.race([
//           fetch(url).then(res => res.text()),
//           new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 7000))
//         ]);
//         if (response.includes("<result>SUCCESS</result>")) {
//           printSuccessCount++;
//           localStorage.setItem(storageKey, JSON.stringify(printSessionData));

//           // ✅ Log to MongoDB immediately WITHOUT image
//           await updateMongoDBAfterPrint(品番, sagyoubi_yyMMdd, [currentLotNo], [], 1);
//         } else {
//           throw new Error(response.includes("PrinterStatusErrorCoverOpen") ? "Printer Cover Open" : "Printer Error: " + response.substring(0, 100));
//         }
//         await new Promise(resolve => setTimeout(resolve, 1500));
//       } catch (error) {
//         showModalAlert(`印刷エラー (${i}/${copiesToPrintNow}): ${error.message}`, true);
//         if (printingStatusModal) printingStatusModal.style.display = 'none';
//         return;
//       }
//     }
//   }

//   // ✅ Upload images only if all prints succeeded and platform is Android
//   if (printSuccessCount === copiesToPrintNow) {
//     const imagesToSubmit = (typeof window.getTakenPictures === 'function') ? window.getTakenPictures() : [];
//     if (!isIOS && imagesToSubmit.length > 0) {
//       await updateMongoDBAfterPrint(品番, sagyoubi_yyMMdd, [], imagesToSubmit, 0);
//     }
//   }

//   if (printingStatusModal) printingStatusModal.style.display = 'none';

//   if (printSuccessCount === copiesToPrintNow || (printSuccessCount > 0 && isIOS)) {
//     if (printCompletionModal) printCompletionModal.style.display = 'block';
//     if (isIOS && printSuccessCount < copiesToPrintNow) {
//       showModalAlert(`${printSuccessCount}件のラベル印刷を開始しました。(Initiated printing for ${printSuccessCount} labels. Please check Brother app for remaining.)`, false);
//     }
//   }

//   if (typeof fetchProductDetails === 'function') await fetchProductDetails();
// }


async function printLabel() {
  console.log("===== PRINT LABEL PROCESS STARTED =====");
  
  const printingStatusModal = document.getElementById('printingStatusModal');
  const printCompletionModal = document.getElementById('printCompletionModal');

  const 材料背番号 = document.getElementById("材料背番号")?.value || "";
  const 品番 = document.getElementById("品名")?.value;
  const 色 = document.getElementById("material-color")?.value || "";
  const length = document.getElementById("length")?.value || "50";
  const orderVal = document.getElementById("order")?.value || "";
  const copiesToPrintNow = parseInt(document.getElementById("printTimes")?.value, 10) || 1;
  
  console.log("Print preparation values:", {
    材料背番号: 材料背番号,
    品番: 品番,
    色: 色,
    length: length,
    orderVal: orderVal,
    copiesToPrintNow: copiesToPrintNow,
    isSpecialQR: window.currentSpecialQR && window.currentSpecialQR.isSpecial,
    specialQRData: window.currentSpecialQR ? {
      qrValue: window.currentSpecialQR.qrValue,
      hasRequestData: !!window.currentSpecialQR.requestData
    } : null
  });

  if (!品番) {
    showModalAlert('品番が選択されていません。(Product Number is not selected.)', true);
    console.log("Print cancelled: No 品番 selected");
    if (printingStatusModal) printingStatusModal.style.display = 'none';
    return;
  }

  // ✅ Handle storage key for special QR vs normal flow
  const isSpecialQR = window.currentSpecialQR && window.currentSpecialQR.isSpecial;
  const storageKey = isSpecialQR 
    ? `${uniquePrefix}${品番}_specialQR_printData`
    : `${uniquePrefix}${品番}_${selectedProductionOrder || 'default'}_printData`;
  const lotDateInputElement = document.getElementById('Lot No.');
  if (!lotDateInputElement) {
    showModalAlert('日付入力フィールドが見つかりません。', true);
    if (printingStatusModal) printingStatusModal.style.display = 'none';
    return;
  }

  const lotDateInput = lotDateInputElement.value;
  const dateParts = lotDateInput.split("-");
  if (dateParts.length < 3) {
    showModalAlert('日付の形式が無効です。YYYY-MM-DD形式で入力してください。', true);
    if (printingStatusModal) printingStatusModal.style.display = 'none';
    return;
  }

  const sagyoubi_yyMMdd = `${dateParts[0].slice(-2)}${dateParts[1]}${dateParts[2]}`;
  let printSessionData = JSON.parse(localStorage.getItem(storageKey)) || { date: sagyoubi_yyMMdd, extension: 0 };
  if (printSessionData.date !== sagyoubi_yyMMdd) {
    printSessionData = { date: sagyoubi_yyMMdd, extension: 0 };
  }

  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  let successfullyPrintedLotNumbers = []; // Store successfully printed lots here
  let printSuccessCount = 0;

  for (let i = 1; i <= copiesToPrintNow; i++) {
    const currentExtension = printSessionData.extension + 1; // Tentative extension
    const currentLotNo = `${sagyoubi_yyMMdd}-${currentExtension}`;
    
    // ✅ CHECK FOR SPECIAL QR LOGIC
    const isSpecialQR = window.currentSpecialQR && window.currentSpecialQR.isSpecial;
    let filename, printFields, barcodeFullValue;
    
    if (isSpecialQR) {
      // ✅ SPECIAL QR PRINTING LOGIC using materialMasterDB2
      console.log("Using special QR printing logic with kinuuraLabel.lbx");
      filename = "kinuuraLabel.lbx";
      
      const specialMaterial = window.currentSpecialQR.materialData;
      const requestData = window.currentSpecialQR.requestData;
      
      // Debug the material structure from materialMasterDB2
      console.log("Special material for printing (materialMasterDB2):", {
        品番: specialMaterial.品番,
        お客様品番: specialMaterial.お客様品番,
        品名: specialMaterial.品名,
        ラベル品番: specialMaterial.ラベル品番,
        構成品番: specialMaterial.構成品番,
        NMOJI_色コード: specialMaterial.NMOJI_色コード,
        基材長: specialMaterial.基材長,
        梱包数: specialMaterial.梱包数
      });
      
      // Debug request data status
      console.log("Request data for special QR:", {
        hasRequest: !!requestData,
        requestData: requestData ? {
          生産順番: requestData.生産順番,
          作業日: requestData.作業日,
          STATUS: requestData.STATUS
        } : "No request found for today"
      });

      // Calculate 収容数 from request's 生産順番 divided by 10 if available
      let calculatedCapacity = length; // Default to regular length
      if (requestData && requestData.生産順番) {
        const orderNum = parseInt(requestData.生産順番, 10);
        if (!isNaN(orderNum)) {
          calculatedCapacity = Math.floor(orderNum / 10);
          console.log(`Calculated 収容数 from 生産順番 (${requestData.生産順番}): ${calculatedCapacity}`);
        }
      }
      
      // ✅ NEW FIELD MAPPINGS for materialMasterDB2
      printFields = {
        品番: specialMaterial.お客様品番 || specialMaterial.品番 || 品番,  // ← お客様品番 (or fallback to 品番)
        背番号: specialMaterial.品名 || "",  // ← 品名
        収容数: calculatedCapacity,  // ← 生産順番 / 10
        色: specialMaterial.NMOJI_色コード || 色,  // ← NMOJI_色コード
      };
      
      // Log the final printFields to verify
      console.log("Final printFields for special QR:", {
        品番: printFields.品番,
        背番号: printFields.背番号,
        収容数: printFields.収容数,
        色: printFields.色,
        source: {
          品番Source: specialMaterial.お客様品番 ? "お客様品番" : "品番",
          背番号Source: "品名",
          色Source: "NMOJI_色コード",
          収容数Source: requestData && requestData.生産順番 ? "生産順番/10" : "Default length"
        }
      });
      
      // ✅ For special QR: barcode is the お客様品番
      barcodeFullValue = specialMaterial.お客様品番 || specialMaterial.品番 || 品番;
      console.log("Barcode value for special QR:", barcodeFullValue);
      
      console.log("Special QR print fields:", printFields);
    } else {
      // ✅ NORMAL PRINTING LOGIC (existing)
      const barcodeValuePart1 = 材料背番号 || 品番;
      barcodeFullValue = `${barcodeValuePart1},${currentLotNo},${length}`;
      const srsStatus = document.getElementById("SRS")?.value;
      filename = srsStatus === "有り" ? "SRS3.lbx" : (材料背番号 === "NC2" ? "NC21.lbx" : "firstkojo3.lbx");
      
      printFields = {
        品番: 品番,
        背番号: 材料背番号,
        収容数: orderVal,
        色: 色,
        barcode: barcodeFullValue
      };
    }

    let wasSuccessful = false;
    
    // Check if we have a request for today's date (important for no request scenarios)
    const today = new Date();
    const yearToday = String(today.getFullYear()).slice(-2);
    const monthToday = String(today.getMonth() + 1).padStart(2, '0');
    const dayToday = String(today.getDate()).padStart(2, '0');
    const todayFormatted = `${yearToday}${monthToday}${dayToday}`;
    
    // For special QR, check if there's no request for today
    if (isSpecialQR && window.currentSpecialQR.requestData) {
      const requestDate = window.currentSpecialQR.requestData.作業日;
      if (requestDate !== todayFormatted) {
        console.log(`⚠️ WARNING: Request date (${requestDate}) does not match today's date (${todayFormatted})`);
        console.log("This is expected if there's no request for today. Current values will still be shown:");
        console.log({
          品番: printFields.品番,
          背番号: printFields.背番号,
          収容数: printFields.収容数,
          色: printFields.色,
          barcode: barcodeFullValue,
          lotNo: currentLotNo
        });
      }
    }
    
    if (isIOS) {
      const url = `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=RollW62&copies=1` +
        `&text_品番=${encodeURIComponent(printFields.品番)}&text_背番号=${encodeURIComponent(printFields.背番号)}` +
        `&text_収容数=${encodeURIComponent(printFields.収容数)}&text_色=${encodeURIComponent(printFields.色)}` +
        `&text_DateT=${encodeURIComponent(currentLotNo)}&barcode_barcode=${encodeURIComponent(barcodeFullValue)}`;
      console.log(`[iOS] Special QR: ${isSpecialQR}, URL:`, url);
      console.log("Final printing values (iOS):", {
        filename: filename,
        品番: printFields.品番,
        背番号: printFields.背番号,
        収容数: printFields.収容数,
        色: printFields.色,
        DateT: currentLotNo,
        barcode: barcodeFullValue
      });
      window.location.href = url;
      wasSuccessful = true; // Assume success for iOS URL scheme
      await new Promise(resolve => setTimeout(resolve, 3500));
    } else {
      const url = `http://localhost:8088/print?filename=${encodeURIComponent(filename)}&size=RollW62&copies=1` +
        `&text_品番=${encodeURIComponent(printFields.品番)}&text_背番号=${encodeURIComponent(printFields.背番号)}` +
        `&text_収容数=${encodeURIComponent(printFields.収容数)}&text_色=${encodeURIComponent(printFields.色)}` +
        `&text_DateT=${encodeURIComponent(currentLotNo)}&barcode_barcode=${encodeURIComponent(barcodeFullValue)}`;
      console.log(`[Android] Special QR: ${isSpecialQR}, URL:`, url);
      console.log("Final printing values (Android):", {
        filename: filename,
        品番: printFields.品番,
        背番号: printFields.背番号,
        収容数: printFields.収容数,
        色: printFields.色,
        DateT: currentLotNo,
        barcode: barcodeFullValue
      });
      try {
        const response = await Promise.race([
          fetch(url).then(res => res.text()),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 7000))
        ]);
        if (response.includes("<result>SUCCESS</result>")) {
          wasSuccessful = true;
        } else {
          throw new Error(response.includes("PrinterStatusErrorCoverOpen") ? "Printer Cover Open" : "Printer Error: " + response.substring(0, 100));
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        showModalAlert(`印刷エラー (${i}/${copiesToPrintNow}): ${error.message}`, true);
        if (printingStatusModal) printingStatusModal.style.display = 'none';
        // Stop on first error
        return;
      }
    }

    // Only if the print was successful, we finalize the lot number and count
    if (wasSuccessful) {
        printSessionData.extension++; // Officially increment the extension
        successfullyPrintedLotNumbers.push(currentLotNo);
        printSuccessCount++;
    }
  }

  // Finalize localStorage with the actual number of prints
  localStorage.setItem(storageKey, JSON.stringify(printSessionData));

  // ✅ SINGLE DATABASE UPDATE AFTER ALL PRINTING IS DONE
  if (printSuccessCount > 0) {
    const imagesToSubmit = !isIOS ? (typeof window.getTakenPictures === 'function' ? window.getTakenPictures() : []) : [];
    console.log(`Submitting ${printSuccessCount} print logs and ${imagesToSubmit.length} images to the database.`);
    await updateMongoDBAfterPrint(品番, sagyoubi_yyMMdd, successfullyPrintedLotNumbers, imagesToSubmit, printSuccessCount);
  }

  if (printingStatusModal) printingStatusModal.style.display = 'none';

  if (printSuccessCount === copiesToPrintNow || (printSuccessCount > 0 && isIOS)) {
    if (printCompletionModal) printCompletionModal.style.display = 'block';
    if (isIOS && printSuccessCount < copiesToPrintNow) {
      showModalAlert(`${printSuccessCount}件のラベル印刷を開始しました。(Initiated printing for ${printSuccessCount} labels. Please check Brother app for remaining.)`, false);
    }
  }

  if (typeof fetchProductDetails === 'function') await fetchProductDetails();
}



async function updateMongoDBAfterPrint(品番, sagyoubi_yyMMdd, printedLotNumbersArray, imagesToUploadArray, numJustPrinted) {
    const targetProdCountEl = document.getElementById('targetProductionCount');
    const currentFactoryEl = document.getElementById('selected工場');
    const currentMachineEl = document.getElementById('hidden設備');
    const printStatusEl = document.getElementById('printStatus');
    const statusEl = document.getElementById('status');

    const targetForCompletion = targetProdCountEl ? (parseInt(targetProdCountEl.value, 10) || 0) : 0;
    const currentFactory = currentFactoryEl ? currentFactoryEl.value : 'N/A';
    const currentMachine = currentMachineEl ? currentMachineEl.value : "N/A";
    const currentUser = "LabelPrinterUser";

    const payloadForBackend = {
        品番: 品番,
        作業日: sagyoubi_yyMMdd,
        生産順番: selectedProductionOrder, // ✅ Include selected production order to avoid conflicts
        numJustPrinted: numJustPrinted, // This is the total number printed in the batch
        printLogEntry: {
            timestamp: new Date().toISOString(),
            lotNumbers: printedLotNumbersArray,
            count: numJustPrinted, // Use the total count for the log
            printedBy: currentUser,
            factory: currentFactory,
            machine: currentMachine
        },
        lastPrintTimestamp: new Date().toISOString(),
        imagesToUpload: imagesToUploadArray.length > 0 ? imagesToUploadArray.map(pic => ({
            base64: pic.base64,
            label: pic.label,
            品番ForFilename: 品番,
            dateForFilename: sagyoubi_yyMMdd,
            timestampForFilename: pic.timestamp,
            factoryForFilename: currentFactory,
            machineForFilename: currentMachine
        })) : [],
        targetProductionCountForStatusUpdate: targetForCompletion,
    };

    try {
        const response = await fetch(`${serverURL}/logPrintAndUpdateMaterialRequest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadForBackend)
        });
        const result = await response.json();

        if (response.ok && result.status === "success") {
            const successMessage = `ログと${imagesToUploadArray.length > 0 ? '画像' : ''}がDBに送信されました。\n${numJustPrinted}枚印刷完了。\n最終ステータス: ${result.finalDocStatus || '確認中'}`;
            showModalAlert(successMessage, false);

            // ✅ Only clear pictures if they were part of THIS submission
            if (imagesToUploadArray.length > 0 && typeof window.clearTakenPictures === 'function') {
                console.log("Clearing taken pictures after successful submission.");
                window.clearTakenPictures();
            }

            const newTotalPrinted = result.newTotalPrintedCount !== undefined ? result.newTotalPrintedCount :
                                    ((printStatusEl ? parseInt(printStatusEl.value.split(' / ')[0],10) : 0) || 0) + numJustPrinted;

            if(printStatusEl) printStatusEl.value = `${newTotalPrinted} / ${targetForCompletion}`;
            if (statusEl && (result.finalDocStatus === "completed" || (targetForCompletion > 0 && newTotalPrinted >= targetForCompletion))) {
                statusEl.value = "完了";
            }

        } else {
            throw new Error(result.message || result.error || "DB更新失敗 (DB update failed)");
        }
    } catch (error) {
        console.error("Error in updateMongoDBAfterPrint:", error);
        showModalAlert(`DB更新エラー: ${error.message}`, true);
    }
}


// === Reprint Logic ===
const reprintButton = document.getElementById('reprintButton');
if (reprintButton) {
    reprintButton.addEventListener('click', () => {
        const reprintModal = document.getElementById('reprintModal');
        const confirmReprintBtn = document.getElementById('confirmReprintButton');
        if (!reprintModal || !confirmReprintBtn) {
            console.error("Reprint modal elements not found.");
            return;
        }
        
        confirmReprintBtn.disabled = false;
        confirmReprintBtn.textContent = 'Reprint This Label';

        const 品番 = document.getElementById("品名")?.value;
        if (!品番) {
            showModalAlert("まず品番を選択してください。(Please select a 品番 first.)", true);
            return;
        }
        
        // ✅ Handle storage key for special QR vs normal flow in reprint
        const isSpecialQR = window.currentSpecialQR && window.currentSpecialQR.isSpecial;
        const storageKey = isSpecialQR 
            ? `${uniquePrefix}${品番}_specialQR_printData`
            : `${uniquePrefix}${品番}_${selectedProductionOrder || 'default'}_printData`;
        const lotSuffixSelect = document.getElementById('suffixSelector');
        
        if (!lotSuffixSelect) return;

        lotSuffixSelect.innerHTML = ""; 
        const storedData = JSON.parse(localStorage.getItem(storageKey));
        if (storedData && storedData.extension && storedData.date) {
            for (let i = 1; i <= storedData.extension; i++) {
            const suffix = `${storedData.date}-${i}`;
            const option = document.createElement('option');
            option.value = suffix;
            option.textContent = `${storedData.date} (ロット ${i})`;
            lotSuffixSelect.appendChild(option);
            }
            if (lotSuffixSelect.options.length > 0) {
                reprintModal.style.display = 'block';
            } else {
                showModalAlert("この品番の以前のラベル履歴はありません。(No previous label history for this 品番.)", false);
            }
        } else {
            showModalAlert("この品番の以前のラベル履歴はありません。(No previous label history for this 品番.)", false);
        }
    });
}
const closeReprintModalButton = document.getElementById('closeReprintModal');
if(closeReprintModalButton) {
    closeReprintModalButton.addEventListener('click', () => {
        const reprintModal = document.getElementById('reprintModal');
        if(reprintModal) reprintModal.style.display = 'none';
    });
}
const confirmReprintButton = document.getElementById('confirmReprintButton');
if(confirmReprintButton) {
    confirmReprintButton.addEventListener('click', async () => {
        const selectedSuffix = document.getElementById('suffixSelector')?.value;
        if (!selectedSuffix) {
            showModalAlert("再印刷するロットを選択してください。(Please select a lot to reprint.)", true);
            return;
        }

        confirmReprintButton.disabled = true;
        confirmReprintButton.textContent = '再印刷中...';

        const 材料背番号 = document.getElementById("材料背番号")?.value || "";
        const 品番 = document.getElementById("品名")?.value;
        const 色 = document.getElementById("material-color")?.value || "";
        const length = document.getElementById("length")?.value || "50";
        const orderVal = document.getElementById("order")?.value || "";
        const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
        
        // ✅ CHECK FOR SPECIAL QR LOGIC IN REPRINT
        const isSpecialQR = window.currentSpecialQR && window.currentSpecialQR.isSpecial;
        let filename, printFields, barcodeFullValue;
        
        if (isSpecialQR) {
          // ✅ SPECIAL QR REPRINT LOGIC
          console.log("Reprint: Using special QR logic with kinuuraLabel.lbx");
          filename = "kinuuraLabel.lbx";
          
          const specialMaterial = window.currentSpecialQR.materialData;
          printFields = {
            品番: specialMaterial.お客様品番 || 品番,           // 品番 ← お客様品番
            背番号: specialMaterial.品名 || "",              // 背番号 ← 品名  
            収容数: specialMaterial.length || length,        // 収容数 ← length
            色: specialMaterial.色 || 色,                    // 色 stays the same
          };
          // ✅ For special QR reprint: barcode is ONLY the お客様品番 (no concatenation)
          barcodeFullValue = specialMaterial.お客様品番 || 品番;
        } else {
          // ✅ NORMAL REPRINT LOGIC (existing)
          const barcodeValuePart1 = 材料背番号 || 品番;
          barcodeFullValue = `${barcodeValuePart1},${selectedSuffix},${length}`;
          const srsStatus = document.getElementById("SRS")?.value;
          filename = srsStatus === "有り" ? "SRS3.lbx" : (材料背番号 === "NC2" ? "NC21.lbx" : "firstkojo3.lbx");
          
          printFields = {
            品番: 品番,
            背番号: 材料背番号,
            収容数: orderVal,
            色: 色
          };
        }

        try {
            if (isIOS) {
                const url = `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=RollW62&copies=1` +
                    `&text_品番=${encodeURIComponent(printFields.品番)}&text_背番号=${encodeURIComponent(printFields.背番号)}` +
                    `&text_収容数=${encodeURIComponent(printFields.収容数)}&text_色=${encodeURIComponent(printFields.色)}` +
                    `&text_DateT=${encodeURIComponent(selectedSuffix)}&barcode_barcode=${encodeURIComponent(barcodeFullValue)}`;
                console.log(`[iOS Reprint] Special QR: ${isSpecialQR}, URL:`, url);
                window.location.href = url;
                 setTimeout(() => { 
                    showModalAlert("再印刷を開始しました。Brotherアプリを確認してください。", false, 3000);
                 }, 500);

            } else {
                const url = `http://localhost:8088/print?filename=${encodeURIComponent(filename)}&size=RollW62&copies=1` +
                    `&text_品番=${encodeURIComponent(printFields.品番)}&text_背番号=${encodeURIComponent(printFields.背番号)}` +
                    `&text_収容数=${encodeURIComponent(printFields.収容数)}&text_色=${encodeURIComponent(printFields.色)}` +
                    `&text_DateT=${encodeURIComponent(selectedSuffix)}&barcode_barcode=${encodeURIComponent(barcodeFullValue)}`;
                console.log(`[Android Reprint] Special QR: ${isSpecialQR}, URL:`, url);
                
                const response = await Promise.race([
                    fetch(url).then(res => res.text()),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 7000))
                ]);
                if (response.includes("<result>SUCCESS</result>")) {
                    showModalAlert("再印刷成功。(Reprint successful.)", false);
                } else {
                     showModalAlert("再印刷失敗：プリンターエラー。(Reprint failed: Printer error.)", true);
                }
            }
        } catch (err) {
            showModalAlert(`再印刷失敗：${err.message}.(Reprint failed: ${err.message}.)`, true);
        } finally {
            confirmReprintButton.disabled = false;
            confirmReprintButton.textContent = 'Reprint This Label';
            const reprintModal = document.getElementById('reprintModal');
            if(reprintModal) reprintModal.style.display = 'none';
        }
    });
}


// === Form Reset ===
function resetForm() {
  updateUniquePrefix(); 
  const excludedInputs = ['selected工場']; 

  const inputsToReset = document.querySelectorAll('input, select, textarea');
  inputsToReset.forEach(input => {
      if (!excludedInputs.includes(input.id) && !excludedInputs.includes(input.name)) {
          const key = input.id || input.name;
          if (key) removeFromLocalStorage(key); 

          if (input.tagName === 'SELECT' && input.options.length > 0) {
              if (input.id === 'sub-dropdown' && input.options[0] && input.options[0].disabled) {
                  input.selectedIndex = 0; 
              } else if (input.options.length > 0) {
                  input.selectedIndex = 0;
              }
          } else if (input.type === 'checkbox' || input.type === 'radio') {
              input.checked = false;
          } else if (input.type === 'date') {
              // Handled by setDefaultDate if called after blankInfo
          } else {
              input.value = ''; 
          }
      }
  });
  
  blankInfo(); 
  
  // ✅ Clear special QR state
  window.currentSpecialQR = null;
  
  const lotNoInput = document.getElementById('Lot No.');
  if (lotNoInput) setDefaultDate(lotNoInput); 

  const subDropdown = document.getElementById('sub-dropdown');
  if (subDropdown && subDropdown.options.length > 0 && subDropdown.options[0]?.disabled) {
      subDropdown.selectedIndex = 0; 
  }
  
  console.log("Form reset executed.");
}


// === DOMContentLoaded Main Setup ===
document.addEventListener('DOMContentLoaded', async () => {
    updateUniquePrefix(); 
    setupInputSaving();   

    const factoryParam = getQueryParam('filter');
    const factorySelect = document.getElementById('selected工場');
    if (factoryParam && factorySelect && factorySelect.tagName === "SELECT" && factorySelect.options) {
        const optionExists = Array.from(factorySelect.options).some(opt => opt.value === factoryParam);
        if (optionExists) factorySelect.value = factoryParam;
        updateUniquePrefix(); 
    } else {
        console.warn("Factory select dropdown not ready or missing options. Skipping factoryParam prefill.");
    }

    // ✅ Only restore after sub-dropdown is filled
    await restoreValuesFromLocalStorage(); 

    const lotNoInput = document.getElementById('Lot No.');
    if (lotNoInput) setDefaultDate(lotNoInput); 

    const subDropdown = document.getElementById('sub-dropdown');
    if (subDropdown) {
        subDropdown.addEventListener("change", () => {
            const selectedValue = subDropdown.value;
            if (selectedValue) {
                saveToLocalStorage('sub-dropdown', selectedValue); 
                if (typeof handleScannedQR === 'function') handleScannedQR(selectedValue); 
            } else {
                if (typeof blankInfo === 'function') blankInfo(); 
            }
        });
    }
});


// === IMAGE CAPTURE FUNCTIONALITY ===
document.addEventListener('DOMContentLoaded', () => {
    const takePictureButton = document.getElementById('takePictureButton');
    const cameraModal = document.getElementById('cameraModal');
    const videoFeed = document.getElementById('videoFeed');
    const captureCanvas = document.getElementById('captureCanvas');
    const captureButton = document.getElementById('captureButton');
    const closeCameraButton = document.getElementById('closeCameraButton');
    const thumbnailsContainer = document.getElementById('thumbnailsContainer');
    
    const imagePreviewModal = document.getElementById('imagePreviewModal');
    const fullPreviewImage = document.getElementById('fullPreviewImage');
    const closeImagePreviewModal = document.getElementById('closeImagePreviewModal');

    let stream = null;
    let takenPictures = []; 
    const MAX_PICTURES = 10;

    if (takePictureButton) {
        takePictureButton.addEventListener('click', openCamera);
    } else { console.warn("takePictureButton not found"); }

    if (closeCameraButton) {
        closeCameraButton.addEventListener('click', closeCamera);
    } else { console.warn("closeCameraButton not found"); }

    if (captureButton) {
        captureButton.addEventListener('click', takeSnapshot);
    } else { console.warn("captureButton not found"); }
    
    if (closeImagePreviewModal) {
        closeImagePreviewModal.onclick = function() {
            if(imagePreviewModal) imagePreviewModal.style.display = "none";
        }
    } else { console.warn("closeImagePreviewModal not found"); }
    
    if (imagePreviewModal) { 
        imagePreviewModal.addEventListener('click', function(event) { 
            if (event.target == imagePreviewModal) { 
                imagePreviewModal.style.display = "none";
            }
        });
    }


    async function openCamera() {
        if (takenPictures.length >= MAX_PICTURES) {
            showModalAlert(`最大${MAX_PICTURES}枚まで撮影できます。(You can take up to ${MAX_PICTURES} pictures.)`, false);
            return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showModalAlert("カメラ機能はこのブラウザではサポートされていません。(Camera features are not supported in this browser.)", true);
            return;
        }

        const constraints = {
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        };

        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
            console.warn("Environment camera failed, trying user camera:", e);
            constraints.video.facingMode = { ideal: "user" }; 
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
                console.error("Error accessing camera: ", err);
                showModalAlert("カメラにアクセスできませんでした。設定を確認してください。", true);
                return;
            }
        }

        if (stream && videoFeed && cameraModal && captureCanvas) {
            videoFeed.srcObject = stream;
            cameraModal.style.display = 'block';
            videoFeed.onloadedmetadata = () => { 
                captureCanvas.width = videoFeed.videoWidth;
                captureCanvas.height = videoFeed.videoHeight;
            };
        } else {
            console.error("Camera related DOM elements not found. VideoFeed:", videoFeed, "CameraModal:", cameraModal, "CaptureCanvas:", captureCanvas);
            showModalAlert("カメラ表示要素の初期化に失敗しました。", true);
        }
    }

    function closeCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        stream = null;
        if(videoFeed) videoFeed.srcObject = null;
        if(cameraModal) cameraModal.style.display = 'none';
    }

    function takeSnapshot() {
    if (!stream || !captureCanvas || !videoFeed || !captureCanvas.getContext) {
        console.error("Stream or canvas not ready for snapshot, or canvas context unavailable.");
        closeCamera();
        return;
    }
    if (takenPictures.length >= MAX_PICTURES) {
        showModalAlert(`最大${MAX_PICTURES}枚までです。(Max ${MAX_PICTURES} pictures allowed.)`, false);
        closeCamera();
        return;
    }
     
    const context = captureCanvas.getContext('2d');
    if (!context) {
        console.error("Failed to get 2D context from canvas.");
        closeCamera();
        return;
    }
    context.drawImage(videoFeed, 0, 0, captureCanvas.width, captureCanvas.height);
    const imageDataURL = captureCanvas.toDataURL('image/jpeg', 0.8); 
     
    // ✅ FIX: Added a unique timestamp at the moment of capture.
    takenPictures.push({
        base64: imageDataURL.split(',')[1], 
        label: "材料ラベル",
        timestamp: Date.now() // The unique timestamp is now part of the image data.
    });
     
    renderThumbnails();
    showModalAlert('写真が撮影されました。(Picture taken!)', false, 2000); // Brief confirmation

    if (takenPictures.length >= MAX_PICTURES) {
        showModalAlert(`最大${MAX_PICTURES}枚に達しました。(Reached max ${MAX_PICTURES} pictures.)`, false);
        closeCamera(); 
    }
}

    function renderThumbnails() {
        if (!thumbnailsContainer) {
            console.error("thumbnailsContainer not found");
            return;
        }
        thumbnailsContainer.innerHTML = ''; 
        takenPictures.forEach((picData, index) => {
            const thumbItem = document.createElement('div');
            thumbItem.className = 'thumbnail-item';
            const img = document.createElement('img');
            img.src = `data:image/jpeg;base64,${picData.base64}`; 
            img.alt = `材料ラベル ${index + 1}`;
            img.onclick = () => showFullPreview(`data:image/jpeg;base64,${picData.base64}`);
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-img-btn';
            removeBtn.innerHTML = '&times;'; 
            removeBtn.onclick = (event) => {
                event.stopPropagation(); 
                removePicture(index);
            };
            thumbItem.appendChild(img);
            thumbItem.appendChild(removeBtn);
            thumbnailsContainer.appendChild(thumbItem);
        });
    }

    function removePicture(indexToRemove) {
        takenPictures.splice(indexToRemove, 1);
        renderThumbnails();
    }
    
    function showFullPreview(imageDataURL) {
        if (fullPreviewImage && imagePreviewModal) {
            fullPreviewImage.src = imageDataURL;
            imagePreviewModal.style.display = 'flex'; 
        } else {
            console.error("Image preview modal elements (fullPreviewImage or imagePreviewModal) not found.");
        }
    }

    window.getTakenPictures = function() { return takenPictures; }
    window.clearTakenPictures = function() {
        takenPictures = [];
        if(thumbnailsContainer) renderThumbnails(); 
    }
});
