
//link for final report
const scriptURL = 'https://script.google.com/macros/s/AKfycby-_1ZH5JUXYJk4qzSUVEekfJM5F4QG7qTys67uwXFm2p9q2O_SI1HnqEDzjQnSx30J/exec'

//link for database (nakaya)
const dbURL = 'https://script.google.com/macros/s/AKfycbwBzPZgoNiUK_ez3AzK5FXFr8_AsmdBjCWGzulG3eh0cryirgVxtMzIF4ehh98QYdkpUg/exec';

//link for worker database
const workerURL = 'https://script.google.com/macros/s/AKfycbxw4KtgqhSTVI4TKfQuT642LyvnkvYBQSh3IHaWc1GGI--89abQp0bUff-x8-rELeS_VQ/exec';

const form = document.forms['contact-form']
const filterValue = '倉知'; // put division here


//when submit form is pressed
form.addEventListener('submit', e => {
  e.preventDefault()
  fetch(scriptURL, { method: 'POST', body: new FormData(form),mode:'no-cors'})
  .then(response => alert("Thank you! your form is submitted successfully." ))
  .then(() => { window.location.reload(); })
  .catch(error => console.error('Error!', error.message))
})


//when time is pressed
function setDefaultTime(input) {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  input.value = `${hours}:${minutes}`;
}


//when date is pressed
function setDefaultDate(input) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  input.value = `${year}-${month}-${day}`;
}




//for the dynamic dropdown list (machine list)
document.addEventListener('DOMContentLoaded', function() {
  
  fetch(`${dbURL}?filter=${filterValue}`)
  .then(response => response.json())
  .then(data => {
          const dropdown = document.getElementById('dropdown');
          data.forEach(option => {
              const opt = document.createElement('option');
              opt.value = option;
              opt.textContent = option;
              dropdown.appendChild(opt);
          });
          // add an event listener to the first dropdown
          dropdown.addEventListener('change', function() {
            const selectedValue = this.value;
            fetch(`${dbURL}?filterE=${selectedValue}`)
            .then(response => response.json())
            .then(data => {
                  const subDropdown = document.getElementById('sub-dropdown');
                  subDropdown.innerHTML = ''; // clear the options
                  data.forEach(option => {
                    const opt = document.createElement('option');
                    opt.value = option;
                    opt.textContent = option;
                    subDropdown.appendChild(opt);
                  });
               })
            .catch(error => console.error('Error fetching sub-dropdown options:', error));
          });
      })
  .catch(error => console.error('Error fetching dropdown options:', error));
});


document.addEventListener('DOMContentLoaded', function() {
  fetch(`${workerURL}?division=${filterValue}`)
 .then(response => response.json())
 .then(data => {
    const suggestionsList = document.getElementById('machine-operator-suggestions');
    data.forEach(option => {
      const suggestion = document.createElement('option');
      suggestion.value = option;
      suggestion.textContent = option;
      suggestionsList.appendChild(suggestion);
    });
  })
 .catch(error => console.error('Error fetching machine operator suggestions:', error));
});
