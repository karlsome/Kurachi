// link for final report (html data)
const scriptURL = 'https://script.google.com/macros/s/AKfycby-_1ZH5JUXYJk4qzSUVEekfJM5F4QG7qTys67uwXFm2p9q2O_SI1HnqEDzjQnSx30J/exec'

// link for database (nakaya -> main)
const dbURL = 'https://script.google.com/macros/s/AKfycbwBzPZgoNiUK_ez3AzK5FXFr8_AsmdBjCWGzulG3eh0cryirgVxtMzIF4ehh98QYdkpUg/exec';
//const dbURL = 'https://script.google.com/macros/s/AKfycbz7c9FCfX5ExpxSBBqKm87PePym4KzvCfDcH2zEL9oL/dev';

// link for worker database
const workerURL = 'https://script.google.com/macros/s/AKfycbxw4KtgqhSTVI4TKfQuT642LyvnkvYBQSh3IHaWc1GGI--89abQp0bUff-x8-rELeS_VQ/exec';

// link for pictures database
const picURL = 'https://script.google.com/macros/s/AKfycbwHUW1ia8hNZG-ljsguNq8K4LTPVnB6Ng_GLXIHmtJTdUgGGd2WoiQo9ToF-7PvcJh9bA/exec';

//link for printer master database
const printerCodeURL = 'https://script.google.com/macros/s/AKfycbxP9j_KH4fRe4io777vD-pnt9BQH9IwiS4JRrbsw8DkoDCfaAcdHeH7pbIWIy2ue_8jcQ/exec';

//link for ip address database
const ipURL = 'https://script.google.com/macros/s/AKfycbyC6-KiT3xwGiahhzhB-L-OOL8ufG0WqnT5mjEelGBKGnbiqVAS6qjT78FlzBUHqTn3Gg/exec';


//link for live status (google sheets live status)
const googleSheetLiveStatusURL = 'https://script.google.com/macros/s/AKfycbwbL30hlX9nBlQH4dwxlbdxSM5kJtgtNEQJQInA1mgXlEhYJxFHykZkdXV38deR6P83Ow/exec';



const blank = " ";
const form = document.forms['contact-form']
const filterValue = '倉知'; // put division here
let sendtoNCButtonisPressed = false; // this global variable is to check if sendtoNC button is pressed or not





