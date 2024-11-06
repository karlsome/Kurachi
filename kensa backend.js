// link for final report
const scriptURL = 'https://script.google.com/macros/s/AKfycby-_1ZH5JUXYJk4qzSUVEekfJM5F4QG7qTys67uwXFm2p9q2O_SI1HnqEDzjQnSx30J/exec'

// link for database (nakaya -> main)
const dbURL = 'https://script.google.com/macros/s/AKfycbwBzPZgoNiUK_ez3AzK5FXFr8_AsmdBjCWGzulG3eh0cryirgVxtMzIF4ehh98QYdkpUg/exec';

// link for worker database
const workerURL = 'https://script.google.com/macros/s/AKfycbxw4KtgqhSTVI4TKfQuT642LyvnkvYBQSh3IHaWc1GGI--89abQp0bUff-x8-rELeS_VQ/exec';

// link for pictures database
const picURL = 'https://script.google.com/macros/s/AKfycbwHUW1ia8hNZG-ljsguNq8K4LTPVnB6Ng_GLXIHmtJTdUgGGd2WoiQo9ToF-7PvcJh9bA/exec';

//link for printer master database
const printerCodeURL = 'https://script.google.com/macros/s/AKfycbxP9j_KH4fRe4io777vD-pnt9BQH9IwiS4JRrbsw8DkoDCfaAcdHeH7pbIWIy2ue_8jcQ/exec';

//link for ip address database
const ipURL = 'https://script.google.com/macros/s/AKfycbyC6-KiT3xwGiahhzhB-L-OOL8ufG0WqnT5mjEelGBKGnbiqVAS6qjT78FlzBUHqTn3Gg/exec';





function toggleInputs() {
  var isChecked = document.getElementById('enable-inputs').checked;
  
  // Enable or disable specific inputs based on the checkbox status
  var inputs = document.querySelectorAll('#Kensa\\ Name, #KDate, #KStart\\ Time, #KEnd\\ Time, textarea[name="Comments2"], input[type="submit"], #在庫');
  inputs.forEach(function(input) {
    input.disabled = !isChecked;
  });

  // Enable or disable plus and minus buttons for counters 1 to 12 based on the checkbox status
  for (let i = 1; i <= 12; i++) {
    var plusBtn = document.querySelector(`#counter-box-${i} .plus-btn`);
    var minusBtn = document.querySelector(`#counter-box-${i} .minus-btn`);
    if (plusBtn) plusBtn.disabled = !isChecked;
    if (minusBtn) minusBtn.disabled = !isChecked;
  }

  // Update the hidden input value based on checkbox status
  document.getElementById('検査STATUS').value = isChecked ? "TRUE" : "false";
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
  input.value = `${hours}:${minutes}`;
  //calculateTotalTime();
}

// when date is pressed
function setDefaultDate(input) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  input.value = `${year}-${month}-${day}`;
}


//this function listens to incoming input: selected is the machine value, filter is the factory value
function getQueryParams() {
    const params = {};
    const queryString = window.location.search.slice(1);
    const pairs = queryString.split('&');
    pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        params[decodeURIComponent(key)] = decodeURIComponent(value);
    });
    return params;
}

document.addEventListener('DOMContentLoaded', () => {
    const params = getQueryParams();
    const form = document.getElementById('kensa-form');
    for (const [key, value] of Object.entries(params)) {
        const input = form.elements.namedItem(key);
        if (input) {
            input.value = value;
        }
    }
});




// for the dynamic dropdown list (machine list)
function LoadList(selectedValue) {
    
       var dropdown = selectedValue;
          
      // Fetch and populate the second dropdown based on the initial value of the first dropdown
      const initialSelectedValue = dropdown;
      
      fetchSubDropdownData(initialSelectedValue);
}


document.addEventListener('DOMContentLoaded', function () {
    const currentSebango = document.getElementById('sub-dropdown').value;
    const enableInputsCheckbox = document.getElementById('enable-inputs');
    const checkboxValue = document.getElementById('検査STATUS').value;

    productNumberInfo(currentSebango);
        modelInfo(currentSebango);
        shapeInfo(currentSebango);
        RLInfo(currentSebango);
        materialInfo(currentSebango);
        materialCodeInfo(currentSebango);
        materialColorInfo(currentSebango);
        picLINK(currentSebango);
        printerCode(currentSebango);
        
        

        if (checkboxValue === "true") {
          enableInputsCheckbox.checked = true;
        } else {
          enableInputsCheckbox.checked = false;
        }

        toggleInputs();

        // Add event listener to the checkbox to toggle inputs on change
        enableInputsCheckbox.addEventListener('change', toggleInputs);

});

