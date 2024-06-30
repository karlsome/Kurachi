// link for final report
const scriptURL = 'https://script.google.com/macros/s/AKfycby-_1ZH5JUXYJk4qzSUVEekfJM5F4QG7qTys67uwXFm2p9q2O_SI1HnqEDzjQnSx30J/exec'

// link for database (nakaya -> main)
const dbURL = 'https://script.google.com/macros/s/AKfycbwBzPZgoNiUK_ez3AzK5FXFr8_AsmdBjCWGzulG3eh0cryirgVxtMzIF4ehh98QYdkpUg/exec';

// link for worker database
const workerURL = 'https://script.google.com/macros/s/AKfycbxw4KtgqhSTVI4TKfQuT642LyvnkvYBQSh3IHaWc1GGI--89abQp0bUff-x8-rELeS_VQ/exec';



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
  var inputs = document.querySelectorAll('#Kensa\\ Name, #KDate, #KStart\\ Time, #KEnd\\ Time, .plus-btn, .minus-btn, textarea[name="Comments2"], input[type="submit"]');
  inputs.forEach(function(input) {
      input.disabled = !isChecked;
  });
}

// when time is pressed
function setDefaultTime(input) {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  input.value = `${hours}:${minutes}`;
}

// when date is pressed
function setDefaultDate(input) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  input.value = `${year}-${month}-${day}`;
}

// for the dynamic dropdown list (machine list)
document.addEventListener('DOMContentLoaded', function () {
  fetch(`${dbURL}?filter=${filterValue}`)
    .then(response => response.json())
    .then(data => {
      const dropdown = document.getElementById('dropdown');
      
      // Populate the first dropdown
      data.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        dropdown.appendChild(opt);
      });
      
      // Fetch and populate the second dropdown based on the initial value of the first dropdown
      const initialSelectedValue = dropdown.value;
      fetchSubDropdownData(initialSelectedValue);
      
      // Add an event listener to update the second dropdown when the first dropdown changes
      dropdown.addEventListener('change', function () {
        const selectedValue = this.value;
        fetchSubDropdownData(selectedValue);
      });
    })
    .catch(error => console.error('Error fetching dropdown options:', error));
});

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
      if (subDropdown.options.length > 0) {
        productNumberInfo(subDropdown.value);
        modelInfo(subDropdown.value);
        shapeInfo(subDropdown.value);
        RLInfo(subDropdown.value);
        materialInfo(subDropdown.value);
        materialCodeInfo(subDropdown.value);
        materialColorInfo(subDropdown.value);
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

function incrementCounter(counterId) {
  const counterElement = document.getElementById(`counter-${counterId}`);
  let currentValue = parseInt(counterElement.value, 10);
  counterElement.value = currentValue + 1;
}

function decrementCounter(counterId) {
  const counterElement = document.getElementById(`counter-${counterId}`);
  let currentValue = parseInt(counterElement.value, 10);
  if (currentValue > 0) {
      counterElement.value = currentValue - 1;
  }
}



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
      productNumberInput.value = data;
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
      modelInput.value = data;
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
      shapeInput.value = data;
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
      RLInput.value = data;
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
      materialInput.value = data;
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
      materialCodeInput.value = data;
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
      materialColorInput.value = data;
    })
    .catch(error => {
      console.error('Error:', error);
    });
}


