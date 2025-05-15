
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


// // function to fetch product details
// // This function fetches product details based on 背番号 or 品番
// async function fetchProductDetails() {
//   checkProcessCondition();
//   enableInputs(); // Delete this in production

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
//     // Step 1: Try query by 背番号
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

//     // Step 2: If not found, try query by 品番
//     if (!result || result.length === 0) {
//       const altRes = await fetch(`${serverURL}/queries`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           dbName: "Sasaki_Coating_MasterDB",
//           collectionName: "masterDB",
//           query: { 品番: serialNumber },
//         }),
//       });

//       const altResult = await altRes.json();

//       if (altResult.length > 0) {
//         const matched = altResult[0];
//         if (matched.背番号) {
//           subDropdown.value = matched.背番号; // Update dropdown to 背番号
//         }
//         result = [matched];
//       }
//     }

//     // Step 3: Still no result
//     if (!result || result.length === 0) {
//       console.error("No matching product found.");
//       blankInfo();
//       return;
//     }

//     const product = result[0];

//     // Step 4: (Removed pictureDB fetch)
//     // Use only picLINK for image handling now
//     picLINK(product.背番号 || serialNumber, product.品番);

//     // Step 5: Populate fields
//     document.getElementById("product-number").value = product.品番 || "";
//     document.getElementById("model").value = product.モデル || "";
//     document.getElementById("shape").value = product.形状 || "";
//     document.getElementById("R-L").value = product["R/L"] || "";
//     document.getElementById("material").value = product.材料 || "";
//     document.getElementById("material-code").value = product.材料背番号 || "";
//     document.getElementById("material-color").value = product.色 || "";
//     document.getElementById("kataban").value = product.型番 || "";
//     document.getElementById("収容数").value = product.収容数 || "";
//     document.getElementById("送りピッチ").textContent = "送りピッチ: " + (product.送りピッチ || "");
//     document.getElementById("SRS").value = product.SRS || "";
//   } catch (error) {
//     console.error("Error fetching product details:", error);
//   }
// }

// // Trigger on change
// document.getElementById("sub-dropdown").addEventListener("change", fetchProductDetails);

