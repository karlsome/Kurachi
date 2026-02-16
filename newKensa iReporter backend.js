const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";

// link for pictures database
const picURL = 'https://script.google.com/macros/s/AKfycbwHUW1ia8hNZG-ljsguNq8K4LTPVnB6Ng_GLXIHmtJTdUgGGd2WoiQo9ToF-7PvcJh9bA/exec';

// 背番号/品番 Selection Modal Variables
let sebanggoData = [];
const RECENT_SEBANGGO_KEY = 'recentSebanggoSelection';
const MAX_RECENT_SEBANGGO = 6;


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

// ==================== DATE CHOICE MODAL ====================
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ensureDateChoiceModal() {
  let modal = document.getElementById('dateChoiceModal');
  if (modal) {
    return modal;
  }

  modal = document.createElement('div');
  modal.id = 'dateChoiceModal';
  modal.style.cssText = `
    display: none;
    position: fixed;
    z-index: 10050;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.7);
    justify-content: center;
    align-items: center;
  `;

  modal.innerHTML = `
    <div style="
      background: white;
      padding: 25px;
      border-radius: 12px;
      width: 90%;
      max-width: 520px;
      text-align: center;
      box-shadow: 0 6px 20px rgba(0,0,0,0.25);
      position: relative;
    ">
      <button id="closeDateChoiceModal" style="
        position: absolute;
        top: 8px;
        right: 10px;
        background: transparent;
        border: none;
        font-size: 24px;
        font-weight: bold;
        color: #666;
        cursor: pointer;
        line-height: 1;
      ">×</button>
      <style>
        @keyframes dateBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0.2; }
        }
        .date-mismatch {
          color: #dc3545;
          font-weight: 800;
          animation: dateBlink 1s infinite;
        }
        .date-mismatch-button {
          font-weight: 800;
          animation: dateBlink 1s infinite;
        }
        .date-btn-label {
          line-height: 1;
          margin: 0;
          padding: 0;
          display: block;
        }
        .date-btn-date {
          line-height: 1;
          margin: 0;
          padding: 0;
          display: block;
        }
      </style>
      <h2 style="margin: 0 0 10px;">日付確認 / Date Confirmation</h2>
      <p id="dateChoiceMessage" style="margin: 0 0 20px; color: #444; line-height: 1.5;"></p>
      <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
        <button id="useEnteredDateBtn" style="
          width: 160px;
          height: 160px;
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          white-space: nowrap;
          gap: 0;
          padding: 6px 10px;
        ">Entered Date</button>
        <button id="useCurrentDateBtn" style="
          width: 160px;
          height: 160px;
          background: #28a745;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          white-space: nowrap;
          gap: 0;
          padding: 6px 10px;
        ">Current Date</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
}

function showDateChoiceModal(enteredDate, currentDate) {
  return new Promise((resolve) => {
    const modal = ensureDateChoiceModal();
    const message = modal.querySelector('#dateChoiceMessage');
    const enteredBtn = modal.querySelector('#useEnteredDateBtn');
    const currentBtn = modal.querySelector('#useCurrentDateBtn');
    const closeBtn = modal.querySelector('#closeDateChoiceModal');

    message.innerHTML = `入力日付: <strong class="date-mismatch">${enteredDate}</strong><br>現在日付: <strong>${currentDate}</strong><br><br>どちらの日付を使用しますか？<br>Which date should be used?`;
    enteredBtn.innerHTML = `<span class="date-btn-label">Entered</span><span class="date-btn-date date-mismatch-button">${enteredDate}</span>`;
    currentBtn.innerHTML = `<span class="date-btn-label">Current</span><span class="date-btn-date">${currentDate}</span>`;

    const cleanup = () => {
      enteredBtn.onclick = null;
      currentBtn.onclick = null;
      closeBtn.onclick = null;
      modal.style.display = 'none';
    };

    enteredBtn.onclick = () => {
      cleanup();
      resolve('entered');
    };

    currentBtn.onclick = () => {
      cleanup();
      resolve('current');
    };

    closeBtn.onclick = () => {
      cleanup();
      resolve('cancel');
    };

    modal.style.display = 'flex';
  });
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
                      } else if (input.id === 'sub-dropdown-input') {
                          // Special handling for sebanggo input field
                          input.value = savedValue;
                          console.log(`Restored ${input.id || input.name}:`, savedValue);
                          fetchProductDetails(); // for info
                          updateTotal(); // for total value
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

      // Update focus handler to use custom handler
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

      // Update focus handler to use custom handler
      endTimeInput.onfocus = function() { handleProcessingTimeFocus(this); };

      // Update lock status based on current value
      updateProcessingTimeLockStatus('end');
    }
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

    // Combine both lists for the modal
    const combinedList = [...sebanggoList, ...hinbanList];
    sebanggoData = combinedList;

    console.log("Sebanggo data loaded for modal:", { sebanggoList, hinbanList, combinedList });
    
    // Always initialize modal functionality (with safety check)
    if (typeof initializeSebanggoModal === 'function') {
        initializeSebanggoModal();
    } else {
        console.warn('initializeSebanggoModal function not yet available, will retry later');
        // Retry after a short delay to allow functions to be defined
        setTimeout(() => {
            if (typeof initializeSebanggoModal === 'function') {
                initializeSebanggoModal();
            } else {
                console.error('initializeSebanggoModal still not available after delay');
            }
        }, 100);
    }

  } catch (error) {
    console.error("Error fetching 背番号 and 品番 data:", error);
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
  const subDropdown = document.getElementById("sub-dropdown-input");
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

// Add change event listener to sub-dropdown-input
document.addEventListener('DOMContentLoaded', () => {
  const inputElement = document.getElementById("sub-dropdown-input");
  if (inputElement) {
    inputElement.addEventListener("change", fetchProductDetails);
    console.log('Change event listener attached to sub-dropdown-input');
  } else {
    console.warn('sub-dropdown-input element not found');
  }
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

  // If this is the Start Time input, lock it to prevent accidental changes
  if (input.id === 'Start Time') {
    setTimeout(() => {
      updateProcessingTimeLockStatus('start');
    }, 100);
  }

  // If this is the End Time input, lock it to prevent accidental changes
  if (input.id === 'End Time') {
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
      
      // Store worker names for modal
      workerNamesData = workerNames;
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
  const uploadingModal = document.getElementById('uploadingModal');

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
    const 背番号 = document.getElementById('sub-dropdown-input').value;
    const Total = parseInt(document.getElementById('total').value, 10) || 0;
    const Worker_Name = document.getElementById('Machine Operator').value;
    const Process_Quantity = parseInt(document.getElementById('ProcessQuantity').value, 10) || 0;
    const Remaining_Quantity = Total;
    const WorkDate = document.getElementById('Lot No.').value;
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

    // ==================== VALIDATION SECTION ====================
    // Validate all required fields before submission

    // 1. Check required fields
    if (!品番 || 品番.trim() === '') {
      scanAlertText.innerText = '品番が必要です / Product Number is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
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
      scanAlertText.innerText = '工場が必要です / Factory is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
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
      scanAlertText.innerText = '設備が必要です / Equipment is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
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
      scanAlertText.innerText = '加工数（良品）が必要です / Process Quantity is required and must be greater than 0';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
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
      scanAlertText.innerText = '作業者名が必要です / Worker Name is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
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
      scanAlertText.innerText = '加工日が必要です / Work Date is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
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

    // Compare entered date vs current date and ask user which to use
    const currentDate = getTodayDateString();
    if (WorkDate !== currentDate) {
      const choice = await showDateChoiceModal(WorkDate, currentDate);
      if (choice === 'cancel') {
        return;
      }
      if (choice === 'current') {
        const dateInput = document.getElementById('Lot No.');
        WorkDate = currentDate;
        if (dateInput) {
          dateInput.value = currentDate;
          localStorage.setItem(`${uniquePrefix}${dateInput.id}`, currentDate);
        }
      }
    }

    if (!製造ロット || 製造ロット.trim() === '') {
      scanAlertText.innerText = '製造ロットが必要です / Manufacturing Lot is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
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
      scanAlertText.innerText = '加工開始時間が必要です / Start Time is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
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
      scanAlertText.innerText = '加工終了時間が必要です / End Time is required';
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
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
      scanAlertText.innerText = '加工開始時間と加工終了時間は同じにできません\n\nStart Time and End Time cannot be the same\n\n開始: ' + Time_start + '\n終了: ' + Time_end;
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
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
      scanAlertText.innerText = '加工開始時間は加工終了時間より前である必要があります\n\nStart Time must be before End Time\n\n開始: ' + Time_start + '\n終了: ' + Time_end;
      scanAlertModal.style.display = 'block';
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
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
      Date: WorkDate,
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
    if (uploadingModal) {
      uploadingModal.style.display = 'flex';
    }

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

    if (uploadingModal) {
      uploadingModal.style.display = 'none';
    }

    // Show success modal with blinking green background
    scanAlertText.innerText = 'Form submitted successfully / 保存しました';
    scanAlertModal.style.display = 'block';
    document.body.classList.add('flash-green');

    // Auto-close after 5 seconds to prevent duplicate submissions
    const autoCloseTimer = setTimeout(() => {
      scanAlertModal.style.display = 'none';
      document.body.classList.remove('flash-green');
      window.location.reload();
      resetForm();
    }, 5000);

    // Allow manual close by clicking the × button
    const closeScanModalButton = document.getElementById('closeScanModalButton');
    closeScanModalButton.onclick = function () {
      clearTimeout(autoCloseTimer); // Cancel auto-close if user clicks manually
      scanAlertModal.style.display = 'none';
      document.body.classList.remove('flash-green');
      window.location.reload();
      resetForm();
    };
  } catch (error) {
    console.error('Error during submission:', error);

    if (uploadingModal) {
      uploadingModal.style.display = 'none';
    }

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


// Helper function for hidase rotary label printing
async function redirectHidaseRotary(selected収容数, labelMarking, product) {
  const 品番 = product.品番 || "";
  const lotNumber = document.getElementById('製造ロット')?.value || "";
  const 背番号Raw = product.背番号 || "";
  const 車型 = product.モデル || "";
  const R_L = product["R/L"] || "";
  const 材料 = product.材料 || "";
  const 色 = product.色 || "";
  const extension = document.getElementById("Labelextension")?.value || "";
  const Date2 = document.getElementById('Lot No.')?.value || "";
  const Worker_Name = document.getElementById('Machine Operator')?.value || "";
  console.log(Worker_Name);
  
  // Strip all leading letters from 背番号 to get numeric value only
  // Example: "DR103" -> "103", "ABC123" -> "123", "AA1C32" -> "1C32"
  const 背番号Numeric = 背番号Raw.replace(/^[A-Za-z]+/, '');
  
  const Date = extension ? `${Date2} - ${extension}` : Date2;
  const 品番収容数 = `${品番},${selected収容数}`;
  
  // Use hidaseRotary.lbx for special 品番
  const filename = "hidaseRotary2.lbx";
  const size = "RollW62";
  const copies = 1;
  
  // Determine base URL depending on platform
  const baseURL = isIOS()
    ? "brotherwebprint://print"
    : "http://localhost:8088/print";
  
  const url =
    `${baseURL}?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=${encodeURIComponent(copies)}` +
    `&text_品番=${encodeURIComponent(品番)}` +
    `&text_車型=${encodeURIComponent(車型)}` +
    `&text_収容数=${encodeURIComponent(selected収容数)}` +
    `&text_背番号=${encodeURIComponent(背番号Numeric)}` +
    `&text_RL=${encodeURIComponent(R_L)}` +
    `&text_材料=${encodeURIComponent(材料)}` +
    `&text_色=${encodeURIComponent(色)}` +
    `&text_DateT=${encodeURIComponent(lotNumber)}` +
    `&text_labelMarking=${encodeURIComponent(labelMarking)}` +
    `&text_kensa=${encodeURIComponent(Worker_Name)}` +
    `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

  console.log('Hidase Rotary Label URL:', url);
  console.log('背番号 (raw):', 背番号Raw, '-> (numeric):', 背番号Numeric);
  console.log('Label Marking:', labelMarking);
  console.log('Selected 収容数:', selected収容数);
  console.log('Worker Name:', Worker_Name);
  
  // On iOS, use location.href to launch brotherwebprint
  if (isIOS()) {
    window.location.href = url;
    return;
  }

  // Android or desktop: use fetch to send request with printing modal
  showPrintingModal();
  
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
  } finally {
    closePrintingModal();
  }
}


