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

// Global cache for machine IP addresses
const machineIPCache = new Map();

// Function to pre-fetch IP addresses for machines
async function preFetchMachineIPs(machines) {
  console.log('Pre-fetching IP addresses for machines:', machines);
  
  for (const machine of machines) {
    // Skip if already cached and cache is fresh (less than 5 minutes old)
    const cached = machineIPCache.get(machine);
    if (cached && (Date.now() - cached.timestamp < 5 * 60 * 1000)) {
      console.log(`Using cached IP for ${machine}: ${cached.ip}`);
      continue;
    }
    
    try {
      const response = await fetch(`${ipURL}?filter=${machine}`);
      const data = await response.text();
      const cleanIP = data.replace(/['"]/g, '').trim();
      
      if (cleanIP && cleanIP !== 'No data found') {
        machineIPCache.set(machine, {
          ip: cleanIP,
          timestamp: Date.now()
        });
        console.log(`Cached IP for ${machine}: ${cleanIP}`);
      } else {
        console.warn(`No valid IP found for ${machine}`);
      }
    } catch (error) {
      console.error(`Error pre-fetching IP for ${machine}:`, error);
    }
  }
}

// Function to get cached IP address
function getCachedIP(machine) {
  const cached = machineIPCache.get(machine);
  if (cached && (Date.now() - cached.timestamp < 5 * 60 * 1000)) {
    return cached.ip;
  }
  return null;
}

// Function to determine target machines from current state
function getCurrentTargetMachines() {
  const subDropdown = document.getElementById('sub-dropdown');
  const selectedOption = subDropdown.options[subDropdown.selectedIndex];
  
  if (!selectedOption || !selectedOption.value) {
    return [];
  }
  
  // Check if we're in work order mode
  const isWorkOrderMode = (selectedOption && selectedOption.dataset.type === "workorder") || 
                          (selectedOption && selectedOption.dataset.workOrderContext === "true");
  
  if (isWorkOrderMode) {
    let assignedTo;
    if (selectedOption.dataset.type === "workorder") {
      assignedTo = selectedOption.dataset.assignedTo;
    } else if (selectedOption.dataset.workOrderContext === "true") {
      assignedTo = selectedOption.dataset.workOrderAssignment;
    }
    
    if (assignedTo && assignedTo.includes("AOL")) {
      const machineNumbers = assignedTo.replace(/AOL\s*/g, '').split(',').map(num => num.trim());
      return machineNumbers.map(num => `AOL-${num}`);
    }
  } else {
    // Regular mode - use current machine selection
    const currentMachine = document.getElementById('process').value;
    
    if (currentMachine && currentMachine.includes("AOL") && currentMachine.includes(",")) {
      const machineNumbers = currentMachine.replace(/AOL\s*/g, '').split(',').map(num => num.trim());
      return machineNumbers.map(num => `AOL-${num}`);
    } else if (currentMachine) {
      return [currentMachine];
    }
  }
  
  return [];
}

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
    
    // Pre-fetch IP for the initial machine
    const initialMachines = [];
    if (selectedMachine.includes("AOL") && selectedMachine.includes(",")) {
      const machineNumbers = selectedMachine.replace(/AOL\s*/g, '').split(',').map(num => num.trim());
      initialMachines.push(...machineNumbers.map(num => `AOL-${num}`));
    } else {
      initialMachines.push(selectedMachine);
    }
    
    if (initialMachines.length > 0) {
      preFetchMachineIPs(initialMachines);
    }
  }
}

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

  if (!selected工場) {
    console.error("Selected 工場 is not set or found.");
    return;
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
                  
                  // Handle different types of selections properly
                  if (input.id === 'sub-dropdown') {
                    const selectedOption = input.options[input.selectedIndex];
                    if (selectedOption && selectedOption.dataset.type === 'workorder') {
                      // It's a work order, call the work order handler
                      handleWorkOrderSelection(selectedOption);
                    } else {
                      // It's a regular 背番号 or 品番, call fetchProductDetails
                      fetchProductDetails();
                    }
                  } else {
                    // For other selects, call fetchProductDetails if needed
                    if (input.id !== 'process') { // Don't auto-fetch for process dropdown
                      fetchProductDetails();
                    }
                  }

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

  // Initialize material label photos system
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

// this function fetches sebanggo list, hinban list, and work orders for SCNA
async function fetchSebanggo() {
  // Get the selected process from the process dropdown
  const 工場 = document.getElementById("selected工場").value;
  blankInfo();

  try {
    // Get the sub-dropdown element
    const subDropdown = document.getElementById("sub-dropdown");

    // Clear any existing options in the sub-dropdown
    subDropdown.innerHTML = "";

    // Add a blank option at the top
    const blankOption = document.createElement("option");
    blankOption.value = "";
    blankOption.textContent = "Select 背番号 / 品番 / Work Order";
    subDropdown.appendChild(blankOption);

    // Fetch both 背番号 and 品番 values from the server
    const response = await fetch(`${serverURL}/getSeBanggoListPressAndHinban?工場=${encodeURIComponent(工場)}`);
    const data = await response.json();

    // Separate 背番号 and 品番 into different arrays
    const sebanggoList = data.map(item => item.背番号).filter(Boolean); // Remove null/undefined
    const hinbanList = data.map(item => item.品番).filter(Boolean); // Remove null/undefined

    // Sort both lists alphabetically
    sebanggoList.sort((a, b) => a.localeCompare(b, 'ja')); // 'ja' for Japanese sorting
    hinbanList.sort((a, b) => a.localeCompare(b, 'ja'));

    // Add separator for 背番号 section
    if (sebanggoList.length > 0) {
      const seBanggoSeparator = document.createElement("option");
      seBanggoSeparator.disabled = true;
      seBanggoSeparator.textContent = "─── 背番号 ───";
      seBanggoSeparator.style.fontWeight = "bold";
      seBanggoSeparator.style.backgroundColor = "#f0f0f0";
      subDropdown.appendChild(seBanggoSeparator);

      // Populate the sub-dropdown with 背番号 options
      sebanggoList.forEach(sebanggo => {
        const option = document.createElement("option");
        option.value = sebanggo;
        option.textContent = sebanggo;
        option.dataset.type = "sebanggo";
        subDropdown.appendChild(option);
      });
    }

    // Add separator for 品番 section
    if (hinbanList.length > 0) {
      const hinbanSeparator = document.createElement("option");
      hinbanSeparator.disabled = true;
      hinbanSeparator.textContent = "─── 品番 ───";
      hinbanSeparator.style.fontWeight = "bold";
      hinbanSeparator.style.backgroundColor = "#f5f5f5";
      subDropdown.appendChild(hinbanSeparator);

      // Populate the sub-dropdown with 品番 options
      hinbanList.forEach(hinban => {
        const option = document.createElement("option");
        option.value = hinban;
        option.textContent = hinban;
        option.dataset.type = "hinban";
        subDropdown.appendChild(option);
      });
    }

    // For SCNA factory, also fetch work orders
    if (工場 === "SCNA") {
      try {
        const workOrderResponse = await fetch(`${serverURL}/getSCNAWorkOrders`);
        const workOrders = await workOrderResponse.json();

        if (workOrders && workOrders.length > 0) {
          // Add separator for Work Orders section
          const workOrderSeparator = document.createElement("option");
          workOrderSeparator.disabled = true;
          workOrderSeparator.textContent = "─── Work Orders ───";
          workOrderSeparator.style.fontWeight = "bold";
          workOrderSeparator.style.backgroundColor = "#e3f2fd";
          subDropdown.appendChild(workOrderSeparator);

          // Add work order options - simplified display (just WO number)
          workOrders.forEach(workOrder => {
            const option = document.createElement("option");
            option.value = workOrder.Number;
            option.textContent = workOrder.Number; // Simplified - just show WO-003404
            option.dataset.type = "workorder";
            option.dataset.assignedTo = workOrder["Assign to-Custom fields"];
            option.dataset.sku = workOrder["P_SKU-Custom fields"];
            option.dataset.status = workOrder.Status;
            option.dataset.customer = workOrder["Customer-Custom fields"];
            subDropdown.appendChild(option);
          });
        }
      } catch (workOrderError) {
        console.warn("Could not fetch work orders:", workOrderError);
        // Continue without work orders if there's an error
      }
    }

    console.log("Sub-dropdown populated with 背番号, 品番, and work order options", { sebanggoList, hinbanList });

  } catch (error) {
    console.error("Error fetching dropdown data:", error);
  }
}

// Utility function to get current selection information
function getCurrentSelectionInfo() {
  const subDropdown = document.getElementById('sub-dropdown');
  if (!subDropdown.value) return null;
  
  const selectedOption = subDropdown.options[subDropdown.selectedIndex];
  
  return {
    value: subDropdown.value,
    type: selectedOption.dataset.type || 'sebanggo',
    assignedTo: selectedOption.dataset.assignedTo || null,
    sku: selectedOption.dataset.sku || null,
    status: selectedOption.dataset.status || null,
    customer: selectedOption.dataset.customer || null,
    isWorkOrder: selectedOption.dataset.type === 'workorder',
    isHinban: selectedOption.dataset.type === 'hinban',
    isSebanggo: selectedOption.dataset.type === 'sebanggo'
  };
}

// Function to get target machines for current selection
function getTargetMachines() {
  const selectionInfo = getCurrentSelectionInfo();
  
  if (!selectionInfo) {
    return [document.getElementById('process').value]; // fallback to current machine
  }
  
  if (selectionInfo.isWorkOrder && selectionInfo.assignedTo) {
    // Parse assigned machines from work order
    if (selectionInfo.assignedTo.includes("AOL")) {
      const machineNumbers = selectionInfo.assignedTo.replace(/AOL\s*/g, '').split(',').map(num => num.trim());
      return machineNumbers.map(num => `AOL-${num}`);
    }
  }
  
  // Default to current machine
  return [document.getElementById('process').value];
}

// Function to get filename for NC program
function getNCFilename() {
  const selectionInfo = getCurrentSelectionInfo();
  
  if (!selectionInfo) return null;
  
  // For work orders, use 背番号 instead of SKU
  if (selectionInfo.isWorkOrder) {
    const subDropdown = document.getElementById('sub-dropdown');
    const selectedOption = subDropdown.options[subDropdown.selectedIndex];
    
    // Check if we have stored the 背番号 from the product lookup
    if (selectedOption.dataset.sebanggo) {
      return selectedOption.dataset.sebanggo;
    }
    
    // Fallback to cleaned SKU if 背番号 not found
    if (selectionInfo.sku) {
      return selectionInfo.sku.startsWith('P') ? selectionInfo.sku.substring(1) : selectionInfo.sku;
    }
  }
  
  // For regular 背番号 or 品番, use the value directly
  return selectionInfo.value;
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
  document.getElementById("rikeshitext").textContent = "";
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

    let result = await response.json();

    // Step 2: If not found, try query by 品番
    if (!result || result.length === 0) {
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

      const altResult = await altRes.json();

      if (altResult.length > 0) {
        const matched = altResult[0];
        if (matched.背番号) {
          document.getElementById("sub-dropdown").value = matched.背番号;
        }
        result = [matched];
      }
    }

    // Step 3: Still no result
    if (!result || result.length === 0) {
      console.error("No matching product found.");
      blankInfo();
      return;
    }

    const data = result[0];

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
    document.getElementById("送りピッチ").textContent = "Roll Distance: " + (data.送りピッチ || "");
    
    // Translate 離型紙上/下 values to English
    let releasePaperValue = data["離型紙上/下"] || "";
    if (releasePaperValue === "上") {
      releasePaperValue = "Up";
    } else if (releasePaperValue === "下") {
      releasePaperValue = "Down";
    }
    document.getElementById("rikeshitext").textContent = releasePaperValue;
    
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
  }
  // Call getRikeshi after product details are fetched
  //getRikeshi(serialNumber);
}