// function to reset everything then reloads the page
function resetForm() {
    // Clear all form inputs
    const inputs = document.querySelectorAll("input, select, textarea");
    inputs.forEach(input => {
      input.value = '';
    });

    // Clear counters
    for (let i = 1; i <= 12; i++) {
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

// when submit form is pressed
form.addEventListener('submit', e => {
  const hatsumonoStatus = document.getElementById("hatsumonoLabel").textContent;
  const atomonoStatus = document.getElementById("atomonoLabel").textContent;
  if (hatsumonoStatus === "FALSE" || atomonoStatus === "FALSE") {
    window.alert("Please do the checklist / 初物後物チェックください");
    e.preventDefault(); // Prevent form submission if validation fails
    return; // Exit the function to prevent further execution
  }
  
  const currentMachine = document.getElementById("hidden設備").value; // i need the current machine name
  e.preventDefault(); // prevent submit
  calculateTotalTime(); // this calculates the cycle time and total time
  fetch(scriptURL, { method: 'POST', body: new FormData(form), mode: 'no-cors' }) // pakyu cors policy
    .then(response => alert("Thank you! your form is submitted successfully."))
    .then(()=> {updateSheetStatus(blank,currentMachine);}) // this code updates the current status on TV (this updates as blank)
    .then(() => { window.location.reload(); })
    .catch(error => console.error('Error!', error.message))
})


//this function waits for reload then this madapaka will save to local
// this will prevent deleting everything on accidental refresh
document.addEventListener("DOMContentLoaded", function() {
  // Save input to localStorage
  const inputs = document.querySelectorAll("input, select, textarea");
  const savedValue = localStorage.getItem('背番号');
  SubDropdownChange(savedValue);

  // Restore hatsumonoLabel text from localStorage if available
  const hatsumonoLabelValue = localStorage.getItem("hatsumonoLabel");
  if (hatsumonoLabelValue) {
    document.getElementById("hatsumonoLabel").textContent = hatsumonoLabelValue;
  }

  // Restore atomonoLabel text from localStorage if available
  const atomonoLabelValue = localStorage.getItem("atomonoLabel");
  if (atomonoLabelValue) {
    document.getElementById("atomonoLabel").textContent = atomonoLabelValue;
  }
  
  
  inputs.forEach(input => {
      // Load saved data
      if (localStorage.getItem(input.name)) {
          input.value = localStorage.getItem(input.name);
          updateTotal();
      }

      // Save data on change
      input.addEventListener("input", function() {
          updateTotal();
          localStorage.setItem(input.name, input.value);
      });
  });

  // Clear localStorage on form submission
  document.querySelector("form").addEventListener("submit", function() {
    const hatsumonoStatus = document.getElementById("hatsumonoLabel").textContent;
    const atomonoStatus = document.getElementById("atomonoLabel").textContent;
    if (hatsumonoStatus === "FALSE" || atomonoStatus === "FALSE") {
      window.alert("Please do the checklist / 初物後物チェックください");
      e.preventDefault(); // Prevent form submission if validation fails
      return; // Exit the function to prevent further execution
    }
    checkInternetConnection();
      inputs.forEach(input => {
          localStorage.removeItem(input.name);
      });
      // Remove specific items from localStorage that are not cleared by the above loop because pakyu thats why
      localStorage.removeItem('counter-1');
      localStorage.removeItem('counter-2');
      localStorage.removeItem('counter-3');
      localStorage.removeItem('counter-4');
      localStorage.removeItem('counter-5');
      localStorage.removeItem('counter-6');
      localStorage.removeItem('counter-7');
      localStorage.removeItem('counter-8');
      localStorage.removeItem('counter-9');
      localStorage.removeItem('counter-10');
      localStorage.removeItem('counter-11');
      localStorage.removeItem('counter-12');
      localStorage.removeItem('enable-inputs-checkbox');
      localStorage.removeItem('検査STATUS');
      localStorage.removeItem('sendtoNCButtonisPressed');
      localStorage.removeItem('hatsumonoLabel');
      localStorage.removeItem('atomonoLabel');
      
  });
});



//offline saving
// Function to save form data to localStorage if the internet is gone
function saveFormData() {
  const inputs = document.querySelectorAll("input, select, textarea");
  const submission = {};

  inputs.forEach(input => {
    submission[input.name] = input.value;
  });

  // Store the form submission with a unique key
  const timestamp = new Date().getTime();
  localStorage.setItem(`offline-submission-${timestamp}`, JSON.stringify(submission));
}

// Function to submit all stored data when the internet is back
function submitStoredData() {
  const keys = Object.keys(localStorage).filter(key => key.startsWith('offline-submission-'));

  if (keys.length > 0) {
    let submissionCount = 0;

    keys.forEach((key, index) => {
      const storedData = JSON.parse(localStorage.getItem(key));

      const formData = new FormData();
      Object.entries(storedData).forEach(([name, value]) => {
        formData.append(name, value);
      });

      // Submit the form data to the Google Sheets script
      fetch(scriptURL, { method: 'POST', body: formData, mode: 'no-cors' })
        .then(() => {
          // Remove the successfully submitted entry from localStorage
          localStorage.removeItem(key);
          submissionCount++;
          
          // After the last item is submitted, alert the user
          if (submissionCount === keys.length) {
            alert(`${submissionCount} saved form(s) have been submitted successfully!`);
            window.location.reload(); // Reload the page to start fresh
          }
        })
        .catch(error => console.error('Error submitting stored data:', error));
    });
  } else {
    alert("No saved forms to submit!");
  }
}

// Function to check if the internet connection is available
function checkInternetConnection() {
  if (navigator.onLine) {
    submitStoredData();
  } else {
    saveFormData();
    alert("Internet is offline. Your data is saved and will be submitted when the connection is restored.");
    // Instead of reloading, just reset the form fields
    document.querySelector("form").reset();
  }
}

//listener if page is back online to submit local forms
window.addEventListener('online', checkInternetConnection); // Try to submit when the internet connection is restored





 //when checkbox is checked
 function toggleInputs() {  
    var isChecked = document.getElementById('enable-inputs').checked;  
    var inputs = document.querySelectorAll('#Kensa\\ Name, #KDate, #KStart\\ Time, #KEnd\\ Time,.plus-btn,.minus-btn, textarea[name="Comments2"], input[type="submit"],#在庫');  
    inputs.forEach(function(input) {  
        input.disabled = !isChecked;  
    });  

    // Enable all inputs inside the counter container when the checkbox is checked  
    if (isChecked) {  
        var counterInputs = document.querySelectorAll('.counter-container input');  
        counterInputs.forEach(function(input) {  
            input.disabled = false;  
        });
        // Set hidden input value to "TRUE"
        document.getElementById('検査STATUS').value = "TRUE";
    } else {
        // Set hidden input value to "false"
        document.getElementById('検査STATUS').value = "false";
    }
    //save to local
    localStorage.setItem('enable-inputs-checkbox', isChecked);
    localStorage.setItem('検査STATUS', document.getElementById('検査STATUS').value);
}

//function to load from local to checkbox
function loadInputState() {
  // Retrieve the checkbox state from local storage
  var isChecked = localStorage.getItem('enable-inputs-checkbox') === 'true';
  
  // Set the checkbox state
  document.getElementById('enable-inputs').checked = isChecked;

  // Retrieve the stored status value
  var storedStatus = localStorage.getItem('検査STATUS');
  if (storedStatus) {
      document.getElementById('検査STATUS').value = storedStatus;
  }

  // Enable/disable inputs based on the checkbox state
  var inputs = document.querySelectorAll('#Kensa\\ Name, #KDate, #KStart\\ Time, #KEnd\\ Time,.plus-btn,.minus-btn, textarea[name="Comments2"],#在庫');
  inputs.forEach(function(input) {  
      input.disabled = !isChecked;  
  });

  if (isChecked) {
      var counterInputs = document.querySelectorAll('.counter-container input');
      counterInputs.forEach(function(input) {  
          input.disabled = false;  
      });
  }
}


//this code is for the scan lot number
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const photo = document.getElementById('photo');
const captureButton = document.getElementById('capture');
const highlightBox = document.getElementById('highlightBox');
const modal = document.getElementById('myModal');
const span = document.getElementsByClassName('close')[0];

const highlightBoxSize = {
    width: 80,
    height: 20
};

highlightBox.style.width = `${highlightBoxSize.width}px`;
highlightBox.style.height = `${highlightBoxSize.height}px`;

document.getElementById('scan-lot').addEventListener('click', () => {
    modal.style.display = 'block';
    navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment" 
        }
    })
    .then(stream => {
        video.srcObject = stream;
    })
    .catch(err => {
        console.error("Error accessing the camera: ", err);
    });
});

span.onclick = () => {
    modal.style.display = 'none';
    video.srcObject.getTracks().forEach(track => track.stop()); // Stop the camera
};

window.onclick = event => {
    if (event.target == modal) {
        modal.style.display = 'none';
        video.srcObject.getTracks().forEach(track => track.stop()); // Stop the camera
    }
};

