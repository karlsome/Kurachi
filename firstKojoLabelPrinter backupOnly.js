const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";

// link for pictures database
const picURL = 'https://script.google.com/macros/s/AKfycbwHUW1ia8hNZG-ljsguNq8K4LTPVnB6Ng_GLXIHmtJTdUgGGd2WoiQo9ToF-7PvcJh9bA/exec';


//this code listens to incoming parameters passed
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}
const selectedFactory = getQueryParam('filter');
if (selectedFactory){
  document.getElementById('selected工場').value = selectedFactory;
  console.log("kojo changed to: " + selectedFactory);
}


// Select all input, select, and button elements
const inputs = document.querySelectorAll('input, select, button,textarea');
const selected工場 = document.getElementById('selected工場').value; // Get the current factory value
const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
const uniquePrefix = `${pageName}_${selected工場}_`;

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


// Restore the values of input fields from localStorage on page load
document.addEventListener('DOMContentLoaded', () => {
  const inputs = document.querySelectorAll('input, select, button, textarea'); // Get all input elements
  const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
  const selected工場 = document.getElementById('selected工場')?.value; // Get the selected工場 value
  const processElement = document.getElementById("process");

  if (!selected工場) {
      console.error("Selected 工場 is not set or found.");
      return;
  }

  // Loop through all keys in localStorage
  Object.keys(localStorage).forEach(key => {
      // Check if the key belongs to the current HTML file and selected工場
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
                                  fetchProductDetails(); // for info
                                  
                              } else {
                                  console.error(`Option '${savedValue}' not found in select '${input.id || input.name}'.`);
                              }
                          }, 1000); // Adjust delay if options are populated dynamically
                      } else {
                          input.value = savedValue; // Restore value for text, hidden, and other inputs
                      }
                  }
              });
          }
      }
  });

  // Log the restored value for debugging (Optional)
  if (processElement) {
      console.log('Process value after restoration:', processElement.value); // Debugging the restored process value
  }
});



//FETCH values for sub-dropdown
document.addEventListener('DOMContentLoaded', async () => {
  const subDropdown = document.getElementById('sub-dropdown');

  // Define the query payload
  const queryPayload = {
    dbName: "Sasaki_Coating_MasterDB",
    collectionName: "materialDB",
    aggregation: [
      {
        "$project": {
          "品名": 1,
          "材料背番号": 1,
          "_id": 0
        }
      }
    ]
  };

  try {
    const response = await fetch(`${serverURL}/queries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(queryPayload),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch data");
    }

    const data = await response.json();

    // Extract unique and sorted lists
    const unique材料背番号 = [...new Set(data.map(item => item.材料背番号))].sort((a, b) => a.localeCompare(b, 'ja'));
    const unique品名 = [...new Set(data.map(item => item.品名))].sort((a, b) => a.localeCompare(b, 'ja'));

    // Clear existing options
    subDropdown.innerHTML = '';

    // Add a default "Select an option" choice
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select 材料背番号 or 品名';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    subDropdown.appendChild(defaultOption);

    // Add 材料背番号 options first
    unique材料背番号.forEach(材料背番号 => {
      const option = document.createElement('option');
      option.value = 材料背番号;
      option.textContent = 材料背番号;
      subDropdown.appendChild(option);
    });

    // Add a separator for 品名 (optional)
    if (unique品名.length > 0) {
      const separator = document.createElement('option');
      separator.disabled = true;
      separator.textContent = '── 品名一覧 ──'; // "List of Product Names"
      subDropdown.appendChild(separator);
    }

    // Add 品名 options next
    unique品名.forEach(品名 => {
      const option = document.createElement('option');
      option.value = 品名;
      option.textContent = 品名;
      subDropdown.appendChild(option);
    });

  } catch (error) {
    console.error('Error fetching data:', error);
  }
});







//blanks the info page
function blankInfo() {
  // Clear the value of the label with id "SRScode"
  //document.getElementById("SRScode").textContent = "";

  // Clear the values of all input fields
  document.getElementById("材料背番号").value = "";
  document.getElementById("status").value = "";
  document.getElementById("品名").value = "";
  document.getElementById("material").value = "";
  document.getElementById("material-color").value = "";
}



async function fetchProductDetails() {
  const serialNumber = document.getElementById("sub-dropdown").value;
  const factory = document.getElementById("selected工場").value;
  const dynamicImage = document.getElementById("dynamicImage");
  dynamicImage.src = ""; // Reset the image

  if (!serialNumber) {
    console.error("Please select a valid 背番号.");
    blankInfo();
    return;
  }

  // Define the query payload
  const queryPayload = {
    dbName: "Sasaki_Coating_MasterDB",
    collectionName: "materialDB",
    query: {
      "$or": [
        { "品名": serialNumber }, // Match if serialNumber is a 品名
        { "材料背番号": serialNumber } // Match if serialNumber is a 材料背番号
      ]
    }
  };

  try {
    const response = await fetch(`${serverURL}/queries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(queryPayload),
    });

    if (response.ok) {
      const data = await response.json();

      if (data.length === 0) {
        console.error("No matching product found.");
        blankInfo();
        return;
      }

      const product = data[0]; // Assuming we get only one matching product

      // Populate the HTML fields with the retrieved data
      document.getElementById("品名").value = product.品名 || "";
      document.getElementById("材料背番号").value = product.材料背番号 || "";
      document.getElementById("material").value = product.材料 || "";
      document.getElementById("material-color").value = product.色 || "";
      document.getElementById("length").value = product.length || "";
    } else {
      console.error("Error fetching product details:", response.statusText);
      blankInfo();
    }
  } catch (error) {
    console.error("Error fetching product details:", error);
    blankInfo();
  }

  // Fetch and update product image separately
  picLINK(serialNumber);
}

