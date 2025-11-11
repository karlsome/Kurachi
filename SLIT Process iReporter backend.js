const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";

// Select all input, select, and button elements
const inputs = document.querySelectorAll('input, select, button,textarea');
const selected工場 = document.getElementById('selected工場').value; // Get the current factory value
const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
const uniquePrefix = `${pageName}_${selected工場}_`;

// link for pictures database
const picURL = 'https://script.google.com/macros/s/AKfycbwHUW1ia8hNZG-ljsguNq8K4LTPVnB6Ng_GLXIHmtJTdUgGGd2WoiQo9ToF-7PvcJh9bA/exec';


// // this code will ping the Render website for inactivity
// const interval = 30000; // 30 seconds
// function pingServer() {
//   fetch(`${serverURL}/getSeBanggoList`)
//     .then((response) => {
//       if (!response.ok) {
//         throw new Error(`HTTP error! Status: ${response.status}`);
//       }
//       console.log(
//         `Pinged at ${new Date().toISOString()}: Status Code ${response.status}`
//       );
//     })
//     .catch((error) => {
//       console.error(
//         `Error pinging at ${new Date().toISOString()}:`,
//         error.message
//       );
//     });
// }
// setInterval(pingServer, interval);

//this code listens to incoming parameters passed
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}
const selectedFactory = getQueryParam("filter");
if (selectedFactory) {
  document.getElementById("selected工場").value = selectedFactory;
  console.log("kojo changed to: " + selectedFactory);
}



// get sebanggo list for SLIT only
document.addEventListener("DOMContentLoaded", () => {
  uploadingModal.style.display = 'none';
  const subDropdown = document.getElementById("sub-dropdown");

  // Fetch 背番号 list from the server
  fetch(`${serverURL}/getSeBanggoListSLIT`)
    .then((response) => response.json())
    .then((data) => {
      data.sort((a, b) => a.localeCompare(b, 'ja')); // 'ja' for Japanese sorting if needed alphabetically
      // Clear existing options
      subDropdown.innerHTML = "";

      // Add a default "Select 背番号" option
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "Select 背番号";
      defaultOption.disabled = true; // Make it non-selectable
      defaultOption.selected = true; // Make it the default selection
      subDropdown.appendChild(defaultOption);

      // Populate options dynamically
      data.forEach((seBanggo) => {
        const option = document.createElement("option");
        option.value = seBanggo;
        option.textContent = seBanggo;
        subDropdown.appendChild(option);
      });
    })
    .catch((error) => console.error("Error fetching 背番号 list:", error));
});

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
  document.getElementById('uploadingModal').style.display = 'none'; // this turns off the uploading modal
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


// async function fetchProductDetails() {
//   const serialNumber = document.getElementById("sub-dropdown").value;
//   const factory = document.getElementById("selected工場").value;
//   // Update the dynamicImage src attribute with the retrieved htmlWebsite value
//   const dynamicImage = document.getElementById("dynamicImage");
//   dynamicImage.src = "";

//   if (!serialNumber) {
//     console.error("Please select a valid 背番号.");
//     blankInfo();
//     return;
//   }

//   try {
//     const response = await fetch(
//       `${serverURL}/getProductDetails?serialNumber=${encodeURIComponent(
//         serialNumber
//       )}&factory=${encodeURIComponent(factory)}`
//     );
//     if (response.ok) {
//       const data = await response.json();

//       // Populate the HTML fields with the retrieved data
//       document.getElementById("product-number").value = data.品番 || "";
//       document.getElementById("model").value = data.モデル || "";
//       document.getElementById("shape").value = data.形状 || "";
//       document.getElementById("R-L").value = data["R/L"] || "";
//       document.getElementById("material").value = data.材料 || "";
//       document.getElementById("material-code").value = data.材料背番号 || "";
//       document.getElementById("material-color").value = data.色 || "";
//       document.getElementById("kataban").value = data.型番 || "";
//       document.getElementById("送りピッチ").textContent =
//         "送りピッチ: " + data.送りピッチ || "";


//       // if (data.htmlWebsite) {
//       //   dynamicImage.src = data.htmlWebsite; // Set the image source to the retrieved URL
//       //   dynamicImage.alt = "Product Image"; // Optional: Set the alt text
//       //   dynamicImage.style.display = "block"; // Ensure the image is visible
//       // } else {
//       //   dynamicImage.src = ""; // Clear the image source if no URL is available
//       //   dynamicImage.alt = "No Image Available"; // Optional: Set fallback alt text
//       //   dynamicImage.style.display = "none"; // Hide the image if no URL is available
//       // }
//     } else {
//       console.error("No matching product found.");
//     }
//   } catch (error) {
//     console.error("Error fetching product details:", error);
//   }
//   picLINK(serialNumber);
// }

