const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";

// this code will ping the Render website for inactivity
const interval = 60000; // 30 seconds
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

// Function to sync the values of "process" and "processRH"
function syncProcessValues() {
  const process = document.getElementById("process");
  const processRH = document.getElementById("processRH");

  // Set the initial value on page load
  processRH.value = process.value;

  // Update the value whenever "process" changes
  process.addEventListener("change", () => {
    processRH.value = process.value;
  });
}
window.onload = syncProcessValues;



// This code will mirror Worker's Name
// Select the Machine Operator and Machine OperatorRH fields
const WorkerName = document.getElementById("Machine Operator");
const WorkerNameRH = document.getElementById("Machine OperatorRH");

// Add an event listener to mirror input value
WorkerName.addEventListener("input", () => {
  WorkerNameRH.value = WorkerName.value; // Mirror the value

  // Trigger the same logic as other inputs to save to localStorage
  const selected工場 = document.getElementById('selected工場').value;
  const pageName = location.pathname.split('/').pop();
  const keyRH = `${pageName}_${selected工場}_${WorkerNameRH.id || WorkerNameRH.name}`;
  
  // Save the mirrored value for WorkerNameRH
  localStorage.setItem(keyRH, WorkerNameRH.value);
});

// Load initial values from localStorage on page load
document.addEventListener("DOMContentLoaded", () => {
  const selected工場 = document.getElementById('selected工場').value;
  const pageName = location.pathname.split('/').pop();
  const keyRH = `${pageName}_${selected工場}_${WorkerNameRH.id || WorkerNameRH.name}`;

  // Retrieve and set the saved value for WorkerNameRH
  const savedWorkerNameRH = localStorage.getItem(keyRH);
  if (savedWorkerNameRH) WorkerNameRH.value = savedWorkerNameRH;
});



// Select all input, select, and button elements
const inputs = document.querySelectorAll('input, select, button,textarea');
const selected工場 = document.getElementById('selected工場').value; // Get the current factory value
const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
const uniquePrefix = `${pageName}_${selected工場}_`;

// Save the value of each input to localStorage on change
inputs.forEach(input => {
    input.addEventListener('input', () => {
        const key = `${pageName}_${selected工場}_${input.id || input.name}`; // Prefix key with pageName and selected工場
        if (key) {
            localStorage.setItem(key, input.value);
        }
    });

    if (input.type === 'checkbox' || input.type === 'radio') {
        input.addEventListener('change', () => {
            const key = `${pageName}_${selected工場}_${input.id || input.name}`;
            if (key) {
                localStorage.setItem(key, input.checked); // Save checkbox/radio state
            }
        });
    }
});



// Restore the values of input fields, images, and textContent from localStorage on page load
document.addEventListener('DOMContentLoaded', () => {
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
      if (key.startsWith(`${pageName}_${selected工場}_`)) {
          const savedValue = localStorage.getItem(key);

          if (savedValue !== null) {
              // Match each input with its respective localStorage key
              inputs.forEach(input => {
                  const inputKey = `${pageName}_${selected工場}_${input.id || input.name}`;
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
                                  fetchProductDetailsRH();
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
                  const textKey = `${pageName}_${selected工場}_${element.id}.textContent`;
                  if (key === textKey) {
                      element.textContent = savedValue; // Restore textContent
                      console.log(`Restored textContent for ${element.id}:`, savedValue);
                  }
              });

              // Restore image sources dynamically
              images.forEach(image => {
                  const imageKey = `${pageName}_${selected工場}_${image.id || image.name}.src`;
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





//blanks the info page
function blankInfo() {
  // Clear the value of the label with id "SRScode"
  //document.getElementById("SRScode").textContent = "";

  // Clear the values of all input fields
  document.getElementById("product-number").value = "";
  document.getElementById("model").value = "";
  document.getElementById("shape").value = "";
  document.getElementById("R-L").value = "";
  document.getElementById("labelCode").value="";
}
function blankInfoRH() {
  // Clear the value of the label with id "SRScode"
  //document.getElementById("SRScode").textContent = "";

  // Clear the values of all input fields
  document.getElementById("product-numberRH").value = "";
  document.getElementById("modelRH").value = "";
  document.getElementById("shapeRH").value = "";
  document.getElementById("R-LRH").value = "";
  document.getElementById("labelCodeRH").value="";
}



// Clears The LH form and associated localStorage data
function clearForm() {
  // Get all input elements within the LH form
  const form = document.querySelector('form[name="LH-form"]');
  const inputs = form.querySelectorAll('input, textarea');
  const dropdown = document.getElementById("sub-dropdown");
  const dynamicImage = document.getElementById("dynamicImage");
  const selected工場 = document.getElementById("selected工場").value; // Get the current factory value
  const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
  const uniquePrefix = `${pageName}_${selected工場}_`; // Define the prefix for localStorage keys
  const counters = [
    "counter-13",
    "counter-14",
    "counter-15",
    "counter-16",
    "counter-17",
    "counter-23",
  ];

  // Clear all input fields and textareas
  inputs.forEach((input) => {
    if (input.type === "hidden" && input.id === "selected工場") {
      return; // Skip clearing this specific input
    }

    const key = `${uniquePrefix}${input.id || input.name}`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key); // Clear associated localStorage data
    }

    if (
      input.type === "hidden" ||
      input.type === "text" ||
      input.type === "number" ||
      input.type === "date" ||
      input.type === "time" ||
      input.tagName.toLowerCase() === "textarea"
    ) {
      input.value = ""; // Reset value
    }
    if (input.type === "checkbox" || input.type === "radio") {
      input.checked = false; // Uncheck checkboxes and radio buttons
    }
  });

  // Explicitly clear the Comments1 textarea
  const commentsTextarea = form.querySelector('textarea[name="Comments1"]');
  if (commentsTextarea) {
    const key = `${uniquePrefix}${commentsTextarea.name}`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key); // Clear associated localStorage data
    }
    commentsTextarea.value = ""; // Clear its value
  }

  // Reset the counters to 0
  counters.forEach((counterId) => {
    const counter = document.getElementById(counterId);
    if (counter) {
      const key = `${uniquePrefix}${counterId}`;
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key); // Clear associated localStorage data
      }
      counter.value = 0;
    }
  });

  // Reset the dropdown
  if (dropdown) {
    const key = `${uniquePrefix}${dropdown.id}`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key); // Clear associated localStorage data
    }
    dropdown.selectedIndex = 0; // Set to the default option
  }

  // Clear the image
  if (dynamicImage) {
    dynamicImage.src = ""; // Remove the image source
    dynamicImage.alt = "Image Description"; // Reset alt text if needed
    dynamicImage.style.display = "none"; // Hide the image
  }
  // Clear hatsumonoLabel and hatsumonoPic data from localStorage
  if (hatsumonoLabel) {
    const key = `${uniquePrefix}hatsumonoLabel.textContent`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key); // Remove hatsumonoLabel data
    }
    hatsumonoLabel.textContent = "FALSE"; 
  }

  if (hatsumonoPic) {
    const key = `${uniquePrefix}hatsumonoPic.src`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key); // Remove hatsumonoPic data
    }
    hatsumonoPic.src = ""; // Clear the image source
    hatsumonoPic.style.display = "none"; // Hide the image
  }

  console.log("LH form cleared successfully, including associated localStorage data.");
}





