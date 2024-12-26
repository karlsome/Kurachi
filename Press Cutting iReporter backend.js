
const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";


// this code will ping the Render website for inactivity
const interval = 30000; // 30 seconds
function pingServer() {
  fetch(`${serverURL}/getSeBanggoList`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      console.log(`Pinged at ${new Date().toISOString()}: Status Code ${response.status}`);
    })
    .catch(error => {
      console.error(`Error pinging at ${new Date().toISOString()}:`, error.message);
    });
}
setInterval(pingServer, interval);


//this code listens to incoming parameters passed
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}
const selectedFactory = getQueryParam('filter');
if (selectedFactory){
  document.getElementById('selected工場').value = selectedFactory;
  document.getElementById('nippoTitle').textContent=selectedFactory + "プレス日報";
  console.log("kojo changed to: " + selectedFactory);
}



// this function fetches setsubi list (process.value)
async function fetchSetsubiList() {
  const factory = document.getElementById("selected工場").value;

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
    const response = await fetch(`${serverURL}/getProductDetails?serialNumber=${encodeURIComponent(serialNumber)}&factory=${encodeURIComponent(factory)}`);
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
      document.getElementById("収容数").value = data.収容数 || "";
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




//Submit Button
document.querySelector('form[name="contact-form"]').addEventListener('submit', async (event) => {
  event.preventDefault(); // Prevent default form submission behavior
  updateCycleTime();

  const alertSound = document.getElementById('alert-sound');
  const scanAlertModal = document.getElementById('scanAlertModal');
  const scanAlertText = document.getElementById('scanAlertText');

  // Preload the alert sound without playing it
  if (alertSound) {
    alertSound.muted = true; // Mute initially to preload
    alertSound.loop = false; // Disable looping
    alertSound.load(); // Preload the audio file
  }

  try {
    // Get form data
    const 品番 = document.getElementById('product-number').value;
    const 工場 = document.getElementById('selected工場').value;
    const 背番号 = document.getElementById('sub-dropdown').value;
    const Total = parseInt(document.getElementById('total').value, 10) || 0;
    const Worker_Name = document.getElementById('Machine Operator').value;
    const Process_Quantity = parseInt(document.getElementById('ProcessQuantity').value, 10) || 0;
    const Date = document.getElementById('Lot No.').value;
    const Time_start = document.getElementById('Start Time').value;
    const Time_end = document.getElementById('End Time').value;
    const 設備 = document.getElementById('process').value;
    const Cycle_Time = parseFloat(document.getElementById('cycleTime').value) || 0;
    const 材料ロット = document.getElementById('材料ロット').value;
    const Comment = document.querySelector('textarea[name="Comments1"]').value;
    const Spare = parseInt(document.getElementById('spare').value, 10) || 0;
    const 疵引不良 = parseInt(document.getElementById('counter-18').value, 10) || 0;
    const 加工不良 = parseInt(document.getElementById('counter-19').value, 10) || 0;
    const その他 = parseInt(document.getElementById('counter-20').value, 10) || 0;
    const Total_NG =parseInt(document.getElementById("Total_NG").value, 10) || 0;


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
      closeScanModalButton.onclick = function () {
        scanAlertModal.style.display = 'none';
        alertSound.pause();
        alertSound.currentTime = 0; // Reset sound to the beginning
        alertSound.muted = true; // Mute again for next time
        document.body.classList.remove('flash-red');
      };

      return; // Stop the submission process
    }


    // Prepare data for saving to kensaDB
    const formData = {
      品番,
      背番号,
      設備,
      Total,
      工場,
      Worker_Name,
      Process_Quantity,
      Date,
      Time_start,
      Time_end,
      材料ロット,
      疵引不良,
      加工不良,
      その他,
      Total_NG,
      Spare,
      Comment,
      Cycle_Time,
      
      
    };

    console.log('Data to save to pressDB:', formData);

    // Save to pressDB
    const saveResponse = await fetch(`${serverURL}/submitTopressDBiReporter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!saveResponse.ok) {
      const errorData = await saveResponse.json();
      throw new Error(errorData.error || 'Failed to save data to pressDB');
    }

    console.log('Form data saved to pressDB successfully.');

    // Show success modal with blinking green background
    scanAlertText.innerText = 'Form submitted successfully / 保存しました';
    scanAlertModal.style.display = 'block';
    document.body.classList.add('flash-green');

    // Reload the page after closing the modal
    const closeScanModalButton = document.getElementById('closeScanModalButton');
    closeScanModalButton.onclick = function () {
      scanAlertModal.style.display = 'none';
      document.body.classList.remove('flash-green');
      window.location.reload();
    };
  } catch (error) {
    console.error('Error during submission:', error);

    // Show error modal with blinking red background
    scanAlertText.innerText = 'An error occurred. Please try again.';
    scanAlertModal.style.display = 'block';

    // Play alert sound
    if (alertSound) {
      alertSound.muted = false;
      alertSound.volume = 1;
      alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
    }

    // Add blinking red background
    document.body.classList.add('flash-red');

    // Close modal on button click
    const closeScanModalButton = document.getElementById('closeScanModalButton');
    closeScanModalButton.onclick = function () {
      scanAlertModal.style.display = 'none';
      alertSound.pause();
      alertSound.currentTime = 0;
      alertSound.muted = true;
      document.body.classList.remove('flash-red');
    };
  }
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

//Print label using "Smooth Print" app for mobile devices
function printLabel() {
  // Retrieve dynamic values from the form
  const 品番 = document.getElementById("product-number").value;
  const 車型 = document.getElementById("model").value;
  const 収容数 = document.getElementById("収容数").value;
  const 背番号 = document.getElementById("sub-dropdown").value;
  
  const R_L = document.getElementById("R-L").value;
  const 材料 = document.getElementById("material").value;
  const 色 = document.getElementById("material-color").value;
  const 品番収容数 = 品番 + "," + 収容数;
  const extension = document.getElementById("Labelextension").value;
  const Date2 = document.getElementById('Lot No.').value;

  if (extension){
     Date = Date2 + " - " + extension;
  } else {
    Date = Date2;
  }

  // Smooth Print URL scheme
  const filename = "sample4.lbx"; // Ensure this matches the local file name
  ///storage/emulated/0/Download/sample2.lbx
  const size = "RollW62RB";
  const copies = 1;
  const url =
    `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=${encodeURIComponent(copies)}` +
    `&text_品番=${encodeURIComponent(品番)}` +
    `&text_車型=${encodeURIComponent(車型)}` +
    `&text_収容数=${encodeURIComponent(収容数)}` +
    `&text_背番号=${encodeURIComponent(背番号)}` +
    `&text_R/L=${encodeURIComponent(R_L)}` +
    `&text_材料=${encodeURIComponent(材料)}` +
    `&text_色=${encodeURIComponent(色)}` +
    `&text_DateT=${encodeURIComponent(Date)}` +
    `&barcode_[品番][Comma][収容数]=${encodeURIComponent(品番収容数)}`;
  console.log(Date);
  // Redirect to Smooth Print
  window.location.href = url;
}