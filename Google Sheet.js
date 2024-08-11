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



const form = document.forms['contact-form']
const filterValue = '倉知'; // put division here

// when submit form is pressed
form.addEventListener('submit', e => {
  e.preventDefault();
  calculateTotalTime();
  fetch(scriptURL, { method: 'POST', body: new FormData(form), mode: 'no-cors' })
    .then(response => alert("Thank you! your form is submitted successfully."))
    .then(() => { window.location.reload(); })
    .catch(error => console.error('Error!', error.message))
})
// form.addEventListener('submit', function(event) {
//   event.preventDefault();
//   const formData = new FormData(form);
//   const data = {};
//   formData.forEach((value, key) => {
//       data[key] = value;
//   });

//   if (navigator.onLine) {
//       sendDataToServer([data]);
//   } else {
//       saveDataLocally(data);
//   }
// });

// window.addEventListener('online', function() {
//   const savedData = JSON.parse(localStorage.getItem('formDataArray') || '[]');
//   if (savedData.length > 0) {
//       sendDataToServer(savedData);
//   }
// });

// function saveDataLocally(data) {
//   let formDataArray = JSON.parse(localStorage.getItem('formDataArray') || '[]');
//   formDataArray.push(data);
//   localStorage.setItem('formDataArray', JSON.stringify(formDataArray));
//   alert('You are offline. Data has been saved locally.');
//   window.location.reload();
// }

// function sendDataToServer(dataArray) {
//   dataArray.forEach(data => {
//       fetch(scriptURL, { 
//           method: 'POST', 
//           body: new URLSearchParams(data), 
//           mode: 'no-cors' 
//       })
//       .then(() => {
//           // Remove the submitted data from localStorage
//           let formDataArray = JSON.parse(localStorage.getItem('formDataArray') || '[]');
//           formDataArray = formDataArray.filter(savedData => JSON.stringify(savedData) !== JSON.stringify(data));
//           localStorage.setItem('formDataArray', JSON.stringify(formDataArray));
//       })
//       .catch(error => {
//           console.error('Error sending data:', error);
//       });
//   });
  
//   alert('All offline data sent successfully!');
//   window.location.reload();
// }


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
      // selectedValue is Sebanggo
      
      subDropdown.addEventListener('change', function () {
        const rikeshiInput2 = document.getElementById('rikeshi');
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
        getRikeshi(selectedValue);
        getIP();
        updateSheetStatus();

        
        //sendtoNC(selectedValue);
      });
    })
    .catch(error => console.error('Error fetching sub-dropdown options:', error));
}

function updateSheetStatus(){
  fetch('https://script.google.com/macros/s/AKfycbwbL30hlX9nBlQH4dwxlbdxSM5kJtgtNEQJQInA1mgXlEhYJxFHykZkdXV38deR6P83Ow/exec', {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      'current': 'BM03',
      'machine': 'OZNC01'
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
  const ipAddress = document.getElementById('ipInfo').value;
  const currentSebanggo = document.getElementById('sub-dropdown').value;
  const machineName = document.getElementById('hidden設備').value;
  //window.alert(machineName + currentSebanggo);

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
const rikeshiInput = document.getElementById('rikeshi');

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



// Function to fetch rikeshi up or down color info
function getRikeshi(headerValue) {
  fetch(`${dbURL}?rikeshi=${headerValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      const cleanedData = data.replace(/"/g, '');
      rikeshiInput.value = cleanedData;
      sendtoShowVideo(cleanedData);
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

function showVideo(videoToShowId) {
  const videoContainer = document.getElementById('videoContainer');
  const videoToShow = document.getElementById(videoToShowId);
  const allVideos = document.querySelectorAll('.video-element');

  // Hide all video elements and pause them
  allVideos.forEach(video => {
    video.classList.add('hidden');
    video.classList.remove('active-video'); // Remove active-video class
    video.pause();
    video.currentTime = 0;
  });

  // Show the video container and the specific video
  videoContainer.classList.remove('hidden');
  videoToShow.classList.remove('hidden');
  videoToShow.classList.add('active-video'); // Add active-video class

  // Autoplay the video
  videoToShow.play();

  // Automatically hide the video container after 4 seconds
  setTimeout(closeVideoPopup, 4000);
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
}




