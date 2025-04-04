
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
  document.getElementById('nippoTitle').textContent=selectedFactory + "日報";
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



// Restore the values of input fields, images, and textContent from localStorage on page load
document.addEventListener('DOMContentLoaded', () => {
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
                                  fetchProductDetails();
                                  checkProcessCondition();
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
                      console.log(`Restored ${image.id || image.name} image src:`, savedValue);
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
});








// this function fetches setsubi list (process.value)
async function fetchSetsubiList() {
  const factory = document.getElementById("selected工場").value;
  
  if (factory === '肥田瀬' || factory ==='第二工場') {
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
    checkProcessCondition();

  } catch (error) {
    console.error("Error fetching data:", error);
  }
}


// this function fetches sebanggo list
// async function fetchSebanggo() {
//   // Get the selected process from the process dropdown
//   const 工場 = document.getElementById("selected工場").value;
//   blankInfo();

//   try {
//     // Fetch 背番号 values from the server based on the selected process
//     const response = await fetch(`${serverURL}/getSeBanggoListPress?工場=${encodeURIComponent(工場)}`);
//     const data = await response.json();
//     data.sort((a, b) => a.localeCompare(b, 'ja')); // 'ja' for Japanese sorting if needed // sort alphabetically

//     // Get the sub-dropdown element
//     const subDropdown = document.getElementById("sub-dropdown");

//     // Clear any existing options in the sub-dropdown
//     subDropdown.innerHTML = "";

//     // Add a blank option at the top
//     const blankOption = document.createElement("option");
//     blankOption.value = "";
//     blankOption.textContent = "Select 背番号";
//     subDropdown.appendChild(blankOption);

//     // Populate the sub-dropdown with new options based on the 背番号 values
//     data.forEach(item => {
//       const option = document.createElement("option");
//       option.value = item;
//       option.textContent = item;
//       subDropdown.appendChild(option);
//     });

//     console.log("Sub-dropdown populated with 背番号 options:", data);
    
//   } catch (error) {
//     console.error("Error fetching 背番号 data:", error);
//   }
// }

// // Call fetchSetsubiList when the page loads
// document.addEventListener("DOMContentLoaded", fetchSetsubiList);

// Function to fetch 背番号 and 品番 list
async function fetchSebanggo() {
  // Get the selected 工場 from the dropdown
  const 工場 = document.getElementById("selected工場").value;
  blankInfo();

  try {
    // Fetch 背番号 and 品番 values from the server
    const response = await fetch(`${serverURL}/getSeBanggoListPressAndHinban?工場=${encodeURIComponent(工場)}`);
    const data = await response.json();
    console.log(data);

    // Separate 背番号 and 品番 into different arrays
    const sebanggoList = data.map(item => item.背番号).filter(Boolean); // Remove null/undefined
    const hinbanList = data.map(item => item.品番).filter(Boolean); // Remove null/undefined

    // Sort both lists alphabetically
    sebanggoList.sort((a, b) => a.localeCompare(b, 'ja')); // 'ja' for Japanese sorting
    hinbanList.sort((a, b) => a.localeCompare(b, 'ja'));

    // Get the sub-dropdown element
    const subDropdown = document.getElementById("sub-dropdown");

    // Clear any existing options in the sub-dropdown
    subDropdown.innerHTML = "";

    // Add a blank option at the top
    const blankOption = document.createElement("option");
    blankOption.value = "";
    blankOption.textContent = "Select 背番号 / 品番";
    subDropdown.appendChild(blankOption);

    // Populate the sub-dropdown with 背番号 values first
    sebanggoList.forEach(sebanggo => {
      const option = document.createElement("option");
      option.value = sebanggo;
      option.textContent = sebanggo;
      subDropdown.appendChild(option);
    });

    // Add a separator (optional)
    if (hinbanList.length > 0) {
      const separatorOption = document.createElement("option");
      separatorOption.disabled = true; // Make it unselectable
      separatorOption.textContent = "------ 品番 ------";
      subDropdown.appendChild(separatorOption);
    }

    // Populate the sub-dropdown with 品番 values at the bottom
    hinbanList.forEach(hinban => {
      const option = document.createElement("option");
      option.value = hinban;
      option.textContent = hinban;
      subDropdown.appendChild(option);
    });

    console.log("Sub-dropdown populated with 背番号 and 品番 options:", { sebanggoList, hinbanList });

  } catch (error) {
    console.error("Error fetching 背番号 and 品番 data:", error);
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



// this function is to disable or enable input fields
function disableInputs() {
  inputs.forEach(input => {
      if (
          input.id !== 'scan-button' && 
          input.id !== 'sub-dropdown' && 
          input.id !== 'process' && 
          input.id !== 'reset-button'&& // Specifically exclude the reset button
          input.id !== "selectBluetooth"&&
          input.id !== "selectCamera"
      ) {
          input.disabled = true;
      }
  });
}


function enableInputs() {
  inputs.forEach(input => {
      if (input.id !== 'sub-dropdown') { // Keep sub-dropdown enabled
          input.disabled = false;
      }
  });
}



//for the info section
async function fetchProductDetails() {
  checkProcessCondition();
  enableInputs(); // delete if production
  
  
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
      document.getElementById("SRS").value = data.SRS || "";

      
      //imagepart
      // if (data.htmlWebsite) {
      //   dynamicImage.src = data.htmlWebsite; // Set the image source to the retrieved URL
      //   dynamicImage.alt = "Product Image"; // Optional: Set the alt text
      //   dynamicImage.style.display = "block"; // Ensure the image is visible
      // } else {
      //   dynamicImage.src = ""; // Clear the image source if no URL is available
      //   dynamicImage.alt = "No Image Available"; // Optional: Set fallback alt text
      //   dynamicImage.style.display = "none"; // Hide the image if no URL is available
      // }
      
    } else {
      console.error("No matching product found.");
    }
  } catch (error) {
    console.error("Error fetching product details:", error);
  }
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
  closeScanModalButton.onclick = function () {
      scanAlertModal.style.display = 'none';
      alertSound.pause();
      alertSound.currentTime = 0; // Reset sound to the beginning
      alertSound.muted = true; // Mute again for next time
      document.body.classList.remove('flash-red');
  };
}


