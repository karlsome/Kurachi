// this function fetches setsubi list (process.value)
async function fetchSetsubiList() {
  const factory = document.getElementById("selected工場").value;

  try {
    // Fetch data for the process dropdown
    const response = await fetch(`https://mongoloid-lu6c.onrender.com/getSetsubiList?factory=${encodeURIComponent(factory)}`);
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
  const process = document.getElementById("process").value;
  blankInfo();

  try {
    // Fetch 背番号 values from the server based on the selected process
    const response = await fetch(`https://mongoloid-lu6c.onrender.com/getSetsubiByProcess?process=${encodeURIComponent(process)}`);
    const data = await response.json();

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
      option.value = item.背番号;
      option.textContent = item.背番号;
      subDropdown.appendChild(option);
    });

    console.log("Sub-dropdown populated with 背番号 options:", data);
    
  } catch (error) {
    console.error("Error fetching 背番号 data:", error);
  }
}

// Call fetchSetsubiList when the page loads
document.addEventListener("DOMContentLoaded", fetchSetsubiList);
// Also call fetchSebanggo when a new process is selected
document.getElementById("process").addEventListener("change", fetchSebanggo);

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
  document.getElementById("送りピッチ").value = "";
}



async function fetchProductDetails() {
  const serialNumber = document.getElementById("sub-dropdown").value;
  const factory = document.getElementById("selected工場").value;
  // Update the dynamicImage src attribute with the retrieved htmlWebsite value
  const dynamicImage = document.getElementById("dynamicImage");
  dynamicImage.src = "";

  if (!serialNumber) {
    console.error("Please select a valid 背番号.");
    blankInfo();
    return;
  }

  try {
    const response = await fetch(`https://mongoloid-lu6c.onrender.com/getProductDetails?serialNumber=${encodeURIComponent(serialNumber)}&factory=${encodeURIComponent(factory)}`);
    if (response.ok) {
      const data = await response.json();

      // Populate the HTML fields with the retrieved data
      document.getElementById("product-number").value = data.品番 || "";
      document.getElementById("model").value = data.モデル || "";
      document.getElementById("shape").value = data.形状 || "";
      document.getElementById("R-L").value = data["R/L"] || "";
      document.getElementById("material").value = data.材料 || "";
      document.getElementById("material-code").value = data.材料背番号 || "";
      document.getElementById("material-color").value = data.色 || "";
      document.getElementById("kataban").value = data.型番 || "";
      document.getElementById("送りピッチ").textContent = "送りピッチ: " + data.送りピッチ || "";

      
      if (data.htmlWebsite) {
        dynamicImage.src = data.htmlWebsite; // Set the image source to the retrieved URL
        dynamicImage.alt = "Product Image"; // Optional: Set the alt text
        dynamicImage.style.display = "block"; // Ensure the image is visible
      } else {
        dynamicImage.src = ""; // Clear the image source if no URL is available
        dynamicImage.alt = "No Image Available"; // Optional: Set fallback alt text
        dynamicImage.style.display = "none"; // Hide the image if no URL is available
      }
    } else {
      console.error("No matching product found.");
    }
  } catch (error) {
    console.error("Error fetching product details:", error);
  }
}

// Call fetchProductDetails when a new 背番号 is selected
document.getElementById("sub-dropdown").addEventListener("change", fetchProductDetails);




// when time is pressed
function setDefaultTime(input) {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeValue = `${hours}:${minutes}`;
  input.value = timeValue;

  // Save the time to local storage beyatch
  localStorage.setItem(input.id, timeValue);
}

// When date is pressed or on page load, set current date as default
function setDefaultDate(input) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateValue = `${year}-${month}-${day}`;
  input.value = dateValue;

  // Save the date to local storage
  localStorage.setItem(input.id, dateValue);
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
      const response = await fetch(`https://mongoloid-lu6c.onrender.com/getWorkerNames?selectedFactory=${encodeURIComponent(selectedFactory)}`);
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

  // Save the updated value to local storage
  localStorage.setItem(`counter-${counterId}`, currentValue);

  updateTotal();
}