// Call fetchProductDetails when a new 背番号 is selected
document.getElementById("sub-dropdown").addEventListener("change", fetchProductDetails);



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



//scan Button
document.getElementById('scan-button').addEventListener('click', function () {
  const scanOptionModal = document.getElementById('scanOptionModal');
  scanOptionModal.style.display = 'block';
});

// Function to start the camera-based QR scanner
function startCameraScanner() {
  const qrScannerModal = document.getElementById('qrScannerModal');
  const scanAlertModal = document.getElementById('scanAlertModal');
  const scanAlertText = document.getElementById('scanAlertText');
  const alertSound = document.getElementById('alert-sound');

  const html5QrCode = new Html5Qrcode("qrReader");

  // Preload alert sound
  if (alertSound) {
      alertSound.muted = true;
      alertSound.loop = false;
      alertSound.load();
  }

  // Hide option modal & show scanner
  document.getElementById('scanOptionModal').style.display = 'none';
  qrScannerModal.style.display = 'block';

  html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async qrCodeMessage => {
          handleScannedQR(qrCodeMessage);
          html5QrCode.stop().then(() => {
              qrScannerModal.style.display = 'none';
          }).catch(err => console.error("Failed to stop scanning:", err));
      }
  ).catch(err => console.error("Failed to start scanning:", err));

  document.getElementById('closeQRScannerModal').onclick = function () {
      html5QrCode.stop().then(() => {
          qrScannerModal.style.display = 'none';
      }).catch(err => console.error("Failed to stop scanning:", err));
  };
}