// Trigger when 背番号, 品番, or Work Order is selected
document.getElementById("sub-dropdown").addEventListener("change", async function() {
  // Skip handling if we're in the middle of an auto-switch from work order
  if (window.workOrderAutoSwitching) {
    return;
  }
  
  const selectedOption = this.options[this.selectedIndex];
  
  // Reset UI from previous work order mode if needed
  resetUIFromWorkOrderMode();
  
  if (selectedOption && selectedOption.dataset.type === "workorder") {
    // Handle work order selection
    await handleWorkOrderSelection(selectedOption);
  } else if (selectedOption && (selectedOption.dataset.type === "sebanggo" || selectedOption.dataset.type === "hinban")) {
    // Handle regular 背番号 or 品番 selection
    await fetchProductDetails();
  } else {
    // Fallback for items without dataset.type (backward compatibility)
    await fetchProductDetails();
  }
  
  // Pre-fetch IP addresses for current target machines
  const targetMachines = getCurrentTargetMachines();
  if (targetMachines.length > 0) {
    preFetchMachineIPs(targetMachines);
  }
  
  NCPresstoFalse();
});

// Function to handle work order selection
async function handleWorkOrderSelection(selectedOption) {
  try {
    const workOrderNumber = selectedOption.value;
    const sku = selectedOption.dataset.sku;
    const assignedTo = selectedOption.dataset.assignedTo;
    const status = selectedOption.dataset.status;
    
    // Remove "P" prefix from SKU for masterDB lookup
    const cleanSku = sku.startsWith('P') ? sku.substring(1) : sku;
    
    // Try to fetch product details using the cleaned SKU
    if (cleanSku) {
      // First, try to find this SKU in the master database by 品番
      const response = await fetch(`${serverURL}/queries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dbName: "Sasaki_Coating_MasterDB",
          collectionName: "masterDB",
          query: {
            品番: cleanSku
          }
        }),
      });
      
      const result = await response.json();
      
      if (result && result.length > 0) {
        const data = result[0];
        
        // Store the 背番号 for NC filename use
        selectedOption.dataset.sebanggo = data.背番号 || cleanSku;
        
        // AUTOMATICALLY UPDATE THE SUB-DROPDOWN TO 背番号 (like 品番 selection does)
        if (data.背番号) {
          const subDropdown = document.getElementById('sub-dropdown');
          // Find if 背番号 exists in the dropdown options
          const sebanggoOption = Array.from(subDropdown.options).find(option => 
            option.value === data.背番号 && option.dataset.type === 'sebanggo'
          );
          
          if (sebanggoOption) {
            // Change selection to the 背番号
            subDropdown.value = data.背番号;
            console.log(`Work Order ${workOrderNumber}: Auto-switched to 背番号 ${data.背番号}`);
            
            // Mark this option as having work order context to preserve multi-machine targeting
            sebanggoOption.dataset.workOrderContext = "true";
            sebanggoOption.dataset.workOrderAssignment = assignedTo;
            sebanggoOption.dataset.workOrderSku = sku;
            
            // Set a flag to prevent infinite recursion and call fetchProductDetails
            window.workOrderAutoSwitching = true;
            try {
              await fetchProductDetails();
            } finally {
              // Clear the flag
              delete window.workOrderAutoSwitching;
            }
          }
        }
        
        // Since we're calling fetchProductDetails() above, it will populate all fields correctly
        // No need to populate fields here again as it would overwrite with potentially incorrect data
        
        // Set work order specific information in comment field
        const commentField = document.querySelector('textarea[name="Comments1"]');
        if (commentField) {
          commentField.value = `Work Order: ${workOrderNumber}\nAssigned to: ${assignedTo}\nStatus: ${status}\nSKU: ${sku}\n背番号: ${data.背番号 || 'Not found'}`;
        }
        
        console.log("Work order details loaded successfully:", data);
        console.log(`Will use 背番号 "${data.背番号}" for NC filename instead of SKU "${sku}"`);
      } else {
        // If not found in master database, populate what we know from work order
        document.getElementById("product-number").value = sku;
        
        // Store the cleaned SKU as fallback for NC filename
        selectedOption.dataset.sebanggo = cleanSku;
        
        const commentField = document.querySelector('textarea[name="Comments1"]');
        if (commentField) {
          commentField.value = `Work Order: ${workOrderNumber}\nAssigned to: ${assignedTo}\nStatus: ${status}\nSKU: ${sku}\n(Product details not found in master database)`;
        }
        
        console.log("Product details not found, using cleaned SKU:", cleanSku);
      }
      
      // Update any UI elements to show work order mode
      updateUIForWorkOrderMode(assignedTo);
      
    }
  } catch (error) {
    console.error("Error handling work order selection:", error);
  }
}

// Function to update UI for work order mode
function updateUIForWorkOrderMode(assignedTo) {
  // Update the machine dropdown to show assigned machines for work orders
  
  if (assignedTo && assignedTo.includes("AOL")) {
    const machineNumbers = assignedTo.replace(/AOL\s*/g, '').split(',').map(num => num.trim());
    const targetMachines = machineNumbers.map(num => `AOL-${num}`);
    
    console.log(`Work Order Mode: Target machines are ${targetMachines.join(', ')}`);
    
    // Update the process/machine dropdown to show the assigned machines
    const processDropdown = document.getElementById('process');
    if (processDropdown) {
      // Create the display format that matches the work order assignment
      const displayText = `AOL ${machineNumbers.join(',')}`;
      
      // Check if this option already exists
      let existingOption = null;
      if (processDropdown.options) {
        existingOption = Array.from(processDropdown.options).find(option => 
          option.value === displayText || option.dataset.isWorkOrderAssignment === "true"
        );
      }
      
      if (!existingOption) {
        // Create a new option for the multi-machine assignment
        const multiMachineOption = document.createElement("option");
        multiMachineOption.value = displayText;
        multiMachineOption.textContent = displayText;
        multiMachineOption.dataset.isWorkOrderAssignment = "true";
        multiMachineOption.dataset.originalAssignment = assignedTo;
        processDropdown.appendChild(multiMachineOption);
      }
      
      // Select this option
      processDropdown.value = displayText;
      
      // Add visual indication
      processDropdown.style.backgroundColor = "#e3f2fd";
      processDropdown.style.fontWeight = "bold";
      
      console.log(`Machine dropdown updated to: "${displayText}"`);
      
      // Update URL parameter to reflect multi-machine assignment
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('machine', displayText);
      const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
      window.history.replaceState(null, '', newUrl);
      console.log(`URL updated to show machine parameter: ${displayText}`);
      
      // Note: Don't trigger input events here as it might interfere with work order data population
      // The field value is already set above and that's sufficient for display purposes
    }
    
    // Show notification to user
    const notification = document.createElement('div');
    notification.id = 'workOrderNotification';
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #2196F3;
      color: white;
      padding: 15px;
      border-radius: 5px;
      z-index: 1000;
      font-weight: bold;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    `;
    notification.innerHTML = `
      Work Order Mode<br>
      Target Machines: ${targetMachines.join(', ')}<br>
      Will send NC program to ${targetMachines.length} machine${targetMachines.length > 1 ? 's' : ''}
    `;
    
    // Remove existing notification if any
    const existing = document.getElementById('workOrderNotification');
    if (existing) existing.remove();
    
    document.body.appendChild(notification);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (notification && notification.parentNode) {
        notification.remove();
      }
    }, 5000);
    
    // Pre-fetch IP addresses for work order machines
    preFetchMachineIPs(targetMachines);
  }
}