video.addEventListener('loadedmetadata', () => {
    highlightBox.style.left = `${(video.offsetWidth - highlightBoxSize.width) / 2}px`;
    highlightBox.style.top = `${(video.offsetHeight - highlightBoxSize.height) / 2}px`;
    highlightBox.style.display = 'block';
});

captureButton.addEventListener('click', event => {
    event.preventDefault(); // Prevent the form from submitting

    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/png');
    photo.setAttribute('src', data);

    const rect = highlightBox.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();

    const scaleX = canvas.width / videoRect.width;
    const scaleY = canvas.height / videoRect.height;

    const captureX = (rect.left - videoRect.left) * scaleX;
    const captureY = (rect.top - videoRect.top) * scaleY;
    const captureWidth = highlightBoxSize.width * scaleX;
    const captureHeight = highlightBoxSize.height * scaleY;

    const selectionCanvas = document.createElement('canvas');
    selectionCanvas.width = captureWidth;
    selectionCanvas.height = captureHeight;
    const selectionContext = selectionCanvas.getContext('2d');
    selectionContext.drawImage(canvas, captureX, captureY, captureWidth, captureHeight, 0, 0, captureWidth, captureHeight);

    const selectionData = selectionCanvas.toDataURL('image/png');

    Tesseract.recognize(
        selectionData,
        'eng',
        {
            logger: m => console.log(m)
        }
    ).then(({ data: { text } }) => {
        alert(text); // Display the extracted text in a pop-up window
        document.getElementById('材料ロット').value = text; // Set the input value
        modal.style.display = 'none';
        video.srcObject.getTracks().forEach(track => track.stop()); // Stop the camera
    });
});



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

// when date is pressed
function setDefaultDate(input) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateValue = `${year}-${month}-${day}`;
  input.value = dateValue;

  // Save the date to local storage yeahh
  localStorage.setItem(input.id, dateValue);
}


//this function listens to incoming input: selected is the machine value, filter is the factory value
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

const selectedMachine = getQueryParam('selected');
const selectedFactory = getQueryParam('filter');
const hatsumono = getQueryParam('kensastatus');

if (selectedMachine) {
  document.getElementById('dropdown').textContent = selectedMachine;
  document.getElementById('nippoTitle').textContent = selectedFactory+"日報";
  document.getElementById('checkboxLabel').textContent = selectedFactory+"検査";
  document.getElementById('hidden設備').value = selectedMachine;
  document.getElementById('hidden工場').value = selectedFactory;
  fetchSubDropdownData(selectedMachine);
  
  
}



// this is new dropdown function (populate list)  <-- need to fix this code (dropdown save locally)
function fetchSubDropdownData(selectedValue) {
  const subDropdown = document.getElementById('sub-dropdown');

  function populateDropdown(options) {
    subDropdown.innerHTML = ''; 

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '';
    subDropdown.appendChild(defaultOption);

    options.forEach(option => {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      subDropdown.appendChild(opt);
    });

    const savedValue = localStorage.getItem('背番号');
    if (savedValue) {
      subDropdown.value = savedValue;
      //SubDropdownChange(savedValue);
      loadCounterValues();
      loadInputState();
    }

    subDropdown.addEventListener('change', function () {
      const selectedValue = this.value;
      const machineName = document.getElementById("hidden設備").value;
      productNumberInfo(selectedValue);
      modelInfo(selectedValue);
      shapeInfo(selectedValue);
      RLInfo(selectedValue);
      materialInfo(selectedValue);
      materialCodeInfo(selectedValue);
      materialColorInfo(selectedValue);
      picLINK(selectedValue);
      printerCode(selectedValue);
      getRikeshi(selectedValue);
      getIP();
      updateSheetStatus(selectedValue, machineName);
      //this is for the pop up for sendtomachine button
      sendtoNCButtonisPressed = false;
      localStorage.setItem('sendtoNCButtonisPressed', 'false');
      popupShown = false;
      checkValue();
      printerName();
      getBox(selectedValue);
    });
  }

  const savedOptions = localStorage.getItem('dropdown-options');
  if (savedOptions) {
    populateDropdown(JSON.parse(savedOptions));
  }

  fetch(`${dbURL}?filterE=${selectedValue}`)
    .then(response => response.json())
    .then(data => {
      localStorage.setItem('dropdown-options', JSON.stringify(data));
      populateDropdown(data);
    })
    .catch(error => {
      console.error('Error fetching sub-dropdown options:', error);
      if (!savedOptions) {
        alert("No internet connection and no saved options available.");
      }
    });
}



//LIVE STATUS function
// this function sends the post command to google sheet live status
function updateSheetStatus(selectedValue,machineName){
  const selectedFactory = document.getElementById('hidden工場').value;
  fetch(googleSheetLiveStatusURL, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      'current': selectedValue,
      'machine': machineName,
      'factory': selectedFactory
    })
  })
  .then(response => response.text())
  .then(data => {
    console.log(data);
  })
  .catch(error => {
    console.error('Error:', error);
  });
  

}


//this function sends request to nc cutter's pC
function sendtoNC(selectedValue){
  sendCommand("off"); // this is for arduino (emergency button)
  sendtoNCButtonisPressed = true;
  localStorage.setItem('sendtoNCButtonisPressed', 'true');
  const ipAddress = document.getElementById('ipInfo').value;
  const currentSebanggo = document.getElementById('sub-dropdown').value;
  const machineName = document.getElementById('hidden設備').value;
  //window.alert(machineName + currentSebanggo);
  if (!currentSebanggo) {
    window.alert("Please select product first / 背番号選んでください");
    return;
  }

  //let pcName = "DESKTOP-V36G1SK-2";
  const url = `http://${ipAddress}:5000/request?filename=${currentSebanggo}.pce`; //change to 
 
    // Open a new tab with the desired URL
    const newTab = window.open(url, '_blank');
    
    // Set a timer to close the new tab after a delay (e.g., 1 seconds)
    setTimeout(() => {
      newTab.close();
    }, 5000);
}
document.getElementById('sendtoNC').addEventListener('click', sendtoNC);







