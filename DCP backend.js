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

//this code listens to incoming parameters passed
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

const selectedFactory = getQueryParam('filter');
const selectedMachine = getQueryParam('machine');

if (selectedFactory) {
  document.getElementById('selected工場').value = selectedFactory;
  document.getElementById('nippoTitle').textContent = selectedFactory + "日報";
  console.log("kojo changed to: " + selectedFactory);
}
if (selectedMachine) {
  const processInput = document.getElementById('process');
  if (processInput) {
    processInput.value = selectedMachine;
    console.log("machine set to: " + selectedMachine);
  }
}

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
const MAX_MATERIAL_PHOTOS = 5; // Maximum number of photos allowed

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
    } else {
      maintenanceRecords.push(record);
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

function addMaterialLabelPhoto(photoDataURL) {
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

  const photoData = {
    base64: base64Data,
    timestamp: new Date().toISOString(),
    displayURL: displayURL
  };

  materialLabelPhotos.push(photoData);
  console.log(`Added material label photo #${materialLabelPhotos.length}`);
  
  renderMaterialPhotoThumbnails();
  updateMaterialPhotoCount();
  updateMaterialLabelElement();
  
  // Save to localStorage
  const key = `${uniquePrefix}materialLabelPhotos`;
  localStorage.setItem(key, JSON.stringify(materialLabelPhotos));
  console.log('Saved material label photos to localStorage');
  
  return true;
}

function removeMaterialLabelPhoto(index) {
  if (index >= 0 && index < materialLabelPhotos.length) {
    materialLabelPhotos.splice(index, 1);
    // Save updated array to localStorage
    const key = `${uniquePrefix}materialLabelPhotos`;
    localStorage.setItem(key, JSON.stringify(materialLabelPhotos));
    renderMaterialPhotoThumbnails();
    updateMaterialPhotoCount();
  }
}

function renderMaterialPhotoThumbnails() {
  console.log('Rendering material photo thumbnails');
  
  let container = document.getElementById('material-photo-thumbnails');
  let photosContainer = document.getElementById('material-label-photos-container');
  
  // Create container if it doesn't exist
  if (!photosContainer) {
    console.log('Creating material label photos container');
    const mainForm = document.querySelector('form') || document.querySelector('.main-form') || document.body;
    
    const photoSection = document.createElement('div');
    photoSection.id = 'material-label-photos-container';
    photoSection.style.cssText = 'margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px; display: none; background-color: #f9f9f9;';
    
    const header = document.createElement('div');
    header.innerHTML = '<strong>材料ラベル Photos (<span id="material-photo-count">0</span>):</strong>';
    
    const thumbnailsDiv = document.createElement('div');
    thumbnailsDiv.id = 'material-photo-thumbnails';
    thumbnailsDiv.style.cssText = 'display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px;';
    
    photoSection.appendChild(header);
    photoSection.appendChild(thumbnailsDiv);
    
    // Look for the best place to insert the container
    // First try finding material label specific elements
    const makerLabelButton = document.getElementById('makerLabelButton');
    const materialLabelJP = document.getElementById('材料ラベル_L');
    const materialLabelEN = document.getElementById('makerLabel');
    const materialImg = document.getElementById('材料ラベル');
    
    console.log('Finding placement for material label photos container:', {
      'makerLabelButton': !!makerLabelButton,
      '材料ラベル_L': !!materialLabelJP,
      'makerLabel': !!materialLabelEN,
      '材料ラベル': !!materialImg
    });
    
    // Try to find the best container area
    let insertAfter = null;
    
    // Priority 1: After the button's parent
    if (makerLabelButton) {
      insertAfter = makerLabelButton.parentElement;
    } 
    // Priority 2: After the Japanese label's parent
    else if (materialLabelJP) {
      insertAfter = materialLabelJP.parentElement;
    }
    // Priority 3: After the English label's parent
    else if (materialLabelEN) {
      insertAfter = materialLabelEN.parentElement;
    }
    // Priority 4: After the image element's parent
    else if (materialImg) {
      insertAfter = materialImg.parentElement;
    }
    
    if (insertAfter) {
      // Insert after the target element
      if (insertAfter.nextSibling) {
        insertAfter.parentNode.insertBefore(photoSection, insertAfter.nextSibling);
      } else {
        insertAfter.parentNode.appendChild(photoSection);
      }
      console.log('Inserted material photo container after appropriate element');
    } else {
      // Fallback: Just append to the main form
      mainForm.appendChild(photoSection);
      console.log('Appended material photo container to main form (fallback)');
    }
    
    // Update our references to the newly created elements
    container = document.getElementById('material-photo-thumbnails');
    photosContainer = document.getElementById('material-label-photos-container');
  }
  
  if (!container) {
    console.error('Failed to find or create material-photo-thumbnails container');
    // Create the container if it still doesn't exist
    try {
      const photosContainer = document.getElementById('material-label-photos-container');
      if (photosContainer) {
        const thumbnailsDiv = document.createElement('div');
        thumbnailsDiv.id = 'material-photo-thumbnails';
        thumbnailsDiv.style.cssText = 'display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px;';
        photosContainer.appendChild(thumbnailsDiv);
        container = thumbnailsDiv;
        console.log('Created missing thumbnails container within existing container');
      } else {
        throw new Error('Parent container still not found');
      }
    } catch (error) {
      console.error('Failed to create thumbnails container:', error);
      return;
    }
  }
  
  // Clear existing thumbnails and update display
  container.innerHTML = '';
  
  const photoCount = document.getElementById('material-photo-count');
  if (photoCount) {
    photoCount.textContent = materialLabelPhotos.length;
  }
  
  if (materialLabelPhotos.length === 0) {
    photosContainer.style.display = 'none';
    console.log('No material label photos to display');
  } else {
    photosContainer.style.display = 'block';
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
  
  if (countElement) {
    countElement.textContent = materialLabelPhotos.length;
  }
  
  // Update Material Label status based on photo count
  if (statusLabel) {
    if (materialLabelPhotos.length > 0) {
      statusLabel.textContent = 'TRUE';
    } else {
      statusLabel.textContent = 'FALSE';
    }
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

  // KensaDB cycle time
  const kStartTime = document.getElementById("KStart Time").value;
  const kEndTime = document.getElementById("KEnd Time").value;
  const kQuantity = parseInt(document.getElementById("total").value, 10) || 1; // Total quantity for kensaDB

  if (kStartTime && kEndTime) {
    const kStart = new Date(`1970-01-01T${kStartTime}:00Z`);
    const kEnd = new Date(`1970-01-01T${kEndTime}:00Z`);

    // Calculate difference in milliseconds and convert to seconds
    const kDiffInSeconds = (kEnd - kStart) / 1000;

    // Calculate cycle time (in seconds per item)
    const cycleTimeK = kDiffInSeconds / kQuantity;

    // Update the Cycle Time K field in the form
    document.getElementById("cycleTimeK").value = cycleTimeK.toFixed(2);
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

// Scan Lot Button functionality
document.getElementById('scan-lot').addEventListener('click', function() {
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
      let filename = "";

      const WorkDate = extension ? `${Date2} - ${extension}` : Date2;

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
  let filename = "";

  const WorkDate = extension ? `${Date2} - ${extension}` : Date2;

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
    `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

  console.log(WorkDate);
  window.location.href = url;
}

// Take photo hatsumono and atomono and label
// Mapping of buttons to labels and images
const buttonMappings = [{
  buttonId: 'hatsumonoButton',
  labelId: 'hatsumonoLabel',
  imgId: 'hatsumonoPic',
  labelText: '初物チェック',
}, {
  buttonId: 'atomonoButton',
  labelId: 'atomonoLabel',
  imgId: 'atomonoPic',
  labelText: '終物チェック',
}, {
  buttonId: 'makerLabelButton',
  labelId: '材料ラベル_L', // Updated to match the Japanese label ID
  imgId: '材料ラベル',
  labelText: '材料ラベル',
}, ];

let currentButtonId = null;

// Handle hatsumonoButton and atomonoButton with original functionality
['hatsumonoButton', 'atomonoButton'].forEach(buttonId => {
  const button = document.getElementById(buttonId);
  if (!button) return;
  
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

    // If value is selected, proceed with standard functionality
    currentButtonId = buttonId;
    window.open('captureImage.html', 'Capture Image', 'width=900,height=900');
  });
});

// Handle makerLabelButton with multi-photo functionality
const makerLabelButton = document.getElementById('makerLabelButton');
if (makerLabelButton) {
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

    // If value is selected, proceed with multi-photo functionality for material label
    currentButtonId = 'makerLabelButton';
    window.open('captureImage.html', 'Capture Image', 'width=900,height=900');
  });
}

// Handle the message from the popup window
window.addEventListener('message', function(event) {
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
          const added = addMaterialLabelPhoto(data.image);
          
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

// Locate your document.getElementById('submit').addEventListener('click', async (event) => { ... }
document.getElementById('submit').addEventListener('click', async (event) => {
    event.preventDefault();
    updateCycleTime();

    const hatsumono = document.getElementById("hatsumonoLabel").textContent;
    const atomono = document.getElementById("atomonoLabel").textContent;
    const isToggleChecked = document.getElementById('enable-inputs').checked;

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
        const WorkDate = document.getElementById('Lot No.').value;
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

        if (!材料ロット || 材料ロット.trim() === '') {
            uploadingModal.style.display = 'none';
            showAlert('材料ロットが必要です / Material Lot is required');
            document.getElementById('材料ロット').focus();
            return;
        }

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

        // Prepare maintenance images data for the new submitToDCP route
        const maintenanceImages = [];
        
        if (maintenanceRecords.length > 0) {
            console.log(`📸 Preparing ${maintenanceRecords.length} maintenance records for submission...`);
            
            maintenanceRecords.forEach(record => {
                if (record.photos && record.photos.length > 0) {
                    record.photos.forEach(photo => {
                        if (photo.base64 && photo.id && photo.timestamp) {
                            maintenanceImages.push({
                                base64: photo.base64,
                                id: photo.id,
                                timestamp: photo.timestamp,
                                maintenanceRecordId: record.id
                            });
                        }
                    });
                }
            });
            
            console.log(`📊 Prepared ${maintenanceImages.length} maintenance images for upload`);
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
        
        // Process all material label photos from the new system
        const materialLabelImages = [];
        
        console.log(`Processing ${materialLabelPhotos.length} material label photos for submission`);
        
        // Convert all material label photos to the format expected by server
        for (let i = 0; i < materialLabelPhotos.length; i++) {
            const photo = materialLabelPhotos[i];
            if (!photo.base64) {
                console.warn(`Skipping material label photo ${i} - no base64 data`);
                continue;
            }
            
            materialLabelImages.push({
                base64: photo.base64,
                id: `material-label-${i}-${photo.timestamp || new Date().getTime()}`,
                timestamp: photo.timestamp || new Date().getTime(),
                description: `材料ラベル ${i+1}/${materialLabelPhotos.length}`
            });
            
            console.log(`Material label photo ${i+1} processed: ${(photo.base64.length / 1024).toFixed(2)} KB`);
        }
        
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
            maintenanceRecords: maintenanceDataForSubmission.records.length,
            isToggleChecked
        });

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

        setTimeout(() => {
            uploadingModal.style.display = 'none'; scanAlertText.innerText = 'Form submitted successfully / 保存しました';
            scanAlertModal.style.display = 'block'; document.body.classList.add('flash-green');
            document.getElementById('closeScanModalButton').onclick = function() {
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

// Image Collection with Base64 + Metadata
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

  // Process regular cycle check images (hatsumono and atomono)
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
      const response = await fetch(photoPreview.src);
      const blob = await response.blob();
      const base64Data = await blobToBase64(blob);

      // Debug log the size to verify we have real image data
      console.log(`Image ${label}: ${(base64Data.length / 1024).toFixed(2)} KB`);

      imagesToUpload.push({
        base64: base64Data,
        label,
        factory: selectedFactory,
        machine: selectedMachine,
        worker: selectedWorker,
        date: currentDate,
        sebanggo: selectedSebanggo,
        timestamp: new Date().getTime() // Add timestamp for uniqueness
      });
    } catch (error) {
      console.error(`Error processing ${label} image:`, error);
    }
  }
  
  // Process all material label photos from our new system
  console.log(`Processing ${materialLabelPhotos.length} material label photos`);
  
  if (materialLabelPhotos.length > 0) {
    // Process each material label photo
    for (let i = 0; i < materialLabelPhotos.length; i++) {
      const photo = materialLabelPhotos[i];
      if (!photo || !photo.base64) {
        console.warn(`Skipping invalid material label photo at index ${i}`);
        continue;
      }
      
      const photoBase64 = photo.base64;
      const photoIndex = i === 0 ? '' : `_${i+1}`;  // First photo has no index suffix
      
      console.log(`Adding material label photo ${i+1}/${materialLabelPhotos.length} (${(photoBase64.length / 1024).toFixed(2)} KB) to upload list`);
      
      imagesToUpload.push({
        base64: photoBase64,
        label: `材料ラベル${photoIndex}`,  // First one is "材料ラベル", others are "材料ラベル_2", etc.
        factory: selectedFactory,
        machine: selectedMachine,
        worker: selectedWorker,
        date: currentDate,
        sebanggo: selectedSebanggo,
        timestamp: photo.timestamp || new Date().getTime()
      });
    }
    
    // Update the legacy element if needed (for backward compatibility)
    updateMaterialLabelElement();
    
  } else {
    // Fall back to legacy approach if no new system photos
    const makerPic = document.getElementById('材料ラベル');
    
    if (makerPic && makerPic.src && makerPic.src !== '' && makerPic.src !== 'data:,' && 
        makerPic.style.display !== 'none') {
      try {
        console.log('No material label photos in new system, falling back to legacy element');
        const response = await fetch(makerPic.src);
        const blob = await response.blob();
        const base64Data = await blobToBase64(blob);

        // Debug log the size
        console.log(`Legacy 材料ラベル image: ${(base64Data.length / 1024).toFixed(2)} KB`);

        imagesToUpload.push({
          base64: base64Data,
          label: '材料ラベル',
          factory: selectedFactory,
          machine: selectedMachine,
          worker: selectedWorker,
          date: currentDate,
          sebanggo: selectedSebanggo,
          timestamp: new Date().getTime()
        });
      } catch (error) {
        console.error('Error processing legacy 材料ラベル image:', error);
      }
    } else {
      console.warn('No material label photos available in either system');
    }
  }

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

let sendtoNCButtonisPressed = false; // this global variable is to check if sendtoNC button is pressed or not

function toggleInputs() {
  var isChecked = document.getElementById('enable-inputs').checked;
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

//this function sends request to nc cutter's pC
async function sendtoNC(selectedValue) {

  //sendCommand("off"); // this is for arduino (emergency button)
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

  //let pcName = "DESKTOP-V36G1SK-2";
  const url = `http://${ipAddress}:5000/request?filename=${currentSebanggo}.pce`; //change to

  // Show progress bar at top of page
  const progressBar = document.getElementById('sendingProgressBar');
  if (progressBar) {
    progressBar.classList.remove('hide');
    progressBar.classList.add('show');
  }

  // Send command using fetch instead of opening new tab
  try {
    console.log(`Sending command to mini PC: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      mode: 'no-cors' // Allow cross-origin request without CORS preflight
    });
    
    console.log('Command sent successfully to mini PC');
    
    // Hide progress bar after 7 seconds
    setTimeout(() => {
      if (progressBar) {
        progressBar.classList.remove('show');
        progressBar.classList.add('hide');
        // Reset after animation completes
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
document.getElementById('sendtoNC').addEventListener('click', async function() {
  const currentSebanggo = document.getElementById('sub-dropdown').value;
  await sendtoNC(currentSebanggo);
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

// global variable for ip address input container
const ipInput = document.getElementById('ipInfo');
// Function to fetch ip address
function getIP() {
  const machineName = document.getElementById('process').value;
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
    })
    .catch(error => {
      console.error('Error:', error);
    });
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
      
      // 🔴 BROADCAST SCAN TO SSE - Send to machine display page
      const machineNameForSSE = getMachineName(); // Get the current machine name
      if (machineNameForSSE) {
        fetch(`${serverURL}/api/broadcast-scan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            machineId: machineNameForSSE,
            sebanggo: currentProductDetails.sebanggo,
            hinban: currentProductDetails.hinban,
            timestamp: new Date().toISOString(),
            additionalData: {
              materialCode: currentProductDetails.materialCode
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
      
      // Broadcast clear message to pdfDisplayer
      if (machineNameForSSE) {
        fetch(`${serverURL}/api/broadcast-scan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            machineId: machineNameForSSE,
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