// Submit Button
document.querySelector('form[name="contact-form"]').addEventListener('submit', async (event) => {
  const hatsumono = document.getElementById("hatsumonoLabel").textContent;
  const atomono = document.getElementById("atomonoLabel").textContent;
  event.preventDefault(); // Prevent default form submission behavior

  //check if hatsumono is done
  if (hatsumono === "FALSE" || atomono === "FALSE"){
    showAlert("初物/終物確認してください / Please do Hatsumono and Atomono");
    return;

  }

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
    const Total_NG = parseInt(document.getElementById('Total_NG').value, 10) || 0;
    const ショット数 = parseInt(document.getElementById('shot').value, 10) || 0;

    // Check if 背番号 is selected
    if (!背番号) {
      // Show alert modal
      scanAlertText.innerText = '背番号が必要です。 / Sebanggo is required.';
      scanAlertModal.style.display = 'block';

      // Play alert sound
      if (alertSound) {
        alertSound.muted = false; // Unmute to alert user
        alertSound.volume = 1; // Set full volume
        alertSound.play().catch((error) => console.error('Failed to play alert sound:', error));
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

    // Prepare data for saving to pressDB
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
      ショット数,
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

    // Run uploadPhotou() after saving data
    try {
      await uploadPhotou();

      // Wait for 3 seconds before showing success message and closing
      setTimeout(() => {
        // Show success modal with blinking green background
        scanAlertText.innerText = 'Form submitted successfully / 保存しました';
        scanAlertModal.style.display = 'block';
        document.body.classList.add('flash-green');

        const closeScanModalButton = document.getElementById('closeScanModalButton');
        closeScanModalButton.onclick = function () {
          scanAlertModal.style.display = 'none';
          document.body.classList.remove('flash-green');
          window.location.reload();
          resetForm();
        };
      }, 3000);
    } catch (error) {
      console.error('Upload failed:', error);

      // Show error message and close window after 3 seconds
      scanAlertText.innerText = 'Upload failed. Please try again.';
      scanAlertModal.style.display = 'block';
      setTimeout(() => {
        scanAlertModal.style.display = 'none';
        window.close();
      }, 3000);
    }
  } catch (error) {
    console.error('Error during submission:', error);

    // Show error modal with blinking red background
    scanAlertText.innerText = 'An error occurred. Please try again.';
    scanAlertModal.style.display = 'block';

    // Play alert sound
    if (alertSound) {
      alertSound.muted = false;
      alertSound.volume = 1;
      alertSound.play().catch((error) => console.error('Failed to play alert sound:', error));
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


// Global function to check process conditions
function checkProcessCondition() {
  const subDropdown = document.getElementById('sub-dropdown');
  const processDropdown = document.getElementById("process");
  const selected工場 = document.getElementById("selected工場").value;
  const processValue = processDropdown ? processDropdown.value : ""; // Ensure processDropdown exists
  const firstScanValue = document.getElementById("firstScanValue").value;
  const secondScanValue = document.getElementById("secondScanValue").value;

  if (
      (selected工場 === "肥田瀬" || selected工場 === "第二工場") || 
      (selected工場 === "NFH" && processValue !== "RLC")
  ) {
      if (!firstScanValue || !secondScanValue) {
          console.log("Inputs disabled: Factory requires 2 QR scans.");
          disableInputs();
      } else {
          console.log("Inputs enabled: 2 QR scans completed.");
          enableInputs();
      }
  } else {
      console.log("NFH with process 'RLC' detected. Inputs stay enabled.");
      enableInputs();
  }
}





// // scan sebanggo button
// document.addEventListener('DOMContentLoaded', () => {
//   const subDropdown = document.getElementById('sub-dropdown');
//   const processDropdown = document.getElementById("process");
//   let firstScanValue = document.getElementById("firstScanValue").value;
//   let secondScanValue = document.getElementById("secondScanValue").value;
//   const selected工場 = document.getElementById("selected工場").value;
  

//   console.log("Initial firstScanValue:", firstScanValue);
//   console.log("Initial secondScanValue:", secondScanValue);
  
//   if (subDropdown && firstScanValue && secondScanValue) {
//     setTimeout(() => {
//       subDropdown.value = firstScanValue;
//       fetchProductDetails();
//     }, 1000);
//   }

//   // Run checkProcessCondition() once on page load
//   checkProcessCondition();

//   // Add event listener to "process" dropdown
//   processDropdown.addEventListener("change", checkProcessCondition);




//   // This is the scan sebanggo button
//   document.getElementById('scan-button').addEventListener('click', function () {
//     if (firstScanValue) {
//       window.alert("Please scan the TOMSON BOARD. / 最初のQRコードが正常にスキャンされました。トムソンボードをスキャンしてください。");
//     }

//     const qrScannerModal = document.getElementById('qrScannerModal');
//     const html5QrCode = new Html5Qrcode("qrReader");
//     const alertSound = document.getElementById('alert-sound');

//     if (alertSound) {
//       alertSound.muted = true;
//       alertSound.loop = false;
//       alertSound.load();
//     }

//     qrScannerModal.style.display = 'block';

//     function showAlert(message) {
//       const scanAlertModal = document.getElementById('scanAlertModal');
//       document.getElementById('scanAlertText').innerText = message;
//       scanAlertModal.style.display = 'block';

//       if (alertSound) {
//         alertSound.muted = false;
//         alertSound.volume = 1;
//         alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
//       }

//       document.body.classList.add('flash-red');

//       document.getElementById('closeScanModalButton').onclick = function () {
//         scanAlertModal.style.display = 'none';
//         alertSound.pause();
//         alertSound.currentTime = 0;
//         alertSound.muted = true;
//         document.body.classList.remove('flash-red');
//       };
//     }
    
//     html5QrCode.start(
//       { facingMode: "environment" },
//       { fps: 10, qrbox: { width: 250, height: 250 } },
//       qrCodeMessage => {
//         console.log("First scan: " + firstScanValue);
//         const options = [...subDropdown.options].map(option => option.value);
//         const processValue = processDropdown.value;

//         if (!firstScanValue) {
//           if (options.includes(qrCodeMessage)) {
//             firstScanValue = qrCodeMessage;
//             localStorage.setItem(`${uniquePrefix}firstScanValue`, firstScanValue);
//             // **Set the scanned value inside the sub-dropdown**
//             subDropdown.value = firstScanValue;
//             console.log("Sub-dropdown updated with first scan:", subDropdown.value);
//             fetchProductDetails();
//             window.alert("First QR code scanned successfully. Please scan the TOMSON BOARD.");
//           } else {
//             showAlert("背番号が存在しません。 / Sebanggo does not exist.");
//             html5QrCode.stop().then(() => { qrScannerModal.style.display = 'none'; });
//           }
//         } else {
//           fetchProductDetails();
//           // Get expected second QR value based on model, shape, R-L
//           const expectedModel = document.getElementById("model").value;
//           const expectedShape = document.getElementById("shape").value;
//           const expectedRL = document.getElementById("R-L").value;
//           const expectedSecondValue = `${expectedModel},${expectedShape},${expectedRL}`;
//           console.log("need this: "+ expectedSecondValue);

//           if (qrCodeMessage === expectedSecondValue) {
//             secondScanValue = expectedSecondValue;
//             localStorage.setItem(`${uniquePrefix}secondScanValue`, secondScanValue);
//             subDropdown.value = firstScanValue;
//             enableInputs();
//             html5QrCode.stop().then(() => { qrScannerModal.style.display = 'none'; });
//           } else {
//             showAlert(`Second QR code does not match the expected value (${expectedSecondValue}).`);
//             html5QrCode.stop().then(() => { qrScannerModal.style.display = 'none'; });
//           }
//         }
//       }
//     ).catch(err => {
//       console.error("Failed to start scanning:", err);
//     });

//     document.getElementById('closeQRScannerModal').onclick = function () {
//       html5QrCode.stop().then(() => {
//         qrScannerModal.style.display = 'none';
//       });
//     };

//     window.onclick = function (event) {
//       if (event.target == qrScannerModal) {
//         html5QrCode.stop().then(() => {
//           qrScannerModal.style.display = 'none';
//         });
//       }
//     };
//   });
// });


// //temporary
// document.addEventListener('DOMContentLoaded', () => {
//   const subDropdown = document.getElementById('sub-dropdown');
//   const processDropdown = document.getElementById("process");
//   let firstScanValue = localStorage.getItem(`${uniquePrefix}firstScanValue`);
//   let secondScanValue = localStorage.getItem(`${uniquePrefix}secondScanValue`);
//   let storedScannerChoice = localStorage.getItem(`${uniquePrefix}scannerChoice`);
//   const selected工場 = document.getElementById("selected工場").value;

//   console.log("Initial firstScanValue:", firstScanValue);
//   console.log("Initial secondScanValue:", secondScanValue);
//   console.log("Stored Scanner Choice:", storedScannerChoice);

//   if (subDropdown && firstScanValue && secondScanValue) {
//       setTimeout(() => {
//           subDropdown.value = firstScanValue;
//           fetchProductDetails();
//       }, 1000);
//   }

//   checkProcessCondition();
//   processDropdown.addEventListener("change", checkProcessCondition);

//   // Scan button click event
//   document.getElementById('scan-button').addEventListener('click', function () {
//       if (storedScannerChoice && firstScanValue && !secondScanValue) {
//           // If scanner choice exists and first scan is done, skip selection
//           if (storedScannerChoice === "bluetooth") {
//               startBluetoothScanner();
//           } else {
//               startCameraScanner();
//           }
//       } else {
//           // Show scanner selection modal
//           const scannerSelectionModal = document.getElementById('scannerSelectionModal');
//           scannerSelectionModal.style.display = 'block';

//           document.getElementById('selectCamera').onclick = function () {
//               localStorage.setItem(`${uniquePrefix}scannerChoice`, "camera");
//               scannerSelectionModal.style.display = 'none';
//               startCameraScanner();
//           };

//           document.getElementById('selectBluetooth').onclick = function () {
//               localStorage.setItem(`${uniquePrefix}scannerChoice`, "bluetooth");
//               scannerSelectionModal.style.display = 'none';
//               startBluetoothScanner();
//           };

//           window.onclick = function (event) {
//               if (event.target == scannerSelectionModal) {
//                   scannerSelectionModal.style.display = 'none';
//               }
//           };
//       }
//   });

//   // Function to start the Camera Scanner
//   function startCameraScanner() {
//       if (firstScanValue) {
//           window.alert("Please scan the TOMSON BOARD. / 最初のQRコードが正常にスキャンされました。トムソンボードをスキャンしてください。");
//       }

//       const qrScannerModal = document.getElementById('qrScannerModal');
//       const html5QrCode = new Html5Qrcode("qrReader");
//       const alertSound = document.getElementById('alert-sound');

//       if (alertSound) {
//           alertSound.muted = true;
//           alertSound.loop = false;
//           alertSound.load();
//       }

//       qrScannerModal.style.display = 'block';

//       html5QrCode.start(
//           { facingMode: "environment" },
//           { fps: 10, qrbox: { width: 250, height: 250 } },
//           qrCodeMessage => handleScannedData(qrCodeMessage, html5QrCode, qrScannerModal)
//       ).catch(err => {
//           console.error("Failed to start scanning:", err);
//       });

//       document.getElementById('closeQRScannerModal').onclick = function () {
//           html5QrCode.stop().then(() => {
//               qrScannerModal.style.display = 'none';
//           });
//       };

//       window.onclick = function (event) {
//           if (event.target == qrScannerModal) {
//               html5QrCode.stop().then(() => {
//                   qrScannerModal.style.display = 'none';
//               });
//           }
//       };
//   }

//   // Function to start the Bluetooth Scanner (Listens for Keyboard Input)
//   function startBluetoothScanner() {
//       const bluetoothModal = document.getElementById("bluetoothScannerModal");
//       const bluetoothScannerText = document.getElementById("bluetoothScannerText");
//       const bluetoothScannerInstruction = document.getElementById("bluetoothScannerInstruction");

//       let scannerInput = document.getElementById("scannerInput");
//       if (!scannerInput) {
//           scannerInput = document.createElement("input");
//           scannerInput.setAttribute("type", "text");
//           scannerInput.setAttribute("id", "scannerInput");
//           scannerInput.style.position = "absolute";
//           scannerInput.style.opacity = "0";
//           document.body.appendChild(scannerInput);
//       }

//       scannerInput.value = "";
//       scannerInput.focus();

//       let scanStage = firstScanValue ? 2 : 1;

//       bluetoothModal.style.display = "block";
//       if (scanStage === 1) {
//           bluetoothScannerText.innerText = "Listening for Bluetooth Scanner...";
//           bluetoothScannerInstruction.innerText = "Please scan the first QR code (Sebanggo).";
//       } else {
//           bluetoothScannerText.innerText = "First scan found!";
//           bluetoothScannerInstruction.innerText = "Now, scan the TOMSON BOARD.";
//       }

//       function closeModal() {
//           bluetoothModal.style.display = "none";
//           document.removeEventListener("keydown", handleScan);
//       }

//       function handleScan(event) {
//           if (event.key === "Enter") {
//               const scannedValue = scannerInput.value.trim();
//               scannerInput.value = "";
//               console.log("Scanned Value:", scannedValue);

//               if (scanStage === 1) {
//                   const options = [...subDropdown.options].map(option => option.value);
//                   console.log("Dropdown Options:", options);

//                   if (options.includes(scannedValue)) {
//                       firstScanValue = scannedValue;
//                       localStorage.setItem(`${uniquePrefix}firstScanValue`, firstScanValue);
//                       localStorage.setItem(`${uniquePrefix}scannerChoice`, "bluetooth");
//                       subDropdown.value = firstScanValue;
//                       fetchProductDetails();

//                       bluetoothScannerText.innerText = "First QR scanned successfully!";
//                       bluetoothScannerInstruction.innerText = "Now, scan the TOMSON BOARD.";
//                       scanStage = 2;
//                   } else {
//                       showAlert("背番号が存在しません。 / Sebanggo does not exist.");
//                       localStorage.removeItem(`${uniquePrefix}scannerChoice`);
//                       closeModal();
//                   }
//               } else if (scanStage === 2) {
//                   const expectedModel = document.getElementById("model").value;
//                   const expectedShape = document.getElementById("shape").value;
//                   const expectedRL = document.getElementById("R-L").value;
//                   const expectedSecondValue = `${expectedModel},${expectedShape},${expectedRL}`;

//                   console.log("Expected Tomson Board QR:", expectedSecondValue);

//                   if (scannedValue === expectedSecondValue) {
//                       localStorage.setItem(`${uniquePrefix}secondScanValue`, expectedSecondValue);
//                       localStorage.removeItem(`${uniquePrefix}scannerChoice`);
//                       enableInputs();

//                       setTimeout(closeModal, 1000);
//                   } else {
//                       showAlert(`Second QR code does not match the expected value (${expectedSecondValue}).`);
//                       localStorage.removeItem(`${uniquePrefix}scannerChoice`);
//                       closeModal();
//                   }
//               }
//           }
//       }

//       scannerInput.focus();
//       document.addEventListener("keydown", handleScan);

//       window.onclick = function (event) {
//           if (event.target === bluetoothModal) {
//               closeModal();
//           }
//       };

//       document.getElementById("closeBluetoothScannerModal").onclick = closeModal;
//   }
// });


//temporary scan button
document.addEventListener('DOMContentLoaded', () => {
  const subDropdown = document.getElementById('sub-dropdown');
  const processDropdown = document.getElementById("process");
  let firstScanValue = localStorage.getItem(`${uniquePrefix}firstScanValue`) || "";
  let secondScanValue = localStorage.getItem(`${uniquePrefix}secondScanValue`) || "";
  let lastScanMethod = localStorage.getItem(`${uniquePrefix}scannerChoice`) || ""; // Empty if not set

  console.log("Initial firstScanValue:", firstScanValue);
  console.log("Initial secondScanValue:", secondScanValue);
  console.log("Last scan method:", lastScanMethod);

  if (subDropdown && firstScanValue && secondScanValue) {
    setTimeout(() => {
      subDropdown.value = firstScanValue;
      fetchProductDetails();
    }, 1000);
  }

  checkProcessCondition();
    // Add event listener to "process" dropdown
  processDropdown.addEventListener("change", checkProcessCondition);

  // Open Scanner Selection Modal
  function openScannerSelectionModal() {
    document.getElementById('scannerSelectionModal').style.display = 'block';
  }

  function closeScannerSelectionModal() {
    document.getElementById('scannerSelectionModal').style.display = 'none';
  }


//   function handleQRScan(qrCodeMessage) {
//     console.log("Scanned QR (Raw):", qrCodeMessage);

//     if (!firstScanValue) {
//         // If a comma is present in the first scan, take only the part before it
//         let cleanedQR = qrCodeMessage.includes(",") ? qrCodeMessage.split(",")[0] : qrCodeMessage;
//         console.log("First Scan Processed QR:", cleanedQR);

//         const options = [...subDropdown.options].map(option => option.value);

//         if (options.includes(cleanedQR)) {
//             firstScanValue = cleanedQR;
//             localStorage.setItem(`${uniquePrefix}firstScanValue`, firstScanValue);
//             subDropdown.value = firstScanValue;
//             localStorage.setItem(`${uniquePrefix}sub-dropdown`, firstScanValue);
        
//             fetchProductDetails();
//             window.alert("First QR code scanned successfully. Please scan the TOMSON BOARD.");
//         } else {
//             showAlert("背番号が存在しません。 / Sebanggo does not exist.");
//         }
//     } else {
//         // Second scan: Use the full value as is
//         console.log("Second Scan Processed QR:", qrCodeMessage);
//         fetchProductDetails();

//         const expectedModel = document.getElementById("model").value;
//         const expectedShape = document.getElementById("shape").value;
//         const expectedRL = document.getElementById("R-L").value;
//         const expectedSecondValue = `${expectedModel},${expectedShape},${expectedRL}`;
//         console.log("Expected Tomson Board QR:", expectedSecondValue);

//         if (qrCodeMessage === expectedSecondValue) {
//             secondScanValue = expectedSecondValue;
//             localStorage.setItem(`${uniquePrefix}secondScanValue`, secondScanValue);
//             subDropdown.value = firstScanValue;
//             enableInputs();

//             // ✅ Both scans are done, delete scanner choice
//             localStorage.removeItem(`${uniquePrefix}scannerChoice`);
//             // ✅ Close the modal based on the last scanning method
//             if (lastScanMethod === "bluetooth") {
//               document.getElementById('bluetoothScannerModal').style.display = 'none';
//           } else {
//               document.getElementById('qrScannerModal').style.display = 'none';
//           }
//         } else {
//             showAlert(`Second QR code does not match the expected value (${expectedSecondValue}).`);
//         }
//     }
// }
function handleQRScan(qrCodeMessage) {
  console.log("Scanned QR (Raw):", qrCodeMessage);

  const factoryValue = document.getElementById("selected工場")?.value || "";
  const processValue = document.getElementById("process")?.value || "";

  // ✅ Check if factory is "NFH" and process is "RLC" BEFORE scanning
  const isNFH_RLC = factoryValue === "NFH" && processValue === "RLC";
  console.log(`Factory: ${factoryValue}, Process: ${processValue}, NFH + RLC Condition: ${isNFH_RLC}`);

  // ✅ If NFH + RLC, mark second scan as skipped BEFORE scanning
  if (isNFH_RLC) {
      console.log("NFH + RLC detected before scanning. Second scan will be skipped.");
      localStorage.setItem(`${uniquePrefix}secondScanValue`, "SKIPPED");
  }

  if (!firstScanValue) {
      // ✅ If a comma is present in the first scan, take only the part before it
      let cleanedQR = qrCodeMessage.includes(",") ? qrCodeMessage.split(",")[0] : qrCodeMessage;
      console.log("First Scan Processed QR:", cleanedQR);

      const options = [...subDropdown.options].map(option => option.value);

      if (options.includes(cleanedQR)) {
          firstScanValue = cleanedQR;
          localStorage.setItem(`${uniquePrefix}firstScanValue`, firstScanValue);
          subDropdown.value = firstScanValue;
          localStorage.setItem(`${uniquePrefix}sub-dropdown`, firstScanValue);

          fetchProductDetails();
          

          // ✅ If NFH + RLC, enable inputs and close modal immediately
          if (isNFH_RLC) {
              enableInputs();
              console.log("Skipping second scan. Inputs enabled.");
              
              // Close modal immediately
              if (lastScanMethod === "bluetooth") {
                  document.getElementById('bluetoothScannerModal').style.display = 'none';
              } else {
                  document.getElementById('qrScannerModal').style.display = 'none';
              }
          } else {
              window.alert("Please scan the TOMSON BOARD.");
          }
      } else {
          showAlert("背番号が存在しません。 / Sebanggo does not exist.");
      }
  } else if (!isNFH_RLC) { // ✅ Second scan only required if NOT NFH + RLC
      console.log("Second Scan Processed QR:", qrCodeMessage);
      fetchProductDetails();

      const expectedModel = document.getElementById("model").value;
      const expectedShape = document.getElementById("shape").value;
      const expectedRL = document.getElementById("R-L").value;
      const expectedSecondValue = `${expectedModel},${expectedShape},${expectedRL}`;
      console.log("Expected Tomson Board QR:", expectedSecondValue);

      if (qrCodeMessage === expectedSecondValue) {
          secondScanValue = expectedSecondValue;
          localStorage.setItem(`${uniquePrefix}secondScanValue`, secondScanValue);
          subDropdown.value = firstScanValue;
          enableInputs();

          // ✅ Both scans are done, delete scanner choice
          localStorage.removeItem(`${uniquePrefix}scannerChoice`);

          // ✅ Close the modal based on the last scanning method
          if (lastScanMethod === "bluetooth") {
              document.getElementById('bluetoothScannerModal').style.display = 'none';
          } else {
              document.getElementById('qrScannerModal').style.display = 'none';
          }
      } else {
          showAlert(`Second QR code does not match the expected value (${expectedSecondValue}).`);
      }
  }
}





  // 🔹 Bluetooth Scanner Handling (Keyboard Input Mode)
  document.addEventListener('keydown', (event) => {
    if (lastScanMethod === "bluetooth") {
        if (!window.scannedBluetoothCode) {
            window.scannedBluetoothCode = ""; // Initialize if not set
        }

        // Check for valid characters (A-Z, a-z, 0-9)
        if (/^[a-zA-Z0-9\-,.]$/.test(event.key)) {
            window.scannedBluetoothCode += event.key; // Accumulate valid characters
        }

        // When Enter is pressed, finalize the scanned value
        if (event.key === "Enter") {
            let cleanedQR = window.scannedBluetoothCode.replace(/Shift/g, ''); // Remove unwanted "Shift" text
            console.log("Final Scanned QR:", cleanedQR);

            handleQRScan(cleanedQR); // Process the cleaned QR code
            window.scannedBluetoothCode = ""; // Reset for next scan
        }
    }
});


  function startCameraScanner() {
    lastScanMethod = "camera";
    localStorage.setItem(`${uniquePrefix}scannerChoice`, lastScanMethod);
    closeScannerSelectionModal();

    const qrScannerModal = document.getElementById('qrScannerModal');
    const html5QrCode = new Html5Qrcode("qrReader");
    qrScannerModal.style.display = 'block';

    html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 300, height: 300 } },
      qrCodeMessage => {
        handleQRScan(qrCodeMessage);
      }
    ).catch(err => {
      console.error("Failed to start scanning:", err);
    });

    document.getElementById('closeQRScannerModal').onclick = function () {
      html5QrCode.stop().then(() => {
        qrScannerModal.style.display = 'none';
      });
    };
  }

  function startBluetoothScanner() {
    lastScanMethod = "bluetooth";
    localStorage.setItem(`${uniquePrefix}scannerChoice`, lastScanMethod);
    closeScannerSelectionModal();

    const bluetoothScannerModal = document.getElementById('bluetoothScannerModal');
    bluetoothScannerModal.style.display = 'block';
    document.getElementById('bluetoothScannerInstruction').textContent = 
      firstScanValue ? "Please scan the TOMSON BOARD QR code." : "Please scan the first QR code (Sebanggo).";
  }

  // 🔹 Scan Button Click (Opens modal if first scan is missing)
  document.getElementById('scan-button').addEventListener('click', function () {
    const factoryValue = document.getElementById("selected工場")?.value || "";
    const processValue = document.getElementById("process")?.value || "";

    // ✅ Check if NFH + RLC when scan button is clicked
    const isNFH_RLC = factoryValue === "NFH" && processValue === "RLC";
    console.log(`Scan Button Clicked - Factory: ${factoryValue}, Process: ${processValue}, NFH + RLC Condition: ${isNFH_RLC}`);

    // ✅ If NFH + RLC, mark second scan as skipped BEFORE scanning
    if (isNFH_RLC) {
        console.log("NFH + RLC detected before scanning. Second scan will be skipped.");
        localStorage.setItem(`${uniquePrefix}secondScanValue`, "SKIPPED");
    }

    if (firstScanValue && !secondScanValue) {
        // If first scan is done, auto-select the last used method
        if (lastScanMethod === "bluetooth") {
            startBluetoothScanner();
        } else {
            startCameraScanner();
        }
    } else {
        // Ask the user to choose scanning method
        openScannerSelectionModal();
    }
});


  // Attach event listeners to modal buttons
  document.getElementById('selectCamera').addEventListener('click', startCameraScanner);
  document.getElementById('selectBluetooth').addEventListener('click', startBluetoothScanner);

  // 🔹 Auto-switch to last used scanning method if first scan is done
  if (firstScanValue && !secondScanValue) {
    if (lastScanMethod === "bluetooth") {
      startBluetoothScanner();
    } else {
      startCameraScanner();
    }
  }

  // 🔹 Close Bluetooth Modal
  document.getElementById('closeBluetoothScannerModal').addEventListener('click', () => {
    document.getElementById('bluetoothScannerModal').style.display = 'none';
  });

  // 🔹 Close Selection Modal on Outside Click
  window.onclick = function(event) {
    const scannerSelectionModal = document.getElementById('scannerSelectionModal');
    const bluetoothScannerModal = document.getElementById('bluetoothScannerModal');
    if (event.target == scannerSelectionModal) {
      closeScannerSelectionModal();
    }
    if (event.target == bluetoothScannerModal) {
      bluetoothScannerModal.style.display = 'none';
    }
  };

});









// Function to reset everything and reload the page
function resetForm() {
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

  localStorage.removeItem(`${uniquePrefix}scannerChoice`); // clear choice

  // Reload the page
  window.location.reload();
}





// Print label using "Smooth Print" app for mobile devices
function printLabel() {
  const alertSound = document.getElementById('alert-sound');
  const scanAlertModal = document.getElementById('scanAlertModal');
  const scanAlertText = document.getElementById('scanAlertText');
  const 背番号 = document.getElementById("sub-dropdown").value;
  
  if (selectedFactory === "肥田瀬"){
    printLabelHidase();
    return;
  }

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
    closeScanModalButton.onclick = function () {
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

      const Date = extension ? `${Date2} - ${extension}` : Date2;

      // Smooth Print URL scheme
      if (SRS === "有り"){
          filename = "SRS3.lbx";
      } else if (背番号 === "NC2"){
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
        `&text_DateT=${encodeURIComponent(Date)}` +
        `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

      console.log(Date);
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

  const Date = extension ? `${Date2} - ${extension}` : Date2;

  if (SRS === "有り"){
    filename = "SRS3.lbx";
  } else if (背番号 === "NC2"){
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
    `&text_DateT=${encodeURIComponent(Date)}` +
    `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

  console.log(Date);
  window.location.href = url;
}


// Hidase style print label
function printLabelHidase() {
  const selectedSeBanggo = document.getElementById("product-number").value;
  const selectedFactory = document.getElementById("selected工場").value;

  if (selectedFactory !== "肥田瀬") {
    console.warn("Not in 肥田瀬 factory. Printing normally...");
    return;
  }

  fetch(`${serverURL}/getCapacityBySeBanggo?seBanggo=${selectedSeBanggo}`)
    .then(response => response.json())
    .then(data => {
      if (data.length > 1) {
        // Multiple capacity options exist, show selection modal
        showCapacitySelectionModal(data);
      } else if (data.length === 1) {
        // Only one capacity, auto-select and proceed
        document.getElementById('収容数').value = data[0].収容数;
        showLabelTypeSelection();
      } else {
        alert('No data found for the selected 品番');
      }
    })
    .catch(error => console.error('Error fetching 収容数:', error));
}

// Show modal to let user choose a 収容数 (uses existing #modal)
function showCapacitySelectionModal(data) {
  const modal = document.getElementById("modal");
  const modalOptions = document.getElementById("modal-options");
  const modalCloseButton = document.getElementById("modal-close");

  // Clear previous options
  modalOptions.innerHTML = '<p>収容数を選んでください / Please choose the quantity:</p>';

  data.forEach((item) => {
    const option = document.createElement('button');
    option.classList.add('modal-option');
    option.textContent = `収容数: ${item.収容数}`;
    option.dataset.value = item.収容数;
    option.onclick = (e) => {
      document.getElementById('収容数').value = e.target.dataset.value;
      modal.style.display = "none";
      showLabelTypeSelection();
    };
    modalOptions.appendChild(option);
  });

  modal.style.display = "block";

  // Close modal on close button click
  modalCloseButton.onclick = () => {
    modal.style.display = "none";
  };
}

// Show modal to choose between BOX or PRODUCT label (uses existing #modal)
function showLabelTypeSelection() {
  const modal = document.getElementById("modal");
  const modalOptions = document.getElementById("modal-options");
  const modalCloseButton = document.getElementById("modal-close");

  // Update modal content
  modalOptions.innerHTML = '<p>Choose label type: For BOX / 外用 or For Product / 製品用</p>';

  const buttonBox = document.createElement('button');
  buttonBox.innerText = 'For BOX / 外用';
  buttonBox.onclick = () => {
    modal.style.display = "none";
    showCopiesPrompt('hidaselabel5.lbx');
  };

  const buttonProduct = document.createElement('button');
  buttonProduct.innerText = 'For Product / 製品用';
  buttonProduct.onclick = () => {
    modal.style.display = "none";
    showCopiesPrompt('hidaselabel6inner.lbx');
  };

  modalOptions.appendChild(buttonBox);
  modalOptions.appendChild(buttonProduct);

  modal.style.display = "block";

  // Close modal on close button click
  modalCloseButton.onclick = () => {
    modal.style.display = "none";
  };
}

// Show modal to select number of copies and print (uses existing #modal)
//Hidase style choose quantity of print
function showCopiesPrompt(filename) {
  const 品番 = document.getElementById("product-number").value;
  const 収容数 = document.getElementById("収容数").value;
  const R_L = document.getElementById("R-L").value;
  const 品番収容数 = `${品番},${収容数}`;
  const extension = document.getElementById("Labelextension").value;
  const Date2 = document.getElementById('Lot No.').value;
  let Date = extension ? `${Date2} - ${extension}` : Date2;

  const modal = document.getElementById("modal");
  const modalOptions = document.getElementById("modal-options");
  const modalCloseButton = document.getElementById("modal-close");

  modalOptions.innerHTML = '<p>Select number of copies:</p>';

  // Wrapper for input and buttons
  const copiesDisplay = document.createElement('div');
  copiesDisplay.className = 'modal-copies-control';

  // Minus Button
  const minusButton = document.createElement('button');
  minusButton.innerText = '-';
  minusButton.type = "button";
  minusButton.onclick = (event) => {
    event.preventDefault();
    const current = parseInt(copiesInput.value, 10) || 1;
    if (current > 1) {
      copiesInput.value = current - 1;
    }
  };

  // Input field
  const copiesInput = document.createElement('input');
  copiesInput.type = 'number';
  copiesInput.min = '1';
  copiesInput.step = '1';
  copiesInput.value = '1';
  copiesInput.style.width = '60px';
  copiesInput.style.textAlign = 'center';

  // Prevent invalid input (non-integer, negatives, etc.)
  copiesInput.oninput = () => {
    let value = copiesInput.value;
    if (!/^\d+$/.test(value)) {
      copiesInput.value = value.replace(/\D/g, '');
    }
    if (copiesInput.value === '' || parseInt(copiesInput.value, 10) < 1) {
      copiesInput.value = '1';
    }
  };

  // Plus Button
  const plusButton = document.createElement('button');
  plusButton.innerText = '+';
  plusButton.type = "button";
  plusButton.onclick = (event) => {
    event.preventDefault();
    const current = parseInt(copiesInput.value, 10) || 1;
    copiesInput.value = current + 1;
  };

  // Append controls
  copiesDisplay.appendChild(minusButton);
  copiesDisplay.appendChild(copiesInput);
  copiesDisplay.appendChild(plusButton);
  modalOptions.appendChild(copiesDisplay);

  // Confirm Button
  const confirmButton = document.createElement('button');
  confirmButton.innerText = 'Confirm';
  confirmButton.type = "button";
  confirmButton.onclick = () => {
    const copies = parseInt(copiesInput.value, 10);
    if (isNaN(copies) || copies < 1) {
      alert('Please enter a valid number of copies (integer > 0)');
      return;
    }

    const url =
      `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent("RollW62")}&copies=${encodeURIComponent(copies)}` +
      `&text_品番=${encodeURIComponent(品番)}` +
      `&text_収容数=${encodeURIComponent(収容数)}` +
      `&text_DateT=${encodeURIComponent(Date)}` +
      `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

    console.log("Printing:", url);
    window.location.href = url;
    modal.style.display = "none";
  };

  modalOptions.appendChild(confirmButton);

  modal.style.display = "block";

  modalCloseButton.onclick = () => {
    modal.style.display = "none";
  };
}
















// Take photo hatsumono and atomono and label
// Mapping of buttons to labels and images
const buttonMappings = [
  {
    buttonId: 'hatsumonoButton',
    labelId: 'hatsumonoLabel',
    imgId: 'hatsumonoPic',
    labelText: '初物チェック',
  },
  {
    buttonId: 'atomonoButton',
    labelId: 'atomonoLabel',
    imgId: 'atomonoPic',
    labelText: '終物チェック',
  },
  {
    buttonId: 'makerLabelButton',
    labelId: 'makerLabel',
    imgId: '材料ラベル',
    labelText: '材料ラベル',
  },
];

let currentButtonId = null; // Track the button that triggered the popup

// Add event listeners for all buttons
buttonMappings.forEach(({ buttonId }) => {
  const button = document.getElementById(buttonId);

  button.addEventListener('click', () => {
    currentButtonId = buttonId; // Set the current button ID
    window.open('captureImage.html', 'Capture Image', 'width=900,height=900');
  });
});

// Handle the message from the popup window
window.addEventListener('message', function (event) {
  if (event.origin === window.location.origin) {
    const data = event.data;

    if (data.image && currentButtonId) {
      // Find the mapping for the current button
      const mapping = buttonMappings.find(({ buttonId }) => buttonId === currentButtonId);

      if (mapping) {
        const { labelId, imgId } = mapping;

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

        console.log(
          `Saved ${labelId}: ${label.textContent} and ${imgId} image: ${photoPreview.src} to localStorage.`
        );
      }

      // Reset the current button ID after processing
      currentButtonId = null;
    }
  }
});





//Upload Photo Function
// //this is working upload function
// function uploadPhotou() {
//   const selectedSebanggo = document.getElementById("sub-dropdown").value;
//   const currentDate = document.getElementById("Lot No.").value;
//   const selectedWorker = document.getElementById("Machine Operator").value;
//   const selectedFactory = document.getElementById("selected工場").value;
//   const photoPreview = document.getElementById('photoPreview').value;


//   if (!photoPreview.src) {
//       console.error("No photo preview available");
//       return;
//   }

//   // Convert the image to a blob
//   fetch(photoPreview.src)
//       .then(response => response.blob())
//       .then(blob => {
//           const reader = new FileReader();
//           reader.onloadend = function() {
//               const base64data = reader.result.split(',')[1]; // Get the base64 encoded string
              
//               const formData = new FormData();
//               formData.append('imageBlob', base64data);
//               formData.append('fileName', `${selectedSebanggo}_${currentDate}_${selectedWorker}_${selectedFactory}.jpg`);
//               formData.append('mimeType', blob.type);
//               formData.append('selectedFactory', selectedFactory);

//               // Send the blob to Apps Script via POST request
//               fetch('https://script.google.com/macros/s/AKfycbxDWa2RTdI2_aHBgzq9GA9GtQx5MrwqaRnW4F26VZdoptwJ1Pg_Enr_xI3vw1t7WHYbTw/exec', {
//                   method: 'POST',
//                   body: formData
//               })
//               .then(response => response.text())  // Fetch raw text response
//               .then(text => {
//                   console.log('Raw response:', text); // Log the raw response
//                   try {
//                       const data = JSON.parse(text); // Attempt to parse JSON
//                       if (data.status === 'success') {
//                           console.log('File uploaded successfully: ' + data.fileUrl);
//                       } else {
//                           console.error('Upload failed: ' + data.message);
//                       }
//                   } catch (error) {
//                       console.error('Error parsing JSON:', error);
//                   }
//               })
//               .catch(error => {
//                   console.error('Error uploading file: ', error);
//               });
//           };
//           reader.readAsDataURL(blob);
//       })
//       .catch(error => console.error('Error converting image to blob: ', error));
//   }

// Upload Photo Function for multiple images
function uploadPhotou() {
  const selectedSebanggo = document.getElementById("sub-dropdown").value;
  const currentDate = document.getElementById("Lot No.").value;
  const selectedWorker = document.getElementById("Machine Operator").value;
  const selectedFactory = document.getElementById("selected工場").value;
  const selectedMachine = document.getElementById("process").value;

  // Mapping of images to their respective IDs
  const imageMappings = [
    { imgId: 'hatsumonoPic', label: '初物チェック' },
    { imgId: 'atomonoPic', label: '終物チェック' },
    { imgId: '材料ラベル', label: '材料ラベル' },
  ];

  imageMappings.forEach(({ imgId, label }) => {
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
        reader.onloadend = function () {
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
            'https://script.google.com/macros/s/AKfycbxDWa2RTdI2_aHBgzq9GA9GtQx5MrwqaRnW4F26VZdoptwJ1Pg_Enr_xI3vw1t7WHYbTw/exec',
            {
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

//for dynamic process link from nav
document.addEventListener("DOMContentLoaded", function () {
  const selectedFactory = document.getElementById("selected工場")?.value;
  const processLink = document.getElementById("process-link");

  if (selectedFactory && processLink) {
    processLink.href = `machine.html?selected=${encodeURIComponent(selectedFactory)}`;
  }
});