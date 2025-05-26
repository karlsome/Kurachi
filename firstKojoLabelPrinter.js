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
    
    const request = requestData.length > 0 ? requestData[0] : null;
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
    
    const materialQueryPayload = {
      dbName: "Sasaki_Coating_MasterDB", collectionName: "materialDB", query: { "材料品番": matched材料品番 }
    };
    const materialResponse = await fetch(`${serverURL}/queries`, { 
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(materialQueryPayload),
    });
    if (!materialResponse.ok) throw new Error(`materialDB fetch failed: ${materialResponse.statusText}`);
    
    const materialData = await materialResponse.json();
    if (!Array.isArray(materialData)) {
        console.error("Received non-array materialData:", materialData);
        throw new Error("Invalid data format received for material details.");
    }

    if (materialData.length === 0) { 
      showModalAlert(`材料DBに詳細が見つかりません。材料品番: ${matched材料品番}`, true);
      picLINK(selected品番Value); 
      return;
    }
    const material = materialData[0];

    document.getElementById("材料背番号").value = material.材料背番号 || "";
    document.getElementById("材料品番").value = material.材料品番 || "";
    document.getElementById("material").value = material.材料 || "";
    document.getElementById("material-color").value = material.色 || "";
    const materialLength = parseInt(material.length, 10) || 50; 
    document.getElementById("length").value = materialLength;
    document.getElementById("SRS").value = material.SRS === "有り" ? "有り" : "無し";

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
        let targetForCompletion = 0; 

        if (!isNaN(生産数) && !isNaN(materialLength) && materialLength > 0) {
            const rollTimes = (生産数 / materialLength) / 100; 
            targetForCompletion = Math.ceil(rollTimes);
            console.log("生産数:", 生産数, "length:", materialLength, "Calculated rollTimes (target):", targetForCompletion);
        } else {
            console.warn("Invalid 生産数 or length for roll time calculation. Defaulting target to 0.");
        }
        
        document.getElementById("targetProductionCount").value = targetForCompletion;

        const currentPrints = parseInt(request.TotalLabelsPrintedForOrder, 10) || 0;
        document.getElementById("printStatus").value = `${currentPrints} / ${targetForCompletion}`;
        console.log(`Current prints: ${currentPrints}, Target for completion (from RollTimes): ${targetForCompletion}`);
        
    } else {
        document.getElementById("status").value = "本日リクエストなし";
        document.getElementById("printStatus").value = `0 / 0`;
        document.getElementById("targetProductionCount").value = "0";
        document.getElementById("order").value = ""; 
    }
    picLINK(selected品番Value); 
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