// Function to reset UI when not in work order mode
function resetUIFromWorkOrderMode() {
  const processDropdown = document.getElementById('process');
  if (processDropdown && processDropdown.options) {
    // Remove work order assignment options
    Array.from(processDropdown.options).forEach(option => {
      if (option.dataset && option.dataset.isWorkOrderAssignment === "true") {
        option.remove();
      }
    });
    
    // Reset styling
    processDropdown.style.backgroundColor = "";
    processDropdown.style.fontWeight = "";
  }
  
  // Remove notification
  const notification = document.getElementById('workOrderNotification');
  if (notification) notification.remove();
}

// Remove duplicate event listeners - the main async function above handles all cases
// document.getElementById("sub-dropdown").addEventListener("change", fetchProductDetails);
document.getElementById("sub-dropdown").addEventListener("change", NCPresstoFalse);

// Add listener for process dropdown changes to pre-fetch IPs
document.getElementById("process").addEventListener("change", function() {
  const selectedMachine = this.value;
  if (selectedMachine) {
    const machines = [];
    if (selectedMachine.includes("AOL") && selectedMachine.includes(",")) {
      const machineNumbers = selectedMachine.replace(/AOL\s*/g, '').split(',').map(num => num.trim());
      machines.push(...machineNumbers.map(num => `AOL-${num}`));
    } else {
      machines.push(selectedMachine);
    }
    
    if (machines.length > 0) {
      preFetchMachineIPs(machines);
    }
  }
});