// Print label using "Smooth Print" app for mobile devices
function printLabel() {
  const alertSound = document.getElementById('alert-sound');
  const scanAlertModal = document.getElementById('scanAlertModal');
  const scanAlertText = document.getElementById('scanAlertText');
  const 背番号 = document.getElementById("sub-dropdown").value;
  const 品番 = document.getElementById("product-number").value;

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

  // List of special 品番 for hidase rotary label
  const hidaseRotary品番List = [
    "116671-1030", "116671-1040", "116671-0990", "116671-1000",
    "116671-0930", "116671-0940", "116671-0920", "116671-0910",
    "116671-0800", "116671-0810","116671-1050","116671-1070"
  ];

  // Check if current 品番 is in the hidase rotary special list
  if (hidaseRotary品番List.includes(品番)) {
    // Fetch product data from MongoDB to get labelMarking and 収容数
    fetch(`${serverURL}/queries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dbName: "Sasaki_Coating_MasterDB",
        collectionName: "masterDB",
        query: { 品番: 品番 }
      }),
    })
    .then(response => response.json())
    .then(data => {
      if (!data || data.length === 0) {
        console.error("No product data found for hidase rotary 品番");
        return;
      }

      const product = data[0];
      const labelMarking = product.labelMarking || "";
      const 収容数String = product.収容数 || "";
      
      // Parse 収容数 - split by comma and trim whitespace
      const 収容数Options = 収容数String.split(',').map(v => v.trim()).filter(v => v);

      if (収容数Options.length === 0) {
        console.error("No 収容数 values found");
        return;
      }

      // Create modal for 収容数 selection
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
      modal.style.zIndex = '10001';

      // Add close button (X) at top right
      const closeBtn = document.createElement('span');
      closeBtn.innerHTML = '&times;';
      closeBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 20px;
        font-size: 35px;
        font-weight: bold;
        color: #aaa;
        cursor: pointer;
        transition: color 0.2s;
      `;
      closeBtn.onmouseover = () => closeBtn.style.color = '#000';
      closeBtn.onmouseout = () => closeBtn.style.color = '#aaa';
      closeBtn.onclick = () => document.body.removeChild(modal);
      modal.appendChild(closeBtn);

      const message = document.createElement('p');
      message.innerText = '収容数を選んでください / Please choose the value for Quantity';
      message.style.fontSize = '24px';
      message.style.textAlign = 'center';
      message.style.marginBottom = '20px';
      message.style.color = '#333';
      modal.appendChild(message);

      // Create button for each 収容数 option
      収容数Options.forEach(option => {
        const button = document.createElement('button');
        button.innerText = option;
        button.style.margin = '10px';
        button.style.padding = '15px 30px';
        button.style.fontSize = '20px';
        button.style.cursor = 'pointer';
        button.style.borderRadius = '5px';
        button.style.border = '2px solid #007bff';
        button.style.backgroundColor = '#007bff';
        button.style.color = 'white';
        button.onclick = () => {
          document.body.removeChild(modal);
          redirectHidaseRotary(option, labelMarking, product);
        };
        modal.appendChild(button);
      });

      document.body.appendChild(modal);
    })
    .catch(error => {
      console.error('Error fetching hidase rotary product data:', error);
    });

    return; // Stop here and wait for user selection
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


// ===== NUMERIC KEYPAD FUNCTIONALITY =====

// Define direct keypad functions in the global scope
window.openDirectNumericKeypad = function(inputId) {
  window.currentDirectInputId = inputId;
  const modal = document.getElementById('numericKeypadModalDirect');
  const display = document.getElementById('numericDisplayDirect');
  const currentInput = document.getElementById(inputId);

  if (modal && display && currentInput) {
    display.value = currentInput.value || '';
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Update keypad title based on which input field was clicked
    const keypadTitle = modal.querySelector('h2');
    if (keypadTitle) {
      if (inputId === 'ProcessQuantity') {
        keypadTitle.textContent = '加工数を入力';
      } else if (inputId === '製造ロット') {
        keypadTitle.textContent = '製造ロットを入力';
      }
    }

    // Show/hide the hyphen button based on input field
    const hyphenButton = document.getElementById('hyphenButton');
    if (hyphenButton) {
      if (inputId === '製造ロット') {
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
        } else if (event.key === '-' && inputId === '製造ロット') {
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

window.backspaceDirectNumericDisplay = function() {
  const display = document.getElementById('numericDisplayDirect');
  if (display && display.value.length > 0) {
    display.value = display.value.slice(0, -1);
  }
};

window.clearDirectNumericDisplay = function() {
  const display = document.getElementById('numericDisplayDirect');
  if (display) {
    display.value = '';
  }
};

window.confirmDirectNumericInput = function() {
  if (!window.currentDirectInputId) return;

  const display = document.getElementById('numericDisplayDirect');
  const targetInput = document.getElementById(window.currentDirectInputId);

  if (display && targetInput) {
    const value = display.value;

    // Different validation based on input type
    if (window.currentDirectInputId === '製造ロット') {
      // For manufacturing lot, allow numbers, hyphens, spaces, and blank values
      if (value !== '' && !/^[0-9\-\s]*$/.test(value)) {
        if (typeof showAlert === 'function') {
          showAlert('数字、ハイフン、スペースのみを入力してください');
        } else {
          window.alert('数字、ハイフン、スペースのみを入力してください');
        }
        return;
      }
      // Allow blank value - no validation needed
    } else if (window.currentDirectInputId === 'ProcessQuantity') {
      // For process quantity, allow numbers, spaces, and blank values
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
    }

    targetInput.value = value;

    // Trigger the input event to handle any event listeners
    const event = new Event('input', { bubbles: true });
    targetInput.dispatchEvent(event);

    window.closeDirectNumericKeypad();
  }
};

// Run initialization after page is fully loaded
window.addEventListener('load', function() {
  // Create the keypad modal HTML
  const modalHTML = `
    <div id="numericKeypadModalDirect" style="
      display: none;
      position: fixed;
      z-index: 10000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.6);
      overflow: auto;
    ">
      <div style="
        position: relative;
        margin: 5% auto;
        padding: 30px;
        background-color: white;
        width: 90%;
        max-width: 400px;
        border-radius: 10px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: bold; color: #333;">入力</h2>
          <span onclick="window.closeDirectNumericKeypad()" style="color: #aaa; float: right; font-size: 28px; font-weight: bold; cursor: pointer;">&times;</span>
        </div>

        <div style="margin-bottom: 15px;">
          <input type="text" id="numericDisplayDirect" readonly style="
            width: 100%;
            padding: 15px;
            font-size: 24px;
            text-align: right;
            border: 2px solid #007bff;
            border-radius: 5px;
            box-sizing: border-box;
            background-color: #f8f9fa;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
          ">
        </div>

        <div id="keypadContainerDirect" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
          <!-- Number buttons will be added via JavaScript -->
        </div>

        <button onclick="window.confirmDirectNumericInput()" style="
          width: 100%;
          margin-top: 15px;
          padding: 15px;
          background-color: #28a745;
          color: white;
          border: none;
          border-radius: 5px;
          font-size: 18px;
          font-weight: bold;
          cursor: pointer;
          transition: background-color 0.2s;
        " onmouseover="this.style.backgroundColor='#218838'" onmouseout="this.style.backgroundColor='#28a745'">
          確定 (Enter)
        </button>
      </div>
    </div>
  `;

  // Append modal to body
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
        padding: 20px;
        font-size: 24px;
        background-color: #f1f1f1;
        border: 1px solid #ccc;
        border-radius: 5px;
        cursor: pointer;
        transition: background-color 0.2s;
      `;
      btn.addEventListener('mouseover', function() {
        this.style.backgroundColor = '#d0d0d0';
      });
      btn.addEventListener('mouseout', function() {
        this.style.backgroundColor = '#f1f1f1';
      });
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
      padding: 20px;
      font-size: 24px;
      background-color: #ff6b6b;
      color: white;
      border: 1px solid #ff5252;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
      font-weight: bold;
    `;
    clearBtn.addEventListener('mouseover', function() {
      this.style.backgroundColor = '#ff5252';
    });
    clearBtn.addEventListener('mouseout', function() {
      this.style.backgroundColor = '#ff6b6b';
    });
    clearBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#ff5252';
    });
    clearBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#ff6b6b';
    });

    const zeroBtn = document.createElement('button');
    zeroBtn.textContent = '0';
    zeroBtn.onclick = function() { window.addToDirectNumericDisplay('0'); };
    zeroBtn.style.cssText = `
      padding: 20px;
      font-size: 24px;
      background-color: #f1f1f1;
      border: 1px solid #ccc;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
    `;
    zeroBtn.addEventListener('mouseover', function() {
      this.style.backgroundColor = '#d0d0d0';
    });
    zeroBtn.addEventListener('mouseout', function() {
      this.style.backgroundColor = '#f1f1f1';
    });
    zeroBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#d0d0d0';
    });
    zeroBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#f1f1f1';
    });

    const backBtn = document.createElement('button');
    backBtn.innerHTML = '&larr;';
    backBtn.onclick = function() { window.backspaceDirectNumericDisplay(); };
    backBtn.style.cssText = `
      padding: 20px;
      font-size: 24px;
      background-color: #ffc107;
      color: white;
      border: 1px solid #ffb300;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
      font-weight: bold;
    `;
    backBtn.addEventListener('mouseover', function() {
      this.style.backgroundColor = '#ffb300';
    });
    backBtn.addEventListener('mouseout', function() {
      this.style.backgroundColor = '#ffc107';
    });
    backBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#ffb300';
    });
    backBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#ffc107';
    });

    // Add hyphen button (will be hidden/shown based on input)
    const hyphenBtn = document.createElement('button');
    hyphenBtn.id = 'hyphenButton';
    hyphenBtn.textContent = '-';
    hyphenBtn.onclick = function() { window.addToDirectNumericDisplay('-'); };
    hyphenBtn.style.cssText = `
      padding: 20px;
      font-size: 24px;
      background-color: #17a2b8;
      color: white;
      border: 1px solid #138496;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
      font-weight: bold;
      display: none;
    `;
    hyphenBtn.addEventListener('mouseover', function() {
      this.style.backgroundColor = '#138496';
    });
    hyphenBtn.addEventListener('mouseout', function() {
      this.style.backgroundColor = '#17a2b8';
    });
    hyphenBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#138496';
    });
    hyphenBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#17a2b8';
    });

    // Add space button
    const spaceBtn = document.createElement('button');
    spaceBtn.textContent = '␣';
    spaceBtn.onclick = function() { window.addToDirectNumericDisplay(' '); };
    spaceBtn.style.cssText = `
      padding: 20px;
      font-size: 24px;
      background-color: #6c757d;
      color: white;
      border: 1px solid #5a6268;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
      font-weight: bold;
      grid-column: span 2;
    `;
    spaceBtn.addEventListener('mouseover', function() {
      this.style.backgroundColor = '#5a6268';
    });
    spaceBtn.addEventListener('mouseout', function() {
      this.style.backgroundColor = '#6c757d';
    });
    spaceBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#5a6268';
    });
    spaceBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#6c757d';
    });

    // Append all buttons
    keypadContainer.appendChild(clearBtn);
    keypadContainer.appendChild(zeroBtn);
    keypadContainer.appendChild(backBtn);
    keypadContainer.appendChild(hyphenBtn); // Add hyphen button to the keypad
    keypadContainer.appendChild(spaceBtn); // Add space button to the keypad
  }

  // Configure Process Quantity input with the direct keypad
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

    console.log('Process Quantity input configured with direct keypad');
  }

  // Configure 製造ロット input to use the same keypad
  const manufacturingLotInput = document.getElementById('製造ロット');
  if (manufacturingLotInput) {
    manufacturingLotInput.readOnly = true;

    // Use a more robust event attachment
    if (manufacturingLotInput.addEventListener) {
      manufacturingLotInput.addEventListener('click', function() {
        window.openDirectNumericKeypad('製造ロット');
      });
    } else {
      // Fallback for older browsers
      manufacturingLotInput.onclick = function() {
        window.openDirectNumericKeypad('製造ロット');
      };
    }

    // Style the input
    manufacturingLotInput.style.cssText = `
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

    console.log('製造ロット input configured with direct keypad');
  }
});

// ===== END OF NUMERIC KEYPAD FUNCTIONALITY =====


// ===== PLATFORM DETECTION AND PRINTING HELPER FUNCTIONS =====

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isAndroid() {
  return /Android/.test(navigator.userAgent);
}

// Function to show printing modal for Android
function showPrintingModal() {
  // Create modal if it doesn't exist
  let modal = document.getElementById('printingModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'printingModal';
    modal.style.cssText = `
      display: none;
      position: fixed;
      z-index: 10000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.6);
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      position: relative;
      margin: 20% auto;
      padding: 30px;
      background-color: white;
      width: 80%;
      max-width: 400px;
      border-radius: 10px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      text-align: center;
    `;

    const message = document.createElement('p');
    message.style.cssText = `
      font-size: 24px;
      margin-bottom: 20px;
      color: #333;
    `;
    message.textContent = '印刷中... / Printing...';

    const closeButton = document.createElement('button');
    closeButton.textContent = '閉じる / Close';
    closeButton.style.cssText = `
      padding: 10px 20px;
      font-size: 16px;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      margin-top: 10px;
    `;
    closeButton.onmouseover = function() {
      this.style.backgroundColor = '#0056b3';
    };
    closeButton.onmouseout = function() {
      this.style.backgroundColor = '#007bff';
    };
    closeButton.onclick = closePrintingModal;

    modalContent.appendChild(message);
    modalContent.appendChild(closeButton);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
  }

  modal.style.display = 'block';
}

// Function to close printing modal
function closePrintingModal() {
  const modal = document.getElementById('printingModal');
  if (modal) {
    modal.style.display = 'none';
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

// Add CSS for flash-green animation
const flashGreenStyle = document.createElement('style');
flashGreenStyle.innerHTML = `
.flash-green {
  animation: flash-green 0.5s ease-in-out;
}
@keyframes flash-green {
  0%, 100% { background-color: white; }
  50% { background-color: #28a745; }
}
`;
document.head.appendChild(flashGreenStyle);

// ===== END OF PLATFORM DETECTION AND PRINTING HELPER FUNCTIONS =====

// ===== WORKER NAME MODAL FUNCTIONALITY =====

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
  if (!name || name.trim() === '') return; // Don't add empty names
  
  let recent = getRecentWorkers();
  
  // Remove if already exists
  recent = recent.filter(w => w !== name);
  
  // Add to beginning
  recent.unshift(name);
  
  // Keep only max recent
  recent = recent.slice(0, MAX_RECENT_WORKERS);
  
  localStorage.setItem(RECENT_WORKERS_KEY, JSON.stringify(recent));
}

// Remove worker from recent list
function removeFromRecentWorkers(name) {
  let recent = getRecentWorkers();
  recent = recent.filter(w => w !== name);
  localStorage.setItem(RECENT_WORKERS_KEY, JSON.stringify(recent));
  renderWorkerNames(); // Re-render to update UI
}

// Group names alphabetically
function groupNamesByLetter(names) {
  const grouped = {};
  
  names.forEach(name => {
    // Get first character (handle Japanese, English, etc.)
    let firstChar = name.charAt(0).toUpperCase();
    
    // For Japanese characters, try to group by first character
    if (firstChar.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/)) {
      // Japanese character - use as is
      firstChar = name.charAt(0);
    } else if (firstChar.match(/[A-Z]/)) {
      // English letter - use uppercase
      firstChar = firstChar.toUpperCase();
    } else {
      // Other characters - group under '#'
      firstChar = '#';
    }
    
    if (!grouped[firstChar]) {
      grouped[firstChar] = [];
    }
    grouped[firstChar].push(name);
  });
  
  // Sort each group
  Object.keys(grouped).forEach(key => {
    grouped[key].sort();
  });
  
  return grouped;
}

// Render worker names in modal
function renderWorkerNames() {
  const container = document.getElementById('workerNamesContainer');
  container.innerHTML = '';
  
  // Get recent workers
  const recentWorkers = getRecentWorkers();
  
  // Add recent section if there are recent workers
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
        e.stopPropagation(); // Prevent selecting the worker
        removeFromRecentWorkers(name);
      };
      
      wrapper.appendChild(btn);
      wrapper.appendChild(deleteBtn);
      grid.appendChild(wrapper);
    });
    
    recentSection.appendChild(grid);
    container.appendChild(recentSection);
  }
  
  // Group all names alphabetically
  const grouped = groupNamesByLetter(workerNamesData);
  const sortedKeys = Object.keys(grouped).sort();
  
  // Render each alphabetical group
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
  
  // Add to recent workers
  addToRecentWorkers(name);
  
  // Save to localStorage (programmatic changes don't trigger 'input' event)
  const pageName = location.pathname.split('/').pop();
  const selected工場 = document.getElementById('selected工場')?.value;
  if (pageName && selected工場) {
    const key = `${pageName}_${selected工場}_${input.id || input.name}`;
    localStorage.setItem(key, name);
  }
  
  // Close modal
  closeWorkerModal();
  
  // Trigger change event
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

// Initialize worker name modal (runs after DOMContentLoaded)
setTimeout(function() {
  const workerInput = document.getElementById('Machine Operator');
  const closeModalBtn = document.getElementById('closeWorkerModal');
  const manualEntryBtn = document.getElementById('manualEntryBtn');
  
  // Open modal when clicking on worker input (only if readonly)
  if (workerInput) {
    // Prevent default keyboard from showing on mobile
    workerInput.addEventListener('click', function(e) {
      // Only open modal if input is readonly (not in manual entry mode)
      if (workerInput.readOnly && workerNamesData.length > 0) {
        e.preventDefault();
        openWorkerModal();
      }
    });
    
    // Also open on focus
    workerInput.addEventListener('focus', function(e) {
      // Only open modal if input is readonly (not in manual entry mode)
      if (workerInput.readOnly && workerNamesData.length > 0) {
        e.preventDefault();
        openWorkerModal();
      }
    });
    
    // Prevent keyboard from showing on touch devices
    workerInput.addEventListener('touchstart', function(e) {
      // Only prevent and open modal if input is readonly
      if (workerInput.readOnly && workerNamesData.length > 0) {
        e.preventDefault();
        openWorkerModal();
      }
    });
  }
  
  // Close modal button
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeWorkerModal);
  }
  
  // Manual entry button - close modal and let user type
  if (manualEntryBtn) {
    manualEntryBtn.addEventListener('click', function() {
      const targetInput = document.getElementById('Machine Operator');
      
      // Close the modal
      closeWorkerModal();
      
      if (targetInput) {
        // Remove readonly to allow free typing
        targetInput.removeAttribute('readonly');
        targetInput.readOnly = false;
        targetInput.style.cursor = 'text';
        targetInput.placeholder = 'Type worker name manually...';
        
        // Clear current value and focus after modal closes
        setTimeout(function() {
          targetInput.value = '';
          targetInput.focus();
          
          // Trigger click to ensure keyboard shows on mobile
          targetInput.click();
        }, 100);
      }
    });
  }
  
  // Close modal when clicking outside
  const modal = document.getElementById('workerNameModal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeWorkerModal();
      }
    });
  }
  
  // Save manually entered worker name to recents when user finishes typing
  if (workerInput) {
    workerInput.addEventListener('blur', function() {
      const enteredName = workerInput.value.trim();
      if (enteredName && !workerInput.readOnly) {
        // Only save if user manually typed (not readonly)
        addToRecentWorkers(enteredName);
      }
    });
    
    // Also save on Enter key
    workerInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        const enteredName = workerInput.value.trim();
        if (enteredName && !workerInput.readOnly) {
          addToRecentWorkers(enteredName);
        }
      }
    });
  }
}, 1000);

// Fetch worker names from server
document.addEventListener("DOMContentLoaded", async function() {
  const selectedFactory = document.getElementById("selected工場")?.value;

  if (selectedFactory) {
    try {
      const response = await fetch(`${serverURL}/getWorkerNames?selectedFactory=${encodeURIComponent(selectedFactory)}`);
      if (!response.ok) throw new Error("Failed to fetch worker names");

      const workerNames = await response.json();
      
      // Store worker names for modal
      workerNamesData = workerNames;
      
    } catch (error) {
      console.error("Error fetching worker names:", error);
    }
  }
});

// ===== END OF WORKER NAME MODAL FUNCTIONALITY =====

// ========== 背番号/品番 Modal Functions ==========

// Initialize 背番号/品番 modal functionality
function initializeSebanggoModal() {
  const input = document.getElementById('sub-dropdown-input');
  const modal = document.getElementById('sebanggoModal');
  const closeBtn = document.getElementById('close-sebanggo-modal');
  const searchInput = document.getElementById('sebanggo-search');
  const clearRecentBtn = document.getElementById('clear-recent-sebanggo');
  
  // Check if all required elements exist
  if (!input || !modal || !closeBtn || !searchInput || !clearRecentBtn) {
    console.error('Sebanggo modal elements not found:', {
      input: !!input,
      modal: !!modal,
      closeBtn: !!closeBtn,
      searchInput: !!searchInput,
      clearRecentBtn: !!clearRecentBtn
    });
    return;
  }
  
  // Prevent duplicate event listeners
  if (input.hasEventListener) {
    console.log('Sebanggo modal already initialized');
    return;
  }
  
  console.log('Initializing sebanggo modal...');
  
  // Mark that event listener has been added
  input.hasEventListener = true;
  
  // Open modal when input is clicked
  input.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Input field clicked');
    openSebanggoModal();
  });
  
  // Close modal
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Close button clicked');
    closeSebanggoModal();
  });
  
  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      console.log('Modal background clicked');
      closeSebanggoModal();
    }
  });
  
  // Search functionality
  searchInput.addEventListener('input', (e) => {
    console.log('Search input changed:', e.target.value);
    filterSebanggoList();
  });
  
  // Clear recent selections
  clearRecentBtn.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Clear recent button clicked');
    clearRecentSebanggo();
  });
  
  console.log('All event listeners attached successfully');
}

// Open sebanggo modal
function openSebanggoModal() {
  console.log('Opening sebanggo modal...');
  const modal = document.getElementById('sebanggoModal');
  
  if (!modal) {
    console.error('Sebanggo modal not found');
    return;
  }
  
  if (sebanggoData.length === 0) {
    console.error('Sebanggo data is empty');
    return;
  }
  
  modal.style.display = 'block';
  console.log('Modal display set to block, rendering list...');
  renderSebanggoList();
}

// Close sebanggo modal
function closeSebanggoModal() {
  const modal = document.getElementById('sebanggoModal');
  modal.style.display = 'none';
  
  // Clear search
  document.getElementById('sebanggo-search').value = '';
}

// Render sebanggo list in modal
function renderSebanggoList() {
  console.log('Rendering sebanggo list...');
  const recentSection = document.getElementById('recent-sebanggo-section');
  const recentGrid = document.getElementById('recent-sebanggo-grid');
  const allGrid = document.getElementById('all-sebanggo-grid');
  
  if (!recentSection || !recentGrid || !allGrid) {
    console.error('Sebanggo grid elements not found:', {
      recentSection: !!recentSection,
      recentGrid: !!recentGrid,
      allGrid: !!allGrid
    });
    return;
  }
  
  // Load recent selections
  const recentSebanggo = getRecentSebanggo();
  console.log('Recent sebanggo:', recentSebanggo);
  console.log('Total sebanggo data:', sebanggoData.length);
  
  // Show/hide recent section
  if (recentSebanggo.length > 0) {
    recentSection.style.display = 'block';
    recentGrid.innerHTML = '';
    
    recentSebanggo.forEach(item => {
      const button = createSebanggoButton(item, true);
      recentGrid.appendChild(button);
    });
  } else {
    recentSection.style.display = 'none';
  }
  
  // Render all items
  allGrid.innerHTML = '';
  sebanggoData.forEach(item => {
    const button = createSebanggoButton(item, false);
    allGrid.appendChild(button);
  });
}

// Create sebanggo button element
function createSebanggoButton(item, isRecent = false) {
  const div = document.createElement('div');
  const button = document.createElement('button');
  
  button.className = 'sebanggo-btn';
  button.textContent = item;
  button.onclick = () => selectSebanggo(item);
  
  div.appendChild(button);
  return div;
}

// Select sebanggo item
function selectSebanggo(value) {
  const input = document.getElementById('sub-dropdown-input');
  input.value = value;
  
  // Add to recent selections
  addToRecentSebanggo(value);
  
  // Close modal
  closeSebanggoModal();
  
  // Save to localStorage
  const pageName = location.pathname.split('/').pop();
  const selected工場 = document.getElementById('selected工場').value;
  if (pageName && selected工場) {
    const key = `${pageName}_${selected工場}_${input.id || input.name}`;
    localStorage.setItem(key, value);
  }
  
  // Trigger change event to fetch product details
  input.dispatchEvent(new Event('change'));
}

// Filter sebanggo list based on search input
function filterSebanggoList() {
  const searchInput = document.getElementById('sebanggo-search');
  const searchTerm = searchInput.value.toLowerCase();
  
  const allGrid = document.getElementById('all-sebanggo-grid');
  const noResults = document.getElementById('no-results');
  
  let visibleCount = 0;
  
  // Filter all items
  const items = allGrid.querySelectorAll('.sebanggo-btn');
  items.forEach(btn => {
    const text = btn.textContent.toLowerCase();
    if (text.includes(searchTerm)) {
      btn.parentElement.style.display = 'block';
      visibleCount++;
    } else {
      btn.parentElement.style.display = 'none';
    }
  });
  
  // Show no results message if needed
  if (visibleCount === 0 && searchTerm.length > 0) {
    noResults.style.display = 'block';
  } else {
    noResults.style.display = 'none';
  }
}

// Get recent sebanggo selections from localStorage
function getRecentSebanggo() {
  try {
    const recent = localStorage.getItem(RECENT_SEBANGGO_KEY);
    return recent ? JSON.parse(recent) : [];
  } catch (error) {
    console.error('Error loading recent sebanggo:', error);
    return [];
  }
}

// Add item to recent sebanggo selections
function addToRecentSebanggo(value) {
  try {
    let recent = getRecentSebanggo();
    
    // Remove if already exists
    recent = recent.filter(item => item !== value);
    
    // Add to beginning
    recent.unshift(value);
    
    // Limit to MAX_RECENT_SEBANGGO items
    if (recent.length > MAX_RECENT_SEBANGGO) {
      recent = recent.slice(0, MAX_RECENT_SEBANGGO);
    }
    
    localStorage.setItem(RECENT_SEBANGGO_KEY, JSON.stringify(recent));
  } catch (error) {
    console.error('Error saving recent sebanggo:', error);
  }
}

// Clear recent sebanggo selections
function clearRecentSebanggo() {
  if (confirm('Clear all recent selections?')) {
    localStorage.removeItem(RECENT_SEBANGGO_KEY);
    renderSebanggoList();
  }
}

// Initialize sebanggo modal on page load
setTimeout(function() {
  if (typeof initializeSebanggoModal === 'function') {
    initializeSebanggoModal();
  } else {
    console.warn('initializeSebanggoModal function not yet available');
  }
}, 100);

// ===== END OF SEBANGGO MODAL FUNCTIONALITY =====