// // listener for the QR Code Button (scan-button)
// document.getElementById('scan-button').addEventListener('click', function() {
  
//   // Open popup window for QR scanning with an identifier for "scan-button"
//   const popup = window.open('popup.html?source=scan', 'QR Scanner', 'width=400,height=300');

//   // Listen for the message event specific to "scan-button"
//   window.addEventListener('message', function handleScanButton(event) {
//     // Ensure the event is from the same origin
//     if (event.origin === window.location.origin) {
//       const BarcodeValue = event.data;
//       console.log(`QR Code detected: ${BarcodeValue}`);

//       const subDropdown = document.getElementById('sub-dropdown');
//       if (subDropdown && subDropdown.value !== BarcodeValue) {
//         resetForm();
//         sendtoNCButtonisPressed = false;
//         localStorage.setItem("sendtoNCButtonisPressed",'false');
//         checkValue();    
//       }
    
//       SubDropdownChange(BarcodeValue);
//       // Delay the page reload after successful QR code processing
//       setTimeout(() => {
//         window.location.reload();
//       }, 500);
    
      
      
//       // Remove the event listener after handling
//       window.removeEventListener('message', handleScanButton);
//     }
//   });
// });

// // listener for the QR Code Button (scan-button)
// document.getElementById('scan-button').addEventListener('click', function() {
  
//   // Open popup window for QR scanning with an identifier for "scan-button"
//   const popup = window.open('popup.html?source=scan', 'QR Scanner', 'width=400,height=300');

//   // Listen for the message event specific to "scan-button"
//   window.addEventListener('message', function handleScanButton(event) {
//     // Ensure the event is from the same origin
//     if (event.origin === window.location.origin) {
//       const BarcodeValue = event.data;
//       console.log(`QR Code detected: ${BarcodeValue}`);

//       const subDropdown = document.getElementById('sub-dropdown');

//       // Check if there's an existing product loaded in the sub-dropdown and it differs from the scanned QR code
//       if (subDropdown && subDropdown.value !== "" && subDropdown.value !== BarcodeValue) {
//           // If the user cancels the prompt, flash the screen red and play the alarm sound
//           const alertSound = document.getElementById('alert-sound');
//           if (alertSound) {
//             alertSound.play().then(() => {
//               console.log("Sound is playing");
  
//               // Flash the page red immediately before the alert
//               document.body.classList.add('flash-red');
  
//               // Delay the alert to let the flash animation start
//               setTimeout(() => {
//                 // Show alert message
//                 window.alert("Different product detected! Please save form before changing. / 異なる製品が検出されました。保存してください！");
  
//                 // Stop the sound after the user closes the alert
//                 alertSound.pause();
//                 alertSound.currentTime = 0; // Reset sound to the beginning
  
//                 // Stop flashing after 3 seconds (from the time the alert started)
//                 setTimeout(() => {
//                   document.body.classList.remove('flash-red');
//                 }, 3000);
//               }, 50);  // Small delay before showing the alert, allowing the animation to start
//             }).catch(function(error) {
//               console.error("Failed to play sound:", error);
//             });
//           } else {
//             console.error("Alert sound not found");
//           }

//           // Stop further processing after the alert
//           window.removeEventListener('message', handleScanButton);
//           return;
        
//       }

//       if (subDropdown && subDropdown.value !== BarcodeValue) {
//         resetForm();
//         sendtoNCButtonisPressed = false;
//         localStorage.setItem("sendtoNCButtonisPressed",'false');
//         checkValue();    
//       }
    
//       // Process the QR code and update the sub-dropdown
//       SubDropdownChange(BarcodeValue);
//       // Delay the page reload after successful QR code processing
//       setTimeout(() => {
//         window.location.reload();
//       }, 500);

//       // Remove the event listener after handling
//       window.removeEventListener('message', handleScanButton);
//     }
//   });
// });

// listener for the QR Code Button (scan-button)
document.getElementById('scan-button').addEventListener('click', function() {
  
  // Open popup window for QR scanning with an identifier for "scan-button"
  const popup = window.open('popup.html?source=scan', 'QR Scanner', 'width=400,height=300');

  // Listen for the message event specific to "scan-button"
  window.addEventListener('message', function handleScanButton(event) {
    // Ensure the event is from the same origin
    if (event.origin === window.location.origin) {
      const BarcodeValue = event.data;
      console.log(`QR Code detected: ${BarcodeValue}`);

      const subDropdown = document.getElementById('sub-dropdown');

      // Check if there's an existing product loaded in the sub-dropdown and it differs from the scanned QR code
      if (subDropdown && subDropdown.value !== "" && subDropdown.value !== BarcodeValue) {
          // If the user cancels the prompt, flash the screen red and play the alarm sound
          const alertSound = document.getElementById('alert-sound');
          if (alertSound) {
            alertSound.play().then(() => {
              console.log("Sound is playing");
  
              // Flash the page red immediately before the alert
              document.body.classList.add('flash-red');
  
              // Delay the alert to let the flash animation start
              setTimeout(() => {
                // Show alert message
                window.alert("Different product detected! Please save form before changing. / 異なる製品が検出されました。保存してください！");
  
                // Stop the sound after the user closes the alert
                alertSound.pause();
                alertSound.currentTime = 0; // Reset sound to the beginning
  
                // Stop flashing after 3 seconds (from the time the alert started)
                setTimeout(() => {
                  document.body.classList.remove('flash-red');
                }, 3000);
              }, 50);  // Small delay before showing the alert, allowing the animation to start
            }).catch(function(error) {
              console.error("Failed to play sound:", error);
            });
          } else {
            console.error("Alert sound not found");
          }

          // Stop further processing after the alert
          window.removeEventListener('message', handleScanButton);
          return;
        
      }

      // Only reset form and reload if the QR code is different from sub-dropdown value
      if (subDropdown && subDropdown.value !== BarcodeValue) {
        resetForm();
        sendtoNCButtonisPressed = false;
        localStorage.setItem("sendtoNCButtonisPressed",'false');
        checkValue();    

        // Process the QR code and update the sub-dropdown
        SubDropdownChange(BarcodeValue);
        // Delay the page reload after successful QR code processing
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        console.log("QR code is the same as sub-dropdown value, no reload needed.");
      }

      // Remove the event listener after handling
      window.removeEventListener('message', handleScanButton);
    }
  });
});




