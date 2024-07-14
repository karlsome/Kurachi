// link for final report
const scriptURL = 'https://script.google.com/macros/s/AKfycby-_1ZH5JUXYJk4qzSUVEekfJM5F4QG7qTys67uwXFm2p9q2O_SI1HnqEDzjQnSx30J/exec'

// link for database (nakaya -> main)
const dbURL = 'https://script.google.com/macros/s/AKfycbwBzPZgoNiUK_ez3AzK5FXFr8_AsmdBjCWGzulG3eh0cryirgVxtMzIF4ehh98QYdkpUg/exec';

// link for worker database
const workerURL = 'https://script.google.com/macros/s/AKfycbxw4KtgqhSTVI4TKfQuT642LyvnkvYBQSh3IHaWc1GGI--89abQp0bUff-x8-rELeS_VQ/exec';

// link for pictures database
const picURL = 'https://script.google.com/macros/s/AKfycbwHUW1ia8hNZG-ljsguNq8K4LTPVnB6Ng_GLXIHmtJTdUgGGd2WoiQo9ToF-7PvcJh9bA/exec';



const form = document.forms['contact-form']
const filterValue = '倉知'; // put division here

// when submit form is pressed
form.addEventListener('submit', e => {
  e.preventDefault()
  fetch(scriptURL, { method: 'POST', body: new FormData(form), mode: 'no-cors' })
    .then(response => alert("Thank you! your form is submitted successfully."))
    .then(() => { window.location.reload(); })
    .catch(error => console.error('Error!', error.message))
})


 //when checkbox is checked
function toggleInputs() {  
  var isChecked = document.getElementById('enable-inputs').checked;  
  var inputs = document.querySelectorAll('#Kensa\\ Name, #KDate, #KStart\\ Time, #KEnd\\ Time,.plus-btn,.minus-btn, textarea[name="Comments2"], input[type="submit"],#在庫');  
  inputs.forEach(function(input) {  
    input.disabled =!isChecked;  
  });  

    
  // Enable all inputs inside the counter container when the checkbox is checked  
  if (isChecked) {  
    var counterInputs = document.querySelectorAll('.counter-container input');  
    counterInputs.forEach(function(input) {  
      input.disabled = false;  
    });  
  }  
}  


// when time is pressed
function setDefaultTime(input) {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  input.value = `${hours}:${minutes}`;
  calculateTotalTime();
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
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

const selectedValue = getQueryParam('selected');
const selectedFactory = getQueryParam('filter');
if (selectedValue) {
  document.getElementById('dropdown').textContent = selectedValue;
  document.getElementById('nippoTitle').textContent = selectedFactory+"日報";
  document.getElementById('checkboxLabel').textContent = selectedFactory+"検査";
  document.getElementById('hidden設備').value = selectedValue;
  document.getElementById('hidden工場').value = selectedFactory;
  LoadList(selectedValue);
}




// for the dynamic dropdown list (machine list)
function LoadList(selectedValue) {
  
       var dropdown = selectedValue;
          
      // Fetch and populate the second dropdown based on the initial value of the first dropdown
      const initialSelectedValue = dropdown;
      
      fetchSubDropdownData(initialSelectedValue);
}



// Function to fetch and populate the second dropdown
function fetchSubDropdownData(selectedValue) {
  fetch(`${dbURL}?filterE=${selectedValue}`)
    .then(response => response.json())
    .then(data => {
      const subDropdown = document.getElementById('sub-dropdown');
      subDropdown.innerHTML = ''; // Clear the existing options
      
      // Populate the second dropdown
      data.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        subDropdown.appendChild(opt);
      });

      // Alert the value of the second dropdown immediately after populating
      // call function to put value of dropdown 2 to fetch google sheets
      if (subDropdown.options.length > 0) {
        productNumberInfo(subDropdown.value);
        modelInfo(subDropdown.value);
        shapeInfo(subDropdown.value);
        RLInfo(subDropdown.value);
        materialInfo(subDropdown.value);
        materialCodeInfo(subDropdown.value);
        materialColorInfo(subDropdown.value);
        picLINK(subDropdown.value);
      }
      
      // Add event listener to the second dropdown to alert the selected value
      subDropdown.addEventListener('change', function () {
        const selectedValue = this.value;
        productNumberInfo(selectedValue);
        modelInfo(subDropdown.value);
        shapeInfo(subDropdown.value);
        RLInfo(subDropdown.value);
        materialInfo(subDropdown.value);
        materialCodeInfo(subDropdown.value);
        materialColorInfo(subDropdown.value);
        picLINK(subDropdown.value);
      });
    })
    .catch(error => console.error('Error fetching sub-dropdown options:', error));
}




// suggestion for worker name
document.addEventListener('DOMContentLoaded', function () {
  fetch(`${workerURL}?division=${filterValue}`)
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
  fetch(`${workerURL}?division=${filterValue}`)
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

function updateTotal() {
  let ngTotal = 0;
  for (let i = 1; i <= 12; i++) {
    const counterElement = document.getElementById(`counter-${i}`);
    ngTotal += parseInt(counterElement.value, 10);
  }
  document.getElementById('NG total').value = ngTotal;
  
  const processQuantity = parseInt(document.getElementById('Process Quantity').value, 10) || 0;
  const totalQuantity = processQuantity - ngTotal;
  document.getElementById('total').value = totalQuantity;
}

// Add event listener to process quantity input
document.getElementById('Process Quantity').addEventListener('input', updateTotal);



// these codes just variables for displaying info

const productNumberInput = document.getElementById('product-number');
const modelInput = document.getElementById('model');
const shapeInput = document.getElementById('shape');
const RLInput = document.getElementById('R-L');
const materialInput = document.getElementById('material');
const materialCodeInput = document.getElementById('material-code');
const materialColorInput = document.getElementById('material-color');



// Function to fetch product info
function productNumberInfo(headerValue) {
  fetch(`${dbURL}?productNumber=${headerValue}`)
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
  fetch(`${dbURL}?model=${headerValue}`)
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
  fetch(`${dbURL}?shape=${headerValue}`)
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
  fetch(`${dbURL}?rl=${headerValue}`)
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
  fetch(`${dbURL}?material=${headerValue}`)
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
  fetch(`${dbURL}?materialcode=${headerValue}`)
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
  fetch(`${dbURL}?materialcolor=${headerValue}`)
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



//This is a listener for the QR Code Button
document.getElementById('scan-button').addEventListener('click', function() {
  //pops up window using popup.html
  const popup = window.open('popup.html', 'QR Scanner', 'width=400,height=300');
  
  window.addEventListener('message', function(event) {
      if (event.origin === window.location.origin) {
          
          // event.data is the QR code value which is stored inside BarcodeValue
          var BarcodeValue = event.data;
          console.log(`QR Code detected: ${BarcodeValue}`);

          SubDropdownChange(BarcodeValue);

      }
  });
});

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
    })
    .catch(error => console.error('Error fetching sub-dropdown options:', error));
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
      
      
  }

}

//this function is from index.html
function navigateTo(location) {
  window.location.href = `machine.html?selected=${location}`;
}