// Pre-fetch common machine IPs when page loads
window.addEventListener('load', function() {
  // Pre-fetch IPs for common AOL machines
  const commonMachines = ['AOL-1', 'AOL-2', 'AOL-3', 'AOL-4', 'AOL-5', 'AOL-6', 'AOL-7', 'AOL-8'];
  setTimeout(() => {
    preFetchMachineIPs(commonMachines);
    console.log('Pre-cached common machine IPs for faster access');
  }, 1000); // Delay slightly to not interfere with initial page load
});

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

//simple function to set ncbuttonisPressed = false
function NCPresstoFalse() {
  checkValue();
  // Save to localStorage with a unique key format = FALSE
  sendtoNCButtonisPressed = "FALSE";
  popupShown = false;
  const selected工場 = document.getElementById('selected工場').value; // Get the current factory value
  const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
  const key = `${uniquePrefix}sendtoNCButtonisPressed`;
  localStorage.setItem(key, 'false'); // Save the value with the unique key

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
    container.innerHTML = '<p style="text-align: center; color: #666; margin: 20px 0;">No photos</p>';
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

// === Material Label Photo Functions ===
let materialLabelPhotos = []; // Array to store multiple material label photos
const MAX_MATERIAL_PHOTOS = 5; // Maximum number of photos allowed

function clearMaterialLabelPhotos() {
  materialLabelPhotos = [];
  renderMaterialPhotoThumbnails();
  updateMaterialPhotoCount();
}

function addMaterialLabelPhoto(photoDataURL) {
  if (materialLabelPhotos.length >= MAX_MATERIAL_PHOTOS) {
    alert(`Maximum ${MAX_MATERIAL_PHOTOS} photos allowed for Material Label.`);
    return;
  }

  // Create photo object with base64 data for storage
  const base64Data = photoDataURL.replace(/^data:image\/[a-z]+;base64,/, '');
  const photoData = {
    base64: base64Data,
    timestamp: new Date().toISOString(),
    displayURL: photoDataURL // Keep original for display
  };

  materialLabelPhotos.push(photoData);
  renderMaterialPhotoThumbnails();
  updateMaterialPhotoCount();
}

function removeMaterialLabelPhoto(index) {
  if (index >= 0 && index < materialLabelPhotos.length) {
    materialLabelPhotos.splice(index, 1);
    // Save updated array to localStorage
    localStorage.setItem(`${uniquePrefix}materialLabelPhotos`, JSON.stringify(materialLabelPhotos));
    renderMaterialPhotoThumbnails();
    updateMaterialPhotoCount();
  }
}

function renderMaterialPhotoThumbnails() {
  const container = document.getElementById('material-photo-thumbnails');
  const photosContainer = document.getElementById('material-label-photos-container');
  
  if (!container) return;
  
  container.innerHTML = '';
  
  if (materialLabelPhotos.length === 0) {
    photosContainer.style.display = 'none';
  } else {
    photosContainer.style.display = 'block';
    
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
        console.warn('Material label photo has no displayable source:', photo);
        imageSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjQwIiB5PSI0NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5Ij5JbWFnZTwvdGV4dD4KPHR0ZXh0IHg9IjQwIiB5PSI1NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEwIiBmaWxsPSIjOTk5Ij5FcnJvcjwvdGV4dD4KPC9zdmc+'; // Placeholder SVG
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
        img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjQwIiB5PSI0NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5Ij5FcnJvcjwvdGV4dD4KPC9zdmc+'; // Error fallback
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
}

// Load material label photos from localStorage
function loadMaterialLabelPhotos() {
  const photosKey = `${uniquePrefix}materialLabelPhotos`;
  const saved = localStorage.getItem(photosKey);
  if (saved) {
    try {
      materialLabelPhotos = JSON.parse(saved);
      renderMaterialPhotoThumbnails();
      updateMaterialPhotoCount();
    } catch (error) {
      console.error('Error loading material label photos from localStorage:', error);
      materialLabelPhotos = [];
    }
  }
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
      ${isEditing ? 'Edit Maintenance' : 'Add Maintenance'}
    </h2>
    
    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">Start Time:</label>
      <input type="time" id="maintenance-start" value="${existingRecord.startTime || ''}" 
             style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 5px;">
    </div>
    
    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">End Time:</label>
      <input type="time" id="maintenance-end" value="${existingRecord.endTime || ''}"
             style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 5px;">
    </div>
    
    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">Reason/Comment:</label>
      <textarea id="maintenance-comment" rows="4" placeholder="Please enter the reason for machine trouble..."
                style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 5px; resize: vertical;">${existingRecord.comment || ''}</textarea>
    </div>
    
    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 10px; font-weight: bold;">
        Photos (<span id="maintenance-photo-count">0/${MAX_MAINTENANCE_PHOTOS}</span>):
      </label>
      <div style="margin-bottom: 10px;">
        <button type="button" id="take-maintenance-photo" 
                style="padding: 10px 20px; background: #007cba; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">
          📷 Take Photo
        </button>
        <button type="button" id="clear-maintenance-photos" 
                style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
          🗑️ Clear All
        </button>
      </div>
      <div id="maintenance-photo-thumbnails" style="border: 1px solid #ddd; border-radius: 5px; padding: 10px; min-height: 60px; background: #f9f9f9;">
        <!-- Photo thumbnails will be rendered here -->
      </div>
    </div>
    
    <div style="display: flex; gap: 10px; justify-content: flex-end;">
      <button type="button" id="cancel-maintenance" 
              style="padding: 10px 20px; background: #ccc; color: black; border: none; border-radius: 5px; cursor: pointer;">
        Cancel
      </button>
      ${isEditing ? `
        <button type="button" id="delete-maintenance" 
                style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
          Delete
        </button>
      ` : ''}
      <button type="button" id="save-maintenance" 
              style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer;">
        Save
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

  // Start QR code scanning
  html5QrCode.start(
    {
      facingMode: "environment"
    }, {
      fps: 10,
      qrbox: {
        width: 250,
        height: 250
      }
    },
    async qrCodeMessage => {
      const subDropdown = document.getElementById('sub-dropdown');
      const options = [...subDropdown.options].map(option => option.value);

      console.log("Scanned QR Code:", qrCodeMessage);
      if (subDropdown != qrCodeMessage) {
        NCPresstoFalse();
      }

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
        subDropdown.value = qrCodeMessage;
        fetchProductDetails();

        html5QrCode.stop().then(() => {
          qrScannerModal.style.display = 'none';
        }).catch(err => console.error("Failed to stop scanning:", err));

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

// CSS for blinking red background
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
`;
document.head.appendChild(style);

// Function to reset everything and reload the page
function resetForm() {
  const excludedInputs = []; // Remove 'process' from excluded inputs as we'll handle it specially

  // Clear all form inputs with unique prefix except excluded ones
  const inputs = document.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    const key = `${uniquePrefix}${input.id || input.name}`;
    if (!excludedInputs.includes(input.id) && !excludedInputs.includes(input.name)) {
      localStorage.removeItem(key);
      input.value = ''; // Reset input value
    }
  });

  // Reset Equipment Name (process field) to original URL parameter value
  const selectedMachine = getQueryParam('machine');
  const processInput = document.getElementById('process');
  if (processInput && selectedMachine) {
    // Clear localStorage for process field
    const processKey = `${uniquePrefix}process`;
    localStorage.removeItem(processKey);
    
    processInput.value = selectedMachine;
    processInput.style.backgroundColor = ''; // Reset any work order styling
    processInput.style.fontWeight = '';
    console.log("Equipment Name reset to original machine value:", selectedMachine);
  }

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

  // Reload the page
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
  labelId: 'makerLabel',
  imgId: '材料ラベル',
  labelText: '材料ラベル',
}, ];

let currentButtonId = null;

// Setup individual button event listeners
// Handle hatsumonoButton and atomonoButton with original functionality
['hatsumonoButton', 'atomonoButton'].forEach(buttonId => {
  const button = document.getElementById(buttonId);
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

    // If value is selected, proceed
    currentButtonId = buttonId;
    window.open('captureImage.html', 'Capture Image', 'width=900,height=900');
  });
});

// Handle makerLabelButton with multi-photo functionality
document.getElementById('makerLabelButton').addEventListener('click', () => {
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

  // If value is selected, proceed with multi-photo functionality
  currentButtonId = 'makerLabelButton';
  window.open('captureImage.html', 'Capture Image', 'width=900,height=900');
});

// Handle the message from the popup window
window.addEventListener('message', function(event) {
  if (event.origin === window.location.origin) {
    const data = event.data;

    if (data.image && currentButtonId) {
      // Handle makerLabelButton with multi-photo functionality
      if (currentButtonId === 'makerLabelButton') {
        // Add photo to material label photos array
        addMaterialLabelPhoto(data.image);
        
        // Update the associated label to TRUE
        const label = document.getElementById('makerLabel');
        label.textContent = 'TRUE';
        
        // Save label textContent to localStorage
        const labelKey = `${uniquePrefix}makerLabel.textContent`;
        localStorage.setItem(labelKey, label.textContent);
        
        // Save material label photos to localStorage
        const photosKey = `${uniquePrefix}materialLabelPhotos`;
        localStorage.setItem(photosKey, JSON.stringify(materialLabelPhotos));
        
      } else {
        // Handle other buttons with original single-photo functionality
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
          photoPreview.src = data.image;
          photoPreview.style.display = 'block';

          // Update the associated label to TRUE
          const label = document.getElementById(labelId);
          label.textContent = 'TRUE';

          // Save label textContent to localStorage
          const labelKey = `${uniquePrefix}${labelId}.textContent`;
          localStorage.setItem(labelKey, label.textContent);

          // Save image source to localStorage
          const photoPreviewKey = `${uniquePrefix}${imgId}.src`;
          localStorage.setItem(photoPreviewKey, photoPreview.src);
        }
      }

      // Reset the current button ID after processing
      currentButtonId = null;
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

    // Check for material label photos (new multi-photo system)
    if (!materialLabelPhotos || materialLabelPhotos.length === 0) {
        uploadingModal.style.display = 'none';
        showAlert("Please capture at least one Material Label photo");
        return;
    }

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
        const スペアからの部分数 = parseInt(document.getElementById('partial-from-spare').value, 10) || 0;

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

        // Validate processing time vs break time + maintenance time
        if (Time_start && Time_end) {
            // Calculate total processing time in minutes
            const startTime = new Date(`2000-01-01T${Time_start}:00`);
            const endTime = new Date(`2000-01-01T${Time_end}:00`);
            
            // Handle overnight processing (if end time is before start time)
            if (endTime < startTime) {
                endTime.setDate(endTime.getDate() + 1);
            }
            
            const processingTimeMinutes = (endTime - startTime) / (1000 * 60);
            const combinedBreakAndMaintenanceMinutes = totalBreakMinutes + totalTroubleMinutes;
            
            console.log(`⏰ Processing time: ${processingTimeMinutes} minutes`);
            console.log(`⏸️ Total break time: ${totalBreakMinutes} minutes`);
            console.log(`🔧 Total maintenance time: ${totalTroubleMinutes} minutes`);
            console.log(`🔄 Combined break + maintenance: ${combinedBreakAndMaintenanceMinutes} minutes`);
            
            if (combinedBreakAndMaintenanceMinutes > processingTimeMinutes) {
                uploadingModal.style.display = 'none';
                const processingHours = Math.floor(processingTimeMinutes / 60);
                const processingMins = Math.round(processingTimeMinutes % 60);
                const combinedHours = Math.floor(combinedBreakAndMaintenanceMinutes / 60);
                const combinedMins = Math.round(combinedBreakAndMaintenanceMinutes % 60);
                
                showAlert(
                    `❌ Time Validation Error!\n\n` +
                    `Processing Time: ${processingHours}h ${processingMins}m\n` +
                    `Break + Maintenance Time: ${combinedHours}h ${combinedMins}m\n\n` +
                    `Break time and maintenance time combined cannot exceed the total processing time.\n` +
                    `Please check your time entries.`
                );
                return;
            }
        }

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

        // Prepare material label images data
        const materialLabelImages = [];
        
        if (materialLabelPhotos.length > 0) {
            console.log(`📸 Preparing ${materialLabelPhotos.length} material label photos for submission...`);
            
            materialLabelPhotos.forEach((photo, index) => {
                if (photo.base64) {
                    materialLabelImages.push({
                        base64: photo.base64,
                        id: `material-label-${index}-${Date.now()}`,
                        timestamp: photo.timestamp || new Date().toISOString()
                    });
                }
            });
            
            console.log(`📊 Prepared ${materialLabelImages.length} material label images for upload`);
        }

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
        
        // Prepare data for the new submitToDCP route
        const dcpSubmissionData = {
            品番, 背番号, 設備, Total: Total_PressDB, 工場, Worker_Name, Process_Quantity, Date: WorkDate,
            Time_start, Time_end, 材料ロット, 疵引不良, 加工不良, その他, Total_NG, Spare, Comment,
            Cycle_Time, ショット数, スペアからの部分数, Break_Time_Data: breakTimeData,
            Total_Break_Minutes: totalBreakMinutes, Total_Break_Hours: parseFloat(totalBreakHours.toFixed(2)),
            Maintenance_Data: maintenanceDataForSubmission,
            Total_Trouble_Minutes: totalTroubleMinutes, Total_Trouble_Hours: parseFloat(totalTroubleHours.toFixed(2)),
            Total_Work_Hours: parseFloat(totalWorkHours.toFixed(2)),
            
            // Include image data
            images: uploadedImages, // Cycle check images (existing logic)
            maintenanceImages: maintenanceImages, // Maintenance images
            materialLabelImages: materialLabelImages, // NEW: Material label images (base64 for upload only)
            
            // Material label image handling instructions for server:
            // - Single image: Store as "材料ラベル画像": "firebase_url" (preserve existing structure)
            // - Multiple images: Store as "材料ラベル画像": "first_url" + "materialLabelImages": ["url1", "url2", ...]
            // - NEVER store base64 in MongoDB, only Firebase URLs
            materialLabelImageCount: materialLabelImages.length,
            
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
  }
  // Removed 材料ラベル - now handled by the new multi-photo system
  ];

  const imagesToUpload = [];

  for (const {
      imgId,
      label
    } of imageMappings) {
    const photoPreview = document.getElementById(imgId);
    if (!photoPreview || !photoPreview.src) continue;

    const response = await fetch(photoPreview.src);
    const blob = await response.blob();
    const base64Data = await blobToBase64(blob);

    imagesToUpload.push({
      base64: base64Data,
      label,
      factory: selectedFactory,
      machine: selectedMachine,
      worker: selectedWorker,
      date: currentDate,
      sebanggo: selectedSebanggo
    });
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

//this function sends request to nc cutter's PC - supports multiple machines
async function sendtoNC(selectedValue) {
  
  // Check if button is currently disabled (within 12-second cooldown)
  const sendButton = document.getElementById('sendtoNC');
  if (sendButton.disabled) {
    window.alert("Please wait. Send to Machine is on cooldown to prevent double sending.");
    return;
  }

  // Disable the button and show loading state
  sendButton.disabled = true;
  sendButton.style.opacity = '0.6';
  sendButton.style.cursor = 'not-allowed';
  const originalText = sendButton.textContent;
  sendButton.textContent = 'Sending...';

  // Show loading modal
  showSendingModal();

  //sendCommand("off"); // this is for arduino (emergency button)
  sendtoNCButtonisPressed = true;

  // Save to localStorage with a unique key format
  const key = `${uniquePrefix}sendtoNCButtonisPressed`;
  localStorage.setItem(key, 'true'); // Save the value with the unique key

  const subDropdown = document.getElementById('sub-dropdown');
  const currentSelection = subDropdown.value;
  const selectedOption = subDropdown.options[subDropdown.selectedIndex];
  
  if (!currentSelection) {
    hideSendingModal();
    restoreButton();
    window.alert("Please select product, 品番, or work order first / 背番号、品番、またはワークオーダーを選んでください");
    return;
  }

  try {
    // Determine filename and target machines
  let filename = getNCFilename(); // Use the updated filename function
  let targetMachines = [];
  
  // Check if we're in work order mode (either original work order or auto-switched)
  const isWorkOrderMode = (selectedOption && selectedOption.dataset.type === "workorder") || 
                          (selectedOption && selectedOption.dataset.workOrderContext === "true");
  
  if (isWorkOrderMode) {
    // Get work order context
    let assignedTo, sku;
    if (selectedOption.dataset.type === "workorder") {
      // Original work order selection
      assignedTo = selectedOption.dataset.assignedTo;
      sku = selectedOption.dataset.sku;
    } else if (selectedOption.dataset.workOrderContext === "true") {
      // Auto-switched 背番号 with work order context
      assignedTo = selectedOption.dataset.workOrderAssignment;
      sku = selectedOption.dataset.workOrderSku;
    }
    
    // Parse assigned machines (e.g., "AOL 4,5" or "AOL 1")
    if (assignedTo && assignedTo.includes("AOL")) {
      const machineNumbers = assignedTo.replace(/AOL\s*/g, '').split(',').map(num => num.trim());
      targetMachines = machineNumbers.map(num => `AOL-${num}`);
    }
    
    console.log(`Work Order Mode: Using filename ${filename}, targeting machines: ${JSON.stringify(targetMachines)}`);
  } else {
    // It's a regular 背番号 or 品番 - use current machine selection
    const currentMachine = document.getElementById('process').value;
    
    // Check if current machine is multi-machine format (e.g., "AOL 4,5")
    if (currentMachine && currentMachine.includes("AOL") && currentMachine.includes(",")) {
      // Parse multi-machine format
      const machineNumbers = currentMachine.replace(/AOL\s*/g, '').split(',').map(num => num.trim());
      targetMachines = machineNumbers.map(num => `AOL-${num}`);
    } else {
      targetMachines = [currentMachine];
    }
    
    console.log(`${selectedOption?.dataset.type === 'hinban' ? '品番' : '背番号'} ${currentSelection}: Using filename ${filename}, targeting machine: ${JSON.stringify(targetMachines)}`);
  }

  // If no target machines determined, fall back to current machine
  if (targetMachines.length === 0) {
    const currentMachine = document.getElementById('process').value;
    targetMachines = [currentMachine];
    console.log("Fallback to current machine:", targetMachines);
  }

  // Get IP addresses for target machines (use cache for instant response)
  const machineIPs = [];
  const missingIPs = [];
  
  // First, try to get IPs from cache
  for (const machine of targetMachines) {
    const cachedIP = getCachedIP(machine);
    if (cachedIP) {
      machineIPs.push({ machine, ip: cachedIP });
      console.log(`Using cached IP for ${machine}: ${cachedIP}`);
    } else {
      missingIPs.push(machine);
    }
  }
  
  // If any IPs are missing from cache, fetch them now (fallback)
  if (missingIPs.length > 0) {
    console.log(`Fetching missing IPs for: ${missingIPs.join(', ')}`);
    const ipPromises = missingIPs.map(async (machine) => {
      try {
        const response = await fetch(`${ipURL}?filter=${machine}`);
        const data = await response.text();
        const cleanIP = data.replace(/['"]/g, '').trim();
        return { machine, ip: cleanIP };
      } catch (error) {
        console.error(`Error getting IP for ${machine}:`, error);
        return { machine, ip: null };
      }
    });

    const fetchedIPs = await Promise.all(ipPromises);
    machineIPs.push(...fetchedIPs);
  }
  const validMachines = machineIPs.filter(item => item.ip && item.ip !== 'No data found');

  if (validMachines.length === 0) {
    hideSendingModal();
    restoreButton();
    window.alert("No valid IP addresses found for target machines / 対象機械のIPアドレスが見つかりません");
    return;
  }

  // Simple, direct approach - open all tabs immediately
  console.log(`Opening tabs for ${validMachines.length} machines:`);
  
  const openedTabs = [];
  const successfulMachines = [];
  const failedMachines = [];
  
  // Open all tabs immediately (like your openLinks() example)
  validMachines.forEach((machineInfo) => {
    const url = `http://${machineInfo.ip}:5000/request?filename=${filename}.pce`;
    console.log(`Opening tab for ${machineInfo.machine}: ${url}`);
    
    try {
      const newTab = window.open(url, '_blank');
      if (newTab) {
        openedTabs.push({ tab: newTab, machine: machineInfo.machine });
        successfulMachines.push(machineInfo.machine);
        console.log(`✅ Tab opened for ${machineInfo.machine}`);
      } else {
        failedMachines.push(machineInfo.machine);
        console.log(`❌ Failed to open tab for ${machineInfo.machine} - popup blocked`);
      }
    } catch (error) {
      failedMachines.push(machineInfo.machine);
      console.log(`❌ Error opening tab for ${machineInfo.machine}:`, error);
    }
  });
  
  // Close all tabs after 5 seconds
  if (openedTabs.length > 0) {
    setTimeout(() => {
      openedTabs.forEach(({ tab, machine }) => {
        try {
          if (tab && !tab.closed) {
            tab.close();
            console.log(`Tab closed for ${machine}`);
          }
        } catch (e) {
          console.log(`Could not close tab for ${machine}:`, e);
        }
      });
    }, 5000);
  }
  
  // Hide loading modal
  hideSendingModal();
  
  let message = `✅ NC Program Send Completed!\n\nFilename: ${filename}.pce\n`;
  
  if (successfulMachines.length > 0) {
    message += `\n✅ Successfully sent to: ${successfulMachines.join(', ')}`;
  }
  
  if (failedMachines.length > 0) {
    message += `\n⚠️ May have been blocked by popup blocker: ${failedMachines.join(', ')}`;
    message += `\n\n💡 Manual links will appear below to send to blocked machines.`;
  }
  
  if (failedMachines.length === 0) {
    message += `\n\n🎉 All machines targeted successfully!`;
  }
  
  // Always show manual links for verification
  message += `\n\n🔗 Manual verification links will appear below.`;
  
  window.alert(message);
  
  // Always create manual links (both for failed machines and as backup verification)
  const allMachineInfo = validMachines;
  if (allMachineInfo.length > 0) {
    const manualLinks = document.createElement('div');
    manualLinks.id = 'manualSendLinks';
    manualLinks.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border: 2px solid #2196F3;
      border-radius: 10px;
      padding: 20px;
      z-index: 1000;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
    `;
    
    let linksHTML = `
      <div style="font-weight: bold; color: #2196F3; margin-bottom: 15px; text-align: center;">
        � NC Program Send Links - ${filename}.pce
      </div>
      <div style="margin-bottom: 15px; text-align: center;">
        Click these links to manually send to machines (useful if popups were blocked):
      </div>
    `;
    
    allMachineInfo.forEach((machineInfo, index) => {
      const url = `http://${machineInfo.ip}:5000/request?filename=${filename}.pce`;
      const status = successfulMachines.includes(machineInfo.machine) ? 
        '<span style="color: #4CAF50;">✅ Sent</span>' : 
        '<span style="color: #ff9800;">⚠️ Verify</span>';
      
      const buttonId = `manualSend_${machineInfo.machine.replace('-', '_')}`;
      
      linksHTML += `
        <div style="margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>${machineInfo.machine} (${machineInfo.ip}):</strong>
            ${status}
          </div>
          <div style="margin-top: 5px;">
            <button id="${buttonId}" onclick="sendToSingleMachine('${machineInfo.machine}', '${machineInfo.ip}', '${filename}', '${buttonId}')"
               style="background: #2196F3; color: white; padding: 8px 15px; border: none; border-radius: 3px; cursor: pointer; font-size: 14px;">
              Send to ${machineInfo.machine}
            </button>
          </div>
        </div>
      `;
    });
    
    linksHTML += `
      <div style="text-align: center; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 15px;">
        <button onclick="document.getElementById('manualSendLinks').remove()" 
                style="background: #4CAF50; color: white; border: none; padding: 12px 25px; border-radius: 5px; cursor: pointer; font-size: 16px;">
          Close
        </button>
      </div>
    `;
    
    manualLinks.innerHTML = linksHTML;
    document.body.appendChild(manualLinks);
    
    // Auto-remove after 60 seconds (longer time for manual verification)
    setTimeout(() => {
      const element = document.getElementById('manualSendLinks');
      if (element) element.remove();
    }, 60000);
  }
  
  // Restore button after success and start 12-second cooldown
  restoreButtonWithCooldown();
  
  } catch (error) {
    console.error('Error in sendtoNC:', error);
    hideSendingModal();
    restoreButton();
    window.alert("An error occurred while sending the program. Please try again. / プログラム送信中にエラーが発生しました。もう一度お試しください。");
  }
  
  function restoreButton() {
    const sendButton = document.getElementById('sendtoNC');
    sendButton.disabled = false;
    sendButton.style.opacity = '1';
    sendButton.style.cursor = 'pointer';
    sendButton.textContent = originalText;
  }
  
  function restoreButtonWithCooldown() {
    const sendButton = document.getElementById('sendtoNC');
    sendButton.textContent = originalText;
    sendButton.style.opacity = '0.7';
    
    // Start 12-second cooldown timer
    let countdown = 12;
    sendButton.textContent = `Send to Machine (${countdown}s)`;
    
    const cooldownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        sendButton.textContent = `Send to Machine (${countdown}s)`;
      } else {
        clearInterval(cooldownInterval);
        sendButton.disabled = false;
        sendButton.style.opacity = '1';
        sendButton.style.cursor = 'pointer';
        sendButton.textContent = originalText;
      }
    }, 1000);
  }
}