async function handleScannedQR(qrCodeMessage) {
  if (isHandlingScan) {
    console.warn("Scan handling already in progress. Ignoring new scan:", qrCodeMessage);
    return;
  }
  isHandlingScan = true;
  console.log("Handling Scanned QR:", qrCodeMessage);

  const subDropdown = document.getElementById('sub-dropdown');
  if (!subDropdown) {
      console.error("sub-dropdown not found");
      isHandlingScan = false;
      return;
  }
  
  if (subDropdown.options.length <= 1 || ![...subDropdown.options].map(o => o.value).includes(qrCodeMessage)) {
      console.log("Populating dropdown or scanned value not found, re-populating...");
      await populateSubDropdown(); 
  }
  const options = [...subDropdown.options].map(option => option.value);


  try {
    if (!options.includes(qrCodeMessage)) {
      showModalAlert(`品番 "${qrCodeMessage}" はリストにありません。(品番 "${qrCodeMessage}" is not in the list.)`, true);
      isHandlingScan = false;
      return;
    }
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
  const statusValue = document.getElementById('status')?.value;
  const printTimesDisplay = document.getElementById('printTimesDisplay');
  const printTimesInput = document.getElementById('printTimes');
  const targetCountInput = document.getElementById('targetProductionCount');
  const printConfirmationModal = document.getElementById('printConfirmationModal');
  const currentPrintedEl = document.getElementById("printStatus");


  if (!selectedValue) {
    showModalAlert('品番を選択してください。(Please select a 品番.)', true);
    return;
  }
  if (statusValue === "完了" || statusValue === "Completed") {
    showModalAlert('この品番は既に完了しています。印刷はできません。(This item is already completed. Printing not allowed.)', false);
    return;
  }
   if (statusValue === "本日リクエストなし") {
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

async function printLabel() {
  const printingStatusModal = document.getElementById('printingStatusModal');
  const printCompletionModal = document.getElementById('printCompletionModal');
  
  const 材料背番号 = document.getElementById("材料背番号")?.value || "";
  const 品番 = document.getElementById("品名")?.value; 
  const 色 = document.getElementById("material-color")?.value || "";
  const length = document.getElementById("length")?.value || "50";
  const orderVal = document.getElementById("order")?.value || ""; 
  const copiesToPrintNow = parseInt(document.getElementById("printTimes")?.value, 10) || 1;

  if (!品番) { 
    showModalAlert('品番が選択されていません。(Product Number is not selected.)', true);
    if(printingStatusModal) printingStatusModal.style.display = 'none';
    return;
  }
   if (!材料背番号 && 品番) {
       console.warn("材料背番号 is missing, using 品番 for barcode part 1 if needed.");
   }


  const storageKey = `${uniquePrefix}${品番}_printData`; 
  const lotDateInputElement = document.getElementById('Lot No.');
  if (!lotDateInputElement) {
      showModalAlert('日付入力フィールドが見つかりません。', true);
      if(printingStatusModal) printingStatusModal.style.display = 'none';
      return;
  }
  const lotDateInput = lotDateInputElement.value; 
  const dateParts = lotDateInput.split("-");
  if (dateParts.length < 3) {
      showModalAlert('日付の形式が無効です。YYYY-MM-DD形式で入力してください。', true);
      if(printingStatusModal) printingStatusModal.style.display = 'none';
      return;
  }
  const sagyoubi_yyMMdd = `${dateParts[0].slice(-2)}${dateParts[1]}${dateParts[2]}`;

  let printSessionData = JSON.parse(localStorage.getItem(storageKey)) || { date: sagyoubi_yyMMdd, extension: 0 };
  if (printSessionData.date !== sagyoubi_yyMMdd) { 
    printSessionData = { date: sagyoubi_yyMMdd, extension: 0 };
  }

  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  let printedLotNumbers = [];
  let printSuccessCount = 0;

  for (let i = 1; i <= copiesToPrintNow; i++) {
    printSessionData.extension++;
    const currentExtension = printSessionData.extension;
    const currentLotNo = `${sagyoubi_yyMMdd}-${currentExtension}`;
    printedLotNumbers.push(currentLotNo);

    const barcodeValuePart1 = 材料背番号 || 品番; 
    const barcodeFullValue = `${barcodeValuePart1},${currentLotNo},${length}`;

    let filename = "";
    const srsStatusElement = document.getElementById("SRS");
    const srsStatus = srsStatusElement ? srsStatusElement.value : "無し";

    if (srsStatus === "有り") filename = "SRS3.lbx";
    else if (材料背番号 === "NC2") filename = "NC21.lbx"; 
    else filename = "firstkojo3.lbx";
    
    let url = "";
    if (isIOS) {
      url = `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=RollW62&copies=1` +
            `&text_品番=${encodeURIComponent(品番)}` +
            `&text_背番号=${encodeURIComponent(材料背番号)}` + 
            `&text_収容数=${encodeURIComponent(orderVal)}` + 
            `&text_色=${encodeURIComponent(色)}` +
            `&text_DateT=${encodeURIComponent(currentLotNo)}` +
            `&barcode_barcode=${encodeURIComponent(barcodeFullValue)}`;
      console.log(`[iOS] Attempting print via URL scheme: ${i}/${copiesToPrintNow}`);
      window.location.href = url; 
      printSuccessCount++; 
      if (i < copiesToPrintNow) await new Promise(resolve => setTimeout(resolve, 3500)); 
    } else { 
      url = `http://localhost:8088/print?filename=${encodeURIComponent(filename)}&size=RollW62&copies=1` +
            `&text_品番=${encodeURIComponent(品番)}` +
            `&text_背番号=${encodeURIComponent(材料背番号)}` +
            `&text_収容数=${encodeURIComponent(orderVal)}` +
            `&text_色=${encodeURIComponent(色)}` +
            `&text_DateT=${encodeURIComponent(currentLotNo)}` +
            `&barcode_barcode=${encodeURIComponent(barcodeFullValue)}`;
      console.log(`[Desktop/Android] Print ${i}/${copiesToPrintNow}:`, url);
      try {
        const response = await Promise.race([
          fetch(url).then(res => res.text()),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 700000))
        ]);
        if (response.includes("<result>SUCCESS</result>")) {
          console.log(`Print ${i} successful.`);
          printSuccessCount++;
        } else {
          throw new Error(response.includes("PrinterStatusErrorCoverOpen") ? "Printer Cover Open" : "Printer Error: " + response.substring(0, 100));
        }
        if (i < copiesToPrintNow) await new Promise(resolve => setTimeout(resolve, 1500)); 
      } catch (error) {
        showModalAlert(`印刷エラー (${i}/${copiesToPrintNow}): ${error.message}`, true);
        if(printingStatusModal) printingStatusModal.style.display = 'none';
        localStorage.setItem(storageKey, JSON.stringify(printSessionData)); 
        return; 
      }
    }
  }

  localStorage.setItem(storageKey, JSON.stringify(printSessionData)); 

  if (printSuccessCount > 0) {
    const imagesToSubmit = (typeof window.getTakenPictures === 'function') ? window.getTakenPictures() : [];
    await updateMongoDBAfterPrint(品番, sagyoubi_yyMMdd, printedLotNumbers, imagesToSubmit, printSuccessCount);
  }

  if(printingStatusModal) printingStatusModal.style.display = 'none';
  if (printSuccessCount === copiesToPrintNow || (printSuccessCount > 0 && isIOS)) {
    if(printCompletionModal) printCompletionModal.style.display = 'block';
    if (isIOS && printSuccessCount < copiesToPrintNow) {
        showModalAlert(`${printSuccessCount}件のラベル印刷を開始しました。(Initiated printing for ${printSuccessCount} labels. Please check Brother app for remaining.)`, false);
    }
  }
  if(typeof fetchProductDetails === 'function') await fetchProductDetails(); 
}


async function updateMongoDBAfterPrint(品番, sagyoubi_yyMMdd, printedLotNumbersArray, imagesToUploadArray, numJustPrinted) {
  const now = new Date();
  
  const targetProdCountEl = document.getElementById('targetProductionCount');
  const currentFactoryEl = document.getElementById('selected工場');
  const currentMachineEl = document.getElementById('hidden設備');
  const printStatusEl = document.getElementById('printStatus');
  const statusEl = document.getElementById('status');

  const targetForCompletion = targetProdCountEl ? (parseInt(targetProdCountEl.value, 10) || 0) : 0;
  const currentFactory = currentFactoryEl ? currentFactoryEl.value : 'N/A';
  const currentMachine = currentMachineEl ? currentMachineEl.value : "N/A"; 
  const currentUser = "LabelPrinterUser"; // Placeholder

  const payloadForBackend = {
    品番: 品番,
    作業日: sagyoubi_yyMMdd,
    numJustPrinted: numJustPrinted,
    printLogEntry: { 
        timestamp: new Date().toISOString(), 
        lotNumbers: printedLotNumbersArray, 
        count: numJustPrinted,
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
        timestampForFilename: Date.now(), 
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
      showModalAlert(`ログと画像（あれば）がDBに送信されました。\n${numJustPrinted}枚印刷完了。\n最終ステータス: ${result.finalDocStatus || '確認中'}`, false);
      if (window.clearTakenPictures && typeof window.clearTakenPictures === 'function') {
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
        const storageKey = `${uniquePrefix}${品番}_printData`;
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
        const barcodeValuePart1 = 材料背番号 || 品番;
        const barcodeFullValue = `${barcodeValuePart1},${selectedSuffix},${length}`;
        const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
        let filename = "";
        const srsStatus = document.getElementById("SRS")?.value;
        if (srsStatus === "有り") filename = "SRS3.lbx";
        else if (材料背番号 === "NC2") filename = "NC21.lbx";
        else filename = "firstkojo3.lbx";
        let url = "";

        try {
            if (isIOS) {
                url = `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=RollW62&copies=1` +
                    `&text_品番=${encodeURIComponent(品番)}&text_背番号=${encodeURIComponent(材料背番号)}` +
                    `&text_収容数=${encodeURIComponent(orderVal)}&text_色=${encodeURIComponent(色)}` +
                    `&text_DateT=${encodeURIComponent(selectedSuffix)}&barcode_barcode=${encodeURIComponent(barcodeFullValue)}`;
                window.location.href = url;
                 setTimeout(() => { 
                    showModalAlert("再印刷を開始しました。Brotherアプリを確認してください。", false, 3000);
                 }, 500);

            } else {
                url = `http://localhost:8088/print?filename=${encodeURIComponent(filename)}&size=RollW62&copies=1` +
                    `&text_品番=${encodeURIComponent(品番)}&text_背番号=${encodeURIComponent(材料背番号)}` +
                    `&text_収容数=${encodeURIComponent(orderVal)}&text_色=${encodeURIComponent(色)}` +
                    `&text_DateT=${encodeURIComponent(selectedSuffix)}&barcode_barcode=${encodeURIComponent(barcodeFullValue)}`;
                
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
        
        takenPictures.push({
            base64: imageDataURL.split(',')[1], 
            label: "材料ラベル" 
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