// listener for KANBAN QR scanner button (sendtoQty button)
document.getElementById('sendtoQty').addEventListener('click', function() {
  // Open popup window for QR scanning with an identifier for "sendtoQty"
  const popup = window.open('popup.html?source=kanban', 'QR Scanner', 'width=400,height=300');

  // Listen for the message event specific to "sendtoQty"
  window.addEventListener('message', function handleSendtoQty(event) {
    // Ensure the event is from the same origin
    if (event.origin === window.location.origin) {
      const BarcodeValue = event.data;
      console.log(`QR Code detected: ${BarcodeValue}`);

      // Set the scanned QR code data to the "scannedKanban" input field
      const scannedKanbanInput = document.getElementById('scannedKanban');
      if (scannedKanbanInput) {
        scannedKanbanInput.value = BarcodeValue;
      }

      // Check if the value of the scanned QR code matches the value of the dropdown
      const subDropdown = document.getElementById('sub-dropdown');
      if (subDropdown && subDropdown.value !== BarcodeValue) {
        // Play the alert sound before showing the alert
        const alertSound = document.getElementById('alert-sound');
        if (alertSound) {
          alertSound.play().then(() => {
            console.log("Sound is playing");

            // Flash the page red immediately before the alert
            document.body.classList.add('flash-red');

            // Delay the alert to let the flash animation start
            setTimeout(() => {
              // Show alert message
              window.alert("Wrong Kanban / 看板間違い");

              // Stop the sound after the user closes the alert
              alertSound.pause();
              alertSound.currentTime = 0; // Reset sound to the beginning

              // Stop flashing after 3 seconds (from the time the alert started)
              setTimeout(() => {
                document.body.classList.remove('flash-red');
              }, 3000);
            }, 50);  // Small delay before showing the alert, allowing the animation to start
          }).catch(function(error) {
            console.error("Failed to play sound:", error);
          });
        } else {
          console.error("Alert sound not found");
        }

        window.removeEventListener('message', handleSendtoQty); // Stop further processing
        return;
      }

      // Get the value of "boxqty" and add it to the "Process Quantity" input field
      const boxQtyInput = document.getElementById('boxqty');
      const processQtyInput = document.getElementById('ProcessQuantity');
      
      if (boxQtyInput && processQtyInput) {
        const boxQtyValue = parseInt(boxQtyInput.value) || 0;
        const processQtyValue = parseInt(processQtyInput.value) || 0;

        // Add the values together and set it to "Process Quantity"
        processQtyInput.value = processQtyValue + boxQtyValue;
        localStorage.setItem("Process Quantity", processQtyInput.value);
        updateTotal();
        
        // Alert user about success
        window.alert("1 box added successfully / 1箱が正常に追加されました");

        // Call the print function here
        runPrintFunction();
      }

      // Remove the event listener after handling
      window.removeEventListener('message', handleSendtoQty);
    }
  });
});


// Function to handle printing
function runPrintFunction() {
  const ipAddress = document.getElementById('ipInfo').value;
  const printerHostname = document.getElementById('printerHostname').value;

  // Get the value of the hidden input field
  const printerCode = document.getElementById('printerCode').value;
  console.log("printerhostname: " + printerHostname);
  const url = `http://${ipAddress}:5001/print?text=${printerCode}&hostname=${printerHostname}`; //no need for raspberry pi anymore

  // Open a new tab with the desired URL
  const newWindow = window.open(url, '_blank', 'width=100,height=100,left=-1000,top=-1000');

  // Close the window after 5 seconds
  setTimeout(() => {
    if (newWindow) {
      newWindow.close();
    }
  }, 5000);
}


// this function basically just refreshes the information area and sets the sub-dropdown value to current sebanggo
function SubDropdownChange(selectedValue) {
  const subDropdown = document.getElementById('sub-dropdown');
  subDropdown.value = selectedValue;
  localStorage.setItem('背番号',selectedValue);
  fetch(`${dbURL}?filterE=${selectedValue}`)
    .then(response => response.json())
    .then(data => {
      
      const machineName = document.getElementById("hidden設備").value;
      
      // Ensure getRikeshi is only called once
      if (!isRikeshiPlaying) {
        getRikeshi(selectedValue);
        isRikeshiPlaying = true;
      }
      
      productNumberInfo(subDropdown.value);
      modelInfo(subDropdown.value);
      shapeInfo(subDropdown.value);
      RLInfo(subDropdown.value);
      materialInfo(subDropdown.value);
      materialCodeInfo(subDropdown.value);
      materialColorInfo(subDropdown.value);
      picLINK(subDropdown.value);
      printerCode(selectedValue);
      getIP();
      updateSheetStatus(selectedValue, machineName);
      printerName();
      getBox(selectedValue);
      checkValue();
    })
    .catch(error => console.error('Error fetching sub-dropdown options:', error));
}