// Function to send to a single machine with cooldown protection
function sendToSingleMachine(machine, ip, filename, buttonId) {
  const button = document.getElementById(buttonId);
  
  // Check if button is already in cooldown
  if (button.disabled) {
    return;
  }
  
  // Disable button and start cooldown
  button.disabled = true;
  button.style.opacity = '0.6';
  button.style.cursor = 'not-allowed';
  const originalText = button.textContent;
  
  const url = `http://${ip}:5000/request?filename=${filename}.pce`;
  console.log(`Manual send to ${machine} (${ip}): ${url}`);
  
  // Open the URL
  const newTab = window.open(url, '_blank');
  
  if (newTab && !newTab.closed) {
    console.log(`Manual tab opened for ${machine}`);
    setTimeout(() => {
      try {
        if (!newTab.closed) {
          newTab.close();
          console.log(`Manual tab closed for ${machine}`);
        }
      } catch (e) {
        console.log(`Could not close manual tab for ${machine}:`, e);
      }
    }, 5000);
  } else {
    console.warn(`Manual tab failed to open for ${machine}`);
  }
  
  // Start 12-second cooldown
  let countdown = 12;
  button.textContent = `Sending... (${countdown}s)`;
  
  const cooldownInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      button.textContent = `Wait (${countdown}s)`;
    } else {
      clearInterval(cooldownInterval);
      button.disabled = false;
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
      button.textContent = originalText;
    }
  }, 1000);
}