// Function to start Bluetooth Scanner (Keyboard Input Mode)
function startBluetoothScanner() {
  const bluetoothScannerModal = document.getElementById('bluetoothScannerModal');
  bluetoothScannerModal.style.display = 'block';
  document.getElementById('scanOptionModal').style.display = 'none';

  let qrInputBuffer = ""; // Buffer for storing keyboard input

  function handleKeydown(event) {
    // Ignore non-character keys (e.g., Shift, Ctrl, Alt, Arrow keys, etc.)
    if (event.key.length === 1) {
        qrInputBuffer += event.key; // Append only valid characters
    }

    // If Enter is pressed, process the scanned QR code
    if (event.key === "Enter") {
        if (qrInputBuffer.trim() !== "") {
            // Replace "(" with "*"
            let cleanedQR = qrInputBuffer.trim().replace(/\(/g, "*");

            console.log("Captured QR Code:", cleanedQR);
            handleScannedQR(cleanedQR);
            
            // Reset buffer and close modal
            qrInputBuffer = "";
            bluetoothScannerModal.style.display = 'none';

            // Remove event listener after scanning
            document.removeEventListener("keydown", handleKeydown);
        }
    }
}


  // Start listening for keyboard input
  document.addEventListener("keydown", handleKeydown);

  // Close modal if user clicks outside or presses ESC
  window.onclick = function (event) {
      if (event.target == bluetoothScannerModal) {
          bluetoothScannerModal.style.display = 'none';
          document.removeEventListener("keydown", handleKeydown);
      }
  };

  document.getElementById("closeBluetoothScannerModal").onclick = function () {
      bluetoothScannerModal.style.display = 'none';
      document.removeEventListener("keydown", handleKeydown);
  };
}



// Handle scanned QR code (Both Camera & Bluetooth)
async function handleScannedQR(qrCodeMessage) {
  const subDropdown = document.getElementById('sub-dropdown');
  const options = [...subDropdown.options].map(option => option.value);
  const scanAlertModal = document.getElementById('scanAlertModal');
  const scanAlertText = document.getElementById('scanAlertText');
  const alertSound = document.getElementById('alert-sound');
  const statusInput = document.getElementById("status"); // Status input field

  console.log("Scanned QR Code:", qrCodeMessage);

  if (!options.includes(qrCodeMessage)) {
      scanAlertText.innerText = "背番号が存在しません。 / Sebanggo does not exist.";
      scanAlertModal.style.display = 'block';

      if (alertSound) {
          alertSound.muted = false;
          alertSound.volume = 1;
          alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
      }

      document.body.classList.add('flash-red');

      document.getElementById('closeScanModalButton').onclick = function () {
          scanAlertModal.style.display = 'none';
          alertSound.pause();
          alertSound.currentTime = 0;
          alertSound.muted = true;
          document.body.classList.remove('flash-red');
      };

      return;
  }

  if (subDropdown && subDropdown.value !== qrCodeMessage) {
      subDropdown.value = qrCodeMessage;
      localStorage.setItem(`${uniquePrefix}sub-dropdown`, qrCodeMessage);
      await fetchProductDetails();

      // Get the current date in yyMMdd format
      const now = new Date();
      const year = String(now.getFullYear()).slice(-2);
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const currentDate = `${year}${month}${day}`;

      // Get the 品名 value from the fetched product details
      const 品名 = document.getElementById("品名").value;

      // Define the query payload for materialRequestDB
      const queryPayload = {
        dbName: "submittedDB",
        collectionName: "materialRequestDB",
        query: {
          "品番": 品名,
          "納期": currentDate
        }
      };

      try {
        const response = await fetch(`${serverURL}/queries`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(queryPayload),
        });

        if (response.ok) {
          const data = await response.json();

          if (data.length === 0) {
            console.log("No matching request found in materialRequestDB.");
            scanAlertText.innerText = "Request not found in materialRequestDB.";
            scanAlertModal.style.display = 'block';

            if (alertSound) {
                alertSound.muted = false;
                alertSound.volume = 1;
                alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
            }

            document.body.classList.add('flash-red');

            document.getElementById('closeScanModalButton').onclick = function () {
                scanAlertModal.style.display = 'none';
                alertSound.pause();
                alertSound.currentTime = 0;
                alertSound.muted = true;
                document.body.classList.remove('flash-red');
            };

            return;
          }

          const request = data[0]; // Assuming we get only one matching request

          // 🔵 Update STATUS field in the UI
          if (statusInput) {
              if (!request.STATUS || request.STATUS.trim() === "") {
                  statusInput.value = "加工中"; // If STATUS is blank
              } else if (request.STATUS === "Completed") {
                  statusInput.value = "完了"; // If STATUS is "Completed"
              } else {
                  statusInput.value = request.STATUS; // Any other unexpected STATUS
              }
              console.log("Updated STATUS:", statusInput.value);
          }

          // Calculate the desired roll times
          const 生産数 = parseInt(request.生産数, 10);
          const length = parseInt(document.getElementById("length").value, 10);
          const order = parseInt(request.生産順番, 10);
          console.log("order: "+ order/10);

          if (!isNaN(生産数) && !isNaN(length) && length > 0) {
            const rollTimes = 生産数 / length;
            const roundedRollTimes = Math.ceil(rollTimes); // Round up to the next whole number
            console.log("Desired roll times:", roundedRollTimes);
        
            // Set order value divided by 10 to the hidden input field
            const orderInput = document.getElementById("order");
            if (orderInput) {
                orderInput.value = order / 10;
                console.log("Set hidden order value:", orderInput.value);
            }
        
            // Set rounded roll times to the hidden input field
            const printTimesInput = document.getElementById("printTimes");
            if (printTimesInput) {
                printTimesInput.value = roundedRollTimes;
                console.log("Set hidden printTimes value:", printTimesInput.value);
            }
        } else {
            console.error("Invalid 生産数 or length value.");
        }
        } else {
          console.error("Error fetching request details:", response.statusText);
        }
      } catch (error) {
        console.error("Error fetching request details:", error);
      }
  }
}




// Function to reset everything and reload the page
function resetForm() {
  const uniquePrefix = `${pageName}_${selected工場}_`;
  const excludedInputs = ['process']; // IDs or names of inputs to exclude from reset

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
  for (let i = 18; i <= 20; i++) {
      const key = `${uniquePrefix}counter-${i}`;
      localStorage.removeItem(key);
      const counterElement = document.getElementById(`counter-${i}`);
      if (counterElement) {
          counterElement.value = '0'; // Reset counter display
      }
  }

  // Reload the page
  window.location.reload();
}



