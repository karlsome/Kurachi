

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
  const counter13 = parseInt(document.getElementById('counter-13').value, 10) || 0;
  const counter14 = parseInt(document.getElementById('counter-14').value, 10) || 0;
  const counter15 = parseInt(document.getElementById('counter-15').value, 10) || 0;
  const counter16 = parseInt(document.getElementById('counter-16').value, 10) || 0;
  const counter17 = parseInt(document.getElementById('counter-17').value, 10) || 0;

  // Calculate Total_NG
  const totalNG = counter13 + counter14 + counter15 + counter16 + counter17;

  // Update the Total_NG field
  document.getElementById('Total_NG').value = totalNG;

  // Calculate Total
  const total = processQuantity - totalNG;

  // Update the Total field
  document.getElementById('total').value = total;
}

// Attach updateTotal to relevant events
document.getElementById('ProcessQuantity').addEventListener('input', updateTotal);




// //Submit Button
// // Submit Button Logic
// document.querySelector('form[name="contact-form"]').addEventListener('submit', async (event) => {
//   event.preventDefault(); // Prevent default form submission behavior

//   try {
//     // Get form data
//     const uniqueID = document.getElementById('uniqueID').value;
//     const ScannedQR = document.getElementById('tracking-QR').value;
//     const 品番 = document.getElementById('product-number').value;
//     const 背番号 = document.getElementById('sub-dropdown').value;
//     const Total = parseInt(document.getElementById('total').value, 10) || 0; // Total is used as Remaining_Quantity for SRSDB
//     const SRSRemaining_Quantity = Total; // Remaining_Quantity for SRSDB is the value of Total
//     const Remaining_Quantity = parseInt(document.getElementById('Remaining_Quantity').value, 10) || 0; // Current Remaining_Quantity for source
//     const Worker_Name = document.getElementById('Machine Operator').value;
//     const Process_Quantity = parseInt(document.getElementById('ProcessQuantity').value, 10) || 0;
//     const Date = document.getElementById('Lot No.').value;
//     const Time_start = document.getElementById('Start Time').value;
//     const Time_end = document.getElementById('End Time').value;
//     const 設備 = document.getElementById('process').value;

//     // Counters
//     const counter13 = parseInt(document.getElementById('counter-13').value, 10) || 0;
//     const counter14 = parseInt(document.getElementById('counter-14').value, 10) || 0;
//     const counter15 = parseInt(document.getElementById('counter-15').value, 10) || 0;
//     const counter16 = parseInt(document.getElementById('counter-16').value, 10) || 0;
//     const counter17 = parseInt(document.getElementById('counter-17').value, 10) || 0;

//     // SRS_Total_NG Calculation
//     const SRS_Total_NG = counter13 + counter14 + counter15 + counter16 + counter17;

//     // Prepare data for saving to SRSDB
//     const formData = {
//       uniqueID,
//       ScannedQR,
//       品番,
//       背番号,
//       Total,
//       Remaining_Quantity: SRSRemaining_Quantity, // Use Total for Remaining_Quantity in SRSDB
//       Worker_Name,
//       Process_Quantity,
//       Date,
//       Time_start,
//       Time_end,
//       設備,
//       '13-くっつき・めくれ': counter13,
//       '14-シワ': counter14,
//       '15-転写位置ズレ': counter15,
//       '16-転写不良': counter16,
//       '17-その他': counter17,
//       SRS_Total_NG,
//     };

//     console.log('Data to save to SRSDB:', formData);

//     // Save to SRSDB
//     const saveResponse = await fetch('http://localhost:3000/submitToSRSDB', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(formData),
//     });

//     if (!saveResponse.ok) {
//       throw new Error('Failed to save data to SRSDB');
//     }

//     console.log('Form data saved to SRSDB successfully.');

//     // Calculate new Remaining_Quantity
//     const newRemainingQuantity = Remaining_Quantity - Process_Quantity;

//     // Determine source (slitDB or pressDB) based on the label
//     const rqLabelText = document.getElementById('rqLabel').innerText;
//     const source = rqLabelText.includes('slitDB') ? 'slitDB' : 'pressDB';

