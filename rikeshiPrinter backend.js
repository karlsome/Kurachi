// Global definition for serverURL
const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";

let isHandlingScan = false; // Global flag to prevent re-entrant scan handling

// ===================================================================================
// STANDALONE FUNCTION for handling 品目コード changes
// ===================================================================================
window.handleHinmokuCodeChange = function (selectedHinmokuCode) {
    const hinmokuMeiInput = document.getElementById('hinmokuMei');
    const shiyouInput = document.getElementById('shiyou');

    if (!hinmokuMeiInput || !shiyouInput) {
        console.error('handleHinmokuCodeChange: hinmokuMei or shiyou input not found in the DOM.');
        return;
    }

    if (!selectedHinmokuCode) {
        hinmokuMeiInput.value = '';
        shiyouInput.value = '';
        return;
    }

    const requestBody = {
        dbName: "Sasaki_Coating_MasterDB",
        collectionName: "releasePaperDB",
        query: { "品目コード": selectedHinmokuCode }
    };

    fetch(`${serverURL}/queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(errData => {
                throw new Error(`HTTP error! status: ${response.status}, message: ${errData.error || 'Unknown backend error'}`);
            }).catch(() => {
                throw new Error(`HTTP error! status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data && data.length > 0) {
            const productDetails = data[0];
            hinmokuMeiInput.value = productDetails.品目名 || '';
            shiyouInput.value = productDetails.仕様 || '';
        } else {
            hinmokuMeiInput.value = '';
            shiyouInput.value = '';
            console.warn(`No details found for 品目コード: ${selectedHinmokuCode}`);
        }
    })
    .catch(error => {
        console.error('Error in handleHinmokuCodeChange fetching product details:', error);
        if (hinmokuMeiInput) hinmokuMeiInput.value = ''; // Clear fields on error
        if (shiyouInput) shiyouInput.value = '';
        // Consider a less intrusive error message for automated calls on load
        // alert(`製品詳細の取得中にエラーが発生しました。(Error fetching product details.)\n${error.message}`);
    });
};


// ===================================================================================
// URL PARAMETER HANDLING & localStorage PREFIX SETUP
// ===================================================================================
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

const passedFactoryParam = getQueryParam('filter');
if (passedFactoryParam) {
    const selectedKojoInput = document.getElementById('selected工場');
    const nippoTitleElement = document.getElementById('nippoTitle'); // Assuming an element with this ID exists for the title

    if (selectedKojoInput) {
        selectedKojoInput.value = passedFactoryParam;
        console.log("Factory (selected工場) set from URL parameter to: " + passedFactoryParam);
    }
    // You might have a title element like <h1 id="nippoTitle"></h1>
    if (nippoTitleElement) { 
        nippoTitleElement.textContent = passedFactoryParam + "日報";
    }
}

const pageName = location.pathname.split('/').pop() || 'unknownPage';
// Ensure selected工場 value is read *after* it might have been updated by URL param
const currentSelected工場 = document.getElementById('selected工場')?.value || 'default工場'; 
const uniquePrefix = `${pageName}_${currentSelected工場}_`;
console.log(`Using uniquePrefix for localStorage: ${uniquePrefix}`);


// ===================================================================================
// localStorage SAVING LOGIC
// ===================================================================================
document.addEventListener('DOMContentLoaded', () => {
    const allInputsToSave = document.querySelectorAll('input, select, textarea'); // Excludes buttons

    allInputsToSave.forEach(input => {
        const eventToListen = (input.tagName === 'SELECT' || input.type === 'checkbox' || input.type === 'radio') ? 'change' : 'input';
        
        input.addEventListener(eventToListen, () => {
            // Prefer using ID for the key as it's more specific
            const key = input.id ? `${uniquePrefix}${input.id}` : `${uniquePrefix}${input.name}`;
            
            if (input.id || input.name) { // Only save if there's an id or name
                let valueToSave;
                if (input.type === 'checkbox') { // Radio buttons also have 'checked'
                    valueToSave = input.checked;
                } else {
                    valueToSave = input.value;
                }
                localStorage.setItem(key, valueToSave);
                // console.log(`Saved to LS: ${key} = ${valueToSave}`);
            }
        });
    });
});