// Function to fetch product details based on 背番号 or 品番
async function fetchProductDetails() {
  checkProcessCondition();
  enableInputs(); // Delete this in production

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
    // Step 1: Try query by 背番号
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

    // Step 2: If not found, try query by 品番
    if (!result || result.length === 0) {
      const altRes = await fetch(`${serverURL}/queries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dbName: "Sasaki_Coating_MasterDB",
          collectionName: "masterDB",
          query: { 品番: serialNumber },
        }),
      });

      const altResult = await altRes.json();

      if (altResult.length > 0) {
        const matched = altResult[0];
        if (matched.背番号) {
          subDropdown.value = matched.背番号; // Update dropdown to 背番号
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

    const product = result[0];

    // Step 4: Display image from imageURL (Firebase)
    if (product.imageURL) {
      dynamicImage.src = product.imageURL;
      dynamicImage.alt = "Product Image";
      dynamicImage.style.display = "block";
    } else {
      dynamicImage.src = "";
      dynamicImage.alt = "No Image Available";
      dynamicImage.style.display = "none";
    }

    // Step 5: Populate product fields
    document.getElementById("product-number").value = product.品番 || "";
    document.getElementById("model").value = product.モデル || "";
    document.getElementById("shape").value = product.形状 || "";
    document.getElementById("R-L").value = product["R/L"] || "";
    document.getElementById("material").value = product.材料 || "";
    document.getElementById("material-code").value = product.材料背番号 || "";
    document.getElementById("material-color").value = product.色 || "";
    document.getElementById("kataban").value = product.型番 || "";
    document.getElementById("収容数").value = product.収容数 || "";
    document.getElementById("送りピッチ").textContent = "送りピッチ: " + (product.送りピッチ || "");
    document.getElementById("SRS").value = product.SRS || "";

  } catch (error) {
    console.error("Error fetching product details:", error);
  }
}

// Trigger on change
document.getElementById("sub-dropdown").addEventListener("change", fetchProductDetails);


// Function to fetch image link from Google Sheets
function picLINK(背番号, 品番 = null) {
  // Try 背番号 first
  fetchImageFromSheet(背番号)
    .then(link => {
      if (!link || link.includes("not found")) {
        // Try 品番 as fallback
        if (品番) {
          return fetchImageFromSheet(品番);
        } else {
          throw new Error("Image not found and no 品番 to fallback.");
        }
      }
      return link;
    })
    .then(finalLink => {
      if (finalLink && !finalLink.includes("not found")) {
        updateImageSrc(finalLink);
      } else {
        console.warn("No valid image link found for 背番号 or 品番.");
      }
    })
    .catch(error => {
      console.error("Image loading error:", error);
    });
}

// Helper function to call the App Script API
function fetchImageFromSheet(headerValue) {
  return fetch(`${picURL}?link=${headerValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error("Network error: " + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      return data.replace(/"/g, ''); // Clean the returned URL
    });
}


function updateImageSrc(link) {
  const imageElement = document.getElementById('dynamicImage');

  if (imageElement) {
    // Clean redirect-based URL
    const cleanedLink = link.replace(/.*\/d\/(.*?)\/.*/, 'https://drive.google.com/uc?export=view&id=$1');

    imageElement.src = cleanedLink;
    imageElement.alt = "Product Image";
    imageElement.style.display = "block";
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





// // Submit Button
// document.querySelector('form[name="contact-form"]').addEventListener('submit', async (event) => {
//   event.preventDefault();
//   // Show uploading modal
//   document.getElementById('uploadingModal').style.display = 'flex';

//   const alertSound = document.getElementById('alert-sound');
//   const scanAlertModal = document.getElementById('scanAlertModal');
//   const scanAlertText = document.getElementById('scanAlertText');

//   try {
//     const hatsumono = document.getElementById("hatsumonoLabel").textContent;
//     const atomono = document.getElementById("atomonoLabel").textContent;

//     if (hatsumono === "FALSE" || atomono === "FALSE") {
//       showAlert("初物/終物確認してください / Please do Hatsumono and Atomono");
//       return;
//     }

//     updateCycleTime();

//     const formData = {
//       品番: document.getElementById('product-number').value,
//       背番号: document.getElementById('sub-dropdown').value,
//       設備: document.getElementById('process').value,
//       Total: parseInt(document.getElementById('total').value, 10) || 0,
//       工場: document.getElementById('selected工場').value,
//       Worker_Name: document.getElementById('Machine Operator').value,
//       Process_Quantity: parseInt(document.getElementById('ProcessQuantity').value, 10) || 0,
//       Date: document.getElementById('Lot No.').value,
//       Time_start: document.getElementById('Start Time').value,
//       Time_end: document.getElementById('End Time').value,
//       材料ロット: document.getElementById('材料ロット').value,
//       疵引不良: parseInt(document.getElementById('counter-18').value, 10) || 0,
//       加工不良: parseInt(document.getElementById('counter-19').value, 10) || 0,
//       その他: parseInt(document.getElementById('counter-20').value, 10) || 0,
//       Total_NG: parseInt(document.getElementById('Total_NG').value, 10) || 0,
//       Spare: parseInt(document.getElementById('spare').value, 10) || 0,
//       Comment: document.querySelector('textarea[name="Comments1"]').value,
//       Cycle_Time: parseFloat(document.getElementById('cycleTime').value) || 0,
//       ショット数: parseInt(document.getElementById('shot').value, 10) || 0,
//     };

//     if (!formData.背番号) {
//       showAlert('背番号が必要です。 / Sebanggo is required.');
//       return;
//     }

//     // Collect base64 images
//     formData.images = await collectImagesForUpload();

//     // Submit form data
//     const response = await fetch(`${serverURL}/submitTopressDBiReporter`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(formData),
//     });

//     if (!response.ok) {
//       const errorData = await response.json();
//       throw new Error(errorData.error || 'Failed to save data');
//     }

//     // Success handling
//     scanAlertText.innerText = 'Form submitted successfully / 保存しました';
//     scanAlertModal.style.display = 'block';
//     document.body.classList.add('flash-green');

//     document.getElementById('closeScanModalButton').onclick = function () {
//       scanAlertModal.style.display = 'none';
//       document.body.classList.remove('flash-green');
//       // Hide uploading modal after success
//       document.getElementById('uploadingModal').style.display = 'none';
//       window.location.reload();
//       resetForm();
//     };

//   } catch (error) {
//     document.getElementById('uploadingModal').style.display = 'none';
//     console.error('Submission error:', error);
//     showAlert('An error occurred. Please try again.');
//   }
// });


//Submit Button
document.querySelector('form[name="contact-form"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  document.getElementById('uploadingModal').style.display = 'flex';

  const alertSound = document.getElementById('alert-sound');
  const scanAlertModal = document.getElementById('scanAlertModal');
  const scanAlertText = document.getElementById('scanAlertText');

  try {
    const hatsumono = document.getElementById("hatsumonoLabel").textContent;
    const atomono = document.getElementById("atomonoLabel").textContent;

    if (hatsumono === "FALSE" || atomono === "FALSE") {
      showAlert("初物/終物確認してください / Please do Hatsumono and Atomono");
      document.getElementById('uploadingModal').style.display = 'none';
      return;
    }

    updateCycleTime();

    const formData = {
      品番: document.getElementById('product-number').value,
      背番号: document.getElementById('sub-dropdown').value,
      設備: document.getElementById('process').value,
      Total: parseInt(document.getElementById('total').value, 10) || 0,
      工場: document.getElementById('selected工場').value,
      Worker_Name: document.getElementById('Machine Operator').value,
      Process_Quantity: parseInt(document.getElementById('ProcessQuantity').value, 10) || 0,
      Date: document.getElementById('Lot No.').value,
      Time_start: document.getElementById('Start Time').value,
      Time_end: document.getElementById('End Time').value,
      材料ロット: document.getElementById('材料ロット').value,
      疵引不良: parseInt(document.getElementById('counter-18').value, 10) || 0,
      加工不良: parseInt(document.getElementById('counter-19').value, 10) || 0,
      その他: parseInt(document.getElementById('counter-20').value, 10) || 0,
      Total_NG: parseInt(document.getElementById('Total_NG').value, 10) || 0,
      Spare: parseInt(document.getElementById('spare').value, 10) || 0,
      Comment: document.querySelector('textarea[name="Comments1"]').value,
      Cycle_Time: parseFloat(document.getElementById('cycleTime').value) || 0,
      ショット数: parseInt(document.getElementById('shot').value, 10) || 0,
    };

    if (!formData.背番号) {
      showAlert('背番号が必要です。 / Sebanggo is required.');
      document.getElementById('uploadingModal').style.display = 'none';
      return;
    }

    //  Generate uniqueID for duplication check
    formData.uniqueID = `${formData.背番号}_${formData.Date}_${formData.Time_start}_${formData.Worker_Name}_${formData.設備}`;

    //  Check for duplicate on server first
    const duplicateCheck = await fetch(`${serverURL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectionName: "pressDB",
        query: { uniqueID: formData.uniqueID }
      })
    });

    const duplicateResult = await duplicateCheck.json();

    if (duplicateResult.length > 0) {
      document.getElementById('uploadingModal').style.display = 'none';
      showAlert("この作業は既に登録されています。 / This record has already been submitted.");
      return;
    }

    // Collect base64 images
    formData.images = await collectImagesForUpload();

    const response = await fetch(`${serverURL}/submitTopressDBiReporter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save data');
    }

    scanAlertText.innerText = 'Form submitted successfully / 保存しました';
    scanAlertModal.style.display = 'block';
    document.body.classList.add('flash-green');

    document.getElementById('closeScanModalButton').onclick = function () {
      scanAlertModal.style.display = 'none';
      document.body.classList.remove('flash-green');
      document.getElementById('uploadingModal').style.display = 'none';
      window.location.reload();
      resetForm();
    };

  } catch (error) {
    document.getElementById('uploadingModal').style.display = 'none';
    console.error('Submission error:', error);
    showAlert('An error occurred. Please try again.');
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
  const specialValues = [
  "E701", "E702", "E703", "E704", "E705", "E706", "E707", "E708",
  "MDLB", "MDLS", "MDRB", "MDRS",
  "P01K", "P02K", "P03K", "P04K", "P05K", "P06K", "P07K", "P08K",
  "P09K", "P10K", "P11K", "P12K", "P13K", "P14K", "P15K", "P16K",
  "P17K", "P18K", "P19K", "P20K",
  "UFS1", "UFS2", "UFS3", "UFS4", "UFS5", "UFS6", "UFS7", "UFS8",
  "URB1", "URB2", "URB3", "URB4", "URB5", "URB6", "URB7", "URB8"
  ];

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


// // Hidase style print label
// function printLabelHidase() {
//   const selectedSeBanggo = document.getElementById("product-number").value;
//   const selectedFactory = document.getElementById("selected工場").value;

//   if (selectedFactory !== "肥田瀬") {
//     console.warn("Not in 肥田瀬 factory. Printing normally...");
//     return;
//   }

//   fetch(`${serverURL}/getCapacityBySeBanggo?seBanggo=${selectedSeBanggo}`)
//     .then(response => response.json())
//     .then(data => {
//       if (data.length > 1) {
//         // Multiple capacity options exist, show selection modal
//         showCapacitySelectionModal(data);
//       } else if (data.length === 1) {
//         // Only one capacity, auto-select and proceed
//         document.getElementById('収容数').value = data[0].収容数;
//         showLabelTypeSelection();
//       } else {
//         alert('No data found for the selected 品番');
//       }
//     })
//     .catch(error => console.error('Error fetching 収容数:', error));
// }

// // Show modal to let user choose a 収容数 (uses existing #modal)
// function showCapacitySelectionModal(data) {
//   const modal = document.getElementById("modal");
//   const modalOptions = document.getElementById("modal-options");
//   const modalCloseButton = document.getElementById("modal-close");

//   // Clear previous options
//   modalOptions.innerHTML = '<p>収容数を選んでください / Please choose the quantity:</p>';

//   data.forEach((item) => {
//     const option = document.createElement('button');
//     option.classList.add('modal-option');
//     option.textContent = `収容数: ${item.収容数}`;
//     option.dataset.value = item.収容数;
//     option.onclick = (e) => {
//       document.getElementById('収容数').value = e.target.dataset.value;
//       modal.style.display = "none";
//       showLabelTypeSelection();
//     };
//     modalOptions.appendChild(option);
//   });

//   modal.style.display = "block";

//   // Close modal on close button click
//   modalCloseButton.onclick = () => {
//     modal.style.display = "none";
//   };
// }


// // Show modal to choose between BOX or PRODUCT label (uses existing #modal)
// function showLabelTypeSelection() {
//   const modal = document.getElementById("modal");
//   const modalOptions = document.getElementById("modal-options");
//   const modalCloseButton = document.getElementById("modal-close");

//   // Update modal content
//   modalOptions.innerHTML = '<p>Choose label type: For BOX / 外用 or For Product / 製品用</p>';

//   const buttonBox = document.createElement('button');
//   buttonBox.innerText = 'For BOX / 外用';
//   buttonBox.onclick = () => {
//     modal.style.display = "none";
//     showCopiesPrompt('hidaselabel5.lbx', false); // Pass `false` to indicate no modification
//   };

//   const buttonProduct = document.createElement('button');
//   buttonProduct.innerText = 'For Product / 製品用';
//   buttonProduct.onclick = () => {
//     modal.style.display = "none";
//     showCopiesPrompt('hidaselabel6inner.lbx', true); // Pass `true` to indicate modification
//   };

//   modalOptions.appendChild(buttonBox);
//   modalOptions.appendChild(buttonProduct);

//   modal.style.display = "block";

//   // Close modal on close button click
//   modalCloseButton.onclick = () => {
//     modal.style.display = "none";
//   };
// }

// // Show modal to select number of copies and print (uses existing #modal)
// // Hidase style choose quantity of print
// function showCopiesPrompt(filename, modifyHinban) {
//   let 品番 = document.getElementById("product-number").value;
//   const 収容数 = document.getElementById("収容数").value;
//   const R_L = document.getElementById("R-L").value;
//   const extension = document.getElementById("Labelextension").value;
//   const Date2 = document.getElementById('Lot No.').value;
//   const selectedFactory = document.getElementById("selected工場").value;

//   // Apply special condition for 肥田瀬 and 品番 "146696-5630ESH-5"
//   if (selectedFactory === "肥田瀬" && 品番 === "146696-5630ESH-5" && modifyHinban) {
//     品番 = "146696-5630"; // Remove "ESH-5" for Product / 製品用
//   }

//   const 品番収容数 = `${品番},${収容数}`;
//   const Date = extension ? `${Date2} - ${extension}` : Date2;

//   const modal = document.getElementById("modal");
//   const modalOptions = document.getElementById("modal-options");
//   const modalCloseButton = document.getElementById("modal-close");

//   modalOptions.innerHTML = '<p>Select number of copies:</p>';

//   // Wrapper for input and buttons
//   const copiesDisplay = document.createElement('div');
//   copiesDisplay.className = 'modal-copies-control';

//   // Minus Button
//   const minusButton = document.createElement('button');
//   minusButton.innerText = '-';
//   minusButton.type = "button";
//   minusButton.onclick = (event) => {
//     event.preventDefault();
//     const current = parseInt(copiesInput.value, 10) || 1;
//     if (current > 1) {
//       copiesInput.value = current - 1;
//     }
//   };

//   // Input field
//   const copiesInput = document.createElement('input');
//   copiesInput.type = 'number';
//   copiesInput.min = '1';
//   copiesInput.step = '1';
//   copiesInput.value = '1';
//   copiesInput.style.width = '60px';
//   copiesInput.style.textAlign = 'center';

//   // Prevent invalid input (non-integer, negatives, etc.)
//   copiesInput.oninput = () => {
//     let value = copiesInput.value;
//     if (!/^\d+$/.test(value)) {
//       copiesInput.value = value.replace(/\D/g, '');
//     }
//     if (copiesInput.value === '' || parseInt(copiesInput.value, 10) < 1) {
//       copiesInput.value = '1';
//     }
//   };

//   // Plus Button
//   const plusButton = document.createElement('button');
//   plusButton.innerText = '+';
//   plusButton.type = "button";
//   plusButton.onclick = (event) => {
//     event.preventDefault();
//     const current = parseInt(copiesInput.value, 10) || 1;
//     copiesInput.value = current + 1;
//   };

//   // Append controls
//   copiesDisplay.appendChild(minusButton);
//   copiesDisplay.appendChild(copiesInput);
//   copiesDisplay.appendChild(plusButton);
//   modalOptions.appendChild(copiesDisplay);

//   // Confirm Button
//   const confirmButton = document.createElement('button');
//   confirmButton.innerText = 'Confirm';
//   confirmButton.type = "button";
//   confirmButton.onclick = () => {
//     const copies = parseInt(copiesInput.value, 10);
//     if (isNaN(copies) || copies < 1) {
//       alert('Please enter a valid number of copies (integer > 0)');
//       return;
//     }

//     const url =
//       `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent("RollW62")}&copies=${encodeURIComponent(copies)}` +
//       `&text_品番=${encodeURIComponent(品番)}` +
//       `&text_収容数=${encodeURIComponent(収容数)}` +
//       `&text_DateT=${encodeURIComponent(Date)}` +
//       `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

//     console.log("Printing:", url);
//     window.location.href = url;
//     modal.style.display = "none";
//   };

//   modalOptions.appendChild(confirmButton);

//   modal.style.display = "block";

//   modalCloseButton.onclick = () => {
//     modal.style.display = "none";
//   };
// }



async function printLabelHidase() {
  const selectedFactory = document.getElementById("selected工場").value;
  const 品番Raw = document.getElementById("product-number").value;

  if (selectedFactory !== "肥田瀬") {
    console.warn("Not in 肥田瀬 factory. Printing normally...");
    return;
  }

  try {
    const response = await fetch(`${serverURL}/getCapacityBySeBanggo?seBanggo=${encodeURIComponent(品番Raw)}`);
    const data = await response.json();

    if (data.length === 0) {
      alert("No data found for the selected 品番");
      return;
    }

    let lowValue = data[0].収容数;
    let highValue = data[0].収容数;

    if (data.length > 1) {
      const values = data.map(item => parseInt(item.収容数, 10));
      lowValue = Math.min(...values);
      highValue = Math.max(...values);
    }

    showHidaseLabelButtons({
      品番: 品番Raw,
      収容数Low: lowValue,
      収容数High: highValue
    });

  } catch (error) {
    console.error('Error fetching 収容数:', error);
  }
}

function showHidaseLabelButtons({ 品番, 収容数Low, 収容数High }) {
  const container = document.getElementById("hidase-label-buttons");
  container.innerHTML = ''; // Clear old buttons

  const extension = document.getElementById("Labelextension").value;
  const dateRaw = document.getElementById('Lot No.').value;
  const date = extension ? `${dateRaw} - ${extension}` : dateRaw;

  // Create BOX button
  const boxButton = document.createElement('button');
  boxButton.type = "button"; // Prevent form submission
  boxButton.innerText = `Print BOX Label / 外用 (${収容数High})`;
  boxButton.onclick = () => {
    printHidaseLabel({
      品番,
      収容数: 収容数High,
      filename: 'hidaselabel5.lbx',
      modifyHinban: false,
      date
    });
  };

  // Create PRODUCT button
  const productButton = document.createElement('button');
  productButton.type = "button"; // Prevent form submission
  productButton.innerText = `Print Product Label / 製品用 (${収容数Low})`;
  productButton.onclick = () => {
    printHidaseLabel({
      品番,
      収容数: 収容数Low,
      filename: 'hidaselabel6inner.lbx',
      modifyHinban: true,
      date
    });
  };

  container.appendChild(boxButton);
  container.appendChild(productButton);
}


// Function to print the label using Smooth Print
async function printHidaseLabel({ 品番, 収容数, filename, modifyHinban, date }) {
  const selectedFactory = document.getElementById("selected工場").value;

  // Special Hinban modification
  if (selectedFactory === "肥田瀬" && 品番 === "146696-5630ESH-5" && modifyHinban) {
    品番 = "146696-5630";
  }

  const 品番収容数 = `${品番},${収容数}`;
  const size = "RollW62";

  // Determine base URL depending on platform
  const baseURL = isIOS()
    ? "brotherwebprint://print"
    : "http://localhost:8088/print";

  const url =
    `${baseURL}?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=1` +
    `&text_品番=${encodeURIComponent(品番)}` +
    `&text_収容数=${encodeURIComponent(収容数)}` +
    `&text_DateT=${encodeURIComponent(date)}` +
    `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

  console.log("Sending print request:", url);

  // On iOS, use location.href to launch brotherwebprint
  if (isIOS()) {
    window.location.href = url;
    return;
  }

  // Android or desktop: use fetch to send request
  try {
    const response = await Promise.race([
      fetch(url).then(res => res.text()),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout after 7 seconds")), 7000))
    ]);

    if (response.includes("<result>SUCCESS</result>")) {
      console.log("Print success.");
      flashGreen();
    } else {
      alert("Printing failed. Check printer status.");
    }
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Function to flash the background green
function flashGreen() {
  const body = document.body;

  // Remove class if it already exists to restart animation
  body.classList.remove("flash-green");

  // Trigger reflow to reset the animation
  void body.offsetWidth;

  // Add the class to start animation
  body.classList.add("flash-green");

  // Optional: remove class after animation ends
  setTimeout(() => {
    body.classList.remove("flash-green");
  }, 500); // match the duration of your animation
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




// // Upload Photo Function for multiple images
// function uploadPhotou() {
//   const selectedSebanggo = document.getElementById("sub-dropdown").value;
//   const currentDate = document.getElementById("Lot No.").value;
//   const selectedWorker = document.getElementById("Machine Operator").value;
//   const selectedFactory = document.getElementById("selected工場").value;
//   const selectedMachine = document.getElementById("process").value;

//   // Mapping of images to their respective IDs
//   const imageMappings = [
//     { imgId: 'hatsumonoPic', label: '初物チェック' },
//     { imgId: 'atomonoPic', label: '終物チェック' },
//     { imgId: '材料ラベル', label: '材料ラベル' },
//   ];

//   imageMappings.forEach(({ imgId, label }) => {
//     const photoPreview = document.getElementById(imgId);

//     if (!photoPreview || !photoPreview.src) {
//       console.error(`No photo preview available for ${label}`);
//       return;
//     }

//     // Convert the image to a blob
//     fetch(photoPreview.src)
//       .then(response => response.blob())
//       .then(blob => {
//         const reader = new FileReader();
//         reader.onloadend = function () {
//           const base64data = reader.result.split(',')[1]; // Get the base64 encoded string

//           const formData = new FormData();
//           formData.append('imageBlob', base64data);
//           formData.append(
//             'fileName',
//             `${selectedSebanggo}_${currentDate}_${selectedWorker}_${selectedFactory}_${selectedMachine}_${label}.jpg`
//           );
//           formData.append('mimeType', blob.type);
//           formData.append('selectedFactory', selectedFactory);

//           // Send the blob to Apps Script via POST request
//           fetch(
//             'https://script.google.com/macros/s/AKfycbxDWa2RTdI2_aHBgzq9GA9GtQx5MrwqaRnW4F26VZdoptwJ1Pg_Enr_xI3vw1t7WHYbTw/exec',
//             {
//               method: 'POST',
//               body: formData,
//             }
//           )
//             .then((response) => response.text()) // Fetch raw text response
//             .then((text) => {
//               console.log(`Raw response for ${label}:`, text); // Log the raw response
//               try {
//                 const data = JSON.parse(text); // Attempt to parse JSON
//                 if (data.status === 'success') {
//                   console.log(`File uploaded successfully for ${label}: ` + data.fileUrl);
//                 } else {
//                   console.error(`Upload failed for ${label}: ` + data.message);
//                 }
//               } catch (error) {
//                 console.error(`Error parsing JSON for ${label}:`, error);
//               }
//             })
//             .catch((error) => {
//               console.error(`Error uploading file for ${label}: `, error);
//             });
//         };
//         reader.readAsDataURL(blob);
//       })
//       .catch((error) => console.error(`Error converting image to blob for ${label}: `, error));
//   });
// }

     
async function uploadPhotou() {
  const selectedSebanggo = document.getElementById("sub-dropdown").value;
  const currentDate = document.getElementById("Lot No.").value;
  const selectedWorker = document.getElementById("Machine Operator").value;
  const selectedFactory = document.getElementById("selected工場").value;
  const selectedMachine = document.getElementById("process").value;

  const imageMappings = [
    { imgId: 'hatsumonoPic', label: '初物チェック' },
    { imgId: 'atomonoPic', label: '終物チェック' },
    { imgId: '材料ラベル', label: '材料ラベル' },
  ];

  const uploadedImageURLs = {};

  for (const { imgId, label } of imageMappings) {
    const photoPreview = document.getElementById(imgId);
    if (!photoPreview || !photoPreview.src) continue;

    const response = await fetch(photoPreview.src);
    const blob = await response.blob();
    const fileName = `${selectedSebanggo}_${currentDate}_${selectedWorker}_${selectedFactory}_${selectedMachine}_${label}.jpg`;

    const { ref, uploadBytes, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/11.7.1/firebase-storage.js");
    const storageRef = ref(window.firebaseStorage, `firstCycleCheck/${selectedFactory}/${fileName}`);

    try {
      const snapshot = await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(snapshot.ref);

      uploadedImageURLs[label] = downloadURL;

      // Optionally save to a separate imageUploads collection
      await fetch(`${serverURL}/saveImageURL`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: downloadURL,
          label,
          factory: selectedFactory,
          machine: selectedMachine,
          worker: selectedWorker,
          date: currentDate,
          sebanggo: selectedSebanggo
        })
      });
    } catch (error) {
      console.error(`Failed to upload ${label}`, error);
    }
  }

  return uploadedImageURLs;
}


async function collectImagesForUpload() {
  const selectedSebanggo = document.getElementById("sub-dropdown").value;
  const currentDate = document.getElementById("Lot No.").value;
  const selectedWorker = document.getElementById("Machine Operator").value;
  const selectedFactory = document.getElementById("selected工場").value;
  const selectedMachine = document.getElementById("process").value;

  const imageMappings = [
    { imgId: 'hatsumonoPic', label: '初物チェック' },
    { imgId: 'atomonoPic', label: '終物チェック' },
    { imgId: '材料ラベル', label: '材料ラベル' },
  ];

  const imagesToUpload = [];

  for (const { imgId, label } of imageMappings) {
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
      sebanggo: selectedSebanggo,
    });
  }

  return imagesToUpload;
}

// Utility to convert blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
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

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isAndroid() {
  return /Android/.test(navigator.userAgent);
}