//this is default printing
// // Print label using "Smooth Print" app for mobile devices
// function printLabel() {
//   const alertSound = document.getElementById('alert-sound');
//   const scanAlertModal = document.getElementById('scanAlertModal');
//   const scanAlertText = document.getElementById('scanAlertText');
//   const selectedFactory = document.getElementById("selected工場").value;
//   const 背番号 =  document.getElementById("材料背番号").value;

//   // Preload the alert sound without playing it
//   if (alertSound) {
//     alertSound.muted = true; // Mute initially to preload
//     alertSound.loop = false; // Disable looping
//     alertSound.load(); // Preload the audio file
//   }

//   // Check if 背番号 is selected
//   if (!背番号) {
//     // Show alert modal
//     scanAlertText.innerText = '背番号が必要です。 / Sebanggo is required.';
//     scanAlertModal.style.display = 'block';

//     // Play alert sound
//     if (alertSound) {
//       alertSound.muted = false; // Unmute to alert user
//       alertSound.volume = 1; // Set full volume
//       alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
//     }

//     // Add blinking red background
//     document.body.classList.add('flash-red');

//     // Close modal on button click
//     const closeScanModalButton = document.getElementById('closeScanModalButton');
//     closeScanModalButton.onclick = function () {
//       scanAlertModal.style.display = 'none';
//       alertSound.pause();
//       alertSound.currentTime = 0; // Reset sound to the beginning
//       alertSound.muted = true; // Mute again for next time
//       document.body.classList.remove('flash-red');
//     };

//     return; // Stop the submission process
//   }

 

//   // Default process for other 背番号 values]
//   // Convert yyyy-mm-dd to yymmdd format
//   const originalDate = document.getElementById('Lot No.').value;
//   const dateParts = originalDate.split("-");
//   const Date2 = `${dateParts[0].slice(-2)}${dateParts[1]}${dateParts[2]}`; // Extract last 2 digits of year
//   const 品番 = document.getElementById("品名").value;
//   const 色 = document.getElementById("material-color").value;
//   const extension = document.getElementById("Labelextension").value;
//   const length = document.getElementById("length").value;
//   const order = document.getElementById("order").value;

//   const Date = extension ? `${Date2}-${extension}` : Date2;

//   const 品番収容数 = `${背番号},${Date2}-${extension},${length}`; //barcode value
//   console.log("label QR Value: " + 品番収容数);

  
//   let filename = "";

  

//   if (SRS === "有り"){
//     filename = "SRS3.lbx";
//   } else if (背番号 === "NC2"){
//       filename = "NC21.lbx"
//   } else {
//     filename = "firstkojo3.lbx";
//   }
  
//   const size = "RollW62";
//   const copies = 1;
//   const url =
//     `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=${encodeURIComponent(copies)}` +
//     `&text_品番=${encodeURIComponent(品番)}` +
//     `&text_背番号=${encodeURIComponent(背番号)}` +
//     `&text_収容数=${encodeURIComponent(order)}` +
//     `&text_色=${encodeURIComponent(色)}` +
//     `&text_DateT=${encodeURIComponent(Date)}` +
//     `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

//   console.log("lot number: " + Date);
//   window.location.href = url;
// }


//This is the perfect printing
// // Print label using "Smooth Print" app for mobile devices
// async function printLabel() {
//   const alertSound = document.getElementById('alert-sound');
//   const scanAlertModal = document.getElementById('scanAlertModal');
//   const scanAlertText = document.getElementById('scanAlertText');
//   const selectedFactory = document.getElementById("selected工場").value;
//   const 背番号 = document.getElementById("材料背番号").value;
//   const 品番 = document.getElementById("品名").value;
//   const 色 = document.getElementById("material-color").value;
//   const length = document.getElementById("length").value;
//   const order = document.getElementById("order").value;
//   const copies = parseInt(document.getElementById("Labelextension").value) || 1; // Number of copies

//   // Use the global uniquePrefix
//   const storageKey = `${uniquePrefix}${品番}`;

//   // Get current date in yyMMdd format
//   const originalDate = document.getElementById('Lot No.').value;
//   const dateParts = originalDate.split("-");
//   const currentDate = `${dateParts[0].slice(-2)}${dateParts[1]}${dateParts[2]}`; // Extract last 2 digits of year

//   // Check if 背番号 is selected
//   if (!背番号) {
//       scanAlertText.innerText = '背番号が必要です。 / Sebanggo is required.';
//       scanAlertModal.style.display = 'block';
//       return;
//   }

//   // Get stored tracker data
//   let storedData = JSON.parse(localStorage.getItem(storageKey)) || { date: currentDate, extension: 0 };

//   // Reset extension if date changes
//   if (storedData.date !== currentDate) {
//       storedData = { date: currentDate, extension: 0 };
//   }