// Clears the RH form and associated localStorage data
function clearFormRH() {
  // Get all input elements within the RH form
  const form = document.querySelector('form[name="RH-form"]');
  const inputs = form.querySelectorAll('input, textarea');
  const dropdown = document.getElementById("sub-dropdownRH");
  const dynamicImage = document.getElementById("dynamicImageRH");
  const selected工場 = document.getElementById("selected工場").value; // Get the current factory value
  const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
  const uniquePrefix = `${pageName}_${selected工場}_`; // Define the prefix for localStorage keys
  const counters = [
    "counter-18",
    "counter-19",
    "counter-20",
    "counter-21",
    "counter-22",
    "counter-24",
  ];

  // Clear all input fields and textareas
  inputs.forEach((input) => {
    if (input.type === "hidden" && input.id === "selected工場") {
      return; // Skip clearing this specific input
    }

    const key = `${uniquePrefix}${input.id || input.name}`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key); // Clear associated localStorage data
    }

    if (
      input.type === "hidden" ||
      input.type === "text" ||
      input.type === "number" ||
      input.type === "date" ||
      input.type === "time" ||
      input.tagName.toLowerCase() === "textarea"
    ) {
      input.value = ""; // Reset value
    }
    if (input.type === "checkbox" || input.type === "radio") {
      input.checked = false; // Uncheck checkboxes and radio buttons
    }
  });

  // Explicitly clear the Comments2 textarea
  const commentsTextarea = form.querySelector('textarea[name="Comments2"]');
  if (commentsTextarea) {
    const key = `${uniquePrefix}${commentsTextarea.name}`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key); // Clear associated localStorage data
    }
    commentsTextarea.value = ""; // Clear its value
  }

  // Reset the counters to 0
  counters.forEach((counterId) => {
    const counter = document.getElementById(counterId);
    if (counter) {
      const key = `${uniquePrefix}${counterId}`;
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key); // Clear associated localStorage data
      }
      counter.value = 0;
    }
  });

  // Reset the dropdown
  if (dropdown) {
    const key = `${uniquePrefix}${dropdown.id}`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key); // Clear associated localStorage data
    }
    dropdown.selectedIndex = 0; // Set to the default option
  }

  // Clear the image
  if (dynamicImage) {
    dynamicImage.src = ""; // Remove the image source
    dynamicImage.alt = "Image Description"; // Reset alt text if needed
    dynamicImage.style.display = "none"; // Hide the image
  }

  // Clear hatsumonoLabel and hatsumonoPic data from localStorage
  if (hatsumonoLabelRH) {
    const key = `${uniquePrefix}hatsumonoLabelRH.textContent`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key); // Remove hatsumonoLabel data
    }
    hatsumonoLabelRH.textContent = "FALSE"; 
  }

  if (hatsumonoPicRH) {
    const key = `${uniquePrefix}hatsumonoPicRH.src`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key); // Remove hatsumonoPic data
    }
    hatsumonoPicRH.src = ""; // Clear the image source
    hatsumonoPicRH.style.display = "none"; // Hide the image
  }

  console.log("RH form cleared successfully, including associated localStorage data.");
}





// // gets all the sebanggo list
// document.addEventListener("DOMContentLoaded", () => {
//   const subDropdown = document.getElementById("sub-dropdown");

//   // Fetch 背番号 list from the server
//   fetch(`${serverURL}/getSeBanggoListLH`)
//     .then((response) => response.json())
//     .then((data) => {
//       // Clear existing options
//       subDropdown.innerHTML = "";

//       // Add a default "Select 背番号" option
//       const defaultOption = document.createElement("option");
//       defaultOption.value = "";
//       defaultOption.textContent = "Select 背番号";
//       defaultOption.disabled = true; // Make it non-selectable
//       defaultOption.selected = true; // Make it the default selection
//       subDropdown.appendChild(defaultOption);

//       // Populate options dynamically
//       data.forEach((seBanggo) => {
//         const option = document.createElement("option");
//         option.value = seBanggo;
//         option.textContent = seBanggo;
//         subDropdown.appendChild(option);
//       });
//     })
//     .catch((error) => console.error("Error fetching 背番号 list:", error));
// });

// // gets all the sebanggo list for RH
// document.addEventListener("DOMContentLoaded", () => {
//   const subDropdownRH = document.getElementById("sub-dropdownRH");