// ===================================================================================
// localStorage RESTORATION LOGIC
// ===================================================================================
document.addEventListener('DOMContentLoaded', () => {
    const inputsToRestore = document.querySelectorAll('input, select, textarea');

    if (!currentSelected工場 && currentSelected工場 !== 'default工場') {
        console.error("Critical: Selected 工場 context is missing for localStorage restoration.");
        // return; // Optional: halt restoration if factory context is vital
    }

    Object.keys(localStorage).forEach(key => {
        if (key.startsWith(uniquePrefix)) {
            const savedValue = localStorage.getItem(key);
            if (savedValue !== null) {
                inputsToRestore.forEach(input => {
                    // Prefer matching by ID for restoration
                    const inputKey = input.id ? `${uniquePrefix}${input.id}` : `${uniquePrefix}${input.name}`;
                    
                    if (inputKey === key && (input.id || input.name)) {
                        if (input.type === 'checkbox') {
                            input.checked = (savedValue === 'true');
                        } else if (input.tagName === 'SELECT') {
                            setTimeout(() => {
                                // Check if the option actually exists before setting
                                const optionExists = [...input.options].some(option => option.value === savedValue);
                                if (optionExists) {
                                    input.value = savedValue;
                                    console.log(`Restored ${input.id || input.name}: ${savedValue}`);
                                    
                                    // **If sub-dropdown's value is restored, trigger detail fetch**
                                    if (input.id === 'sub-dropdown' && typeof window.handleHinmokuCodeChange === 'function') {
                                        console.log(`Restored sub-dropdown value: ${savedValue}. Triggering handleHinmokuCodeChange.`);
                                        window.handleHinmokuCodeChange(savedValue);
                                    }
                                    // Add any other select-specific callbacks here
                                    // e.g., if (input.id === 'anotherSelect') someFunctionForAnotherSelect(savedValue);

                                } else {
                                     console.warn(`Option '${savedValue}' not found in select '${input.id || input.name}' during restoration attempt. Options might still be loading or value is outdated.`);
                                }
                            }, 1500); // Adjust delay if options load slowly
                        } else {
                            input.value = savedValue;
                        }
                    }
                });
            }
        }
    });
});


// ===================================================================================
// FORM RESET FUNCTION
// ===================================================================================
function resetForm() {
    const excludedInputsFromReset = ['selected工場']; // Add other input IDs you want to preserve

    const inputsToReset = document.querySelectorAll('input, select, textarea');
    inputsToReset.forEach(input => {
        if (input.id && !excludedInputsFromReset.includes(input.id)) {
            const key = `${uniquePrefix}${input.id}`;
            localStorage.removeItem(key);
            if (input.type === 'checkbox' || input.type === 'radio') {
                input.checked = false;
            } else if (input.tagName === 'SELECT') {
                input.selectedIndex = 0; // Reset to the first (usually placeholder) option
                 // If it's the sub-dropdown, also clear dependent fields
                if (input.id === 'sub-dropdown' && typeof window.handleHinmokuCodeChange === 'function') {
                    window.handleHinmokuCodeChange(''); // Pass empty string to clear fields
                }
            } else {
                input.value = '';
            }
        } else if (input.name && !input.id && !excludedInputsFromReset.includes(input.name) ) { // Fallback for inputs with name but no ID
             const key = `${uniquePrefix}${input.name}`;
             localStorage.removeItem(key);
             input.value = ''; // Basic reset for unnamed inputs
        }
    });

    // Add any other specific localStorage items to clear
    // localStorage.removeItem(`${uniquePrefix}someOtherItem`);

    window.location.reload();
}


// ===================================================================================
// 'sub-dropdown' POPULATION LOGIC (Choose one or make conditional)
// ===================================================================================