//   // Process multiple copies
//   for (let i = 1; i <= copies; i++) {
//       storedData.extension++; // Increment extension per print
//       const extension = storedData.extension;
//       const DateWithExtension = `${currentDate}-${extension}`;

//       const 品番収容数 = `${背番号},${DateWithExtension},${length}`;
//       console.log("label QR Value:", 品番収容数);

//       let filename = "";
//       if (typeof SRS !== "undefined" && SRS === "有り") {
//           filename = "SRS3.lbx";
//       } else if (背番号 === "NC2") {
//           filename = "NC21.lbx";
//       } else {
//           filename = "firstkojo3.lbx";
//       }

//       const size = "RollW62";

//       // Generate print URL
//       const url =
//           `http://localhost:8088/print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=1` +
//           `&text_品番=${encodeURIComponent(品番)}` +
//           `&text_背番号=${encodeURIComponent(背番号)}` +
//           `&text_収容数=${encodeURIComponent(order)}` +
//           `&text_色=${encodeURIComponent(色)}` +
//           `&text_DateT=${encodeURIComponent(DateWithExtension)}` +
//           `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

//       try {
//           const response = await fetch(url);
//           const responseText = await response.text(); // Get response as text

//           // Check for success or error message in XML response
//           if (responseText.includes("<result>SUCCESS</result>")) {
//               console.log("Print Success");
//           } else if (responseText.includes("PrinterStatusErrorCoverOpen")) {
//               console.error("Printer Error: Cover is open.");
//           } else {
//               console.error("Unknown Printer Error:", responseText);
//           }
//       } catch (error) {
//           console.error("Failed to print:", error);
//       }
//   }

//   // Save updated tracker to local storage
//   localStorage.setItem(storageKey, JSON.stringify(storedData));
// }





// // Show print confirmation modal
// function showPrintConfirmationModal() {
//   const subDropdown = document.getElementById('sub-dropdown');
//   const selectedValue = subDropdown.value;
//   const scanAlertModal = document.getElementById('scanAlertModal');
//   const scanAlertText = document.getElementById('scanAlertText');
//   const alertSound = document.getElementById('alert-sound');

//   if (!selectedValue) {
//       scanAlertText.innerText = '背番号が必要です。 / Sebanggo is required.';
//       scanAlertModal.style.display = 'block';

//       if (alertSound) {
//           alertSound.muted = false;
//           alertSound.volume = 1;
//           alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
//       }

//       document.body.classList.add('flash-red');

//       document.getElementById('closeScanModalButton').onclick = function () {
//           scanAlertModal.style.display = 'none';
//           alertSound.pause();
//           alertSound.currentTime = 0;
//           alertSound.muted = true;
//           document.body.classList.remove('flash-red');
//       };

//       return;
//   }

//   // Set the default print times value
//   const printTimes = document.getElementById('printTimes').value;
//   document.getElementById('printTimesDisplay').innerText = printTimes;
//   document.getElementById('printConfirmationModal').style.display = 'block';
// }

// // Increment print times
// function incrementPrintTimes() {
//   const printTimesInput = document.getElementById('printTimes');
//   let printTimes = parseInt(printTimesInput.value, 10);
//   printTimes++;
//   printTimesInput.value = printTimes;
//   document.getElementById('printTimesDisplay').innerText = printTimes;
// }

// // Decrement print times
// function decrementPrintTimes() {
//   const printTimesInput = document.getElementById('printTimes');
//   let printTimes = parseInt(printTimesInput.value, 10);
//   if (printTimes > 1) {
//       printTimes--;
//       printTimesInput.value = printTimes;
//       document.getElementById('printTimesDisplay').innerText = printTimes;
//   }
// }

// // When user confirms print
// function confirmPrint() {
//   document.getElementById('printConfirmationModal').style.display = 'none';
//   document.getElementById('printingStatusModal').style.display = 'block';
  
//   // Call the print function only after confirmation
//   printLabel();
// }


// // Modify printLabel function to print one at a time, wait for success, timeout after 7 seconds, then update MongoDB
// async function printLabel() {
//   const alertSound = document.getElementById('alert-sound');
//   const scanAlertModal = document.getElementById('scanAlertModal');
//   const scanAlertText = document.getElementById('scanAlertText');
//   const printingStatusModal = document.getElementById('printingStatusModal');
//   const selectedFactory = document.getElementById("selected工場").value;
//   const 背番号 = document.getElementById("材料背番号").value;
//   const 品番 = document.getElementById("品名").value;
//   const 色 = document.getElementById("material-color").value;
//   const length = document.getElementById("length").value;
//   const order = document.getElementById("order").value;
//   const copies = parseInt(document.getElementById("printTimes").value) || 1; // Number of copies

