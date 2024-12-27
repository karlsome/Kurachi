//const serverURL = "http://192.168.0.28:3000";
const serverURL = "https://kurachi.onrender.com";


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


//scan BUtton javascript
document.getElementById('scan-button').addEventListener('click', function () {
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
      { facingMode: "environment" },
      {
          fps: 10,
          qrbox: { width: 250, height: 250 }
      },
      async qrCodeMessage => {
          const subDropdown = document.getElementById('sub-dropdown');
          const options = [...subDropdown.options].map(option => option.value);

          console.log("Scanned QR Code:", qrCodeMessage);

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
              closeScanModalButton.onclick = function () {
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
              handleSeBanggoChange(qrCodeMessage);

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
  document.getElementById('closeQRScannerModal').onclick = function () {
      html5QrCode.stop().then(() => {
          qrScannerModal.style.display = 'none';
      }).catch(err => console.error("Failed to stop scanning:", err));
  };

  // Close scanner if user clicks outside the modal
  window.onclick = function (event) {
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




//Print label using "Smooth Print" app for mobile devices
function printLabel() {
  // Retrieve dynamic values from the form
  const 品番 = document.getElementById("product-number").value;
  const 収容数 = document.getElementById("収容数").value;
  const R_L = document.getElementById("R-L").value;
  const 品番収容数 = `${品番},${収容数}`;
  const extension = document.getElementById("Labelextension").value;
  const Date2 = document.getElementById('Lot No.').value;
  console.log(R_L);

  if (extension){
     Date = Date2 + " - " + extension;
  } else {
    Date = Date2;
  }

  // Smooth Print URL scheme
  const filename = "hidaselabel5.lbx"; // Ensure this matches the local file name
  const size = "RollW62RB";
  //const size = "RollW62";
  const copies = 1;
  const url =
    `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=${encodeURIComponent(copies)}` +
    `&text_品番=${encodeURIComponent(品番)}` +
    `&text_収容数=${encodeURIComponent(収容数)}` +
    `&text_DateT=${encodeURIComponent(Date)}` +
    `&barcode_barcode=${encodeURIComponent(品番収容数)}`;
  console.log(Date);
  // Redirect to Smooth Print
  window.location.href = url;
}