// Function to show sending modal
function showSendingModal() {
  // Create modal if it doesn't exist
  let modal = document.getElementById('sendingModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'sendingModal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      font-family: Arial, sans-serif;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      padding: 30px;
      border-radius: 10px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      min-width: 300px;
    `;
    
    const spinner = document.createElement('div');
    spinner.style.cssText = `
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3498db;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    `;
    
    const message = document.createElement('div');
    message.style.cssText = `
      font-size: 18px;
      color: #333;
      margin-bottom: 10px;
      font-weight: bold;
    `;
    message.textContent = 'Sending NC Program...';
    
    const subMessage = document.createElement('div');
    subMessage.style.cssText = `
      font-size: 14px;
      color: #666;
    `;
    subMessage.textContent = 'Please wait while the program is being sent to the machine(s)';
    
    modalContent.appendChild(spinner);
    modalContent.appendChild(message);
    modalContent.appendChild(subMessage);
    modal.appendChild(modalContent);
    
    // Add CSS animation for spinner
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(modal);
  }
  
  modal.style.display = 'flex';
}

// Function to hide sending modal
function hideSendingModal() {
  const modal = document.getElementById('sendingModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

document.getElementById('sendtoNC').addEventListener('click', sendtoNC);

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
  document.getElementById('Total_NG').value = totalNG;

  // Calculate Total
  const total = processQuantity - totalNG;

  // Update the Total field
  document.getElementById('total').value = total;
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
function checkValue() {
  var interval = setInterval(function() {
    console.log("selectedFactory: " + selectedFactory);
    if (selectedFactory !== "小瀬") {
      return; // Skip the check if selectedFactory is not "小瀬"
    }

    const selected工場 = document.getElementById('selected工場').value; // Get the current factory value
    const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
    const key = `${uniquePrefix}sendtoNCButtonisPressed`;

    if (localStorage.getItem(key) === null) {
      return; // Skip the check if the key is not present in local storage
    }
    var sendtoNCButtonisPressed = localStorage.getItem(key) === 'true'; // Retrieve the value from local storage
    console.log("sendtoNCButtonisPressed: " + sendtoNCButtonisPressed);

    if (sendtoNCButtonisPressed) {
      clearInterval(interval); // Stop checking if the value is true
    } else {
      // Get the sub-dropdown value
      const subDropdownValue = document.getElementById('sub-dropdown').value;

      // Check if sub-dropdown value is in its default state
      if (!subDropdownValue || subDropdownValue === "Select 背番号 / 品番 / Work Order") {
        console.log("Sub-dropdown is in its default state. Skipping showPopup.");
        return; // Do not call showPopup if the value is default
      }
      console.log("Sub-dropdown value is not default. Showing popup.");

      showPopup();
    }
  }, 30000); // 30000 milliseconds = 30 seconds
}

// Run the checkValue function when the page loads
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

// === Numeric Keypad Functions ===
let currentNumericInputId = null;

function openNumericKeypad(inputId) {
  currentNumericInputId = inputId;
  const modal = document.getElementById('numericKeypadModal');
  const display = document.getElementById('numericDisplay');
  const currentInput = document.getElementById(inputId);
  
  // Set current value in display
  display.value = currentInput.value || '';
  modal.style.display = 'block';
  
  // Prevent body scrolling when modal is open
  document.body.style.overflow = 'hidden';
}

function closeNumericKeypad() {
  const modal = document.getElementById('numericKeypadModal');
  modal.style.display = 'none';
  currentNumericInputId = null;
  
  // Restore body scrolling
  document.body.style.overflow = 'auto';
}

function addToNumericDisplay(digit) {
  const display = document.getElementById('numericDisplay');
  display.value += digit;
}

function clearNumericDisplay() {
  const display = document.getElementById('numericDisplay');
  display.value = '';
}

function backspaceNumericDisplay() {
  const display = document.getElementById('numericDisplay');
  display.value = display.value.slice(0, -1);
}

function confirmNumericInput() {
  if (!currentNumericInputId) return;
  
  const display = document.getElementById('numericDisplay');
  const targetInput = document.getElementById(currentNumericInputId);
  const value = display.value;
  
  // Validate the input (must be positive number)
  if (value === '' || isNaN(value) || parseInt(value) < 0) {
    showAlert('Please enter a valid positive number');
    return;
  }
  
  // Set the value to the target input
  targetInput.value = value;
  
  // Trigger the input event to save to localStorage
  const event = new Event('input', { bubbles: true });
  targetInput.dispatchEvent(event);
  
  closeNumericKeypad();
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
  const modal = document.getElementById('numericKeypadModal');
  if (event.target === modal) {
    closeNumericKeypad();
  }
});

// Handle keyboard input when modal is open
document.addEventListener('keydown', function(event) {
  const modal = document.getElementById('numericKeypadModal');
  if (modal && modal.style.display === 'block') {
    event.preventDefault(); // Prevent default keyboard behavior
    
    if (event.key >= '0' && event.key <= '9') {
      addToNumericDisplay(event.key);
    } else if (event.key === 'Backspace') {
      backspaceNumericDisplay();
    } else if (event.key === 'Enter') {
      confirmNumericInput();
    } else if (event.key === 'Escape') {
      closeNumericKeypad();
    } else if (event.key === 'Delete' || event.key.toLowerCase() === 'c') {
      clearNumericDisplay();
    }
  }
});