//   console.log("Starting print process for", copies, "copies...");

//   if (!背番号) {
//       showPrintError('背番号が必要です。 / Sebanggo is required.');
//       return;
//   }

//   const storageKey = `${uniquePrefix}${品番}`;

//   // Get current date in yyMMdd format
//   const originalDate = document.getElementById('Lot No.').value;
//   const dateParts = originalDate.split("-");
//   const currentDate = `${dateParts[0].slice(-2)}${dateParts[1]}${dateParts[2]}`; // Extract last 2 digits of year

//   let storedData = JSON.parse(localStorage.getItem(storageKey)) || { date: currentDate, extension: 0 };

//   if (storedData.date !== currentDate) {
//       storedData = { date: currentDate, extension: 0 };
//   }

//   // Show printing status modal before starting
//   printingStatusModal.style.display = 'block';

//   for (let i = 1; i <= copies; i++) {
//       storedData.extension++;
//       const extension = storedData.extension;
//       const DateWithExtension = `${currentDate}-${extension}`;

//       const 品番収容数 = `${背番号},${DateWithExtension},${length}`;
//       console.log(`Printing copy ${i} of ${copies}:`, 品番収容数);

//       let filename = "";
//       if (typeof SRS !== "undefined" && SRS === "有り") {
//           filename = "SRS3.lbx";
//       } else if (背番号 === "NC2") {
//           filename = "NC21.lbx";
//       } else {
//           filename = "firstkojo3.lbx";
//       }

//       const size = "RollW62";

//       const url =
//           `http://localhost:8088/print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=1` +
//           `&text_品番=${encodeURIComponent(品番)}` +
//           `&text_背番号=${encodeURIComponent(背番号)}` +
//           `&text_収容数=${encodeURIComponent(order)}` +
//           `&text_色=${encodeURIComponent(色)}` +
//           `&text_DateT=${encodeURIComponent(DateWithExtension)}` +
//           `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

//       console.log("Sending print request:", url);

//       try {
//           const response = await Promise.race([
//               fetch(url).then(res => res.text()), // Fetch the print request
//               new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout: No response from printer")), 7000)) // 7s timeout
//           ]);

//           if (response.includes("<result>SUCCESS</result>")) {
//               console.log(`Print ${i} of ${copies} successful.`);
//           } else if (response.includes("PrinterStatusErrorCoverOpen")) {
//               showPrintError("Printer Error: Cover is open.");
//               return; // Stop further printing
//           } else {
//               showPrintError("Printing failed. Please check the printer.");
//               return; // Stop further printing
//           }

//           // Short delay before sending the next print job
//           await new Promise(resolve => setTimeout(resolve, 2000));

//       } catch (error) {
//           showPrintError("Printing failed. No response from printer.");
//           return; // Stop further printing
//       }
//   }

//   localStorage.setItem(storageKey, JSON.stringify(storedData));

//   // Step 2: Update MongoDB after successful print
//   console.log("All copies printed successfully. Now updating MongoDB...");
//   await updateMongoDB(品番, currentDate);

//   // Hide printing status modal and show success message
//   printingStatusModal.style.display = 'none';
//   console.log("All copies printed successfully.");
//   document.getElementById('printCompletionModal').style.display = 'block';
// }

// // Function to handle print errors with sound, blinking, and closing status modal
// function showPrintError(errorMessage) {
//   const scanAlertModal = document.getElementById('scanAlertModal');
//   const scanAlertText = document.getElementById('scanAlertText');
//   const alertSound = document.getElementById('alert-sound');
//   const printingStatusModal = document.getElementById('printingStatusModal');

//   // Close printing status modal
//   printingStatusModal.style.display = 'none';

//   scanAlertText.innerText = errorMessage;
//   scanAlertModal.style.display = 'block';

//   if (alertSound) {
//       alertSound.muted = false;
//       alertSound.volume = 1;
//       alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
//   }

//   // Add red blinking effect
//   document.body.classList.add('flash-red');

//   document.getElementById('closeScanModalButton').onclick = function () {
//       scanAlertModal.style.display = 'none';
//       alertSound.pause();
//       alertSound.currentTime = 0;
//       alertSound.muted = true;
//       document.body.classList.remove('flash-red');
//   };
// }

// // Function to update MongoDB after successful print using /queries
// async function updateMongoDB(品番, currentDate) {
//   const now = new Date();
//   const hours = String(now.getHours()).padStart(2, '0');
//   const minutes = String(now.getMinutes()).padStart(2, '0');
//   const seconds = String(now.getSeconds()).padStart(2, '0');
//   const currentTime = `${hours}:${minutes}:${seconds}`; // HHmmss format