function decrementCounter(counterId) {
  const counterElement = document.getElementById(`counter-${counterId}`);
  let currentValue = parseInt(counterElement.value, 10);
  if (currentValue > 0) {
    currentValue -= 1;
    counterElement.value = currentValue;

    // Save the updated value to local storage
    localStorage.setItem(`counter-${counterId}`, currentValue);

    updateTotal();
  }
}

function updateTotal() {
  // Get the value of Process Quantity
  const processQuantity = parseInt(document.getElementById('ProcessQuantity').value, 10) || 0;

  // Get the values of the counters
  const counter18 = parseInt(document.getElementById('counter-18').value, 10) || 0;
  const counter19 = parseInt(document.getElementById('counter-19').value, 10) || 0;
  const counter20 = parseInt(document.getElementById('counter-20').value, 10) || 0;

  // Calculate Total_NG
  const totalNG = counter18 + counter19 + counter20;

  // Update the Total_NG field
  document.getElementById('Total_NG').value = totalNG;

  // Calculate Total
  const total = processQuantity - totalNG;

  // Update the Total field
  document.getElementById('total').value = total;
}

// Attach updateTotal to relevant events
document.getElementById('ProcessQuantity').addEventListener('input', updateTotal);





// //Submit Button
// document.querySelector('form[name="contact-form"]').addEventListener('submit', async (event) => {
//   event.preventDefault();

//   const qrScannerModal = document.getElementById('qrScannerModal');
//   const html5QrCode = new Html5Qrcode("qrReader");
//   const alertSound = document.getElementById('alert-sound');

//   // Preload alert sound
//   if (alertSound) {
//     alertSound.muted = true; // Mute initially to preload
//     alertSound.loop = false; // Disable looping
//     alertSound.load(); // Preload the audio file
//   }

//   // Show the QR scanner modal
//   qrScannerModal.style.display = 'block';

//   try {
//     await html5QrCode.start(
//       { facingMode: "environment" },
//       {
//         fps: 10,
//         qrbox: { width: 250, height: 250 },
//       },
//       async qrCodeMessage => {
//         console.log("Scanned QR Code for Tracking:", qrCodeMessage);

//         // Check if the scanned QR code is already in "processing"
//         const response = await fetch('http://localhost:3000/checkQRStatus', {
//           method: 'POST',
//           headers: {
//             'Content-Type': 'application/json',
//           },
//           body: JSON.stringify({ ScannedQR: qrCodeMessage })
//         });

//         const data = await response.json();
//         console.log("QR Status Response:", data);

//         if (data.isProcessing) {
//           // Warn the user if the QR code is still in processing
//           const scanAlertModal = document.getElementById('scanAlertModal');
//           document.getElementById('scanAlertText').innerText =
//             "QR code is already in processing! / このQRコードは既に処理中です！";

//           scanAlertModal.style.display = 'block';

//           if (alertSound) {
//             alertSound.muted = false; // Unmute to alert user
//             alertSound.volume = 1; // Set full volume
//             alertSound.play().catch(err => console.error("Failed to play alert sound:", err));
//           }

//           document.body.classList.add('flash-red');

//           const closeScanModalButton = document.getElementById('closeScanModalButton');
//           closeScanModalButton.onclick = function () {
//             scanAlertModal.style.display = 'none';
//             alertSound.pause();
//             alertSound.currentTime = 0; // Reset sound to the beginning
//             alertSound.muted = true; // Mute again for next time
//             document.body.classList.remove('flash-red');
//           };

//           html5QrCode.stop().then(() => {
//             qrScannerModal.style.display = 'none';
//           }).catch(err => console.error("Failed to stop scanning:", err));

//           return; // Stop further submission
//         }