//     console.log('Source determined as:', source);

//     // Update Remaining_Quantity in the source database
//     const updateResponse = await fetch(`http://localhost:3000/updateRemainingQuantity`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         source,
//         Remaining_Quantity: newRemainingQuantity,
//         uniqueID, // Include uniqueID in the request body
//       }),
//     });

//     if (!updateResponse.ok) {
//       throw new Error('Failed to update Remaining_Quantity');
//     }

//     console.log('Remaining Quantity updated successfully.');

//     alert('Form submitted and Remaining Quantity updated successfully.');
//   } catch (error) {
//     console.error('Error during submission:', error);
//     alert('An error occurred. Please try again.');
//   }
// });

// Submit Button for SRS Process
document.querySelector('form[name="contact-form"]').addEventListener('submit', async (event) => {
  event.preventDefault(); // Prevent default form submission behavior

  try {
    // Get form data
    const uniqueID = document.getElementById('uniqueID').value;
    const ScannedQR = document.getElementById('tracking-QR').value;
    const 品番 = document.getElementById('product-number').value;
    const 背番号 = document.getElementById('sub-dropdown').value;
    const Total = parseInt(document.getElementById('total').value, 10) || 0;
    const Worker_Name = document.getElementById('Machine Operator').value;
    const Process_Quantity = parseInt(document.getElementById('ProcessQuantity').value, 10) || 0;
    const Remaining_Quantity = Total; // Set Remaining_Quantity in SRSDB to Total
    const Date = document.getElementById('Lot No.').value;
    const Time_start = document.getElementById('Start Time').value;
    const Time_end = document.getElementById('End Time').value;
    const 設備 = document.getElementById('process').value;

    // Counters
    const counter13 = parseInt(document.getElementById('counter-13').value, 10) || 0;
    const counter14 = parseInt(document.getElementById('counter-14').value, 10) || 0;
    const counter15 = parseInt(document.getElementById('counter-15').value, 10) || 0;
    const counter16 = parseInt(document.getElementById('counter-16').value, 10) || 0;
    const counter17 = parseInt(document.getElementById('counter-17').value, 10) || 0;

    // SRS_Total_NG Calculation
    const SRS_Total_NG = counter13 + counter14 + counter15 + counter16 + counter17;

    // Prepare data for saving to SRSDB
    const formData = {
      uniqueID,
      ScannedQR,
      品番,
      背番号,
      Total,
      Worker_Name,
      Process_Quantity,
      Remaining_Quantity,
      Date,
      Time_start,
      Time_end,
      設備,
      '13-くっつき・めくれ': counter13,
      '14-シワ': counter14,
      '15-転写位置ズレ': counter15,
      '16-転写不良': counter16,
      '17-その他': counter17,
      SRS_Total_NG,
    };

    console.log('Data to save to SRSDB:', formData);

    // Save to SRSDB
    const saveResponse = await fetch('http://localhost:3000/submitToSRSDB', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!saveResponse.ok) {
      throw new Error('Failed to save data to SRSDB');
    }

    console.log('Form data saved to SRSDB successfully.');
    const newRemainingQuantity = Remaining_Quantity - Total;

    // // Update currentCountDB for SRS process
    // const updateResponse = await fetch('http://localhost:3000/updateRemainingQuantity', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     uniqueID,
    //     Remaining_Quantity: newRemainingQuantity,
    //     source: 'SRSDB',
    //   }),
    // });

    // if (!updateResponse.ok) {
    //   throw new Error('Failed to update current count in currentCountDB');
    // }

    //console.log('currentCountDB updated successfully.');

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




//Scan Button for SRS
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
          const response = await fetch("http://localhost:3000/processSRS", {
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
          if (data.source === "slitDB" || data.source === "pressDB") {
            document.getElementById("uniqueID").value = data.uniqueID || "";
            document.getElementById("Remaining_Quantity").value = data.Remaining_Quantity || "";

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

            console.log("SRS Data processed successfully!");
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