//   const queryPayload = {
//       dbName: "submittedDB",
//       collectionName: "materialRequestDB",
//       query: {
//           "品番": 品番,
//           "納期": currentDate
//       }
//   };

//   try {
//       // Step 1: Check if the document exists
//       const response = await fetch(`${serverURL}/queries`, {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify(queryPayload)
//       });

//       if (!response.ok) {
//           console.error("MongoDB query failed:", response.statusText);
//           return;
//       }

//       const data = await response.json();

//       if (data.length === 0) {
//           console.log(`No matching document found for 品番: ${品番} and 納期: ${currentDate}.`);
//           return;
//       }

//       // Step 2: Use /queries to update the document
//       const updatePayload = {
//           dbName: "submittedDB",
//           collectionName: "materialRequestDB",
//           query: {
//               "品番": 品番,
//               "納期": currentDate
//           },
//           update: {
//               "$set": {
//                   "STATUS": "Completed",
//                   "DateofCreation": currentDate,
//                   "TimeofCreation": currentTime
//               }
//           }
//       };

//       const updateResponse = await fetch(`${serverURL}/queries`, {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify(updatePayload)
//       });

//       const updateResult = await updateResponse.json();

//       if (updateResponse.ok && updateResult.modifiedCount > 0) {
//           window.alert(`✅ MongoDB update successful for 品番: ${品番}`);
//       } else {
//           window.alert("❌ MongoDB update failed or no document modified:", updateResult);
//       }
//   } catch (error) {
//       window.alert("❌ Error updating MongoDB:", error);
//   }
// }






// Show print confirmation modal
function showPrintConfirmationModal() {
  const subDropdown = document.getElementById('sub-dropdown');
  const selectedValue = subDropdown.value;
  const scanAlertModal = document.getElementById('scanAlertModal');
  const scanAlertText = document.getElementById('scanAlertText');
  const alertSound = document.getElementById('alert-sound');

  if (!selectedValue) {
      scanAlertText.innerText = '背番号が必要です。 / Sebanggo is required.';
      scanAlertModal.style.display = 'block';

      if (alertSound) {
          alertSound.muted = false;
          alertSound.volume = 1;
          alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
      }

      document.body.classList.add('flash-red');

      document.getElementById('closeScanModalButton').onclick = function () {
          scanAlertModal.style.display = 'none';
          alertSound.pause();
          alertSound.currentTime = 0;
          alertSound.muted = true;
          document.body.classList.remove('flash-red');
      };

      return;
  }

  // Set the default print times value
  const printTimes = document.getElementById('printTimes').value;
  document.getElementById('printTimesDisplay').innerText = printTimes;
  document.getElementById('printConfirmationModal').style.display = 'block';
}

// Increment print times
function incrementPrintTimes() {
  const printTimesInput = document.getElementById('printTimes');
  let printTimes = parseInt(printTimesInput.value, 10);
  printTimes++;
  printTimesInput.value = printTimes;
  document.getElementById('printTimesDisplay').innerText = printTimes;
}

// Decrement print times
function decrementPrintTimes() {
  const printTimesInput = document.getElementById('printTimes');
  let printTimes = parseInt(printTimesInput.value, 10);
  if (printTimes > 1) {
      printTimes--;
      printTimesInput.value = printTimes;
      document.getElementById('printTimesDisplay').innerText = printTimes;
  }
}

// When user confirms print
function confirmPrint() {
  document.getElementById('printConfirmationModal').style.display = 'none';
  document.getElementById('printingStatusModal').style.display = 'block';
  
  // Call the print function only after confirmation
  printLabel();
}


let cancelPrinting = false; // Flag to track cancellation

// Attach event listener to cancel button
document.getElementById('cancelPrintButton').addEventListener('click', cancelPrint);

// Function to cancel printing
function cancelPrint() {
    cancelPrinting = true;
    document.getElementById('printingStatusModal').style.display = 'none';
    console.log("Printing cancelled by user.");
}