//         // If not in processing, proceed with submission
//         document.getElementById('tracking-QR').value = qrCodeMessage;
//         document.getElementById('Process_Status').value = "processing";

//         html5QrCode.stop().then(() => {
//           qrScannerModal.style.display = 'none';

//           // Prepare and submit the form data
//           const now = new Date();
//           const uniqueID = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}${now.getMilliseconds().toString().padStart(3, '0')}`;

//           // Update Remaining Quantity
//           const Remaining_Quantity = document.getElementById("Remaining_Quantity");
//           Remaining_Quantity.value = document.getElementById("total").value;

//           // Update Cycle time
//           updateCycleTime();

//           // Prepare form data for submission
//           const formData = {
//             uniqueID,
//             背番号: document.getElementById('sub-dropdown').value,
//             品番: document.getElementById('product-number').value,
//             Worker_Name: document.getElementById('Machine Operator').value,
//             Date: document.getElementById('Lot No.').value,
//             Time_start: document.getElementById('Start Time').value,
//             Time_end: document.getElementById('End Time').value,
//             設備: document.getElementById('process').value,
//             材料ロット: document.getElementById('材料ロット').value,
//             Remaining_Quantity: document.getElementById('Remaining_Quantity').value || 0,
//             Spare: document.getElementById('spare').value || 0,
//             疵引不良: document.getElementById('counter-18').value || 0,
//             加工不良: document.getElementById('counter-19').value || 0,
//             Total_NG: document.getElementById('Total_NG').value || 0,
//             ScannedQR: qrCodeMessage,
//             Process_Quantity: document.getElementById('ProcessQuantity').value || 0,
//             Total: document.getElementById('total').value || 0,
//             その他: document.getElementById('counter-20').value || 0,
//             Cycle_Time: document.getElementById("cycleTime").value || 0,
//             Process_Status: document.getElementById("Process_Status").value || "processing",
//           };

//           console.log('Form Data to Submit:', formData);

//           // Submit the form data to the server
//           fetch('http://localhost:3000/submitPressData', {
//             method: 'POST',
//             headers: {
//               'Content-Type': 'application/json',
//             },
//             body: JSON.stringify(formData)
//           })
//             .then(response => {
//               if (!response.ok) {
//                 throw new Error('Failed to submit data');
//               }
//               return response.json();
//             })
//             .then(result => {
//               alert(`Data submitted successfully. Inserted ID: ${result.insertedId}`);
//             })
//             .catch(error => {
//               console.error('Error submitting form:', error);
//               alert('Failed to submit form. Please try again.');
//             });
//         }).catch(err => console.error("Failed to stop scanning:", err));
//       }
//     );
//   } catch (err) {
//     console.error("Failed to start scanning:", err);
//   }

//   document.getElementById('closeQRScannerModal').onclick = function () {
//     html5QrCode.stop().then(() => {
//       qrScannerModal.style.display = 'none';
//     }).catch(err => console.error("Failed to stop scanning:", err));
//   };

//   window.onclick = function (event) {
//     if (event.target === qrScannerModal) {
//       html5QrCode.stop().then(() => {
//         qrScannerModal.style.display = 'none';
//       }).catch(err => console.error("Failed to stop scanning:", err));
//     }
//   };
// });

