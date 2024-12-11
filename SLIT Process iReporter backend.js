const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";

// this code will ping the Render website for inactivity
const interval = 30000; // 30 seconds
function pingServer() {
  fetch(`${serverURL}/getSeBanggoList`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      console.log(
        `Pinged at ${new Date().toISOString()}: Status Code ${response.status}`
      );
    })
    .catch((error) => {
      console.error(
        `Error pinging at ${new Date().toISOString()}:`,
        error.message
      );
    });
}
setInterval(pingServer, interval);

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

// gets all the sebanggo list
document.addEventListener("DOMContentLoaded", () => {
  const subDropdown = document.getElementById("sub-dropdown");

  // Fetch 背番号 list from the server
  fetch(`${serverURL}/getSeBanggoList`)
    .then((response) => response.json())
    .then((data) => {
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
    const response = await fetch(
      `${serverURL}/getProductDetails?serialNumber=${encodeURIComponent(
        serialNumber
      )}&factory=${encodeURIComponent(factory)}`
    );
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
      document.getElementById("送りピッチ").textContent =
        "送りピッチ: " + data.送りピッチ || "";

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
document
  .getElementById("sub-dropdown")
  .addEventListener("change", fetchProductDetails);

// when time is pressed
function setDefaultTime(input) {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timeValue = `${hours}:${minutes}`;
  input.value = timeValue;

  // Save the time to local storage beyatch
  localStorage.setItem(input.id, timeValue);
}

// When date is pressed or on page load, set current date as default
function setDefaultDate(input) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateValue = `${year}-${month}-${day}`;
  input.value = dateValue;

  // Save the date to local storage
  localStorage.setItem(input.id, dateValue);
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
      const dataList = document.getElementById("machine-operator-suggestions");
      dataList.innerHTML = ""; // Clear any existing options

      workerNames.forEach((name) => {
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
document
  .querySelector('form[name="contact-form"]')
  .addEventListener("submit", async (event) => {
    event.preventDefault(); // Prevent default form submission behavior
    updateCycleTime();

    const alertSound = document.getElementById("alert-sound");
    const scanAlertModal = document.getElementById("scanAlertModal");
    const scanAlertText = document.getElementById("scanAlertText");

    // Preload the alert sound without playing it
    if (alertSound) {
      alertSound.muted = true; // Mute initially to preload
      alertSound.loop = false; // Disable looping
      alertSound.load(); // Preload the audio file
    }

    try {
      // Get form data
      const 品番 = document.getElementById("product-number").value;
      const 背番号 = document.getElementById("sub-dropdown").value;
      const Total = parseInt(document.getElementById("total").value, 10) || 0;
      const Worker_Name = document.getElementById("Machine Operator").value;
      const Date = document.getElementById("Lot No.").value;
      const Time_start = document.getElementById("Start Time").value;
      const Time_end = document.getElementById("End Time").value;
      const 設備 = document.getElementById("process").value;
      const 疵引不良 =
        parseInt(document.getElementById("counter-18").value, 10) || 0;
      const 加工不良 =
        parseInt(document.getElementById("counter-19").value, 10) || 0;
      const その他 =
        parseInt(document.getElementById("counter-20").value, 10) || 0;
      const Total_NG =
        parseInt(document.getElementById("Total_NG").value, 10) || 0;
      const Spare = parseInt(document.getElementById("spare").value, 10) || 0;
      const Comment = document.querySelector(
        'textarea[name="Comments1"]'
      ).value;
      const 工場 = document.getElementById("selected工場").value;
      const Process_Quantity =
        parseInt(document.getElementById("ProcessQuantity").value, 10) || 0;
      const Cycle_Time =
        parseFloat(document.getElementById("cycleTime").value) || 0;
      const 製造ロット = document.getElementById("製造ロット").value;

      // Check if 背番号 is selected
      if (!背番号) {
        // Show alert modal
        scanAlertText.innerText = "背番号が必要です。 / Sebanggo is required.";
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

        // Close modal on button click
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

        return; // Stop the submission process
      }

      // Get the values of the counters
      const counters = Array.from({ length: 12 }, (_, i) => {
        const counter = document.getElementById(`counter-${i + 1}`);
        return parseInt(counter?.value || 0, 10);
      });

      // Prepare data for saving to slitDB
      const formData = {
        品番,
        背番号,
        Total,
        Worker_Name,
        Date,
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

      console.log("Data to save to kensaDB:", formData);

      // Save to kensaDB
      const saveResponse = await fetch(`${serverURL}/submitToSlitDBiReporter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.error || "Failed to save data to kensaDB");
      }

      console.log("Form data saved to kensaDB successfully.");

      // Show success modal with blinking green background
      scanAlertText.innerText = "Form submitted successfully / 保存しました";
      scanAlertModal.style.display = "block";
      document.body.classList.add("flash-green");

      // Reload the page after closing the modal
      const closeScanModalButton = document.getElementById(
        "closeScanModalButton"
      );
      closeScanModalButton.onclick = function () {
        scanAlertModal.style.display = "none";
        document.body.classList.remove("flash-green");
        window.location.reload();
      };
    } catch (error) {
      console.error("Error during submission:", error);

      // Show error modal with blinking red background
      scanAlertText.innerText = "An error occurred. Please try again.";
      scanAlertModal.style.display = "block";

      // Play alert sound
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound
          .play()
          .catch((error) =>
            console.error("Failed to play alert sound:", error)
          );
      }

      // Add blinking red background
      document.body.classList.add("flash-red");

      // Close modal on button click
      const closeScanModalButton = document.getElementById(
        "closeScanModalButton"
      );
      closeScanModalButton.onclick = function () {
        scanAlertModal.style.display = "none";
        alertSound.pause();
        alertSound.currentTime = 0;
        alertSound.muted = true;
        document.body.classList.remove("flash-red");
      };
    }
  });

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

// function to reset everything then reloads the page
function resetForm() {
  // Clear all form inputs
  const inputs = document.querySelectorAll("input, select, textarea");
  inputs.forEach((input) => {
    input.value = "";
  });

  // Clear counters
  for (let i = 1; i <= 18; i++) {
    localStorage.removeItem(`counter-${i}`);
    const counterElement = document.getElementById(`counter-${i}`);
    if (counterElement) {
      counterElement.value = "0"; // Reset the counter display to 0
    }
  }

  // Clear checkbox state and other specific items
  localStorage.removeItem("enable-inputs-checkbox");
  localStorage.removeItem("検査STATUS");
  localStorage.removeItem("sendtoNCButtonisPressed");
  localStorage.removeItem("hatsumonoLabel");
  localStorage.removeItem("atomonoLabel");
  localStorage.removeItem("product-number");
  localStorage.removeItem("process");
  localStorage.removeItem("SRShatsumonoLabel");

  // Uncheck the checkbox and disable inputs
  const checkbox = document.getElementById("enable-inputs");
  if (checkbox) {
    checkbox.checked = false;
    toggleInputs(); // Reuse the existing toggleInputs function to disable the inputs
  }

  // Remove all other form-related local storage items
  inputs.forEach((input) => {
    localStorage.removeItem(input.name);
  });

  // reload the page
  window.location.reload();
}