// suggestion for worker name
document.addEventListener('DOMContentLoaded', function () {
  const selectedFactory = document.getElementById('hidden工場').value;
  fetch(`${workerURL}?division=${selectedFactory}`)
    .then(response => response.json())
    .then(data => {
      const datalist = document.getElementById('machine-operator-suggestions');
      data.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        datalist.appendChild(opt);
      });
    })
    .catch(error => console.error('Error fetching worker name options:', error));
});



// suggestion for kensa name
document.addEventListener('DOMContentLoaded', function () {
  const selectedFactory = document.getElementById('hidden工場').value;
  fetch(`${workerURL}?division=${selectedFactory}`)
    .then(response => response.json())
    .then(data => {
      const datalist = document.getElementById('kensa-name-suggestions');
      data.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        datalist.appendChild(opt);
      });
    })
    .catch(error => console.error('Error fetching kensa name options:', error));
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

// this function puts back the values from storage to input values
function loadCounterValues() {
  const counterElements = document.querySelectorAll('[id^="counter-"]');
  counterElements.forEach(counterElement => {
    const counterId = counterElement.id.split('-')[1];
    const savedValue = localStorage.getItem(`counter-${counterId}`);
    
    if (savedValue !== null) {
      counterElement.value = savedValue;
    } else {
      counterElement.value = 0; // Default value if nothing is saved
    }
  });

  // Optionally, you may want to update the total after loading the values
  updateTotal();
}



// this updates the total quantity
function updateTotal() {
  let ngTotal = 0;
  for (let i = 1; i <= 12; i++) {
    const counterElement = document.getElementById(`counter-${i}`);
    ngTotal += parseInt(counterElement.value, 10);
  }
  document.getElementById('NG total').value = ngTotal;
  
  const processQuantity = parseInt(document.getElementById('ProcessQuantity').value, 10) || 0;
  const totalQuantity = processQuantity - ngTotal;
  document.getElementById('total').value = totalQuantity;
}

// Add event listener to process quantity input
document.getElementById('ProcessQuantity').addEventListener('input', updateTotal);



// these codes just variables for displaying info

const productNumberInput = document.getElementById('product-number');
const modelInput = document.getElementById('model');
const shapeInput = document.getElementById('shape');
const RLInput = document.getElementById('R-L');
const materialInput = document.getElementById('material');
const materialCodeInput = document.getElementById('material-code');
const materialColorInput = document.getElementById('material-color');
const rikeshiInput = document.getElementById('rikeshi');
const boxInput = document.getElementById('boxqty');

// global variable for ip address input container
const ipInput = document.getElementById('ipInfo');