//   // Fetch 背番号 list from the server
//   fetch(`${serverURL}/getSeBanggoListRH`)
//     .then((response) => response.json())
//     .then((data) => {
//       // Clear existing options
//       subDropdownRH.innerHTML = "";

//       // Add a default "Select 背番号" option
//       const defaultOption = document.createElement("option");
//       defaultOption.value = "";
//       defaultOption.textContent = "Select 背番号";
//       defaultOption.disabled = true; // Make it non-selectable
//       defaultOption.selected = true; // Make it the default selection
//       subDropdownRH.appendChild(defaultOption);

//       // Populate options dynamically
//       data.forEach((seBanggo) => {
//         const option = document.createElement("option");
//         option.value = seBanggo;
//         option.textContent = seBanggo;
//         subDropdownRH.appendChild(option);
//       });
//     })
//     .catch((error) =>
//       console.error("Error fetching 背番号 list for RH:", error)
//     );
// });

// gets all the 背番号 list for LH
document.addEventListener("DOMContentLoaded", () => {
  const subDropdown = document.getElementById("sub-dropdown");

  // Fetch 背番号 list from the server
  fetch(`${serverURL}/getSeBanggoListLH`)
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

      // Sort the data alphabetically
      data.sort((a, b) => a.localeCompare(b, 'ja')); // Using localeCompare for Japanese sorting

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

// gets all the 背番号 list for RH
document.addEventListener("DOMContentLoaded", () => {
  const subDropdownRH = document.getElementById("sub-dropdownRH");

  // Fetch 背番号 list from the server
  fetch(`${serverURL}/getSeBanggoListRH`)
    .then((response) => response.json())
    .then((data) => {
      // Clear existing options
      subDropdownRH.innerHTML = "";

      // Add a default "Select 背番号" option
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "Select 背番号";
      defaultOption.disabled = true; // Make it non-selectable
      defaultOption.selected = true; // Make it the default selection
      subDropdownRH.appendChild(defaultOption);

      // Sort the data alphabetically
      data.sort((a, b) => a.localeCompare(b, 'ja')); // Using localeCompare for Japanese sorting

      // Populate options dynamically
      data.forEach((seBanggo) => {
        const option = document.createElement("option");
        option.value = seBanggo;
        option.textContent = seBanggo;
        subDropdownRH.appendChild(option);
      });
    })
    .catch((error) =>
      console.error("Error fetching 背番号 list for RH:", error)
    );
});


// THis fetch details for LH
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

async function fetchProductDetailsRH() {
  const serialNumber = document.getElementById("sub-dropdownRH").value;
  const factory = document.getElementById("selected工場").value;
  // Update the dynamicImageRH src attribute with the retrieved htmlWebsite value
  const dynamicImageRH = document.getElementById("dynamicImageRH");
  dynamicImageRH.src = "";

  if (!serialNumber) {
    console.error("Please select a valid 背番号 (RH).");
    blankInfoRH();
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

      // Populate the RH HTML fields with the retrieved data
      document.getElementById("product-numberRH").value = data.品番 || "";
      document.getElementById("modelRH").value = data.モデル || "";
      document.getElementById("shapeRH").value = data.形状 || "";
      document.getElementById("R-LRH").value = data["R/L"] || "";

      if (data.htmlWebsite) {
        dynamicImageRH.src = data.htmlWebsite; // Set the image source to the retrieved URL
        dynamicImageRH.alt = "Product Image RH"; // Optional: Set the alt text
        dynamicImageRH.style.display = "block"; // Ensure the image is visible
      } else {
        dynamicImageRH.src = ""; // Clear the image source if no URL is available
        dynamicImageRH.alt = "No Image Available RH"; // Optional: Set fallback alt text
        dynamicImageRH.style.display = "none"; // Hide the image if no URL is available
      }
    } else {
      console.error("No matching product found for RH.");
    }
  } catch (error) {
    console.error("Error fetching product details (RH):", error);
  }
}

// Call fetchProductDetailsRH when a new 背番号 (RH) is selected
document.getElementById("sub-dropdownRH").addEventListener("change", fetchProductDetailsRH);



// when time is pressed
function setDefaultTime(input) {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timeValue = `${hours}:${minutes}`;
  input.value = timeValue;

  // Save the date to local storage with unique prefix
  localStorage.setItem(`${uniquePrefix}${input.id}`, timeValue);
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
  localStorage.setItem(`${uniquePrefix}${input.id}`, dateValue);
}

// Set current date as default on page load
document.addEventListener("DOMContentLoaded", function () {
  const dateInput = document.getElementById("Lot No.");
  const dateInput2 = document.getElementById("Lot No.RH");
  setDefaultDate(dateInput);
  setDefaultDate(dateInput2);
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
      const dataListRH = document.getElementById("machine-operator-suggestionsRH");
      dataList.innerHTML = ""; // Clear any existing options
      dataListRH.innerHTML = ""; // Clear any existing options

      workerNames.forEach((name) => {
        // Create option for dataList
        const option1 = document.createElement("option");
        option1.value = name;
        dataList.appendChild(option1);

        // Create a separate option for dataListRH
        const option2 = document.createElement("option");
        option2.value = name;
        dataListRH.appendChild(option2);
      });
    } catch (error) {
      console.error("Error fetching worker names:", error);
    }
  }
});

// Function for plus button
function incrementCounter(counterId) {
  const counterElement = document.getElementById(`counter-${counterId}`);
  let currentValue = parseInt(counterElement.value, 10) || 0; // Ensure a valid number
  currentValue += 1;
  counterElement.value = currentValue;

  // Save the data to localStorage with a unique prefix
  const selected工場 = document.getElementById('selected工場').value; // Get the current factory value
  const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
  const uniquePrefix = `${pageName}_${selected工場}_`; // Define the prefix
  const key = `${uniquePrefix}counter-${counterId}`; // Construct the key
  localStorage.setItem(key, currentValue);

  updateTotal(); // Call a function to update the total
}