//new working submit button (this has unli box)
let boxCount = 1; // Default box count
document.querySelector('form[name="contact-form"]').addEventListener('submit', async (event) => {
  event.preventDefault();

  const boxSelectionModal = document.getElementById('boxSelectionModal');
  const closeBoxSelectionModal = document.getElementById('closeBoxSelectionModal');
  const qrScannerModal = document.getElementById('qrScannerModal');
  const html5QrCode = new Html5Qrcode("qrReader");
  const alertSound = document.getElementById('alert-sound');
  
  let scannedQRCodes = []; // Array to store scanned QR codes

  //this generates uniqueID
  const now = new Date();
  const uniqueID = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}${now.getMilliseconds().toString().padStart(3, '0')}`;

  // Preload alert sound
  if (alertSound) {
    alertSound.muted = true; // Mute initially to preload
    alertSound.loop = false; // Disable looping
    alertSound.load(); // Preload the audio file
  }

  // Show box selection modal
  boxSelectionModal.style.display = 'block';

  // Update box count display
  const boxCountDisplay = document.getElementById('boxCountDisplay');
  const increaseBoxCount = document.getElementById('increaseBoxCount');
  const decreaseBoxCount = document.getElementById('decreaseBoxCount');

  const updateBoxCountDisplay = () => {
    boxCountDisplay.textContent = boxCount;
  };

  increaseBoxCount.onclick = () => {
    console.log("plus clicked" + boxCount);
    boxCount++;
    updateBoxCountDisplay();
  };

  decreaseBoxCount.onclick = () => {
    console.log("minus clicked");
    if (boxCount > 1) {
      boxCount--;
    }
    updateBoxCountDisplay();
  };

  updateBoxCountDisplay(); // Initialize display

  // Close the box selection modal when clicking the close button
  closeBoxSelectionModal.onclick = () => {
    boxSelectionModal.style.display = 'none';
  };

  // Dynamic QR Code List
  const qrCodeList = document.getElementById('qrCodeList');
  const updateQRCodeList = () => {
    if (qrCodeList) {
      qrCodeList.innerHTML = scannedQRCodes
        .map((qr, index) => `<li>${index + 1}: ${qr}</li>`)
        .join('');
    }
  };

  // Confirm box count and start scanning
  document.getElementById('confirmBoxCount').onclick = async () => {
    boxSelectionModal.style.display = 'none';
    qrScannerModal.style.display = 'block';
    boxSelectionModal.style.display = 'none';
    scannedQRCodes = []; // Clear scanned QR codes for new session
    updateQRCodeList(); // Initialize list

    try {
      // Start scanning QR codes
      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (qrCodeMessage) => {
          if (scannedQRCodes.includes(qrCodeMessage)) {
            alert("Duplicate QR code scanned. Please scan a different QR code.");
            return;
          }

          // Check if the scanned QR code is already in "processing"
          const response = await fetch('https://mongoloid-lu6c.onrender.com/checkQRStatus', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ScannedQR: qrCodeMessage })
          });

          const data = await response.json();

          if (data.isProcessing) {
            // Alert if the QR code is already in processing
            const scanAlertModal = document.getElementById('scanAlertModal');
            document.getElementById('scanAlertText').innerText =
              "QR code is already in processing! / このQRコードは既に処理中です！";

            scanAlertModal.style.display = 'block';

            if (alertSound) {
              alertSound.muted = false; // Unmute to alert user
              alertSound.volume = 1; // Set full volume
              alertSound.play().catch(err => console.error("Failed to play alert sound:", err));
            }

            document.body.classList.add('flash-red');

            const closeScanModalButton = document.getElementById('closeScanModalButton');
            closeScanModalButton.onclick = function () {
              scanAlertModal.style.display = 'none';
              alertSound.pause();
              alertSound.currentTime = 0; // Reset sound
              alertSound.muted = true; // Mute again
              document.body.classList.remove('flash-red');
            };

            return; // Stop further processing
          }

          // Successfully scanned QR code
          scannedQRCodes.push(qrCodeMessage);
          updateQRCodeList(); // Update the dynamic list
          document.body.classList.add('flash-green');
          setTimeout(() => document.body.classList.remove('flash-green'), 300);

          if (scannedQRCodes.length === boxCount) {
            // Stop scanning when the required number of QR codes is scanned
            html5QrCode.stop().then(() => {
              qrScannerModal.style.display = 'none';

              // Collect all form data
              const formData = {
                uniqueID,
                背番号: document.getElementById('sub-dropdown').value,
                品番: document.getElementById('product-number').value,
                Worker_Name: document.getElementById('Machine Operator').value,
                Date: document.getElementById('Lot No.').value,
                Time_start: document.getElementById('Start Time').value,
                Time_end: document.getElementById('End Time').value,
                設備: document.getElementById('process').value,
                材料ロット: document.getElementById('材料ロット').value,
                Remaining_Quantity: document.getElementById('Remaining_Quantity').value || 0,
                疵引不良: document.getElementById('counter-18').value || 0,
                加工不良: document.getElementById('counter-19').value || 0,
                Total_NG: document.getElementById('Total_NG').value || 0,
                Total: document.getElementById('total').value || 0,
                Spare: document.getElementById('spare').value || 0,
                ScannedQR: scannedQRCodes,
                Process_Quantity: document.getElementById('ProcessQuantity').value || 0,
                その他: document.getElementById('counter-20').value || 0,
                Cycle_Time: document.getElementById('cycleTime').value || 0,
                Process_Status: document.getElementById('Process_Status').value || "processing",
              };

              console.log('Submitting Form Data:', formData);

              // Submit the data to the server
              fetch('https://mongoloid-lu6c.onrender.com/submitPressData', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
              })
                .then(response => {
                  if (!response.ok) {
                    throw new Error('Failed to submit data');
                  }
                  return response.json();
                })
                .then(result => {
                  alert(`Data submitted successfully. Inserted ID: ${result.insertedId}`);
                })
                .catch(error => {
                  console.error('Error submitting form:', error);
                  alert('Failed to submit form. Please try again.');
                });
            }).catch(err => console.error("Failed to stop scanning:", err));
          }
        }
      );
    } catch (err) {
      console.error("Failed to start scanning:", err);
    }
  };

  // Modal close handlers for QR Scanner Modal
  document.getElementById('closeQRScannerModal').onclick = function () {
    html5QrCode.stop().then(() => {
      qrScannerModal.style.display = 'none';
    }).catch(err => console.error("Failed to stop scanning:", err));
  };

  window.onclick = function (event) {
    if (event.target === qrScannerModal) {
      html5QrCode.stop().then(() => {
        qrScannerModal.style.display = 'none';
      }).catch(err => console.error("Failed to stop scanning:", err));
    }
  };
});






//Updates cycle Time value
function updateCycleTime() {
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
}



// //this is a new scan-button code. instead of using windows.alert, it uses modal so that it wont leave the webpage
document.getElementById('scan-button').addEventListener('click', function() {
  const qrScannerModal = document.getElementById('qrScannerModal');
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

  // Start QR code scanning when the modal is displayed
  html5QrCode.start(
      { facingMode: "environment" },
      {
          fps: 10,
          qrbox: { width: 250, height: 250 }
      },
      qrCodeMessage => {
          const subDropdown = document.getElementById('sub-dropdown');
          const options = [...subDropdown.options].map(option => option.value);

          // Check if the scanned QR code does NOT exist in the dropdown options
          if (!options.includes(qrCodeMessage)) {
              const scanAlertModal = document.getElementById('scanAlertModal');
              document.getElementById('scanAlertText').innerText = "背番号が存在しません。 / Sebanggo does not exist.";
              scanAlertModal.style.display = 'block';

              if (alertSound) {
                  alertSound.muted = false; // Unmute to alert user
                  alertSound.volume = 1; // Set full volume
                  alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
              }

              document.body.classList.add('flash-red');

              const closeScanModalButton = document.getElementById('closeScanModalButton');
              closeScanModalButton.onclick = function () {
                  scanAlertModal.style.display = 'none';
                  alertSound.pause();
                  alertSound.currentTime = 0; // Reset sound to the beginning
                  alertSound.muted = true; // Mute again for next time
                  document.body.classList.remove('flash-red');
              };

              html5QrCode.stop().then(() => {
                  qrScannerModal.style.display = 'none';
              }).catch(err => {
                  console.error("Failed to stop scanning:", err);
              });

              return;
          }

          // If a wrong Kanban QR code is detected
          if (subDropdown && subDropdown.value !== "" && subDropdown.value !== qrCodeMessage) {
              html5QrCode.stop().then(() => {
                  qrScannerModal.style.display = 'none';

                  if (alertSound) {
                      alertSound.muted = false;
                      alertSound.volume = 1;
                      alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
                  }

                  document.body.classList.add('flash-red');
                  const scanAlertModal = document.getElementById('scanAlertModal');
                  scanAlertModal.style.display = 'block';

                  const closeScanModalButton = document.getElementById('closeScanModalButton');
                  closeScanModalButton.onclick = function() {
                      scanAlertModal.style.display = 'none';
                      alertSound.pause();
                      alertSound.currentTime = 0;
                      alertSound.muted = true;
                      document.body.classList.remove('flash-red');
                  };
              }).catch(err => {
                  console.error("Failed to stop scanning:", err);
              });

              return;
          }

          // If QR code is the same as the sub-dropdown value, close the scanner
          if (subDropdown && subDropdown.value === qrCodeMessage) {
              html5QrCode.stop().then(() => {
                  qrScannerModal.style.display = 'none';
              }).catch(err => {
                  console.error("Failed to stop scanning:", err);
              });

              return;
          }

          // If QR code is valid but different, process and close the scanner
          if (subDropdown && subDropdown.value !== qrCodeMessage) {
              // resetForm();
              subDropdown.value = qrCodeMessage;
              fetchProductDetails();
              // setTimeout(() => {
              //     window.location.reload();
              // }, 500);

              html5QrCode.stop().then(() => {
                  qrScannerModal.style.display = 'none';
              }).catch(err => {
                  console.error("Failed to stop scanning:", err);
              });
          }
      },
      errorMessage => {
          // Handle scanning errors here
      }
  ).catch(err => {
      console.error("Failed to start scanning:", err);
  });

  document.getElementById('closeQRScannerModal').onclick = function() {
      html5QrCode.stop().then(() => {
          qrScannerModal.style.display = 'none';
      }).catch(err => {
          console.error("Failed to stop scanning:", err);
      });
  };

  window.onclick = function(event) {
      if (event.target == qrScannerModal) {
          html5QrCode.stop().then(() => {
              qrScannerModal.style.display = 'none';
          }).catch(err => {
              console.error("Failed to stop scanning:", err);
          });
      }
  };
});






// function to reset everything then reloads the page
function resetForm() {
  // Clear all form inputs
  const inputs = document.querySelectorAll("input, select, textarea");
  inputs.forEach(input => {
    input.value = '';
  });

  // Clear counters
  for (let i = 1; i <= 18; i++) {
    localStorage.removeItem(`counter-${i}`);
    const counterElement = document.getElementById(`counter-${i}`);
    if (counterElement) {
      counterElement.value = '0'; // Reset the counter display to 0
    }
  }

  // Clear checkbox state and other specific items
  localStorage.removeItem('enable-inputs-checkbox');
  localStorage.removeItem('検査STATUS');
  localStorage.removeItem('sendtoNCButtonisPressed');
  localStorage.removeItem('hatsumonoLabel');
  localStorage.removeItem('atomonoLabel');
  localStorage.removeItem("product-number");
  localStorage.removeItem('process');
  localStorage.removeItem("SRShatsumonoLabel");

  // Uncheck the checkbox and disable inputs
  const checkbox = document.getElementById('enable-inputs');
  if (checkbox) {
    checkbox.checked = false;
    toggleInputs(); // Reuse the existing toggleInputs function to disable the inputs
  }

  // Remove all other form-related local storage items
  inputs.forEach(input => {
    localStorage.removeItem(input.name);
  });

  // reload the page 
  window.location.reload();
}