//const serverURL = "http://localhost:3000";
const serverURL = "https://kurachi.onrender.com";


// // this code will ping the Render website for inactivity
// const interval = 30000; // 30 seconds
// function pingServer() {
//   fetch(`${serverURL}/getSeBanggoList`)
//     .then(response => {
//       if (!response.ok) {
//         throw new Error(`HTTP error! Status: ${response.status}`);
//       }
//       console.log(`Pinged at ${new Date().toISOString()}: Status Code ${response.status}`);
//     })
//     .catch(error => {
//       console.error(`Error pinging at ${new Date().toISOString()}:`, error.message);
//     });
// }
// setInterval(pingServer, interval);





// gets all the sebanggo list
document.addEventListener('DOMContentLoaded', () => {
  const subDropdown = document.getElementById('sub-dropdown');
  const modal = document.getElementById('modal'); // Modal element
  const modalOptions = document.getElementById('modal-options'); // Container for modal options
  const modalCloseButton = document.getElementById('modal-close'); // Modal close button
  let selectedSeBanggo = '';

  // Function to handle 品番 change logic
  window.handleSeBanggoChange = function (seBanggo) {
    selectedSeBanggo = seBanggo;
    document.getElementById('product-number').value = selectedSeBanggo;

    // Fetch 収容数 for the selected 品番
    fetch(`${serverURL}/getCapacityBySeBanggo?seBanggo=${selectedSeBanggo}`)
      .then(response => response.json())
      .then(data => {
        if (data.length > 1) {
          // If there are multiple entries, show a modal for selection
          modalOptions.innerHTML = ''; // Clear previous options
          data.forEach((item) => {
            const option = document.createElement('button');
            option.classList.add('modal-option');
            option.textContent = `収容数: ${item.収容数}`;
            option.dataset.value = item.収容数;
            modalOptions.appendChild(option);

            // Add event listener to each modal option
            option.addEventListener('click', (e) => {
              const selectedValue = e.target.dataset.value;
              document.getElementById('収容数').value = selectedValue;
              modal.style.display = 'none'; // Close the modal

              // Call the printLabel function
              printLabel();
            });
          });

          modal.style.display = 'block'; // Show the modal
        } else if (data.length === 1) {
          // If there's only one entry, auto-select it
          document.getElementById('収容数').value = data[0].収容数;

          // Call the printLabel function
          printLabel();
        } else {
          alert('No data found for the selected 品番');
        }
      })
      .catch(error => console.error('Error fetching 収容数:', error));
  }
// Fetch 品番 list from the server
fetch(`${serverURL}/getSeBanggoListH`)
  .then(response => response.json())
  .then(data => {
    // Use a Set to remove duplicate values
    const uniqueData = [...new Set(data)]; // Convert array to a Set and back to an array

    // Sort the unique 品番 list alphabetically
    uniqueData.sort((a, b) => a.localeCompare(b, 'ja')); // 'ja' for Japanese sorting

    // Clear existing options
    subDropdown.innerHTML = '';

    // Add a default "Select 品番" option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select 品番';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    subDropdown.appendChild(defaultOption);

    // Populate options dynamically with unique values
    uniqueData.forEach(seBanggo => {
      const option = document.createElement('option');
      option.value = seBanggo;
      option.textContent = seBanggo;
      subDropdown.appendChild(option);
    });
  })
  .catch(error => console.error('Error fetching 品番 list:', error));


  // Event listener for when a 品番 is selected
  subDropdown.addEventListener('change', (event) => {
    handleSeBanggoChange(event.target.value);
  });

  // Close the modal
  modalCloseButton.addEventListener('click', () => {
    modal.style.display = 'none';
  });
});





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