function decrementCounter(counterId) {
  const counterElement = document.getElementById(`counter-${counterId}`);
  let currentValue = parseInt(counterElement.value, 10);
  if (currentValue > 0) {
    currentValue -= 1;
    counterElement.value = currentValue;

    // Save the data to localStorage with a unique prefix
    const selected工場 = document.getElementById('selected工場').value; // Get the current factory value
    const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
    const uniquePrefix = `${pageName}_${selected工場}_`; // Define the prefix
    const key = `${uniquePrefix}counter-${counterId}`; // Construct the key
    localStorage.setItem(key, currentValue);

    updateTotal();
  }
}

function updateTotal() {
  // Get the value of Process Quantity
  const processQuantity =
    parseInt(document.getElementById("ProcessQuantity").value, 10) || 0;
  const processQuantityRH =
    parseInt(document.getElementById("ProcessQuantityRH").value, 10) || 0;

  // Get the values of the counters
  const counter13 = parseInt(document.getElementById("counter-13").value, 10) || 0;
  const counter14 = parseInt(document.getElementById("counter-14").value, 10) || 0;
  const counter15 = parseInt(document.getElementById("counter-15").value, 10) || 0;
  const counter16 = parseInt(document.getElementById("counter-16").value, 10) || 0;
  const counter17 = parseInt(document.getElementById("counter-17").value, 10) || 0;
  const counter18 = parseInt(document.getElementById("counter-18").value, 10) || 0;
  const counter19 = parseInt(document.getElementById("counter-19").value, 10) || 0;
  const counter20 = parseInt(document.getElementById("counter-20").value, 10) || 0;
  const counter21 = parseInt(document.getElementById("counter-21").value, 10) || 0;
  const counter22 = parseInt(document.getElementById("counter-22").value, 10) || 0;
  const counter23 = parseInt(document.getElementById("counter-23").value, 10) || 0; // LH 5
  const counter24 = parseInt(document.getElementById("counter-24").value, 10) || 0; // RH 5

  // Calculate Total_NG
  const totalNG = counter13 + counter14 + counter15 + counter16 + counter17 + counter23;
  const totalNGRH = counter18 + counter19 + counter20 + counter21 + counter22 + counter24;

  // Update the Total_NG field
  document.getElementById("Total_NG").value = totalNG;
  document.getElementById("Total_NGRH").value = totalNGRH;

  // Calculate Total
  const total = processQuantity - totalNG;
  const totalRH = processQuantityRH - totalNGRH;

  // Update the Total field
  document.getElementById("total").value = total;
  document.getElementById("totalRH").value = totalRH;
}

// Attach updateTotal to relevant events
document.getElementById("ProcessQuantity").addEventListener("input", updateTotal);
document.getElementById("ProcessQuantityRH").addEventListener("input", updateTotal);




// // Submit Button for SRS Process LH
// document.querySelector('form[name="LH-form"]').addEventListener("submit", async (event) => {
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
//       // Check if Hatsumono is FALSE
//       const hatsumonoLabel = document.getElementById("hatsumonoLabel");
//       if (hatsumonoLabel && hatsumonoLabel.textContent === "FALSE") {
//         // Show alert modal
//         scanAlertText.innerText = "初物-LH 確認してください / Please do Hatsumono in LH";
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


//       // Get form data
//       const 品番 = document.getElementById("product-number").value;
//       const 背番号 = document.getElementById("sub-dropdown").value;
//       const Total = parseInt(document.getElementById("total").value, 10) || 0;
//       const 工場 = document.getElementById("selected工場").value;
//       const Worker_Name = document.getElementById("Machine Operator").value;
//       const Process_Quantity =
//         parseInt(document.getElementById("ProcessQuantity").value, 10) || 0;
//       const Date = document.getElementById("Lot No.").value;
//       const Time_start = document.getElementById("Start Time").value;
//       const Time_end = document.getElementById("End Time").value;
//       const 設備 = document.getElementById("process").value;
//       const SRSCode = document.getElementById("SRS code").value;
//       // Counters
//       const counter13 =
//         parseInt(document.getElementById("counter-13").value, 10) || 0;
//       const counter14 =
//         parseInt(document.getElementById("counter-14").value, 10) || 0;
//       const counter15 =
//         parseInt(document.getElementById("counter-15").value, 10) || 0;
//       const counter16 =
//         parseInt(document.getElementById("counter-16").value, 10) || 0;
//       const counter17 =
//         parseInt(document.getElementById("counter-17").value, 10) || 0;
//       const counter23 = parseInt(document.getElementById("counter-23").value, 10) || 0; // LH 5

//       // SRS_Total_NG Calculation
//       const SRS_Total_NG =
//         counter13 + counter14 + counter15 + counter16 + counter17 + counter23;
//       const Spare = parseInt(document.getElementById("spare").value, 10) || 0;
//       const Comment = document.querySelector(
//         'textarea[name="Comments1"]'
//       ).value;
//       const 製造ロット = document.getElementById("製造ロット").value;
//       const Cycle_Time =
//         parseFloat(document.getElementById("cycleTime").value) || 0;

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

//       // Prepare data for saving to SRSDB
//       const formData = {
//         品番,
//         背番号,
//         Total,
//         工場,
//         Worker_Name,
//         Process_Quantity,
//         Date,
//         Time_start,
//         Time_end,
//         設備,
//         SRSコード: SRSCode,
//         "くっつき・めくれ": counter13,
//         シワ: counter14,
//         転写位置ズレ: counter15,
//         転写不良: counter16,
//         文字欠け: counter23,
//         その他: counter17,
//         SRS_Total_NG,
//         Spare,
//         Comment,
//         製造ロット,
//         Cycle_Time,
//       };