// Modify printLabel function to track successful prints and allow cancellation
async function printLabel() {
    const alertSound = document.getElementById('alert-sound');
    const scanAlertModal = document.getElementById('scanAlertModal');
    const scanAlertText = document.getElementById('scanAlertText');
    const printingStatusModal = document.getElementById('printingStatusModal');
    const selectedFactory = document.getElementById("selected工場").value;
    const 背番号 = document.getElementById("材料背番号").value;
    const 品番 = document.getElementById("品名").value;
    const 色 = document.getElementById("material-color").value;
    const length = document.getElementById("length").value;
    const order = document.getElementById("order").value;
    const totalPrintTimes = parseInt(document.getElementById("printTimes").value) || 1;

    console.log("Starting print process for", totalPrintTimes, "copies...");

    if (!背番号) {
        showPrintError('背番号が必要です。 / Sebanggo is required.');
        return;
    }

    const storageKey = `${uniquePrefix}${品番}`;

    // Get current date in yyMMdd format
    const originalDate = document.getElementById('Lot No.').value;
    const dateParts = originalDate.split("-");
    const currentDate = `${dateParts[0].slice(-2)}${dateParts[1]}${dateParts[2]}`;

    let storedData = JSON.parse(localStorage.getItem(storageKey)) || { date: currentDate, printedTimes: 0 };

    if (storedData.date !== currentDate) {
        storedData = { date: currentDate, printedTimes: 0 };
    }

    // Calculate remaining prints
    let remainingPrints = totalPrintTimes - storedData.printedTimes;
    if (remainingPrints <= 0) {
        console.log("All prints already completed.");
        return;
    }

    // Show printing status modal before starting
    printingStatusModal.style.display = 'block';
    cancelPrinting = false; // Reset cancel flag

    for (let i = 1; i <= remainingPrints; i++) {
        if (cancelPrinting) {
            console.log(`Printing cancelled. ${i - 1} prints were successful.`);
            break;
        }

        storedData.printedTimes++;
        const DateWithExtension = `${currentDate}-${storedData.printedTimes}`;

        const 品番収容数 = `${背番号},${DateWithExtension},${length}`;
        console.log(`Printing copy ${i} of ${remainingPrints}:`, 品番収容数);

        let filename = 背番号 === "NC2" ? "NC21.lbx" : "firstkojo3.lbx";
        const size = "RollW62";

        const url =
            `http://localhost:8088/print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=1` +
            `&text_品番=${encodeURIComponent(品番)}` +
            `&text_背番号=${encodeURIComponent(背番号)}` +
            `&text_収容数=${encodeURIComponent(order)}` +
            `&text_色=${encodeURIComponent(色)}` +
            `&text_DateT=${encodeURIComponent(DateWithExtension)}` +
            `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

        console.log("Sending print request:", url);

        try {
            const response = await Promise.race([
                fetch(url).then(res => res.text()), // Fetch the print request
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout: No response from printer")), 7000)) // 7s timeout
            ]);

            if (response.includes("<result>SUCCESS</result>")) {
                console.log(`Print ${i} of ${remainingPrints} successful.`);
            } else {
                showPrintError("Printing failed. Please check the printer.");
                return;
            }

            // Save progress locally
            localStorage.setItem(storageKey, JSON.stringify(storedData));

            // Update MongoDB with the successful print count
            await updatePrintCountInMongoDB(品番, currentDate, storedData.printedTimes, totalPrintTimes);

            // Short delay before next print job
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            showPrintError("Printing failed. No response from printer.");
            return;
        }
    }

    // Hide modal and show completion message
    printingStatusModal.style.display = 'none';
    document.getElementById('printCompletionModal').style.display = 'block';
}

// Function to update MongoDB with printed count
async function updatePrintCountInMongoDB(品番, currentDate, printedTimes, totalPrintTimes) {
    let statusValue = printedTimes >= totalPrintTimes ? "完了" : "加工中"; // Update status based on prints

    const updatePayload = {
        dbName: "submittedDB",
        collectionName: "materialRequestDB",
        query: {
            "品番": 品番,
            "納期": currentDate
        },
        update: {
            "$set": {
                "printTimes": totalPrintTimes,
                "printedTimes": printedTimes,
                "STATUS": statusValue
            }
        }
    };

    try {
        const updateResponse = await fetch(`${serverURL}/queries`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatePayload)
        });

        const updateResult = await updateResponse.json();

        if (updateResponse.ok && updateResult.modifiedCount > 0) {
            console.log(`✅ MongoDB updated: ${printedTimes}/${totalPrintTimes} prints completed.`);
        } else {
            console.error("❌ MongoDB update failed or no document modified:", updateResult);
        }
    } catch (error) {
        console.error("❌ Error updating MongoDB:", error);
    }
}

// Function to handle print errors
function showPrintError(errorMessage) {
    const scanAlertModal = document.getElementById('scanAlertModal');
    const scanAlertText = document.getElementById('scanAlertText');
    const alertSound = document.getElementById('alert-sound');
    const printingStatusModal = document.getElementById('printingStatusModal');

    printingStatusModal.style.display = 'none';

    scanAlertText.innerText = errorMessage;
    scanAlertModal.style.display = 'block';

    if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
    }

    document.body.classList.add('flash-red');

    document.getElementById('closeScanModalButton').onclick = function () {
        scanAlertModal.style.display = 'none';
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.muted = true;
        document.body.classList.remove('flash-red');
    };
}