// // Call fetchProductDetails when a new 背番号 is selected
// document.getElementById("sub-dropdown").addEventListener("change", fetchProductDetails);

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
    // Step 1: Try fetching by 背番号
    let response = await fetch(`${serverURL}/queries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dbName: "Sasaki_Coating_MasterDB",
        collectionName: "masterDB",
        query: { 背番号: serialNumber }
      }),
    });

    let result = await response.json();

    // Step 2: If no result, try by 品番
    if (!result || result.length === 0) {
      const altRes = await fetch(`${serverURL}/queries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dbName: "Sasaki_Coating_MasterDB",
          collectionName: "masterDB",
          query: { 品番: serialNumber }
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

    // Populate product detail fields
    document.getElementById("product-number").value = data.品番 || "";
    document.getElementById("model").value = data.モデル || "";
    document.getElementById("shape").value = data.形状 || "";
    document.getElementById("R-L").value = data["R/L"] || "";
    document.getElementById("material").value = data.材料 || "";
    document.getElementById("material-code").value = data.材料背番号 || "";
    document.getElementById("material-color").value = data.色 || "";
    document.getElementById("kataban").value = data.型番 || "";
    document.getElementById("送りピッチ").textContent = "送りピッチ: " + (data.送りピッチ || "");

    // Handle imageURL
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
}

// Trigger on change
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
function setDefaultTime(input) {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timeValue = `${hours}:${minutes}`;
  input.value = timeValue;

  // Save the time to local storage with unique prefix
  const key = `${uniquePrefix}${input.id}`;
  localStorage.setItem(key, timeValue);
}

// When date is pressed or on page load, set current date as default
function setDefaultDate(input) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateValue = `${year}-${month}-${day}`;
  input.value = dateValue;

  // Save the date to local storage with unique prefix
  const key = `${uniquePrefix}${input.id}`;
  localStorage.setItem(key, dateValue);
}

// Set current date as default on page load
document.addEventListener("DOMContentLoaded", function () {
  const dateInput = document.getElementById("Lot No.");
  setDefaultDate(dateInput);
});