//       console.log("Data to save to SRSDB:", formData);

//       // Save to SRSDB
//       const saveResponse = await fetch(`${serverURL}/submitToSRSDBiReporter`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(formData),
//       });

//       if (!saveResponse.ok) {
//         throw new Error("Failed to save data to SRSDB");
//       }

//       console.log("Form data saved to SRSDB successfully.");
      
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
//         clearForm();
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

// Submit Button for SRS Process LH
document.querySelector('form[name="LH-form"]').addEventListener("submit", async (event) => {
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
      // Check if Hatsumono is FALSE
      const hatsumonoLabel = document.getElementById("hatsumonoLabel");
      if (hatsumonoLabel && hatsumonoLabel.textContent === "FALSE") {
          // Show alert modal
          scanAlertText.innerText = "初物-LH 確認してください / Please do Hatsumono in LH";
          scanAlertModal.style.display = "block";

          // Play alert sound
          if (alertSound) {
              alertSound.muted = false; // Unmute to alert user
              alertSound.volume = 1; // Set full volume
              alertSound.play().catch((error) =>
                  console.error("Failed to play alert sound:", error)
              );
          }

          // Add blinking red background
          document.body.classList.add("flash-red");

          // Close modal on button click
          const closeScanModalButton = document.getElementById("closeScanModalButton");
          closeScanModalButton.onclick = function () {
              scanAlertModal.style.display = "none";
              alertSound.pause();
              alertSound.currentTime = 0; // Reset sound to the beginning
              alertSound.muted = true; // Mute again for next time
              document.body.classList.remove("flash-red");
          };

          return; // Stop the submission process
      }

      // Get form data
      const 品番 = document.getElementById("product-number").value;
      const 背番号 = document.getElementById("sub-dropdown").value;
      const Total = parseInt(document.getElementById("total").value, 10) || 0;
      const 工場 = document.getElementById("selected工場").value;
      const Worker_Name = document.getElementById("Machine Operator").value;
      const Process_Quantity = parseInt(document.getElementById("ProcessQuantity").value, 10) || 0;
      const Date = document.getElementById("Lot No.").value;
      const Time_start = document.getElementById("Start Time").value;
      const Time_end = document.getElementById("End Time").value;
      const 設備 = document.getElementById("process").value;
      const SRSCode = document.getElementById("SRS code").value;

      // Counters
      const counter13 = parseInt(document.getElementById("counter-13").value, 10) || 0;
      const counter14 = parseInt(document.getElementById("counter-14").value, 10) || 0;
      const counter15 = parseInt(document.getElementById("counter-15").value, 10) || 0;
      const counter16 = parseInt(document.getElementById("counter-16").value, 10) || 0;
      const counter17 = parseInt(document.getElementById("counter-17").value, 10) || 0;
      const counter23 = parseInt(document.getElementById("counter-23").value, 10) || 0; // LH 5

      // SRS_Total_NG Calculation
      const SRS_Total_NG = counter13 + counter14 + counter15 + counter16 + counter17 + counter23;
      const Spare = parseInt(document.getElementById("spare").value, 10) || 0;
      const Comment = document.querySelector('textarea[name="Comments1"]').value;
      const 製造ロット = document.getElementById("製造ロット").value;
      const Cycle_Time = parseFloat(document.getElementById("cycleTime").value) || 0;

      // Check if 背番号 is selected
      if (!背番号) {
          // Show alert modal
          scanAlertText.innerText = "背番号が必要です。 / Sebanggo is required.";
          scanAlertModal.style.display = "block";

          // Play alert sound
          if (alertSound) {
              alertSound.muted = false; // Unmute to alert user
              alertSound.volume = 1; // Set full volume
              alertSound.play().catch((error) =>
                  console.error("Failed to play alert sound:", error)
              );
          }

          // Add blinking red background
          document.body.classList.add("flash-red");

          // Close modal on button click
          const closeScanModalButton = document.getElementById("closeScanModalButton");
          closeScanModalButton.onclick = function () {
              scanAlertModal.style.display = "none";
              alertSound.pause();
              alertSound.currentTime = 0; // Reset sound to the beginning
              alertSound.muted = true; // Mute again for next time
              document.body.classList.remove("flash-red");
          };

          return; // Stop the submission process
      }

      // Prepare data for saving to SRSDB
      const formData = {
          品番,
          背番号,
          Total,
          工場,
          Worker_Name,
          Process_Quantity,
          Date,
          Time_start,
          Time_end,
          設備,
          SRSコード: SRSCode,
          "くっつき・めくれ": counter13,
          シワ: counter14,
          転写位置ズレ: counter15,
          転写不良: counter16,
          文字欠け: counter23,
          その他: counter17,
          SRS_Total_NG,
          Spare,
          Comment,
          製造ロット,
          Cycle_Time,
      };

      console.log("Data to save to SRSDB:", formData);

      // Save to SRSDB
      const saveResponse = await fetch(`${serverURL}/submitToSRSDBiReporter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
      });

      if (!saveResponse.ok) {
          throw new Error("Failed to save data to SRSDB");
      }

      console.log("Form data saved to SRSDB successfully.");

      // Run uploadPhotou() after saving data
      try {
          await uploadPhotou();

          // Show success modal with blinking green background
          scanAlertText.innerText = "Form and photo submitted successfully / 保存しました";
          scanAlertModal.style.display = "block";
          document.body.classList.add("flash-green");

          const closeScanModalButton = document.getElementById("closeScanModalButton");
          closeScanModalButton.onclick = function () {
              scanAlertModal.style.display = "none";
              document.body.classList.remove("flash-green");
              clearForm();
          };
      } catch (error) {
          console.error("Photo upload failed:", error);

          // Show photo upload error message
          scanAlertText.innerText = "Photo upload failed. Please try again.";
          scanAlertModal.style.display = "block";
          setTimeout(() => {
              scanAlertModal.style.display = "none";
          }, 3000);
      }
  } catch (error) {
      console.error("Error during submission:", error);

      // Show MongoDB upload error modal
      scanAlertText.innerText = "An error occurred while submitting the form. Please try again.";
      scanAlertModal.style.display = "block";

      // Play alert sound
      if (alertSound) {
          alertSound.muted = false;
          alertSound.volume = 1;
          alertSound.play().catch((error) =>
              console.error("Failed to play alert sound:", error)
          );
      }

      document.body.classList.add("flash-red");

      const closeScanModalButton = document.getElementById("closeScanModalButton");
      closeScanModalButton.onclick = function () {
          scanAlertModal.style.display = "none";
          alertSound.pause();
          alertSound.currentTime = 0;
          alertSound.muted = true;
          document.body.classList.remove("flash-red");
      };
  }
});




// Submit Button for SRS Process (RH)
// Submit Button for SRS Process (RH)
document.querySelector('form[name="RH-form"]').addEventListener("submit", async (event) => {
  event.preventDefault(); // Prevent default form submission behavior

  // Add cycle time calculation logic if needed
  updateCycleTimeRH();

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
      // Check if HatsumonoRH is FALSE
      const hatsumonoLabelRH = document.getElementById("hatsumonoLabelRH");
      if (hatsumonoLabelRH && hatsumonoLabelRH.textContent === "FALSE") {
          // Show alert modal
          scanAlertText.innerText = "初物-RH 確認してください / Please do Hatsumono in RH";
          scanAlertModal.style.display = "block";

          // Play alert sound
          if (alertSound) {
              alertSound.muted = false; // Unmute to alert user
              alertSound.volume = 1; // Set full volume
              alertSound.play().catch((error) =>
                  console.error("Failed to play alert sound:", error)
              );
          }

          // Add blinking red background
          document.body.classList.add("flash-red");

          // Close modal on button click
          const closeScanModalButton = document.getElementById("closeScanModalButton");
          closeScanModalButton.onclick = function () {
              scanAlertModal.style.display = "none";
              alertSound.pause();
              alertSound.currentTime = 0; // Reset sound to the beginning
              alertSound.muted = true; // Mute again for next time
              document.body.classList.remove("flash-red");
          };

          return; // Stop the submission process
      }

      // Get form data
      const 品番 = document.getElementById("product-numberRH").value;
      const 背番号 = document.getElementById("sub-dropdownRH").value;
      const Total = parseInt(document.getElementById("totalRH").value, 10) || 0;
      const 工場 = document.getElementById("selected工場").value;
      const Worker_Name = document.getElementById("Machine OperatorRH").value;
      const Process_Quantity = parseInt(document.getElementById("ProcessQuantityRH").value, 10) || 0;
      const Date = document.getElementById("Lot No.RH").value;
      const Time_start = document.getElementById("Start TimeRH").value;
      const Time_end = document.getElementById("End TimeRH").value;
      const 設備 = document.getElementById("processRH").value;
      const SRSCode = document.getElementById("SRS codeRH").value;

      // Counters
      const counter18 = parseInt(document.getElementById("counter-18").value, 10) || 0;
      const counter19 = parseInt(document.getElementById("counter-19").value, 10) || 0;
      const counter20 = parseInt(document.getElementById("counter-20").value, 10) || 0;
      const counter21 = parseInt(document.getElementById("counter-21").value, 10) || 0;
      const counter22 = parseInt(document.getElementById("counter-22").value, 10) || 0;
      const counter24 = parseInt(document.getElementById("counter-24").value, 10) || 0; // LH 5

      // SRS_Total_NG Calculation
      const SRS_Total_NG = counter18 + counter19 + counter20 + counter21 + counter22 + counter24;
      const Spare = parseInt(document.getElementById("spareRH").value, 10) || 0;
      const Comment = document.querySelector('textarea[name="Comments2"]').value;
      const 製造ロット = document.getElementById("製造ロットRH").value;
      const Cycle_Time = parseFloat(document.getElementById("cycleTimeRH").value) || 0;

      // Check if 背番号 is selected
      if (!背番号) {
          // Show alert modal
          scanAlertText.innerText = "背番号が必要です。 / Sebanggo is required.";
          scanAlertModal.style.display = "block";

          // Play alert sound
          if (alertSound) {
              alertSound.muted = false; // Unmute to alert user
              alertSound.volume = 1; // Set full volume
              alertSound.play().catch((error) =>
                  console.error("Failed to play alert sound:", error)
              );
          }

          // Add blinking red background
          document.body.classList.add("flash-red");

          // Close modal on button click
          const closeScanModalButton = document.getElementById("closeScanModalButton");
          closeScanModalButton.onclick = function () {
              scanAlertModal.style.display = "none";
              alertSound.pause();
              alertSound.currentTime = 0; // Reset sound to the beginning
              alertSound.muted = true; // Mute again for next time
              document.body.classList.remove("flash-red");
          };

          return; // Stop the submission process
      }

      // Prepare data for saving to SRSDB
      const formData = {
          品番,
          背番号,
          Total,
          工場,
          Worker_Name,
          Process_Quantity,
          Date,
          Time_start,
          Time_end,
          設備,
          SRSコード: SRSCode,
          "くっつき・めくれ": counter18,
          シワ: counter19,
          転写位置ズレ: counter20,
          転写不良: counter21,
          文字欠け: counter24,
          その他: counter22,
          SRS_Total_NG,
          Spare,
          Comment,
          製造ロット,
          Cycle_Time,
      };

      console.log("Data to save to SRSDB:", formData);

      // Save to SRSDB
      const saveResponse = await fetch(`${serverURL}/submitToSRSDBiReporter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
      });

      if (!saveResponse.ok) {
          throw new Error("Failed to save data to SRSDB");
      }

      console.log("Form data saved to SRSDB successfully.");

      // Run uploadPhotouRH() after saving data
      try {
          await uploadPhotouRH();
          console.log("Photo uploaded to Google Drive successfully.");

          // Show success modal
          scanAlertText.innerText = "Form and photo submitted successfully / 保存しました";
          scanAlertModal.style.display = "block";
          document.body.classList.add("flash-green");

          const closeScanModalButton = document.getElementById("closeScanModalButton");
          closeScanModalButton.onclick = function () {
              scanAlertModal.style.display = "none";
              document.body.classList.remove("flash-green");
              clearFormRH();
          };
      } catch (error) {
          console.error("Photo upload failed:", error);

          // Show photo upload error message
          scanAlertText.innerText = "Photo upload failed. Please try again.";
          scanAlertModal.style.display = "block";
          setTimeout(() => {
              scanAlertModal.style.display = "none";
          }, 3000);
      }
  } catch (error) {
      console.error("Error during submission:", error);

      // Show MongoDB upload error modal
      scanAlertText.innerText = "An error occurred while submitting the form. Please try again.";
      scanAlertModal.style.display = "block";

      // Play alert sound
      if (alertSound) {
          alertSound.muted = false;
          alertSound.volume = 1;
          alertSound.play().catch((error) =>
              console.error("Failed to play alert sound:", error)
          );
      }

      document.body.classList.add("flash-red");

      const closeScanModalButton = document.getElementById("closeScanModalButton");
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

// Updates Cycle Time value for RH
function updateCycleTimeRH() {
  const startTime = document.getElementById("Start TimeRH").value;
  const endTime = document.getElementById("End TimeRH").value;
  const quantity =
    parseInt(document.getElementById("ProcessQuantityRH").value, 10) || 1; // Avoid division by 0

  if (startTime && endTime) {
    const start = new Date(`1970-01-01T${startTime}:00Z`);
    const end = new Date(`1970-01-01T${endTime}:00Z`);

    // Calculate difference in milliseconds and convert to seconds
    const diffInSeconds = (end - start) / 1000;

    // Calculate cycle time (in seconds per item)
    const cycleTime = diffInSeconds / quantity;

    // Update the Cycle Time field in the form
    document.getElementById("cycleTimeRH").value = cycleTime.toFixed(2);
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
          const key = `${pageName}_${selected工場}_sub-dropdown`; // Construct the localStorage key
          localStorage.setItem(key, qrCodeMessage); // Save to localStorage

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




//Scan button for RH
document.getElementById("scan-buttonRH").addEventListener("click", function () {
  const qrScannerModalRH = document.getElementById("qrScannerModal");
  const scanAlertModalRH = document.getElementById("scanAlertModal");
  const scanAlertTextRH = document.getElementById("scanAlertText");
  const html5QrCodeRH = new Html5Qrcode("qrReader");
  const alertSoundRH = document.getElementById("alert-sound");

  // Preload the alert sound without playing it
  if (alertSoundRH) {
    alertSoundRH.muted = true; // Mute initially to preload
    alertSoundRH.loop = false; // Disable looping
    alertSoundRH.load(); // Preload the audio file
  }

  // Show the modal
  qrScannerModalRH.style.display = "block";

  // Start QR code scanning
  html5QrCodeRH
    .start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
      },
      async (qrCodeMessageRH) => {
        const subDropdownRH = document.getElementById("sub-dropdownRH");
        const optionsRH = [...subDropdownRH.options].map(
          (option) => option.value
        );

        console.log("Scanned QR Code (RH):", qrCodeMessageRH);

        // Check if the scanned QR code does NOT exist in the dropdown options
        if (!optionsRH.includes(qrCodeMessageRH)) {
          // Display error modal
          scanAlertTextRH.innerText =
            "背番号が存在しません。 / Sebanggo does not exist.";
          scanAlertModalRH.style.display = "block";

          // Play alert sound
          if (alertSoundRH) {
            alertSoundRH.muted = false; // Unmute to alert user
            alertSoundRH.volume = 1; // Set full volume
            alertSoundRH
              .play()
              .catch((error) =>
                console.error("Failed to play alert sound:", error)
              );
          }

          // Add blinking red background
          document.body.classList.add("flash-red");

          const closeScanModalButtonRH = document.getElementById(
            "closeScanModalButton"
          );
          closeScanModalButtonRH.onclick = function () {
            scanAlertModalRH.style.display = "none";
            alertSoundRH.pause();
            alertSoundRH.currentTime = 0; // Reset sound to the beginning
            alertSoundRH.muted = true; // Mute again for next time
            document.body.classList.remove("flash-red");
          };

          // Stop QR scanning
          html5QrCodeRH
            .stop()
            .then(() => {
              qrScannerModalRH.style.display = "none";
            })
            .catch((err) => console.error("Failed to stop scanning:", err));

          return;
        }

        // If QR code matches an option, set the dropdown value and close scanner
        if (subDropdownRH && subDropdownRH.value !== qrCodeMessageRH) {
          subDropdownRH.value = qrCodeMessageRH;
          fetchProductDetailsRH();
          const key = `${pageName}_${selected工場}_sub-dropdownRH`; // Construct the localStorage key
          localStorage.setItem(key, qrCodeMessageRH); // Save to localStorage

          html5QrCodeRH
            .stop()
            .then(() => {
              qrScannerModalRH.style.display = "none";
            })
            .catch((err) => console.error("Failed to stop scanning:", err));

          return;
        }
      }
    )
    .catch((err) => {
      console.error("Failed to start scanning (RH):", err);
    });

  // Close the QR scanner modal
  document.getElementById("closeQRScannerModalRH").onclick = function () {
    html5QrCodeRH
      .stop()
      .then(() => {
        qrScannerModalRH.style.display = "none";
      })
      .catch((err) => console.error("Failed to stop scanning:", err));
  };

  // Close scanner if user clicks outside the modal
  window.onclick = function (event) {
    if (event.target == qrScannerModalRH) {
      html5QrCodeRH
        .stop()
        .then(() => {
          qrScannerModalRH.style.display = "none";
        })
        .catch((err) => console.error("Failed to stop scanning:", err));
    }
  };
});

// CSS for blinking red background
const styleRH = document.createElement("style");
styleRH.innerHTML = `
.flash-red {
  animation: flash-red 1s infinite;
}

@keyframes flash-red {
  50% {
    background-color: red;
  }
}
`;
document.head.appendChild(styleRH);


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
    buttonId: 'hatsumonoButtonRH',
    labelId: 'hatsumonoLabelRH',
    imgId: 'hatsumonoPicRH',
    labelText: '初物チェックRH',
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
        const labelKey = `${pageName}_${selected工場}_${labelId}.textContent`;
        localStorage.setItem(labelKey, label.textContent);

        // Save image source to localStorage
        const photoPreviewKey = `${pageName}_${selected工場}_${imgId}.src`;
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



// Upload Photo Function for multiple images LH
function uploadPhotou() {
  const selectedSebanggo = document.getElementById("sub-dropdown").value;
  const currentDate = document.getElementById("Lot No.").value;
  const selectedWorker = document.getElementById("Machine Operator").value;
  const selectedFactory = document.getElementById("selected工場").value;
  const selectedMachine = document.getElementById("process").value;

  // Mapping of images to their respective IDs
  const imageMappings = [
    { imgId: 'hatsumonoPic', label: '初物チェック' },
  ];

  imageMappings.forEach(({ imgId, label }) => {
    const photoPreview = document.getElementById(imgId);

    if (!photoPreview || !photoPreview.src) {
      console.error(`No photo preview available for ${label}`);
      return;
    }

    // Convert the image to a blob
    fetch(photoPreview.src)
      .then(response => response.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = function () {
          const base64data = reader.result.split(',')[1]; // Get the base64 encoded string

          const formData = new FormData();
          formData.append('imageBlob', base64data);
          formData.append(
            'fileName',
            `${selectedSebanggo}_${currentDate}_${selectedWorker}_${selectedFactory}_${selectedMachine}_${label}.jpg`
          );
          formData.append('mimeType', blob.type);
          formData.append('selectedFactory', selectedFactory);

          // Send the blob to Apps Script via POST request
          fetch(
            'https://script.google.com/macros/s/AKfycbxDWa2RTdI2_aHBgzq9GA9GtQx5MrwqaRnW4F26VZdoptwJ1Pg_Enr_xI3vw1t7WHYbTw/exec',
            {
              method: 'POST',
              body: formData,
            }
          )
            .then((response) => response.text()) // Fetch raw text response
            .then((text) => {
              console.log(`Raw response for ${label}:`, text); // Log the raw response
              try {
                const data = JSON.parse(text); // Attempt to parse JSON
                if (data.status === 'success') {
                  console.log(`File uploaded successfully for ${label}: ` + data.fileUrl);
                } else {
                  console.error(`Upload failed for ${label}: ` + data.message);
                }
              } catch (error) {
                console.error(`Error parsing JSON for ${label}:`, error);
              }
            })
            .catch((error) => {
              console.error(`Error uploading file for ${label}: `, error);
            });
        };
        reader.readAsDataURL(blob);
      })
      .catch((error) => console.error(`Error converting image to blob for ${label}: `, error));
  });
}