// OPTION 1: Populate 'sub-dropdown' with 背番号 and 品番
// If this is active, 'handleHinmokuCodeChange' will not work as expected with 'sub-dropdown'
// unless 'handleHinmokuCodeChange' is adapted for 背番号/品番 or this targets a different dropdown.
async function fetchSebanggo() {
    const kojoForSebanggo = document.getElementById("selected工場")?.value;
    if (!kojoForSebanggo) {
        console.error("fetchSebanggo: 工場 (Factory) not selected.");
        return;
    }
    // Assuming blankInfo() is defined elsewhere to clear related fields
    // if (typeof blankInfo === 'function') blankInfo(); 

    try {
        const response = await fetch(`${serverURL}/getSeBanggoListPressAndHinban?工場=${encodeURIComponent(kojoForSebanggo)}`);
        if (!response.ok) throw new Error(`HTTP error in fetchSebanggo! status: ${response.status}`);
        const data = await response.json();
        
        const sebanggoList = data.map(item => item.背番号).filter(Boolean);
        const hinbanList = data.map(item => item.品番).filter(Boolean);
        sebanggoList.sort((a, b) => a.localeCompare(b, 'ja'));
        hinbanList.sort((a, b) => a.localeCompare(b, 'ja'));

        const subDropdown = document.getElementById("sub-dropdown");
        if (!subDropdown) {
            console.error("fetchSebanggo: sub-dropdown element not found.");
            return;
        }

        subDropdown.innerHTML = ""; // Clear previous options
        const blankOption = document.createElement("option");
        blankOption.value = "";
        blankOption.textContent = "背番号/品番を選択"; // Select 背番号 / 品番
        subDropdown.appendChild(blankOption);

        sebanggoList.forEach(sebanggo => {
            const option = document.createElement("option");
            option.value = sebanggo;
            option.textContent = sebanggo;
            subDropdown.appendChild(option);
        });
        if (hinbanList.length > 0 && sebanggoList.length > 0) {
            const separatorOption = document.createElement("option");
            separatorOption.disabled = true;
            separatorOption.textContent = "------ 品番 ------";
            subDropdown.appendChild(separatorOption);
        }
        hinbanList.forEach(hinban => {
            const option = document.createElement("option");
            option.value = hinban;
            option.textContent = hinban;
            subDropdown.appendChild(option);
        });
        console.log("Sub-dropdown populated by fetchSebanggo with 背番号 and 品番 options.");
    } catch (error) {
        console.error("Error in fetchSebanggo:", error);
    }
}
// Example of how you might call it (conditionally or based on user action):
// document.addEventListener('DOMContentLoaded', () => {
// if (someConditionMetForSebanggo) fetchSebanggo();
// });


// OPTION 2: Populate 'sub-dropdown' with 品目コード (Product Code)
// This is assumed to be the active logic for 'handleHinmokuCodeChange' to work as requested.
document.addEventListener('DOMContentLoaded', () => {
    const hinmokuCodeDropdown = document.getElementById('sub-dropdown');

    if (!hinmokuCodeDropdown) {
        console.error('品目コード Dropdown (sub-dropdown) not found for 品目コード population.');
        return;
    }
    
    console.log("Attempting to populate sub-dropdown with 品目コード (Product Codes).");

    const initialRequestBody = {
        dbName: "Sasaki_Coating_MasterDB",
        collectionName: "releasePaperDB",
        aggregation: [
            { "$group": { "_id": "$品目コード" } },
            { "$project": { "品目コード": "$_id", "_id": 0 } },
            { "$sort": { "品目コード": 1 } }
        ]
    };

    fetch(`${serverURL}/queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initialRequestBody),
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(errData => {
                throw new Error(`HTTP error! status: ${response.status}, message: ${errData.error || 'Unknown backend error'}`);
            }).catch(() => {
                throw new Error(`HTTP error! status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        // Clear previous options before populating. 
        // This ensures that if fetchSebanggo ran, its options are replaced.
        hinmokuCodeDropdown.innerHTML = ''; 

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '品目コードを選択'; // Select Product Code
        defaultOption.selected = true;
        hinmokuCodeDropdown.appendChild(defaultOption);

        if (data && data.length > 0) {
            data.forEach(item => {
                if (item.品目コード) {
                    const option = document.createElement('option');
                    option.value = item.品目コード;
                    option.textContent = item.品目コード;
                    hinmokuCodeDropdown.appendChild(option);
                }
            });
            console.log("Sub-dropdown successfully populated with 品目コード.");
        } else {
            console.warn('No 品目コード data received from server for sub-dropdown.');
        }
        // Note: The localStorage restoration logic already has a timeout.
        // If options are populated here, and LS restoration runs, it should pick up the correct value.
    })
    .catch(error => {
        console.error('Error fetching 品目コード list for sub-dropdown:', error);
        if(hinmokuCodeDropdown) {
            hinmokuCodeDropdown.innerHTML = '<option value="">リスト取得エラー</option>';
        }
        // Consider a less intrusive error message on page load
        // alert(`品目コードリストの取得中にエラーが発生しました。\n${error.message}`);
    });

    // Event listener for when a 品目コード is selected from 'sub-dropdown'
    hinmokuCodeDropdown.addEventListener('change', (event) => {
        if (typeof window.handleHinmokuCodeChange === 'function') {
            window.handleHinmokuCodeChange(event.target.value);
        }
    });
});