// Function to fetch and populate the second dropdown
function fetchSubDropdownData(selectedValue) {
  fetch(`${dbURL}?filterE=${selectedValue}`)
    .then(response => response.json())
    .then(data => {
      const subDropdown = document.getElementById('sub-dropdown');
      subDropdown.innerHTML = ''; // Clear the existing options
      
      // Add a default blank option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = '';
      subDropdown.appendChild(defaultOption);

      // Populate the second dropdown
      data.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        subDropdown.appendChild(opt);
      });

      // Add event listener to the second dropdown to alert the selected value
      subDropdown.addEventListener('change', function () {
        const selectedValue = this.value;
        productNumberInfo(selectedValue);
        modelInfo(selectedValue);
        shapeInfo(selectedValue);
        RLInfo(selectedValue);
        materialInfo(selectedValue);
        materialCodeInfo(selectedValue);
        materialColorInfo(selectedValue);
        picLINK(selectedValue);
        printerCode(selectedValue);
        getIP();
        //sendtoNC(selectedValue);
      });
    })
    .catch(error => console.error('Error fetching sub-dropdown options:', error));
}








function SubDropdownChange(selectedValue) {
  fetch(`${dbURL}?filterE=${selectedValue}`)
    .then(response => response.json())
    .then(data => {
      const subDropdown = document.getElementById('sub-dropdown');
      
      subDropdown.value = selectedValue;
      
        productNumberInfo(subDropdown.value);
        modelInfo(subDropdown.value);
        shapeInfo(subDropdown.value);
        RLInfo(subDropdown.value);
        materialInfo(subDropdown.value);
        materialCodeInfo(subDropdown.value);
        materialColorInfo(subDropdown.value);
        picLINK(subDropdown.value);
        printerCode(selectedValue);
        
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
// Function for plus minus button
function incrementCounter(counterId) {
  const counterElement = document.getElementById(`counter-${counterId}`);
  let currentValue = parseInt(counterElement.value, 10);
  counterElement.value = currentValue + 1;
  updateTotal();
}

function decrementCounter(counterId) {
  const counterElement = document.getElementById(`counter-${counterId}`);
  let currentValue = parseInt(counterElement.value, 10);
  if (currentValue > 0) {
    counterElement.value = currentValue - 1;
    updateTotal();
  }
}

// function updateTotal() {
//   let ngTotal = 0;
//   for (let i = 1; i <= 12; i++) {
//     const counterElement = document.getElementById(`counter-${i}`);
//     ngTotal += parseInt(counterElement.value, 10);
//   }
//   document.getElementById('NG total').value = ngTotal;
  
//   const processQuantity = parseInt(document.getElementById('Process Quantity').value, 10) || 0;
//   const totalQuantity = processQuantity - ngTotal;
//   document.getElementById('total').value = totalQuantity;
// }

// // Add event listener to process quantity input
// document.getElementById('Process Quantity').addEventListener('input', updateTotal);


function updateTotal() {
  // Retrieve the current process type from the input field
  const processType = document.getElementById('process').value;

  // Get quantities for each process stage (A, B, C)
  const aQuantity = parseInt(document.getElementById('Process Quantity').value, 10) || 0;
  const bQuantityInput = document.getElementById('slit Quantity');
  const cQuantityInput = document.getElementById('SRSQuantity');

  // Define NG totals for each stage
  let dNgTotal = 0;
  let cNgTotal = 0;
  let bNgTotal = 0;
  let totalNg = 0; // Total NG across all counters

  // Calculate D NG total (counters 1 - 12) and accumulate in totalNg
  for (let i = 1; i <= 12; i++) {
      const counterElement = document.getElementById(`counter-${i}`);
      const counterValue = parseInt(counterElement.value, 10) || 0;
      dNgTotal += counterValue;
      totalNg += counterValue;
  }

  // Calculate C NG total (counters 13 - 17) and accumulate in totalNg
  for (let i = 13; i <= 17; i++) {
      const counterElement = document.getElementById(`counter-${i}`);
      const counterValue = parseInt(counterElement.value, 10) || 0;
      cNgTotal += counterValue;
      totalNg += counterValue;
  }

  // Calculate B NG total (counter 18) and accumulate in totalNg
  const bNgCounter = document.getElementById('counter-18');
  bNgTotal = parseInt(bNgCounter.value, 10) || 0;
  totalNg += bNgTotal;

  // Update the NG total input with the calculated total NG
  document.getElementById('NG total').value = totalNg;

  // Initialize totalQuantity based on the process and each stage’s logic
  let totalQuantity;

  // Start from A stage, then proceed based on the active process type
  if (processType === 'A-D') {
      // Only A and D stages
      totalQuantity = aQuantity - dNgTotal;
  } else if (processType === 'A-B-D') {
      // If we're processing B (slit), initialize B with the initial value from A and dynamically update visible B quantity
      const initialBTotal = document.getElementById('initialBTotal');
      if (initialBTotal.value == 0) {
          // Set the initial value for B only once (when it's zero)
          initialBTotal.value = aQuantity;
      }
      bQuantityInput.value = initialBTotal.value - bNgTotal;  // Show B quantity after B NG deductions
      totalQuantity = bQuantityInput.value - dNgTotal;
  } else if (processType === 'A-C-D') {
      // If processing C (SRS), initialize C with the initial value from A and dynamically update visible C quantity
      const initialCTotal = document.getElementById('initialCTotal');
      if (initialCTotal.value == 0) {
          // Set the initial value for C only once (when it's zero)
          initialCTotal.value = aQuantity;
      }
      cQuantityInput.value = initialCTotal.value - cNgTotal;  // Show C quantity after C NG deductions
      totalQuantity = cQuantityInput.value - dNgTotal;
  } else if (processType === 'A-B-C-D') {
      // If processing B, initialize with A's initial value and dynamically update B quantity
      const initialBTotal = document.getElementById('initialBTotal');
      if (initialBTotal.value == 0) {
          initialBTotal.value = aQuantity;  // Set once when B is processed first
      }
      bQuantityInput.value = initialBTotal.value - bNgTotal;  // Show B quantity after B NG deductions

      // Update C's initial quantity based on the latest B quantity
      const initialCTotal = document.getElementById('initialCTotal');
      initialCTotal.value = bQuantityInput.value;  // Set C's initial total to the latest B total after B NG deductions
      cQuantityInput.value = initialCTotal.value - cNgTotal;  // Show C quantity after C NG deductions

      // Final calculation for D
      totalQuantity = cQuantityInput.value - dNgTotal;
  } else {
      // Default case if processType is not recognized
      totalQuantity = aQuantity;
      console.warn(`Unrecognized process type: ${processType}`);
  }

  // Display the calculated total quantity
  document.getElementById('total').value = totalQuantity;
}

// Add event listeners for dynamic updating of each stage quantity and process type
document.getElementById('Process Quantity').addEventListener('input', updateTotal);
document.getElementById('slit Quantity').addEventListener('input', updateTotal);
document.getElementById('SRSQuantity').addEventListener('input', updateTotal);
document.getElementById('process').addEventListener('input', updateTotal);

// Add listeners to each NG counter to dynamically update total when changed
for (let i = 1; i <= 18; i++) {
  document.getElementById(`counter-${i}`).addEventListener('input', updateTotal);
}
document.addEventListener("DOMContentLoaded", updateTotal);




// these codes just variables for displaying info

const productNumberInput = document.getElementById('product-number');
const modelInput = document.getElementById('model');
const shapeInput = document.getElementById('shape');
const RLInput = document.getElementById('R-L');
const materialInput = document.getElementById('material');
const materialCodeInput = document.getElementById('material-code');
const materialColorInput = document.getElementById('material-color');

// global variable for ip address input container
const ipInput = document.getElementById('ipInfo');






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
      localStorage.setItem("product-number",cleanedData);
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








function calculateTotalTime() {
  const kStartTime = document.getElementById("KStart Time").value;
  const kEndTime = document.getElementById("KEnd Time").value;
  const startTime = document.getElementById("Start Time").value;
  const endTime = document.getElementById("End Time").value;
  const quantity = document.getElementById("Process Quantity").value;


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

//This visits a new page to print that shit
  document.getElementById('printLabel').addEventListener('click', function(event) {
    // Prevent the form from submitting
    event.preventDefault();
    
    // Get the value of the hidden input field
    const printerCode = document.getElementById('printerCode').value;
    const url = `http://raspberrypi.local:5000/print?text=${printerCode}`;
    
    // Open a new tab with the desired URL
    const newTab = window.open(url, '_blank');
    
    // Set a timer to close the new tab after a delay (e.g., 1 seconds)
    setTimeout(() => {
      newTab.close();
    }, 5000); // 5000 milliseconds = 5 seconds
  });

  
  
// this is for dynamic process selection
  function updateProcessSections() {
    // Hide all sections initially
    const sections = ["sectionA", "sectionB", "sectionC"];
    sections.forEach(section => document.getElementById(section).style.display = "none");
  
    // Get the selected workflow
    const workflow = document.getElementById("process").value;
    let lastProcess = document.getElementById("Last Process").value;
    if (lastProcess === "" || lastProcess === null) {
        lastProcess = "A";
    }
    console.log("last process: "+lastProcess);
  
    // Display sections based on the selected workflow
    if (workflow === "A-D") {
        document.getElementById("sectionA").style.display = "block"; // Cutting
        
    } else if (workflow === "A-B-C-D") {
        document.getElementById("sectionA").style.display = "block"; // Cutting
        document.getElementById("sectionB").style.display = "block"; // Slit
        document.getElementById("sectionC").style.display = "block"; // SRS
        
    } else if (workflow === "A-B-D") {
        document.getElementById("sectionA").style.display = "block"; // Cutting
        document.getElementById("sectionB").style.display = "block"; // Slit
        
    } else if (workflow === "A-C-D") {
        document.getElementById("sectionA").style.display = "block"; // Cutting
        document.getElementById("sectionC").style.display = "block"; // SRS
        
    }
    // Set readonly inputs for B and C based on last process
    updateReadonlySections(workflow, lastProcess);
    console.log("last process: "+lastProcess, "workflow: " + workflow);
  }
// Initialize sections display when the page loads
document.addEventListener("DOMContentLoaded", updateProcessSections);




// Function to set the specified section's inputs and buttons to read-only/disabled
function setSectionReadonly(sectionId, readonly) {
  const section = document.getElementById(sectionId);
  if (section) {
      const inputs = section.querySelectorAll("input");
      const buttons = section.querySelectorAll("button");

      inputs.forEach(input => {
          input.readOnly = readonly;

          // Disable onfocus event for date and time inputs if readonly
          if (readonly && (input.type === "date" || input.type === "time")) {
              input.onfocus = null;
          }

          // If section is editable, re-enable onfocus events for date and time inputs
          else if (!readonly && (input.type === "date" || input.type === "time")) {
              input.onfocus = function() {
                  if (input.type === "date") setDefaultDate(this);
                  if (input.type === "time") setDefaultTime(this);
              };
          }
      });

      // Disable buttons if readonly, enable otherwise
      buttons.forEach(button => {
          button.disabled = readonly;
      });
  }
}

// Function to update readonly status based on workflow and last process
function updateReadonlySections(workflow, lastProcess) {
  // Always leave section A editable, so only reset sections B and C
  setSectionReadonly("sectionB", false);
  setSectionReadonly("sectionC", false);

  // Apply readonly based on the last process for each workflow, skipping A
  if (workflow === "A-B-C-D") {
      if (lastProcess === "B") {
          setSectionReadonly("sectionB", true);
      } else if (lastProcess === "C") {
          setSectionReadonly("sectionB", true);
          setSectionReadonly("sectionC", true);
      }
  } else if (workflow === "A-B-D") {
      if (lastProcess === "B") {
          setSectionReadonly("sectionB", true);
      }
  } else if (workflow === "A-C-D") {
      if (lastProcess === "C") {
          setSectionReadonly("sectionC", true);
      }
  }
}

// Initialize sections display and readonly settings when the page loads
document.addEventListener("DOMContentLoaded", updateProcessSections);



// Listener for the SRShatsumono Button
document.getElementById('SRShatsumonoButton').addEventListener('click', function(event) {
  event.preventDefault();
  const currentKojo = document.getElementById("hidden工場").value;
  const currentSebanggo = document.getElementById('sub-dropdown').value;
  const currentWorker = document.getElementById('SRS Operator Name').value;
  const buttonValue = "SRShatsumono";
  if (!currentSebanggo) {
      window.alert("Please select product first / 背番号選んでください");
      return;
  }

  const popup = window.open(`SRS hatsumono.html?sebanggo=${encodeURIComponent(currentSebanggo)}&kojo=${encodeURIComponent(currentKojo)}&buttonValue=${encodeURIComponent(buttonValue)}&worker=${encodeURIComponent(currentWorker)}`, 'QR Scanner', 'width=700,height=700');

  window.addEventListener('message', function(event) {
      if (event.origin === window.location.origin) {
          const hatsumonoStatus = event.data;
          console.log(`SRSHatsumonoStatus: ${hatsumonoStatus}`);

          // Update hidden inputs based on the received data
          for (const [key, value] of Object.entries(hatsumonoStatus)) {
              const input = document.getElementById(key.toLowerCase().replace(/\s+/g, '-'));
              console.log(input + " " + value);
              if (input) {
                  input.value = value;
              }
          }
          document.getElementById("SRShatsumonoLabel").textContent = "OK";
          localStorage.setItem("SRShatsumonoLabel","OK");
      }
  });
});