// Upload Photo Function for multiple images LH
function uploadPhotouRH() {
  const selectedSebanggo = document.getElementById("sub-dropdownRH").value;
  const currentDate = document.getElementById("Lot No.RH").value;
  const selectedWorker = document.getElementById("Machine OperatorRH").value;
  const selectedFactory = document.getElementById("selected工場").value;
  const selectedMachine = document.getElementById("processRH").value;

  // Mapping of images to their respective IDs
  const imageMappings = [
    { imgId: 'hatsumonoPicRH', label: '初物チェック' },
  ];

  imageMappings.forEach(({ imgId, label }) => {
    const photoPreview = document.getElementById(imgId);

    if (!photoPreview || !photoPreview.src) {
      console.error(`No photo preview available for ${label}`);
      return;
    }

    // Convert the image to a blob
    fetch(photoPreview.src)
      .then(response => response.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = function () {
          const base64data = reader.result.split(',')[1]; // Get the base64 encoded string

          const formData = new FormData();
          formData.append('imageBlob', base64data);
          formData.append(
            'fileName',
            `${selectedSebanggo}_${currentDate}_${selectedWorker}_${selectedFactory}_${selectedMachine}_${label}.jpg`
          );
          formData.append('mimeType', blob.type);
          formData.append('selectedFactory', selectedFactory);

          // Send the blob to Apps Script via POST request
          fetch(
            'https://script.google.com/macros/s/AKfycbxDWa2RTdI2_aHBgzq9GA9GtQx5MrwqaRnW4F26VZdoptwJ1Pg_Enr_xI3vw1t7WHYbTw/exec',
            {
              method: 'POST',
              body: formData,
            }
          )
            .then((response) => response.text()) // Fetch raw text response
            .then((text) => {
              console.log(`Raw response for ${label}:`, text); // Log the raw response
              try {
                const data = JSON.parse(text); // Attempt to parse JSON
                if (data.status === 'success') {
                  console.log(`File uploaded successfully for ${label}: ` + data.fileUrl);
                } else {
                  console.error(`Upload failed for ${label}: ` + data.message);
                }
              } catch (error) {
                console.error(`Error parsing JSON for ${label}:`, error);
              }
            })
            .catch((error) => {
              console.error(`Error uploading file for ${label}: `, error);
            });
        };
        reader.readAsDataURL(blob);
      })
      .catch((error) => console.error(`Error converting image to blob for ${label}: `, error));
  });
}