// Function to fetch ip address
function getIP() {
  const machineName = document.getElementById('hidden設備').value;
  fetch(`${ipURL}?filter=${machineName}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, '');
      ipInput.value = cleanedData;
    })
    .catch(error => {
      console.error('Error:', error);
    });
}



// Function to fetch product info
function productNumberInfo(headerValue) {
  const factoryValue = document.getElementById('hidden工場').value; // Get the factory value
  fetch(`${dbURL}?productNumber=${headerValue}&factory=${factoryValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, '');
      productNumberInput.value = cleanedData;
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

// Function to fetch model info
function modelInfo(headerValue) {
  const factoryValue = document.getElementById('hidden工場').value; // Get the factory value
  fetch(`${dbURL}?model=${headerValue}&factory=${factoryValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, '');
      modelInput.value = cleanedData;
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

// Function to fetch shape info
function shapeInfo(headerValue) {
  const factoryValue = document.getElementById('hidden工場').value; // Get the factory value
  fetch(`${dbURL}?shape=${headerValue}&factory=${factoryValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, '');
      shapeInput.value = cleanedData;
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

// Function to fetch R-L info
function RLInfo(headerValue) {
  const factoryValue = document.getElementById('hidden工場').value; // Get the factory value
  fetch(`${dbURL}?rl=${headerValue}&factory=${factoryValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, '');
      RLInput.value = cleanedData;
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

// Function to fetch material info
function materialInfo(headerValue) {
  const factoryValue = document.getElementById('hidden工場').value; // Get the factory value
  fetch(`${dbURL}?material=${headerValue}&factory=${factoryValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, '');
      materialInput.value = cleanedData;
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

// Function to fetch material code info
function materialCodeInfo(headerValue) {
  const factoryValue = document.getElementById('hidden工場').value; // Get the factory value
  fetch(`${dbURL}?materialcode=${headerValue}&factory=${factoryValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, '');
      materialCodeInput.value = cleanedData;
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

// Function to fetch material color info
function materialColorInfo(headerValue) {
  const factoryValue = document.getElementById('hidden工場').value; // Get the factory value
  fetch(`${dbURL}?materialcolor=${headerValue}&factory=${factoryValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, '');
      materialColorInput.value = cleanedData;
    })
    .catch(error => {
      console.error('Error:', error);
    });
}



// Function to fetch rikeshi up or down color info
function getRikeshi(headerValue) {
  const factoryValue = document.getElementById('hidden工場').value; // Get the factory value
  const rikeshiInfo = document.getElementById("rikeshitext");
  fetch(`${dbURL}?rikeshi=${headerValue}&factory=${factoryValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, '');
      rikeshiInput.value = cleanedData;
      if (cleanedData == "上"){
        rikeshiInfo.textContent = cleanedData + " - Release paper UP";
      } else if (cleanedData == "下"){
        rikeshiInfo.textContent = cleanedData + " - Release paper DOWN";
      }
      
      sendtoShowVideo(cleanedData);
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

//function to get box value
function getBox(headerValue) {
  const factoryValue = document.getElementById('hidden工場').value; // Get the factory value
  fetch(`${dbURL}?box=${headerValue}&factory=${factoryValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, '');
      boxInput.value = cleanedData;
    })
    .catch(error => {
      console.error('Error:', error);
    });
}



// Function to get link from Google Drive
function picLINK(headerValue) {
  
  fetch(`${picURL}?link=${headerValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, '');
     
      updateImageSrc(cleanedData);
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

// Function to update the image src attribute
function updateImageSrc(link) {
  const imageElement = document.getElementById('dynamicImage');
  imageElement.src = `${link}&sz=s4000`; // this code puts the fetched link to the html picture div
}




//this function calculates time cycle = total / time (seconds/piece)
function calculateTotalTime() {
  const kStartTime = document.getElementById("KStart Time").value;
  const kEndTime = document.getElementById("KEnd Time").value;
  const startTime = document.getElementById("Start Time").value;
  const endTime = document.getElementById("End Time").value;
  const quantity = document.getElementById("ProcessQuantity").value;


  if (kStartTime && kEndTime && startTime && endTime) {
      const kStart = new Date(`1970-01-01T${kStartTime}:00Z`);
      const kEnd = new Date(`1970-01-01T${kEndTime}:00Z`);
      const start = new Date(`1970-01-01T${startTime}:00Z`);
      const end = new Date(`1970-01-01T${endTime}:00Z`);

      const kDiff = (kEnd - kStart) / 3600000; // Difference in hours
      const diff = (end - start) / 3600000; // Difference in hours

      const totalTime = kDiff + diff;
      

      const diffInSeconds = (end - start) / 1000; // Difference in seconds
      const cycleTime = (diffInSeconds) / quantity; // Cycle time in seconds

      // Display results
      document.getElementById("cycleTime").value = cycleTime.toFixed(2);

      document.getElementById("totalTime").value = totalTime.toFixed(2);
      
      
  } else if (startTime && endTime){
    
    const start = new Date(`1970-01-01T${startTime}:00Z`);
    const end = new Date(`1970-01-01T${endTime}:00Z`);

    
    const diff = (end - start) / 3600000; // Difference in hours

    const totalTime = 0 + diff;
    

    const diffInSeconds = (end - start) / 1000; // Difference in seconds
    const cycleTime = (diffInSeconds) / quantity; // Cycle time in seconds

    // Display results
    document.getElementById("cycleTime").value = cycleTime.toFixed(2);

    document.getElementById("totalTime").value = totalTime.toFixed(2);


  }

}



//this function is from index.html
function navigateTo(location) {
  window.location.href = `machine.html?selected=${location}`;
}



// Function to fetch printer info
const printerInput = document.getElementById('printerCode');

function printerCode(headerValue) {
  fetch(`${printerCodeURL}?printerCode=${headerValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      // Remove square brackets and double quotes
      const cleanedData = data.replace(/^[\["]+|[\]"]+$/g, '');
      printerInput.value = cleanedData;
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

//function to fetch printer name
function printerName() {
  const printerHostname = document.getElementById('printerHostname');
  const machineName = document.getElementById("hidden設備").value;
  fetch(`${printerCodeURL}?printerName=${machineName}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      // Remove square brackets and double quotes
      const cleanedData = data.replace(/^[\["]+|[\]"]+$/g, '');
      console.log("printerName: " + cleanedData);
      printerHostname.value = cleanedData;
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

//This visits a new page to print that shit
// print label from brothers printer
  document.getElementById('printLabel').addEventListener('click', function(event) {
    const currentSebanggo = document.getElementById('sub-dropdown').value;
    // Prevent the form from submitting
    event.preventDefault();
    if (!currentSebanggo) {
      window.alert("Please select product first / 背番号選んでください");
      return;
    }
    const ipAddress = document.getElementById('ipInfo').value;
    const printerHostname = document.getElementById('printerHostname').value;
    
    // Get the value of the hidden input field
    const printerCode = document.getElementById('printerCode').value;
    console.log("printerhostname: " + printerHostname);
    const url = `http://${ipAddress}:5001/print?text=${printerCode}&hostname=${printerHostname}`; //no need for raspberry pi anymore
    
    // Open a new tab with the desired URL
    const newWindow = window.open(url, '_blank', 'width=100,height=100,left=-1000,top=-1000');

        // Close the window after 5 seconds
        setTimeout(() => {
            if (newWindow) {
                newWindow.close();
            }
        }, 5000);
  });



//this function is just to send value of showVideo which is either rikeshidown or up
function sendtoShowVideo(rikeshivalue){
  
      if (rikeshivalue == "下") {
        showVideo('rikeshidown');
      } 
      else if (rikeshivalue == "上") {
        showVideo('rikeshiup');
      }
}



// this code is to show video either up or down rikeshi

let videoTimeout;
let isRikeshiPlaying = false; // Flag to check if rikeshi.mp4 is already playing

function showVideo(videoToShowId) {
  const videoContainer = document.getElementById('videoContainer');
  const videoToShow = document.getElementById(videoToShowId);
  const allVideos = document.querySelectorAll('.video-element');

  // Hide all video elements and pause them
  allVideos.forEach(video => {
    video.classList.add('hidden');
    video.classList.remove('active-video');
    video.pause();
    video.currentTime = 0;
  });

  // Show the video container and the specific video
  videoContainer.classList.remove('hidden');
  videoToShow.classList.remove('hidden');
  videoToShow.classList.add('active-video');

  // Set playback speed to 1.8x
  videoToShow.playbackRate = 1.8;

  // Autoplay the video
  videoToShow.play();

  // Clear any existing timeout and set a new one
  clearTimeout(videoTimeout);
  videoTimeout = setTimeout(closeVideoPopup, 4000);
}

function closeVideoPopup() {
  window.alert("CONFIRM RELEASE PAPER DIRECTION");
  window.alert("離型紙セット確認する事");
  const videoContainer = document.getElementById('videoContainer');
  const allVideos = document.querySelectorAll('.video-element');

  // Hide the video container and all videos
  videoContainer.classList.add('hidden');
  allVideos.forEach(video => {
    video.classList.add('hidden');
    video.pause();
    video.currentTime = 0;
  });

  // Reset the flag
  isRikeshiPlaying = false;
}



// Listener for the hatsumono Button
document.getElementById('hatsumonoButton').addEventListener('click', function(event) {
  event.preventDefault();
  const currentSebanggo = document.getElementById('sub-dropdown').value;
  const currentWorker = document.getElementById('Machine Operator').value;
  const buttonValue = "hatsumono";
  if (!currentSebanggo) {
      window.alert("Please select product first / 背番号選んでください");
      return;
  }

  const popup = window.open(`hatsumono.html?sebanggo=${encodeURIComponent(currentSebanggo)}&kojo=${encodeURIComponent(selectedFactory)}&buttonValue=${encodeURIComponent(buttonValue)}&worker=${encodeURIComponent(currentWorker)}`, 'QR Scanner', 'width=700,height=700');

  window.addEventListener('message', function(event) {
      if (event.origin === window.location.origin) {
          const hatsumonoStatus = event.data;
          console.log(`HatsumonoStatus: ${hatsumonoStatus}`);

          // Update hidden inputs based on the received data
          for (const [key, value] of Object.entries(hatsumonoStatus)) {
              const input = document.getElementById(key.toLowerCase().replace(/\s+/g, '-'));
              if (input) {
                  input.value = value;
              }
          }
          document.getElementById("hatsumonoLabel").textContent = "OK";
          localStorage.setItem("hatsumonoLabel","OK");
      }
  });
});

// Listener for the atomono Button
document.getElementById('atomonoButton').addEventListener('click', function(event) {
  event.preventDefault();
  const currentSebanggo = document.getElementById('sub-dropdown').value;
  const currentWorker = document.getElementById('Machine Operator').value;
  const buttonValue = "atomono";
  if (!currentSebanggo) {
      window.alert("Please select product first / 背番号選んでください");
      return;
  }

  const popup = window.open(`hatsumono.html?sebanggo=${encodeURIComponent(currentSebanggo)}&kojo=${encodeURIComponent(selectedFactory)}&buttonValue=${encodeURIComponent(buttonValue)}&worker=${encodeURIComponent(currentWorker)}`, 'QR Scanner', 'width=700,height=700');

  window.addEventListener('message', function(event) {
      if (event.origin === window.location.origin) {
          const atomonoStatus = event.data;
          console.log(`AtomonoStatus: ${atomonoStatus}`);

          // Since no checkbox data is expected, just update the label
          document.getElementById("atomonoLabel").textContent = "OK";
          localStorage.setItem("atomonoLabel","OK");
      }
  });
});

//this function is for ARDUINO command (command value should be "on" or "off")
async function sendCommand(command) {
  const ipAddress = document.getElementById('ipInfo').value;
  const url = `http://${ipAddress}:5000/control?command=${encodeURIComponent(command)}`;
  
  // Get the existing hidden iframe or create one if it doesn't exist
  let iframe = document.getElementById('hiddenIframe');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'hiddenIframe';
    iframe.style.display = 'none'; // Make the iframe invisible
    document.body.appendChild(iframe);
  }

  // Set the iframe source to the URL
  iframe.src = url;

  // Remove the iframe after 2 seconds
  setTimeout(() => {
      iframe.src = ''; // Clear the iframe source
  }, 1000);
}





// this function waits for 1 mins to see if send to NC button is pressed, if not it will pop up and force the user to send to machine
var popupShown = false;
var audio = new Audio('src/alert.mp3');
audio.loop = true; // Set the audio to loop

// Function to show the popup
function showPopup() {
    sendCommand('on');
    console.log("LED on");
  
    if (!popupShown) {
        // Create the popup elements
        var popup = document.createElement('div');
        popup.style.position = 'fixed';
        popup.style.top = '50%';
        popup.style.left = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.padding = '20px';
        popup.style.backgroundColor = 'white';
        popup.style.border = '1px solid black';
        popup.style.zIndex = '1000';

        var message = document.createElement('p');
        message.textContent = 'Please press "send to machine" button! GAGO! / "send to machine" ボタンを押してください';
        popup.appendChild(message);

        var button = document.createElement('button');
        button.textContent = 'Send to Machine';
        button.onclick = function() {
            sendtoNCButtonisPressed = true;
            localStorage.setItem('sendtoNCButtonisPressed', 'true'); // Store the value in local storage
            sendtoNC(); // Call the sendtoNC function
            console.log("sendtoNC function called");
            document.body.removeChild(popup);
            audio.pause(); // Stop the audio
            audio.currentTime = 0; // Reset the audio to the beginning
        };
        popup.appendChild(button);

        document.body.appendChild(popup);
        popupShown = true; // Set the flag to true after showing the popup
        audio.play(); // Play the audio
    }
}

// Function to check the value every 1 minute
function checkValue() {
  
    var interval = setInterval(function() {
        console.log("selectedFactory: " + selectedFactory);
        if (selectedFactory !== "小瀬") {
          return; // Skip the check if selectedFactory is not "小瀬"
        }
        if (localStorage.getItem('sendtoNCButtonisPressed') === null) {
          return; // Skip the check if the key is not present in local storage
        }
        var sendtoNCButtonisPressed = localStorage.getItem('sendtoNCButtonisPressed') === 'true'; // Retrieve the value from local storage

        if (sendtoNCButtonisPressed) {
            clearInterval(interval); // Stop checking if the value is true
           
        } else {
          
          showPopup();
        }
    }, 30000); // 30000 milliseconds =  30 seconds
}

// Run the checkValue function when the page loads
window.onload = checkValue;


      