// Simplified printLabel function for releasePaper.lbx
async function printLabel() {
  const printingStatusModal = document.getElementById('printingStatusModal');
  const printCompletionModal = document.getElementById('printCompletionModal');
  const subDropdownValue = document.getElementById('sub-dropdown')?.value;

  if (printingStatusModal) {
    printingStatusModal.style.display = 'block';
    const cancelPrintBtn = printingStatusModal.querySelector('#cancelPrintButton');
    if (cancelPrintBtn) cancelPrintBtn.style.display = 'none';
  }

  const hinmeiValue = document.getElementById("hinmokuMei")?.value;
  const shiyouValue = document.getElementById("shiyou")?.value;

  if (!hinmeiValue || !shiyouValue) {
    if (printingStatusModal) printingStatusModal.style.display = 'none';
    showModalAlert('品目名と仕様を入力してください。(Product Name and Specification are required.)', true);
    return;
  }

  const filename = "releasePaper5.lbx";
  const copies = 1;

  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  let printSuccess = false;
  let url = "";

  if (isIOS) {
    url = `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=RollW62&copies=${copies}` +
          `&text_hinmei=${encodeURIComponent(hinmeiValue)}&text_sYou=${encodeURIComponent(shiyouValue)}`  +
          `&barcode_barcode=${encodeURIComponent(subDropdownValue)}`;
    window.location.href = url;
    printSuccess = true;
    await new Promise(resolve => setTimeout(resolve, 2500));
  } else {
    // For Android/Desktop, using localhost print server
    url = `http://localhost:8088/print?filename=${encodeURIComponent(filename)}&size=RollW62&copies=${copies}` +
          `&text_hinmei=${encodeURIComponent(hinmeiValue)}&text_sYou=${encodeURIComponent(shiyouValue)}&barcode_barcode=${encodeURIComponent(subDropdownValue)}`;
          
    
    console.log("Attempting to print (non-iOS). URL:", url); // Log the URL

    try {
      // Get the full response object first to inspect status and text
      const httpResponse = await Promise.race([
          fetch(url), // Don't call .then() immediately
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout - プリンターサーバーからの応答がありません。(No response from printer server)")), 7000))
      ]);

      console.log("Printer Server HTTP Status:", httpResponse.status); // Log HTTP status
      console.log("Printer Server HTTP Status Text:", httpResponse.statusText); // Log HTTP status text
      
      const responseText = await httpResponse.text(); // Now get the response text
      console.log("Printer Server Full Response Text:", responseText); // Log the full raw response text

      if (responseText.includes("<result>SUCCESS</result>")) {
        printSuccess = true;
      } else {
        // Attempt to parse a specific error message from the response text
        let printerErrorMessage = "不明なプリンターエラー。(Unknown printer error based on response content)"; // Default if no specific error found in text
        
        if (responseText.includes("PrinterStatusErrorCoverOpen")) {
            printerErrorMessage = "プリンターのカバーが開いています。(Printer Cover Open)";
        } else if (responseText.includes("PrinterStatusErrorPaperEmpty")) {
            printerErrorMessage = "用紙がありません。(Paper Empty)";
        } else if (responseText.includes("<result>ERROR</result>")){
            const match = responseText.match(/<message>(.*?)<\/message>/i);
            printerErrorMessage = match && match[1] ? decodeURIComponent(match[1]) : "プリンターエラー (タグ <message> 内容なし)。(Printer Error - no content in <message> tag)";
        } else if (!httpResponse.ok) {
            // If responseText didn't give a specific Brother error, but HTTP status was bad, use HTTP status.
            // This might override the default "Unknown printer error based on response content" if more specific.
            printerErrorMessage = `プリンターサービスエラー: ${httpResponse.status} ${httpResponse.statusText}. 応答内容: ${responseText.substring(0, 200)}`; // Show part of response
        }
        // If none of the above conditions match, printerErrorMessage remains the default one.
        throw new Error(printerErrorMessage);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      if (printingStatusModal) printingStatusModal.style.display = 'none';
      console.error("Full error object during printing:", error); // Log the full error object
      // Using window.alert for debugging, as showModalAlert might have its own issues or hide console
      window.alert(`印刷エラー (Print Error):\nName: ${error.name}\nMessage: ${error.message}\nURL: ${url}`); 
      return;
    }
  }

  if (printingStatusModal) printingStatusModal.style.display = 'none';

  if (printSuccess) {
    if (isIOS) {
        showModalAlert('印刷指示をBrotherアプリに送信しました。アプリをご確認ください。(Print command sent to Brother app. Please check the app.)', false);
    } else {
        if (printCompletionModal) printCompletionModal.style.display = 'block';
    }
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
      // It's good to also provide a user-facing alert if a critical element is missing
      showModalAlert("ドロップダウン要素「sub-dropdown」が見つかりません。(Dropdown element 'sub-dropdown' not found.)", true);
      isHandlingScan = false;
      return;
  }

  // Get the current options from the sub-dropdown.
  // These are expected to be 品目コード values, populated by your DOMContentLoaded logic.
  const options = [...subDropdown.options].map(option => option.value);

  try {
    // Check if the scanned QR code message (expected to be a 品目コード) is present in the dropdown options.
    if (!options.includes(qrCodeMessage)) {
      showModalAlert(`スキャンされたコード「${qrCodeMessage}」はリストにありません。(Scanned code "${qrCodeMessage}" is not in the list.)`, true);
      isHandlingScan = false;
      return;
    }

    // If the scanned code is in the list:
    // 1. Set the sub-dropdown's value to the scanned code.
    if (subDropdown.value !== qrCodeMessage) {
      subDropdown.value = qrCodeMessage;
      
      // 2. Save this new value to localStorage.
      // Your `saveToLocalStorage` function correctly uses `uniquePrefix`.
      saveToLocalStorage('sub-dropdown', qrCodeMessage);
      
      // Note: Changing subDropdown.value programmatically does not fire the 'change' event automatically.
      // If other logic depends on the 'change' event of sub-dropdown, you might need to dispatch it:
      // subDropdown.dispatchEvent(new Event('change'));
      // However, for this specific flow, directly calling handleHinmokuCodeChange is more reliable.
    }

    // 3. Fetch and display the 品目名 (hinmokuMei) and 仕様 (shiyou) for the selected 品目コード.
    // This is achieved by calling window.handleHinmokuCodeChange.
    if (typeof window.handleHinmokuCodeChange === 'function') {
      // If window.handleHinmokuCodeChange were to return its fetch promise, you could 'await' it here.
      // Based on its current structure, it will run asynchronously.
      window.handleHinmokuCodeChange(qrCodeMessage);
    } else {
      console.error("handleHinmokuCodeChange function is not defined.");
      showModalAlert("製品詳細を更新する機能が見つかりません。(Function to update product details not found.)", true);
    }

  } catch (error) {
    console.error("Error in handleScannedQR:", error);
    // Ensure the error message is useful, potentially including the error.message
    showModalAlert(`スキャン処理中にエラーが発生しました: ${error.message} (Error during scan processing: ${error.message})`, true);
  } finally {
    isHandlingScan = false;
  }
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

function saveToLocalStorage(key, value) {
    if (key && uniquePrefix) { 
        localStorage.setItem(uniquePrefix + key, value);
    }
}