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
                                  updateTotal(); // for total value
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





// // Gets all the 背番号 list
// document.addEventListener('DOMContentLoaded', () => {
//   const subDropdown = document.getElementById('sub-dropdown');

//   // Fetch 背番号 list from the server
//   fetch(`${serverURL}/getSeBanggoList`)
//     .then(response => response.json())
//     .then(data => {
//       // Remove duplicates by creating a Set and converting it back to an array
//       const uniqueData = [...new Set(data)];

//       // Sort the unique 背番号 list alphabetically
//       uniqueData.sort((a, b) => a.localeCompare(b, 'ja')); // 'ja' for Japanese sorting if needed

//       // Clear existing options
//       subDropdown.innerHTML = '';

//       // Add a default "Select 背番号" option
//       const defaultOption = document.createElement('option');
//       defaultOption.value = '';
//       defaultOption.textContent = 'Select 背番号';
//       defaultOption.disabled = true; // Make it non-selectable
//       defaultOption.selected = true; // Make it the default selection
//       subDropdown.appendChild(defaultOption);

//       // Populate options dynamically
//       uniqueData.forEach(seBanggo => {
//         const option = document.createElement('option');
//         option.value = seBanggo;
//         option.textContent = seBanggo;
//         subDropdown.appendChild(option);
//       });
//     })
//     .catch(error => console.error('Error fetching 背番号 list:', error));
// });

