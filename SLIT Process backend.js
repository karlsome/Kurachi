

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
    const response = await fetch(`http://localhost:3000/getProductDetails?serialNumber=${encodeURIComponent(serialNumber)}&factory=${encodeURIComponent(factory)}`);
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
      const response = await fetch(`http://localhost:3000/getWorkerNames?selectedFactory=${encodeURIComponent(selectedFactory)}`);
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

// Submit Button Logic
document.querySelector('form[name="contact-form"]').addEventListener('submit', async (event) => {
  event.preventDefault(); // Prevent default form submission behavior

  try {
    // Get form data
    const uniqueID = document.getElementById('uniqueID').value;
    const ScannedQR = document.getElementById('tracking-QR').value;
    const 品番 = document.getElementById('product-number').value;
    const 背番号 = document.getElementById('sub-dropdown').value;
    const Total = parseInt(document.getElementById('total').value, 10) || 0;
    const Remaining_Quantity = parseInt(document.getElementById('Remaining_Quantity').value, 10) || 0;
    const SLITRemaining_Quantity = Total; // Set Remaining_Quantity in slitDB to Total
    const Worker_Name = document.getElementById('Machine Operator').value;
    const Date = document.getElementById('Lot No.').value;
    const Time_start = document.getElementById('Start Time').value;
    const Time_end = document.getElementById('End Time').value;
    const 設備 = document.getElementById('process').value;
    const 疵引不良 = parseInt(document.getElementById('counter-18').value, 10) || 0;
    const 加工不良 = parseInt(document.getElementById('counter-19').value, 10) || 0;
    const その他 = parseInt(document.getElementById('counter-20').value, 10) || 0;
    const Total_NG = parseInt(document.getElementById('Total_NG').value, 10) || 0;
    const Spare = parseInt(document.getElementById('spare').value, 10) || 0;

    // Prepare data for saving to slitDB
    const formData = {
      uniqueID,
      ScannedQR,
      品番,
      背番号,
      Total,
      Remaining_Quantity: SLITRemaining_Quantity, // Use Total for Remaining_Quantity in slitDB
      Worker_Name,
      Date,
      Time_start,
      Time_end,
      設備,
      疵引不良,
      加工不良,
      その他,
      Total_NG,
      Spare,
    };

    console.log('Data to save to slitDB:', formData);

    // Save to slitDB
    const saveResponse = await fetch('http://localhost:3000/submitToSlitDB', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!saveResponse.ok) {
      throw new Error('Failed to save data to slitDB');
    }

    console.log('Form data saved to slitDB successfully.');

    // Calculate new Remaining_Quantity for pressDB
    const newRemainingQuantity = Remaining_Quantity - Total;


    alert('Form submitted and updated successfully.');
  } catch (error) {
    console.error('Error during submission:', error);
    alert('An error occurred. Please try again.');
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


// SLIT Scan Button
document.getElementById('scan-button').addEventListener('click', function () {
  const qrScannerModal = document.getElementById('qrScannerModal');
  const html5QrCode = new Html5Qrcode("qrReader");

  qrScannerModal.style.display = 'block';

  html5QrCode
    .start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (qrCodeMessage) => {
        console.log("Scanned QR Code:", qrCodeMessage);
        document.getElementById("tracking-QR").value = qrCodeMessage;

        // Send the scanned QR code to the server
        try {
          const response = await fetch("http://localhost:3000/processSLIT", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ScannedQR: qrCodeMessage }),
          });

          const data = await response.json();

          if (response.status !== 200) {
            alert(data.error || "Error processing QR");
            return;
          }

          // Populate the inputs with the retrieved data
          if (data.source === "pressDB") {
            document.getElementById("uniqueID").value = data.uniqueID || "";
            document.getElementById("Remaining_Quantity").value = data.pressDB_Remaining_Quantity || "";

            // Update the label to indicate the source of Remaining Quantity
            const rqLabel = document.getElementById("rqLabel");
            rqLabel.innerText = `Remaining Quantity (Source: ${data.source})`;

            // Set 背番号 to id="sub-dropdown"
            document.getElementById("sub-dropdown").value = data.背番号 || "";
            console.log("sebanggo" + data.背番号);

            // Trigger fetchProductDetails() if sub-dropdown is set
            if (document.getElementById("sub-dropdown").value) {
              fetchProductDetails();
            }

            console.log("SLIT Data processed successfully!");
          }
        } catch (error) {
          console.error("Error processing QR:", error);
          alert("Error communicating with the server.");
        } finally {
          html5QrCode.stop().then(() => {
            qrScannerModal.style.display = 'none';
          }).catch((err) => console.error("Failed to stop scanning:", err));
        }
      }
    )
    .catch((err) => console.error("Failed to start scanning:", err));

  document.getElementById('closeQRScannerModal').onclick = function () {
    html5QrCode.stop().then(() => {
      qrScannerModal.style.display = 'none';
    }).catch((err) => console.error("Failed to stop scanning:", err));
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