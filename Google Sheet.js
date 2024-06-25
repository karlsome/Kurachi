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




const productNumberInput = document.getElementById('product-number');

// Function to fetch data based on header parameter
function fetchData(headerValue, searchValue) {
  fetch(`${dbURL}?header=${headerValue}`)
    .then(response => response.json())
    .then(data => {
      // Find the row where the specified column (headerValue) matches the searchValue
      const row = data.find(item => item[headerValue] === searchValue);
      // Display the product number if a matching row is found, otherwise display 'No data found'
      if (row) {
        productNumberInput.value = row['品番'];
      } else {
        productNumberInput.value = 'No data found';
      }
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

// Usage
const header = '背番号'; // Set the header value
const searchValue = 'BM03'; // Set the specific value to search for
fetchData(header, searchValue);