// Function to fetch 背番号 and 品番 from the server
// using dynamic api on the server.js
async function fetchSebanggoAndHinban() {
  const subDropdown = document.getElementById("sub-dropdown");

  // Clear dropdown before populating
  subDropdown.innerHTML = "";

  // Add default option
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Select 背番号 / 品番";
  defaultOption.disabled = true;
  defaultOption.selected = true;
  subDropdown.appendChild(defaultOption);

  try {
    const response = await fetch(`${serverURL}/queries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dbName: "Sasaki_Coating_MasterDB",
        collectionName: "masterDB",
        query: {},
        projection: { 背番号: 1, 品番: 1, _id: 0 },
      }),
    });

    const data = await response.json();

    // Extract 背番号 and 品番
    const sebanggoList = [...new Set(data.map((item) => item.背番号).filter(Boolean))];
    const hinbanList = [...new Set(data.map((item) => item.品番).filter(Boolean))];

    // Sort alphabetically (Japanese)
    sebanggoList.sort((a, b) => a.localeCompare(b, "ja"));
    hinbanList.sort((a, b) => a.localeCompare(b, "ja"));

    // Populate 背番号 options
    sebanggoList.forEach((sebanggo) => {
      const option = document.createElement("option");
      option.value = sebanggo;
      option.textContent = sebanggo;
      subDropdown.appendChild(option);
    });

    // Add separator
    if (hinbanList.length > 0) {
      const separatorOption = document.createElement("option");
      separatorOption.textContent = "------ 品番 ------";
      separatorOption.disabled = true;
      subDropdown.appendChild(separatorOption);
    }

    // Populate 品番 options
    hinbanList.forEach((hinban) => {
      const option = document.createElement("option");
      option.value = hinban;
      option.textContent = hinban;
      subDropdown.appendChild(option);
    });

    console.log("Dropdown populated with 背番号 and 品番");
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

document.addEventListener("DOMContentLoaded", fetchSebanggoAndHinban);






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





// //new function to fetch product details
// // this function fetches product details based on the selected 背番号 or 品番
// // it uses dynamic API on the server.js
// async function fetchProductDetails() {
//   const subDropdown = document.getElementById("sub-dropdown");
//   const serialNumber = subDropdown.value;
//   const factory = document.getElementById("selected工場").value;
//   const dynamicImage = document.getElementById("dynamicImage");
//   dynamicImage.src = "";

//   if (!serialNumber) {
//     console.error("Please select a valid 背番号 or 品番.");
//     blankInfo();
//     return;
//   }

//   try {
//     // Step 1: Query by 背番号
//     let response = await fetch(`${serverURL}/queries`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         dbName: "Sasaki_Coating_MasterDB",
//         collectionName: "masterDB",
//         query: { 背番号: serialNumber },
//       }),
//     });

//     let result = await response.json();

//     // Step 2: If no result, try search by 品番
//     if (!result || result.length === 0) {
//       const hinbanRes = await fetch(`${serverURL}/queries`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           dbName: "Sasaki_Coating_MasterDB",
//           collectionName: "masterDB",
//           query: { 品番: serialNumber },
//         }),
//       });

//       const hinbanData = await hinbanRes.json();

//       if (hinbanData.length > 0) {
//         const matchedEntry = hinbanData[0];

//         // Update dropdown to show 背番号 instead
//         if (matchedEntry.背番号) {
//           subDropdown.value = matchedEntry.背番号;
//         }

//         result = [matchedEntry];
//       }
//     }

//     // Step 3: Still no result? Show error and exit
//     if (!result || result.length === 0) {
//       console.error("No matching product found.");
//       return;
//     }

//     const product = result[0]; // First matching document

//     // Step 4: Fetch picture if available
//     const pictureRes = await fetch(`${serverURL}/queries`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         dbName: "Sasaki_Coating_MasterDB",
//         collectionName: "pictureDB",
//         query: { 背番号: product.背番号 || serialNumber },
//         projection: { "html website": 1, _id: 0 },
//       }),
//     });

//     const pictureData = await pictureRes.json();
//     const htmlWebsite = pictureData.length > 0 ? pictureData[0]["html website"] : "";

//     // Step 5: Populate fields
//     document.getElementById("product-number").value = product.品番 || "";
//     document.getElementById("model").value = product.モデル || "";
//     document.getElementById("shape").value = product.形状 || "";
//     document.getElementById("R-L").value = product["R/L"] || "";
//     document.getElementById("material").value = product.材料 || "";
//     document.getElementById("material-code").value = product.材料背番号 || "";
//     document.getElementById("material-color").value = product.色 || "";
//     document.getElementById("kataban").value = product.型番 || "";
//     document.getElementById("送りピッチ").textContent = "送りピッチ: " + (product.送りピッチ || "");
//     document.getElementById("収容数").value = product.収容数 || "";
//     document.getElementById("SRS").value = product.SRS || "";

//     // Set dynamic image
//     if (htmlWebsite) {
//       dynamicImage.src = htmlWebsite;
//       dynamicImage.alt = "Product Image";
//       dynamicImage.style.display = "block";
//     } else {
//       dynamicImage.src = "";
//       dynamicImage.alt = "No Image Available";
//       dynamicImage.style.display = "none";
//     }

//     // Optional: update image based on 背番号
//     picLINK(product.背番号 || serialNumber);
//   } catch (error) {
//     console.error("Error fetching product details:", error);
//   }
// }

// document.getElementById("sub-dropdown").addEventListener("change", fetchProductDetails);



// Updated function to fetch product details from masterDB (with imageURL)
async function fetchProductDetails() {
  const subDropdown = document.getElementById("sub-dropdown");
  const serialNumber = subDropdown.value;
  const factory = document.getElementById("selected工場").value;
  const dynamicImage = document.getElementById("dynamicImage");
  dynamicImage.src = "";

  if (!serialNumber) {
    console.error("Please select a valid 背番号 or 品番.");
    blankInfo();
    return;
  }

  try {
    // Step 1: Query by 背番号
    let response = await fetch(`${serverURL}/queries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dbName: "Sasaki_Coating_MasterDB",
        collectionName: "masterDB",
        query: { 背番号: serialNumber },
      }),
    });

    let result = await response.json();

    // Step 2: If no result, try search by 品番
    if (!result || result.length === 0) {
      const hinbanRes = await fetch(`${serverURL}/queries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dbName: "Sasaki_Coating_MasterDB",
          collectionName: "masterDB",
          query: { 品番: serialNumber },
        }),
      });

      const hinbanData = await hinbanRes.json();

      if (hinbanData.length > 0) {
        const matchedEntry = hinbanData[0];

        // Update dropdown to show 背番号 instead
        if (matchedEntry.背番号) {
          subDropdown.value = matchedEntry.背番号;
        }

        result = [matchedEntry];
      }
    }

    // Step 3: Still no result? Show error and exit
    if (!result || result.length === 0) {
      console.error("No matching product found.");
      return;
    }

    const product = result[0]; // First matching document

    // Step 4: Populate fields
    document.getElementById("product-number").value = product.品番 || "";
    document.getElementById("model").value = product.モデル || "";
    document.getElementById("shape").value = product.形状 || "";
    document.getElementById("R-L").value = product["R/L"] || "";
    document.getElementById("material").value = product.材料 || "";
    document.getElementById("material-code").value = product.材料背番号 || "";
    document.getElementById("material-color").value = product.色 || "";
    document.getElementById("kataban").value = product.型番 || "";
    document.getElementById("送りピッチ").textContent = "送りピッチ: " + (product.送りピッチ || "");
    document.getElementById("収容数").value = product.収容数 || "";
    document.getElementById("SRS").value = product.SRS || "";

    // Step 5: Set dynamic image directly from imageURL
    if (product.imageURL) {
      dynamicImage.src = product.imageURL;
      dynamicImage.alt = "Product Image";
      dynamicImage.style.display = "block";
    } else {
      dynamicImage.src = "";
      dynamicImage.alt = "No Image Available";
      dynamicImage.style.display = "none";
    }

    // picLINK no longer needed
  } catch (error) {
    console.error("Error fetching product details:", error);
  }
}

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


// Function for the plus button
function incrementCounter(counterId) {
  const counterElement = document.getElementById(`counter-${counterId}`);
  let currentValue = parseInt(counterElement.value, 10) || 0; // Default to 0 if value is invalid
  currentValue += 1;
  counterElement.value = currentValue;

  // Save the updated value to localStorage
  const uniquePrefix = `${pageName}_${selected工場}_`; // Ensure unique key based on page and 工場
  localStorage.setItem(`${uniquePrefix}counter-${counterId}`, currentValue);

  updateTotal();
}

// Function for the minus button
function decrementCounter(counterId) {
  const counterElement = document.getElementById(`counter-${counterId}`);
  let currentValue = parseInt(counterElement.value, 10) || 0; // Default to 0 if value is invalid
  if (currentValue > 0) {
    currentValue -= 1;
    counterElement.value = currentValue;

    // Save the updated value to localStorage
    const uniquePrefix = `${pageName}_${selected工場}_`; // Ensure unique key based on page and 工場
    localStorage.setItem(`${uniquePrefix}counter-${counterId}`, currentValue);

    updateTotal();
  }
}

function updateTotal() {
  // Get the value of Process Quantity
  const processQuantity = parseInt(document.getElementById('ProcessQuantity').value, 10) || 0;

  // Get the values of the counters
  const counter1 = parseInt(document.getElementById('counter-1').value, 10) || 0;
  const counter2 = parseInt(document.getElementById('counter-2').value, 10) || 0;
  const counter3 = parseInt(document.getElementById('counter-3').value, 10) || 0;
  const counter4 = parseInt(document.getElementById('counter-4').value, 10) || 0;
  const counter5 = parseInt(document.getElementById('counter-5').value, 10) || 0;
  const counter6 = parseInt(document.getElementById('counter-6').value, 10) || 0;
  const counter7 = parseInt(document.getElementById('counter-7').value, 10) || 0;
  const counter8 = parseInt(document.getElementById('counter-8').value, 10) || 0;
  const counter9 = parseInt(document.getElementById('counter-9').value, 10) || 0;
  const counter10 = parseInt(document.getElementById('counter-10').value, 10) || 0;
  const counter11 = parseInt(document.getElementById('counter-11').value, 10) || 0;
  const counter12 = parseInt(document.getElementById('counter-12').value, 10) || 0;

  // Calculate Total_NG
  const totalNG = counter1+counter2+counter3+counter4+counter5+counter6+counter7+counter8+counter9+counter10+counter11+counter12;

  // Update the Total_NG field
  document.getElementById('Total_NG').value = totalNG;

  // Calculate Total
  const total = processQuantity - totalNG;

  // Update the Total field
  document.getElementById('total').value = total;
}

// Attach updateTotal to relevant events
document.getElementById('ProcessQuantity').addEventListener('input', updateTotal);




// Submit Button for new Kensa Process
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
    const Remaining_Quantity = Total;
    const Date = document.getElementById('Lot No.').value;
    const Time_start = document.getElementById('Start Time').value;
    const Time_end = document.getElementById('End Time').value;
    const 設備 = document.getElementById('process').value;
    const Cycle_Time = parseFloat(document.getElementById('cycleTime').value) || 0;
    const 製造ロット = document.getElementById('製造ロット').value;
    const Comment = document.querySelector('textarea[name="Comments1"]').value;
    const Spare = parseInt(document.getElementById('在庫').value, 10) || 0;


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

    // Get the values of the counters
    const counters = Array.from({ length: 12 }, (_, i) => {
      const counter = document.getElementById(`counter-${i + 1}`);
      return parseInt(counter?.value || 0, 10);
    });

    // Calculate Total_NG
    const Total_NG = counters.reduce((sum, count) => sum + count, 0);

    // Prepare data for saving to kensaDB
    const formData = {
      品番,
      背番号,
      工場,
      Total,
      Worker_Name,
      Process_Quantity,
      Remaining_Quantity,
      Date,
      Time_start,
      Time_end,
      設備,
      Counters: counters.reduce((acc, val, idx) => {
        acc[`counter-${idx + 1}`] = val; // Dynamically add counters
        return acc;
      }, {}),
      Total_NG,
      Cycle_Time,
      製造ロット,
      Comment,
      Spare,
    };

    console.log('Data to save to kensaDB:', formData);

    // Save to kensaDB
    const saveResponse = await fetch(`${serverURL}/submitToKensaDBiReporter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!saveResponse.ok) {
      const errorData = await saveResponse.json();
      throw new Error(errorData.error || 'Failed to save data to kensaDB');
    }

    console.log('Form data saved to kensaDB successfully.');

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
      resetForm();
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




// //scan BUtton javascript
// document.getElementById('scan-button').addEventListener('click', function () {
//   const qrScannerModal = document.getElementById('qrScannerModal');
//   const scanAlertModal = document.getElementById('scanAlertModal');
//   const scanAlertText = document.getElementById('scanAlertText');
//   const html5QrCode = new Html5Qrcode("qrReader");
//   const alertSound = document.getElementById('alert-sound');

//   // Preload the alert sound without playing it
//   if (alertSound) {
//       alertSound.muted = true; // Mute initially to preload
//       alertSound.loop = false; // Disable looping
//       alertSound.load(); // Preload the audio file
//   }

//   // Show the modal
//   qrScannerModal.style.display = 'block';

//   // Start QR code scanning
//   html5QrCode.start(
//       { facingMode: "environment" },
//       {
//           fps: 10,
//           qrbox: { width: 250, height: 250 }
//       },
//       async qrCodeMessage => {
//           const subDropdown = document.getElementById('sub-dropdown');
//           const options = [...subDropdown.options].map(option => option.value);

//           console.log("Scanned QR Code:", qrCodeMessage);

//           // Check if the scanned QR code does NOT exist in the dropdown options
//           if (!options.includes(qrCodeMessage)) {
//               // Display error modal
//               scanAlertText.innerText = "背番号が存在しません。 / Sebanggo does not exist.";
//               scanAlertModal.style.display = 'block';

//               // Play alert sound
//               if (alertSound) {
//                   alertSound.muted = false; // Unmute to alert user
//                   alertSound.volume = 1; // Set full volume
//                   alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
//               }

//               // Add blinking red background
//               document.body.classList.add('flash-red');

//               const closeScanModalButton = document.getElementById('closeScanModalButton');
//               closeScanModalButton.onclick = function () {
//                   scanAlertModal.style.display = 'none';
//                   alertSound.pause();
//                   alertSound.currentTime = 0; // Reset sound to the beginning
//                   alertSound.muted = true; // Mute again for next time
//                   document.body.classList.remove('flash-red');
//               };

//               // Stop QR scanning
//               html5QrCode.stop().then(() => {
//                   qrScannerModal.style.display = 'none';
//               }).catch(err => console.error("Failed to stop scanning:", err));

//               return;
//           }

//           // If QR code matches an option, set the dropdown value and close scanner
//           if (subDropdown && subDropdown.value !== qrCodeMessage) {
//               subDropdown.value = qrCodeMessage;
//               fetchProductDetails();

//               html5QrCode.stop().then(() => {
//                   qrScannerModal.style.display = 'none';
//               }).catch(err => console.error("Failed to stop scanning:", err));

//               return;
//           }
//       }
//   ).catch(err => {
//       console.error("Failed to start scanning:", err);
//   });

//   // Close the QR scanner modal
//   document.getElementById('closeQRScannerModal').onclick = function () {
//       html5QrCode.stop().then(() => {
//           qrScannerModal.style.display = 'none';
//       }).catch(err => console.error("Failed to stop scanning:", err));
//   };

//   // Close scanner if user clicks outside the modal
//   window.onclick = function (event) {
//       if (event.target == qrScannerModal) {
//           html5QrCode.stop().then(() => {
//               qrScannerModal.style.display = 'none';
//           }).catch(err => console.error("Failed to stop scanning:", err));
//       }
//   };
// });



let lastScanMethod = null; // Tracks whether using camera or bluetooth
let html5QrCode = null;    // Global reference to camera scanner
window.scannedBluetoothCode = ""; // Buffer for Bluetooth scans

// Show scan method selection modal
document.getElementById('scan-button').addEventListener('click', () => {
  document.getElementById('scanMethodModal').style.display = 'block';
});

// Use camera option
document.getElementById("useCameraScan").addEventListener("click", (e) => {
  e.preventDefault(); // <- prevent form submission
  lastScanMethod = "camera";
  document.getElementById("scanMethodModal").style.display = "none";
  startCameraScanner();
});

// Use Bluetooth scanner option
document.getElementById("useBluetoothScan").addEventListener("click", (e) => {
  e.preventDefault(); // <- prevent form submission
  lastScanMethod = "bluetooth";
  document.getElementById("scanMethodModal").style.display = "none";
  // Show waiting modal
  document.getElementById("bluetoothWaitModal").style.display = "block";
});

// Close scan method modal
document.getElementById("closeScanMethodModal").addEventListener("click", (e) => {
  e.preventDefault(); // <- prevent form submission
  document.getElementById("scanMethodModal").style.display = "none";
});

// Bluetooth scanner input handler
document.addEventListener('keydown', (event) => {
  if (lastScanMethod === "bluetooth") {
    if (/^[a-zA-Z0-9\-.,]$/.test(event.key)) {
      window.scannedBluetoothCode += event.key;
    }
    if (event.key === "Enter") {
      const cleanedQR = window.scannedBluetoothCode.replace(/Shift/g, '');
      console.log("Final Scanned QR (Bluetooth):", cleanedQR);
      handleQRScan(cleanedQR);
      window.scannedBluetoothCode = "";
    }
  }
});

// Handles QR scan for both methods
function handleQRScan(qrCodeMessage) {
  
  const subDropdown = document.getElementById("sub-dropdown");
  const options = [...subDropdown.options].map(option => option.value);
  const scanAlertModal = document.getElementById("scanAlertModal");
  const scanAlertText = document.getElementById("scanAlertText");
  const alertSound = document.getElementById("alert-sound");
  // Hide Bluetooth waiting modal if it's open
  document.getElementById("bluetoothWaitModal").style.display = "none";
  

  if (!options.includes(qrCodeMessage)) {
    scanAlertText.innerText = "背番号が存在しません。 / Sebanggo does not exist.";
    scanAlertModal.style.display = "block";

    if (alertSound) {
      alertSound.muted = false;
      alertSound.volume = 1;
      alertSound.play().catch(err => console.error("Failed to play alert:", err));
    }

    document.body.classList.add("flash-red");

    document.getElementById("closeScanModalButton").onclick = () => {
      scanAlertModal.style.display = "none";
      alertSound.pause();
      alertSound.currentTime = 0;
      alertSound.muted = true;
      document.body.classList.remove("flash-red");
    };

    return;
  }

  if (subDropdown && subDropdown.value !== qrCodeMessage) {
    subDropdown.value = qrCodeMessage;
    fetchProductDetails();
  }

  if (lastScanMethod === "camera" && html5QrCode) {
    html5QrCode.stop().then(() => {
      document.getElementById("qrScannerModal").style.display = "none";
    }).catch(err => console.error("Failed to stop scanning:", err));
  }
}

// Starts the camera scanner
function startCameraScanner() {
  html5QrCode = new Html5Qrcode("qrReader");
  const qrScannerModal = document.getElementById("qrScannerModal");
  qrScannerModal.style.display = "block";

  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    qrMessage => {
      console.log("Camera Scanned QR:", qrMessage);
      handleQRScan(qrMessage);
    }
  ).catch(err => console.error("Failed to start camera scan:", err));

  document.getElementById("closeQRScannerModal").onclick = () => {
    html5QrCode.stop().then(() => {
      qrScannerModal.style.display = "none";
    }).catch(err => console.error("Failed to stop scanner:", err));
  };

  window.onclick = function (event) {
    if (event.target === qrScannerModal) {
      html5QrCode.stop().then(() => {
        qrScannerModal.style.display = "none";
      }).catch(err => console.error("Failed to stop scanner:", err));
    }
  };
}

// Red background blinking animation
const style = document.createElement('style');
style.innerHTML = `
.flash-red {
  animation: flash-red 1s infinite;
}
@keyframes flash-red {
  50% { background-color: red; }
}
`;
document.head.appendChild(style);




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