//Get worker list
document.addEventListener("DOMContentLoaded", async function () {
  const selectedFactory = document.getElementById("selected工場").value;

  if (selectedFactory) {
    try {
      const response = await fetch(
        `${serverURL}/getWorkerNames?selectedFactory=${encodeURIComponent(
          selectedFactory
        )}`
      );
      if (!response.ok) throw new Error("Failed to fetch worker names");

      const workerNames = await response.json();
      
      // Store worker names for modal (datalist removed, now using modal)
      workerNamesData = workerNames;
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

  // Save the updated value to local storage with unique prefix
  const key = `${uniquePrefix}counter-${counterId}`;
  localStorage.setItem(key, currentValue);

  updateTotal();
}

function decrementCounter(counterId) {
  const counterElement = document.getElementById(`counter-${counterId}`);
  let currentValue = parseInt(counterElement.value, 10);
  if (currentValue > 0) {
    currentValue -= 1;
    counterElement.value = currentValue;

    // Save the updated value to local storage with unique prefix
    const key = `${uniquePrefix}counter-${counterId}`;
    localStorage.setItem(key, currentValue);

    updateTotal();
  }
}

function updateTotal() {
  // Get the value of Process Quantity
  const processQuantity =
    parseInt(document.getElementById("ProcessQuantity").value, 10) || 0;

  // Get the values of the counters
  const counter18 =
    parseInt(document.getElementById("counter-18").value, 10) || 0;
  const counter19 =
    parseInt(document.getElementById("counter-19").value, 10) || 0;
  const counter20 =
    parseInt(document.getElementById("counter-20").value, 10) || 0;

  // Calculate Total_NG
  const totalNG = counter18 + counter19 + counter20;

  // Update the Total_NG field
  document.getElementById("Total_NG").value = totalNG;

  // Calculate Total
  const total = processQuantity - totalNG;

  // Update the Total field
  document.getElementById("total").value = total;
}

// Attach updateTotal to relevant events
document
  .getElementById("ProcessQuantity")
  .addEventListener("input", updateTotal);



// Submit Button for new slit Process
// document.querySelector('form[name="contact-form"]').addEventListener("submit", async (event) => {
//     event.preventDefault(); // Prevent default form submission behavior
//     updateCycleTime();

//     const alertSound = document.getElementById("alert-sound");
//     const scanAlertModal = document.getElementById("scanAlertModal");
//     const scanAlertText = document.getElementById("scanAlertText");

//     // Preload the alert sound without playing it
//     if (alertSound) {
//       alertSound.muted = true; // Mute initially to preload
//       alertSound.loop = false; // Disable looping
//       alertSound.load(); // Preload the audio file
//     }

//     try {
//       // Get form data
//       const 品番 = document.getElementById("product-number").value;
//       const 背番号 = document.getElementById("sub-dropdown").value;
//       const Total = parseInt(document.getElementById("total").value, 10) || 0;
//       const Worker_Name = document.getElementById("Machine Operator").value;
//       const Date = document.getElementById("Lot No.").value;
//       const Time_start = document.getElementById("Start Time").value;
//       const Time_end = document.getElementById("End Time").value;
//       const 設備 = document.getElementById("process").value;
//       const 疵引不良 =
//         parseInt(document.getElementById("counter-18").value, 10) || 0;
//       const 加工不良 =
//         parseInt(document.getElementById("counter-19").value, 10) || 0;
//       const その他 =
//         parseInt(document.getElementById("counter-20").value, 10) || 0;
//       const Total_NG =
//         parseInt(document.getElementById("Total_NG").value, 10) || 0;
//       const Spare = parseInt(document.getElementById("spare").value, 10) || 0;
//       const Comment = document.querySelector(
//         'textarea[name="Comments1"]'
//       ).value;
//       const 工場 = document.getElementById("selected工場").value;
//       const Process_Quantity =
//         parseInt(document.getElementById("ProcessQuantity").value, 10) || 0;
//       const Cycle_Time =
//         parseFloat(document.getElementById("cycleTime").value) || 0;
//       const 製造ロット = document.getElementById("製造ロット").value;

//       // Check if 背番号 is selected
//       if (!背番号) {
//         // Show alert modal
//         scanAlertText.innerText = "背番号が必要です。 / Sebanggo is required.";
//         scanAlertModal.style.display = "block";

//         // Play alert sound
//         if (alertSound) {
//           alertSound.muted = false; // Unmute to alert user
//           alertSound.volume = 1; // Set full volume
//           alertSound
//             .play()
//             .catch((error) =>
//               console.error("Failed to play alert sound:", error)
//             );
//         }

//         // Add blinking red background
//         document.body.classList.add("flash-red");

//         // Close modal on button click
//         const closeScanModalButton = document.getElementById(
//           "closeScanModalButton"
//         );
//         closeScanModalButton.onclick = function () {
//           scanAlertModal.style.display = "none";
//           alertSound.pause();
//           alertSound.currentTime = 0; // Reset sound to the beginning
//           alertSound.muted = true; // Mute again for next time
//           document.body.classList.remove("flash-red");
//         };

//         return; // Stop the submission process
//       }

//       // Get the values of the counters
//       const counters = Array.from({ length: 12 }, (_, i) => {
//         const counter = document.getElementById(`counter-${i + 1}`);
//         return parseInt(counter?.value || 0, 10);
//       });

//       // Prepare data for saving to slitDB
//       const formData = {
//         品番,
//         背番号,
//         Total,
//         Worker_Name,
//         Date,
//         Time_start,
//         Time_end,
//         設備,
//         疵引不良,
//         加工不良,
//         その他,
//         Total_NG,
//         Cycle_Time,
//         製造ロット,
//         Spare,
//         Comment,
//         工場,
//         Process_Quantity,
//       };

//       console.log("Data to save to kensaDB:", formData);

//       // Save to kensaDB
//       const saveResponse = await fetch(`${serverURL}/submitToSlitDBiReporter`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(formData),
//       });

//       if (!saveResponse.ok) {
//         const errorData = await saveResponse.json();
//         throw new Error(errorData.error || "Failed to save data to kensaDB");
//       }

//       console.log("Form data saved to kensaDB successfully.");

//       // Show success modal with blinking green background
//       scanAlertText.innerText = "Form submitted successfully / 保存しました";
//       scanAlertModal.style.display = "block";
//       document.body.classList.add("flash-green");

//       // Reload the page after closing the modal
//       const closeScanModalButton = document.getElementById(
//         "closeScanModalButton"
//       );
//       closeScanModalButton.onclick = function () {
//         scanAlertModal.style.display = "none";
//         document.body.classList.remove("flash-green");
//         //window.location.reload();
//         resetForm();
//       };
//     } catch (error) {
//       console.error("Error during submission:", error);

//       // Show error modal with blinking red background
//       scanAlertText.innerText = "An error occurred. Please try again.";
//       scanAlertModal.style.display = "block";

//       // Play alert sound
//       if (alertSound) {
//         alertSound.muted = false;
//         alertSound.volume = 1;
//         alertSound
//           .play()
//           .catch((error) =>
//             console.error("Failed to play alert sound:", error)
//           );
//       }

//       // Add blinking red background
//       document.body.classList.add("flash-red");

//       // Close modal on button click
//       const closeScanModalButton = document.getElementById(
//         "closeScanModalButton"
//       );
//       closeScanModalButton.onclick = function () {
//         scanAlertModal.style.display = "none";
//         alertSound.pause();
//         alertSound.currentTime = 0;
//         alertSound.muted = true;
//         document.body.classList.remove("flash-red");
//       };
//     }
//   });


document.querySelector('form[name="contact-form"]').addEventListener("submit", async (event) => {
  event.preventDefault();
  updateCycleTime();

  const alertSound = document.getElementById("alert-sound");
  const scanAlertModal = document.getElementById("scanAlertModal");
  const scanAlertText = document.getElementById("scanAlertText");
  const uploadingModal = document.getElementById("uploadingModal");

  // Preload the alert sound
  if (alertSound) {
    alertSound.muted = true;
    alertSound.loop = false;
    alertSound.load();
  }

  // Show loading modal
  uploadingModal.style.display = 'flex';

  try {
    const 品番 = document.getElementById("product-number").value;
    const 背番号 = document.getElementById("sub-dropdown").value;
    const Total = parseInt(document.getElementById("total").value, 10) || 0;
    const Worker_Name = document.getElementById("Machine Operator").value;
    const WorkDate = document.getElementById("Lot No.").value;
    const Time_start = document.getElementById("Start Time").value;
    const Time_end = document.getElementById("End Time").value;
    const 設備 = document.getElementById("process").value;
    const 疵引不良 = parseInt(document.getElementById("counter-18").value, 10) || 0;
    const 加工不良 = parseInt(document.getElementById("counter-19").value, 10) || 0;
    const その他 = parseInt(document.getElementById("counter-20").value, 10) || 0;
    const Total_NG = parseInt(document.getElementById("Total_NG").value, 10) || 0;
    const Spare = parseInt(document.getElementById("spare").value, 10) || 0;
    const Comment = document.querySelector('textarea[name="Comments1"]').value;
    const 工場 = document.getElementById("selected工場").value;
    const Process_Quantity = parseInt(document.getElementById("ProcessQuantity").value, 10) || 0;
    const Cycle_Time = parseFloat(document.getElementById("cycleTime").value) || 0;
    const 製造ロット = document.getElementById("製造ロット").value;

    if (!背番号) {
      uploadingModal.style.display = 'none';
      scanAlertText.innerText = "背番号が必要です。 / Sebanggo is required.";
      scanAlertModal.style.display = "block";

      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(console.error);
      }

      document.body.classList.add("flash-red");
      document.getElementById("closeScanModalButton").onclick = function () {
        scanAlertModal.style.display = "none";
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.muted = true;
        document.body.classList.remove("flash-red");
      };
      return;
    }

    // ==================== VALIDATION SECTION ====================
    // Validate all required fields before submission

    // 1. Check required fields
    if (!品番 || 品番.trim() === '') {
      uploadingModal.style.display = 'none';
      scanAlertText.innerText = '品番が必要です / Product Number is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(console.error);
      }
      document.body.classList.add('flash-red');
      document.getElementById('closeScanModalButton').onclick = function() {
        scanAlertModal.style.display = 'none';
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.muted = true;
        document.body.classList.remove('flash-red');
      };
      document.getElementById('product-number').focus();
      return;
    }

    if (!工場 || 工場.trim() === '') {
      uploadingModal.style.display = 'none';
      scanAlertText.innerText = '工場が必要です / Factory is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(console.error);
      }
      document.body.classList.add('flash-red');
      document.getElementById('closeScanModalButton').onclick = function() {
        scanAlertModal.style.display = 'none';
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.muted = true;
        document.body.classList.remove('flash-red');
      };
      document.getElementById('selected工場').focus();
      return;
    }

    if (!設備 || 設備.trim() === '') {
      uploadingModal.style.display = 'none';
      scanAlertText.innerText = '設備が必要です / Equipment is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(console.error);
      }
      document.body.classList.add('flash-red');
      document.getElementById('closeScanModalButton').onclick = function() {
        scanAlertModal.style.display = 'none';
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.muted = true;
        document.body.classList.remove('flash-red');
      };
      document.getElementById('process').focus();
      return;
    }

    if (!Process_Quantity || Process_Quantity <= 0) {
      uploadingModal.style.display = 'none';
      scanAlertText.innerText = '加工数（良品）が必要です / Process Quantity is required and must be greater than 0';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(console.error);
      }
      document.body.classList.add('flash-red');
      document.getElementById('closeScanModalButton').onclick = function() {
        scanAlertModal.style.display = 'none';
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.muted = true;
        document.body.classList.remove('flash-red');
      };
      document.getElementById('ProcessQuantity').focus();
      return;
    }

    if (!Worker_Name || Worker_Name.trim() === '') {
      uploadingModal.style.display = 'none';
      scanAlertText.innerText = '作業者名が必要です / Worker Name is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(console.error);
      }
      document.body.classList.add('flash-red');
      document.getElementById('closeScanModalButton').onclick = function() {
        scanAlertModal.style.display = 'none';
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.muted = true;
        document.body.classList.remove('flash-red');
      };
      document.getElementById('Machine Operator').focus();
      return;
    }

    if (!WorkDate || WorkDate.trim() === '') {
      uploadingModal.style.display = 'none';
      scanAlertText.innerText = '加工日が必要です / Work Date is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(console.error);
      }
      document.body.classList.add('flash-red');
      document.getElementById('closeScanModalButton').onclick = function() {
        scanAlertModal.style.display = 'none';
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.muted = true;
        document.body.classList.remove('flash-red');
      };
      document.getElementById('Lot No.').focus();
      return;
    }

    if (!製造ロット || 製造ロット.trim() === '') {
      uploadingModal.style.display = 'none';
      scanAlertText.innerText = '製造ロットが必要です / Manufacturing Lot is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(console.error);
      }
      document.body.classList.add('flash-red');
      document.getElementById('closeScanModalButton').onclick = function() {
        scanAlertModal.style.display = 'none';
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.muted = true;
        document.body.classList.remove('flash-red');
      };
      document.getElementById('製造ロット').focus();
      return;
    }

    // 2. Validate Time fields
    if (!Time_start || Time_start.trim() === '') {
      uploadingModal.style.display = 'none';
      scanAlertText.innerText = '加工開始時間が必要です / Start Time is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(console.error);
      }
      document.body.classList.add('flash-red');
      document.getElementById('closeScanModalButton').onclick = function() {
        scanAlertModal.style.display = 'none';
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.muted = true;
        document.body.classList.remove('flash-red');
      };
      document.getElementById('Start Time').focus();
      return;
    }

    if (!Time_end || Time_end.trim() === '') {
      uploadingModal.style.display = 'none';
      scanAlertText.innerText = '加工終了時間が必要です / End Time is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(console.error);
      }
      document.body.classList.add('flash-red');
      document.getElementById('closeScanModalButton').onclick = function() {
        scanAlertModal.style.display = 'none';
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.muted = true;
        document.body.classList.remove('flash-red');
      };
      document.getElementById('End Time').focus();
      return;
    }

    // 3. Validate Time_start < Time_end and Time_start ≠ Time_end
    const startTimeDate = new Date(`2000-01-01T${Time_start}:00`);
    const endTimeDate = new Date(`2000-01-01T${Time_end}:00`);

    if (Time_start === Time_end) {
      uploadingModal.style.display = 'none';
      scanAlertText.innerText = '加工開始時間と加工終了時間は同じにできません\n\nStart Time and End Time cannot be the same\n\n開始: ' + Time_start + '\n終了: ' + Time_end;
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(console.error);
      }
      document.body.classList.add('flash-red');
      document.getElementById('closeScanModalButton').onclick = function() {
        scanAlertModal.style.display = 'none';
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.muted = true;
        document.body.classList.remove('flash-red');
      };
      document.getElementById('End Time').focus();
      return;
    }

    if (startTimeDate >= endTimeDate) {
      uploadingModal.style.display = 'none';
      scanAlertText.innerText = '加工開始時間は加工終了時間より前である必要があります\n\nStart Time must be before End Time\n\n開始: ' + Time_start + '\n終了: ' + Time_end;
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(console.error);
      }
      document.body.classList.add('flash-red');
      document.getElementById('closeScanModalButton').onclick = function() {
        scanAlertModal.style.display = 'none';
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.muted = true;
        document.body.classList.remove('flash-red');
      };
      document.getElementById('End Time').focus();
      return;
    }

    console.log('✅ All required fields validated successfully');
    // ==================== END VALIDATION SECTION ====================

    const formData = {
      品番,
      背番号,
      Total,
      Worker_Name,
      Date: WorkDate,
      Time_start,
      Time_end,
      設備,
      疵引不良,
      加工不良,
      その他,
      Total_NG,
      Cycle_Time,
      製造ロット,
      Spare,
      Comment,
      工場,
      Process_Quantity,
    };

    // 🟡 Add image data for 初物チェック if available
    const hatsumonoPic = document.getElementById("hatsumonoPic");
    const images = [];

    if (hatsumonoPic && hatsumonoPic.src) {
      const response = await fetch(hatsumonoPic.src);
      const blob = await response.blob();
      const base64Data = await blobToBase64(blob);

      images.push({
        base64: base64Data,
        label: "初物チェック",
        factory: 工場,
        machine: 設備,
        worker: Worker_Name,
        date: WorkDate,
        sebanggo: 背番号,
      });
    }

    // Attach images array to formData
    formData.images = images;

    // 🔽 Send to slitDB
    const saveResponse = await fetch(`${serverURL}/submitToSlitDBiReporter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (!saveResponse.ok) {
      const errorData = await saveResponse.json();
      throw new Error(errorData.error || "Failed to save data to slitDB");
    }

    uploadingModal.style.display = 'none';
    scanAlertText.innerText = "Form submitted successfully / 保存しました";
    scanAlertModal.style.display = "block";
    document.body.classList.add("flash-green");

    document.getElementById("closeScanModalButton").onclick = function () {
      scanAlertModal.style.display = "none";
      document.body.classList.remove("flash-green");
      resetForm();
    };
  } catch (error) {
    console.error("Error during submission:", error);

    uploadingModal.style.display = 'none';
    scanAlertText.innerText = "An error occurred. Please try again.";
    scanAlertModal.style.display = "block";

    if (alertSound) {
      alertSound.muted = false;
      alertSound.volume = 1;
      alertSound.play().catch(console.error);
    }

    document.body.classList.add("flash-red");
    document.getElementById("closeScanModalButton").onclick = function () {
      scanAlertModal.style.display = "none";
      alertSound.pause();
      alertSound.currentTime = 0;
      alertSound.muted = true;
      document.body.classList.remove("flash-red");
    };
  }
});

// Utility: Convert Blob to Base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}




//Updates cycle Time value
function updateCycleTime() {
  const startTime = document.getElementById("Start Time").value;
  const endTime = document.getElementById("End Time").value;
  const quantity =
    parseInt(document.getElementById("ProcessQuantity").value, 10) || 1; // Avoid division by 0

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

//scan BUtton javascript
document.getElementById("scan-button").addEventListener("click", function () {
  const qrScannerModal = document.getElementById("qrScannerModal");
  const scanAlertModal = document.getElementById("scanAlertModal");
  const scanAlertText = document.getElementById("scanAlertText");
  const html5QrCode = new Html5Qrcode("qrReader");
  const alertSound = document.getElementById("alert-sound");

  // Preload the alert sound without playing it
  if (alertSound) {
    alertSound.muted = true; // Mute initially to preload
    alertSound.loop = false; // Disable looping
    alertSound.load(); // Preload the audio file
  }

  // Show the modal
  qrScannerModal.style.display = "block";

  // Start QR code scanning
  html5QrCode
    .start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
      },
      async (qrCodeMessage) => {
        const subDropdown = document.getElementById("sub-dropdown");
        const options = [...subDropdown.options].map((option) => option.value);

        console.log("Scanned QR Code:", qrCodeMessage);

        // Check if the scanned QR code does NOT exist in the dropdown options
        if (!options.includes(qrCodeMessage)) {
          // Display error modal
          scanAlertText.innerText =
            "背番号が存在しません。 / Sebanggo does not exist.";
          scanAlertModal.style.display = "block";

          // Play alert sound
          if (alertSound) {
            alertSound.muted = false; // Unmute to alert user
            alertSound.volume = 1; // Set full volume
            alertSound
              .play()
              .catch((error) =>
                console.error("Failed to play alert sound:", error)
              );
          }

          // Add blinking red background
          document.body.classList.add("flash-red");

          const closeScanModalButton = document.getElementById(
            "closeScanModalButton"
          );
          closeScanModalButton.onclick = function () {
            scanAlertModal.style.display = "none";
            alertSound.pause();
            alertSound.currentTime = 0; // Reset sound to the beginning
            alertSound.muted = true; // Mute again for next time
            document.body.classList.remove("flash-red");
          };

          // Stop QR scanning
          html5QrCode
            .stop()
            .then(() => {
              qrScannerModal.style.display = "none";
            })
            .catch((err) => console.error("Failed to stop scanning:", err));

          return;
        }

        // If QR code matches an option, set the dropdown value and close scanner
        if (subDropdown && subDropdown.value !== qrCodeMessage) {
          subDropdown.value = qrCodeMessage;
          fetchProductDetails();

          html5QrCode
            .stop()
            .then(() => {
              qrScannerModal.style.display = "none";
            })
            .catch((err) => console.error("Failed to stop scanning:", err));

          return;
        }
      }
    )
    .catch((err) => {
      console.error("Failed to start scanning:", err);
    });

  // Close the QR scanner modal
  document.getElementById("closeQRScannerModal").onclick = function () {
    html5QrCode
      .stop()
      .then(() => {
        qrScannerModal.style.display = "none";
      })
      .catch((err) => console.error("Failed to stop scanning:", err));
  };

  // Close scanner if user clicks outside the modal
  window.onclick = function (event) {
    if (event.target == qrScannerModal) {
      html5QrCode
        .stop()
        .then(() => {
          qrScannerModal.style.display = "none";
        })
        .catch((err) => console.error("Failed to stop scanning:", err));
    }
  };
});

// CSS for blinking red background
const style = document.createElement("style");
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


// Only handle 初物チェック (hatsumono)
const buttonMappings = [
  {
    buttonId: 'hatsumonoButton',
    labelId: 'hatsumonoLabel',
    imgId: 'hatsumonoPic',
    labelText: '初物チェック',
  },
];

let currentButtonId = null;

buttonMappings.forEach(({ buttonId }) => {
  const button = document.getElementById(buttonId);
  button.addEventListener('click', () => {
    const subDropdown = document.getElementById('sub-dropdown');
    const selectedValue = subDropdown?.value;

    if (!selectedValue) {
      const scanAlertModal = document.getElementById('scanAlertModal');
      const scanAlertText = document.getElementById('scanAlertText');
      const alertSound = document.getElementById('alert-sound');

      scanAlertText.innerText = '背番号を選択してください / Please select a Sebanggo first.';
      scanAlertModal.style.display = 'block';

      document.body.classList.add('flash-red');
      subDropdown.classList.add('flash-red-border');

      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(err => console.error("Failed to play sound:", err));
      }

      const closeScanModalButton = document.getElementById('closeScanModalButton');
      closeScanModalButton.onclick = function () {
        scanAlertModal.style.display = 'none';
        document.body.classList.remove('flash-red');
        subDropdown.classList.remove('flash-red-border');

        if (alertSound) {
          alertSound.pause();
          alertSound.currentTime = 0;
          alertSound.muted = true;
        }
      };

      return;
    }

    // Continue to capture image
    currentButtonId = buttonId;
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

// ===== WORKER NAME MODAL FUNCTIONALITY =====

// Worker Name Selection Modal Variables
let workerNamesData = [];
const RECENT_WORKERS_KEY = 'recentWorkerNames';
const MAX_RECENT_WORKERS = 6;

// Get recent workers from localStorage
function getRecentWorkers() {
  const recent = localStorage.getItem(RECENT_WORKERS_KEY);
  return recent ? JSON.parse(recent) : [];
}

// Add worker to recent list
function addToRecentWorkers(name) {
  if (!name || name.trim() === '') return;
  
  let recent = getRecentWorkers();
  recent = recent.filter(w => w !== name);
  recent.unshift(name);
  recent = recent.slice(0, MAX_RECENT_WORKERS);
  
  localStorage.setItem(RECENT_WORKERS_KEY, JSON.stringify(recent));
}

// Remove worker from recent list
function removeFromRecentWorkers(name) {
  let recent = getRecentWorkers();
  recent = recent.filter(w => w !== name);
  localStorage.setItem(RECENT_WORKERS_KEY, JSON.stringify(recent));
  renderWorkerNames();
}

// Group names alphabetically
function groupNamesByLetter(names) {
  const grouped = {};
  
  names.forEach(name => {
    let firstChar = name.charAt(0).toUpperCase();
    
    if (firstChar.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/)) {
      firstChar = name.charAt(0);
    } else if (firstChar.match(/[A-Z]/)) {
      firstChar = firstChar.toUpperCase();
    } else {
      firstChar = '#';
    }
    
    if (!grouped[firstChar]) {
      grouped[firstChar] = [];
    }
    grouped[firstChar].push(name);
  });
  
  Object.keys(grouped).forEach(key => {
    grouped[key].sort();
  });
  
  return grouped;
}

// Render worker names in modal
function renderWorkerNames() {
  const container = document.getElementById('workerNamesContainer');
  container.innerHTML = '';
  
  const recentWorkers = getRecentWorkers();
  
  if (recentWorkers.length > 0) {
    const recentSection = document.createElement('div');
    recentSection.className = 'worker-section recent-section';
    
    const header = document.createElement('div');
    header.className = 'worker-section-header';
    header.textContent = '⭐ 最近使用 / Recent';
    recentSection.appendChild(header);
    
    const grid = document.createElement('div');
    grid.className = 'worker-names-grid';
    
    recentWorkers.forEach(name => {
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'worker-name-btn';
      btn.textContent = name;
      btn.onclick = () => selectWorkerName(name);
      
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-recent-btn';
      deleteBtn.innerHTML = '×';
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        removeFromRecentWorkers(name);
      };
      
      wrapper.appendChild(btn);
      wrapper.appendChild(deleteBtn);
      grid.appendChild(wrapper);
    });
    
    recentSection.appendChild(grid);
    container.appendChild(recentSection);
  }
  
  const grouped = groupNamesByLetter(workerNamesData);
  const sortedKeys = Object.keys(grouped).sort();
  
  sortedKeys.forEach(letter => {
    const section = document.createElement('div');
    section.className = 'worker-section';
    
    const header = document.createElement('div');
    header.className = 'worker-section-header';
    header.textContent = letter;
    section.appendChild(header);
    
    const grid = document.createElement('div');
    grid.className = 'worker-names-grid';
    
    grouped[letter].forEach(name => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'worker-name-btn';
      btn.textContent = name;
      btn.onclick = () => selectWorkerName(name);
      grid.appendChild(btn);
    });
    
    section.appendChild(grid);
    container.appendChild(section);
  });
}

// Select worker name
function selectWorkerName(name) {
  const input = document.getElementById('Machine Operator');
  input.value = name;
  addToRecentWorkers(name);
  closeWorkerModal();
  input.dispatchEvent(new Event('change'));
}

// Open worker modal
function openWorkerModal() {
  const modal = document.getElementById('workerNameModal');
  modal.style.display = 'block';
  renderWorkerNames();
}

// Close worker modal
function closeWorkerModal() {
  const modal = document.getElementById('workerNameModal');
  modal.style.display = 'none';
}

// Initialize worker name modal
setTimeout(function() {
  const workerInput = document.getElementById('Machine Operator');
  const closeModalBtn = document.getElementById('closeWorkerModal');
  const manualEntryBtn = document.getElementById('manualEntryBtn');
  
  if (workerInput) {
    workerInput.addEventListener('click', function(e) {
      if (workerInput.readOnly && workerNamesData.length > 0) {
        e.preventDefault();
        openWorkerModal();
      }
    });
    
    workerInput.addEventListener('focus', function(e) {
      if (workerInput.readOnly && workerNamesData.length > 0) {
        e.preventDefault();
        openWorkerModal();
      }
    });
    
    workerInput.addEventListener('touchstart', function(e) {
      if (workerInput.readOnly && workerNamesData.length > 0) {
        e.preventDefault();
        openWorkerModal();
      }
    });
  }
  
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeWorkerModal);
  }
  
  if (manualEntryBtn) {
    manualEntryBtn.addEventListener('click', function() {
      closeWorkerModal();
      
      if (workerInput) {
        workerInput.removeAttribute('list');
        workerInput.removeAttribute('readonly');
        workerInput.readOnly = false;
        workerInput.style.cursor = 'text';
        workerInput.placeholder = 'Type worker name manually...';
        
        setTimeout(function() {
          workerInput.value = '';
          workerInput.focus();
          workerInput.click();
        }, 100);
      }
    });
  }
  
  const modal = document.getElementById('workerNameModal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeWorkerModal();
      }
    });
  }
  
  if (workerInput) {
    workerInput.addEventListener('blur', function() {
      const enteredName = workerInput.value.trim();
      if (enteredName && !workerInput.readOnly) {
        addToRecentWorkers(enteredName);
      }
    });
    
    workerInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        const enteredName = workerInput.value.trim();
        if (enteredName && !workerInput.readOnly) {
          addToRecentWorkers(enteredName);
        }
      }
    });
  }
}, 500);