// Scan Button Listener
document.getElementById('scan-button').addEventListener('click', function () {
  const scanPromptModal = document.createElement('div');
  scanPromptModal.id = 'scanPromptModal';
  scanPromptModal.innerHTML = `
      <div class="modal-content">
          <p>Scan now...</p>
          <button id="cancelScan">Cancel</button>
      </div>
  `;
  scanPromptModal.style.position = 'fixed';
  scanPromptModal.style.top = '50%';
  scanPromptModal.style.left = '50%';
  scanPromptModal.style.transform = 'translate(-50%, -50%)';
  scanPromptModal.style.backgroundColor = 'white';
  scanPromptModal.style.padding = '20px';
  scanPromptModal.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
  scanPromptModal.style.borderRadius = '10px';
  scanPromptModal.style.textAlign = 'center';
  scanPromptModal.style.zIndex = '1000';

  document.body.appendChild(scanPromptModal);

  window.focus(); // Ensure key events are captured

  let scannedCode = '';

  function handleKeydown(event) {
      if (event.key === 'Enter' && scannedCode.length > 0) {
        console.log("✅ Enter pressed. Closing modal...");
          cleanup(); // 🚀 Closes modal before processing
          processScannedCode(scannedCode);
      } else if (event.key.length === 1) {
          scannedCode += event.key; // Collect characters
      }
  }

  function processScannedCode(qrCodeMessage) {
      const subDropdown = document.getElementById('sub-dropdown');
      const options = [...subDropdown.options].map(option => option.value);
      const scanAlertModal = document.getElementById('scanAlertModal');
      const scanAlertText = document.getElementById('scanAlertText');
      const alertSound = document.getElementById('alert-sound');

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

      // If QR code is valid, set dropdown
      if (subDropdown && subDropdown.value !== qrCodeMessage) {
          subDropdown.value = qrCodeMessage;
          handleSeBanggoChange(qrCodeMessage);
      }
  }

  function cleanup() {
    console.log("🔥 Cleanup called: Attempting to remove scan modal...");

    document.removeEventListener('keydown', handleKeydown);

    let modal = document.getElementById('scanPromptModal');
    if (modal) {
        console.log("✅ Scan modal found. Removing it...");
        
        // Try to remove it
        modal.remove(); 
        
        setTimeout(() => {
            modal = document.getElementById('scanPromptModal');
            if (modal) {
                console.error("⚠️ Scan modal STILL EXISTS! Applying full removal...");

                // Force removal with parentNode
                modal.parentNode?.removeChild(modal);

                // Set forced styles to ensure it's gone
                modal.style.display = 'none';
                modal.style.visibility = 'hidden';
                modal.style.opacity = '0';
                modal.style.pointerEvents = 'none';

                // Empty its content
                modal.innerHTML = '';

                // Final removal attempt
                modal.replaceWith(modal.cloneNode(true));
            } else {
                console.log("✅ Scan modal fully removed.");
            }
        }, 50);
    } else {
        console.warn("⚠️ Scan modal not found in DOM.");
    }
  }

  // Cancel button functionality
  document.getElementById('cancelScan').addEventListener('click', cleanup);

  scannedCode = ''; // Reset scanned input
  document.addEventListener('keydown', handleKeydown);
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




// //Print label using "Smooth Print" app for mobile devices
// function printLabel() {
//   // Retrieve dynamic values from the form
//   const 品番 = document.getElementById("product-number").value;
//   const 収容数 = document.getElementById("収容数").value;
//   const R_L = document.getElementById("R-L").value;
//   const 品番収容数 = `${品番},${収容数}`;
//   const extension = document.getElementById("Labelextension").value;
//   const Date2 = document.getElementById('Lot No.').value;
//   console.log(R_L);

//   if (extension){
//      Date = Date2 + " - " + extension;
//   } else {
//     Date = Date2;
//   }

//   // Smooth Print URL scheme
//   const filename = "hidaselabel5.lbx"; // Ensure this matches the local file name
//   //const size = "RollW62RB";
//   const size = "RollW62";
//   const copies = 1;
//   const url =
//     `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=${encodeURIComponent(copies)}` +
//     `&text_品番=${encodeURIComponent(品番)}` +
//     `&text_収容数=${encodeURIComponent(収容数)}` +
//     `&text_DateT=${encodeURIComponent(Date)}` +
//     `&barcode_barcode=${encodeURIComponent(品番収容数)}`;
//   console.log(Date);
//   // Redirect to Smooth Print
//   window.location.href = url;
// }


// Print label using "Smooth Print" app for mobile devices
function printLabel() {
  // Retrieve dynamic values from the form
  const 品番 = document.getElementById("product-number").value;
  const 収容数 = document.getElementById("収容数").value;
  const R_L = document.getElementById("R-L").value;
  const 品番収容数 = `${品番},${収容数}`;
  const extension = document.getElementById("Labelextension").value;
  const Date2 = document.getElementById('Lot No.').value;
  let Date;
  console.log(R_L);

  if (extension) {
    Date = Date2 + " - " + extension;
  } else {
    Date = Date2;
  }

  // Show modal to choose BOX or Product
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
  message.innerText = 'Choose label type: For BOX / 外用 or For Product / 製品用';
  message.style.fontSize = '20px';
  message.style.textAlign = 'center';
  message.style.marginBottom = '20px';
  modal.appendChild(message);

  const buttonBox = document.createElement('button');
  buttonBox.innerText = 'For BOX / 外用';
  buttonBox.style.margin = '10px';
  buttonBox.style.padding = '10px 20px';
  buttonBox.style.fontSize = '16px';
  buttonBox.style.cursor = 'pointer';
  buttonBox.style.borderRadius = '5px';
  buttonBox.onclick = () => {
    showCopiesPrompt('hidaselabel6.lbx');
    document.body.removeChild(modal);
  };
  modal.appendChild(buttonBox);

  const buttonProduct = document.createElement('button');
  buttonProduct.innerText = 'For Product / 製品用';
  buttonProduct.style.margin = '10px';
  buttonProduct.style.padding = '10px 20px';
  buttonProduct.style.fontSize = '16px';
  buttonProduct.style.cursor = 'pointer';
  buttonProduct.style.borderRadius = '5px';
  buttonProduct.onclick = () => {
    showCopiesPrompt('hidaselabel7inner.lbx');
    document.body.removeChild(modal);
  };
  modal.appendChild(buttonProduct);

  document.body.appendChild(modal);

  function showCopiesPrompt(filename) {
    // Create copies prompt modal
    const copiesModal = document.createElement('div');
    copiesModal.classList.add('modal');
    copiesModal.style.display = 'flex';
    copiesModal.style.position = 'fixed';
    copiesModal.style.top = '50%';
    copiesModal.style.left = '50%';
    copiesModal.style.transform = 'translate(-50%, -50%)';
    copiesModal.style.flexDirection = 'column';
    copiesModal.style.justifyContent = 'center';
    copiesModal.style.alignItems = 'center';
    copiesModal.style.padding = '30px';
    copiesModal.style.backgroundColor = 'white';
    copiesModal.style.boxShadow = '0 0 15px rgba(0, 0, 0, 0.5)';
    copiesModal.style.borderRadius = '10px';
  
    let copies = 1;
  
    const copiesMessage = document.createElement('p');
    copiesMessage.innerText = 'Select number of copies:';
    copiesMessage.style.fontSize = '20px';
    copiesMessage.style.textAlign = 'center';
    copiesMessage.style.marginBottom = '20px';
    copiesModal.appendChild(copiesMessage);
  
    const copiesDisplay = document.createElement('div');
    copiesDisplay.style.display = 'flex';
    copiesDisplay.style.alignItems = 'center';
    copiesDisplay.style.marginBottom = '20px';
  
    const minusButton = document.createElement('button');
    minusButton.innerText = '-';
    minusButton.style.margin = '10px';
    minusButton.style.padding = '10px';
    minusButton.style.fontSize = '16px';
    minusButton.onclick = () => {
      let value = parseInt(copiesInput.value) || 1;
      if (value > 1) {
        value--;
        copies = value;
        copiesInput.value = value;
      }
    };
    copiesDisplay.appendChild(minusButton);
  
    const copiesInput = document.createElement('input');
    copiesInput.type = 'number';
    copiesInput.value = copies;
    copiesInput.min = 1;
    copiesInput.style.fontSize = '20px';
    copiesInput.style.width = '60px';
    copiesInput.style.textAlign = 'center';
    copiesInput.oninput = () => {
      let value = parseInt(copiesInput.value);
      if (isNaN(value) || value < 1) {
        copies = 1;
        copiesInput.value = 1;
      } else {
        copies = value;
      }
    };
    copiesDisplay.appendChild(copiesInput);
  
    const plusButton = document.createElement('button');
    plusButton.innerText = '+';
    plusButton.style.margin = '10px';
    plusButton.style.padding = '10px';
    plusButton.style.fontSize = '16px';
    plusButton.onclick = () => {
      let value = parseInt(copiesInput.value) || 1;
      value++;
      copies = value;
      copiesInput.value = value;
    };
    copiesDisplay.appendChild(plusButton);
  
    copiesModal.appendChild(copiesDisplay);
  
    const confirmButton = document.createElement('button');
    confirmButton.innerText = 'Confirm';
    confirmButton.style.margin = '10px';
    confirmButton.style.padding = '10px 20px';
    confirmButton.style.fontSize = '16px';
    confirmButton.style.cursor = 'pointer';
    confirmButton.style.borderRadius = '5px';
    confirmButton.onclick = () => {
      let finalCopies = parseInt(copiesInput.value);
      if (isNaN(finalCopies) || finalCopies < 1) {
        alert("Please enter a valid number of copies (1 or more).");
        return;
      }
  
      const url =
        `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent("RollW62")}&copies=${encodeURIComponent(finalCopies)}` +
        `&text_品番=${encodeURIComponent(品番)}` +
        `&text_収容数=${encodeURIComponent(収容数)}` +
        `&text_DateT=${encodeURIComponent(Date)}` +
        `&text_kensa=${encodeURIComponent("")}` +
        `&barcode_barcode=${encodeURIComponent(品番収容数)}`;
  
      window.location.href = url;
      document.body.removeChild(copiesModal);
    };
    copiesModal.appendChild(confirmButton);
  
    document.body.appendChild(copiesModal);
  }
}


document.addEventListener('DOMContentLoaded', () => {
  const subDropdown = document.getElementById('sub-dropdown');
  const reprintButton = document.getElementById('reprint-button'); // Reprint button

  // Event listener for reprint button
  reprintButton.addEventListener('click', () => {
    const selectedSeBanggo = subDropdown.value;
    if (selectedSeBanggo) {
      handleSeBanggoChange(selectedSeBanggo); // Re-trigger the selection process
    } else {
      alert('Please select a 品番 first.');
    }
  });
});