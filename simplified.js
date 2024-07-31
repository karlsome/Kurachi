// this code attempts to simplify the Google Sheet.js

// Define URLs for different Google Script endpoints
const scriptURL = 'https://script.google.com/macros/s/AKfycby-_1ZH5JUXYJk4qzSUVEekfJM5F4QG7qTys67uwXFm2p9q2O_SI1HnqEDzjQnSx30J/exec';
const dbURL = 'https://script.google.com/macros/s/AKfycbwBzPZgoNiUK_ez3AzK5FXFr8_AsmdBjCWGzulG3eh0cryirgVxtMzIF4ehh98QYdkpUg/exec';
const workerURL = 'https://script.google.com/macros/s/AKfycbxw4KtgqhSTVI4TKfQuT642LyvnkvYBQSh3IHaWc1GGI--89abQp0bUff-x8-rELeS_VQ/exec';
const picURL = 'https://script.google.com/macros/s/AKfycbwHUW1ia8hNZG-ljsguNq8K4LTPVnB6Ng_GLXIHmtJTdUgGGd2WoiQo9ToF-7PvcJh9bA/exec';
const printerCodeURL = 'https://script.google.com/macros/s/AKfycbxP9j_KH4fRe4io777vD-pnt9BQH9IwiS4JRrbsw8DkoDCfaAcdHeH7pbIWIy2ue_8jcQ/exec';
const ipURL = 'https://script.google.com/macros/s/AKfycbyC6-KiT3xwGiahhzhB-L-OOL8ufG0WqnT5mjEelGBKGnbiqVAS6qjT78FlzBUHqTn3Gg/exec';

const form = document.forms['contact-form'];
const filterValue = '倉知'; // Division filter value

// Submit form event listener
form.addEventListener('submit', e => {
  e.preventDefault();
  fetch(scriptURL, { method: 'POST', body: new FormData(form), mode: 'no-cors' })
    .then(() => alert("Thank you! Your form is submitted successfully."))
    .then(() => window.location.reload())
    .catch(error => console.error('Error!', error.message));
});

// Toggle inputs based on checkbox status
function toggleInputs() {
  const isChecked = document.getElementById('enable-inputs').checked;
  const inputs = document.querySelectorAll('#Kensa\\ Name, #KDate, #KStart\\ Time, #KEnd\\ Time, .plus-btn, .minus-btn, textarea[name="Comments2"], input[type="submit"], #在庫');
  inputs.forEach(input => input.disabled = !isChecked);
  document.getElementById('検査STATUS').value = isChecked ? "TRUE" : "false";
}

// Scan lot number and process with OCR
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const photo = document.getElementById('photo');
const highlightBox = document.getElementById('highlightBox');
const modal = document.getElementById('myModal');

const highlightBoxSize = { width: 80, height: 20 };
highlightBox.style.width = `${highlightBoxSize.width}px`;
highlightBox.style.height = `${highlightBoxSize.height}px`;

// Open modal and access camera
document.getElementById('scan-lot').addEventListener('click', () => {
  modal.style.display = 'block';
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then(stream => video.srcObject = stream)
    .catch(err => console.error("Error accessing the camera: ", err));
});

// Close modal and stop camera
document.querySelectorAll('.close, window').forEach(element => {
  element.addEventListener('click', () => {
    modal.style.display = 'none';
    video.srcObject.getTracks().forEach(track => track.stop());
  });
});

// Position highlight box on video
video.addEventListener('loadedmetadata', () => {
  highlightBox.style.left = `${(video.offsetWidth - highlightBoxSize.width) / 2}px`;
  highlightBox.style.top = `${(video.offsetHeight - highlightBoxSize.height) / 2}px`;
  highlightBox.style.display = 'block';
});

// Capture and process image from video
document.getElementById('capture').addEventListener('click', event => {
  event.preventDefault();
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

  Tesseract.recognize(selectionData, 'eng', { logger: m => console.log(m) })
    .then(({ data: { text } }) => {
      alert(text); // Display extracted text
      document.getElementById('材料ロット').value = text; // Set input value
      modal.style.display = 'none';
      video.srcObject.getTracks().forEach(track => track.stop()); // Stop camera
    });
});

// Set default time and date
function setDefaultTime(input) {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  input.value = `${hours}:${minutes}`;
  calculateTotalTime();
}

function setDefaultDate(input) {
  const now = new Date();
  input.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Get query parameters
function getQueryParam(param) {
  return new URLSearchParams(window.location.search).get(param);
}

const selectedValue = getQueryParam('selected');
const selectedFactory = getQueryParam('filter');
if (selectedValue) {
  document.getElementById('dropdown').textContent = selectedValue;
  document.getElementById('nippoTitle').textContent = `${selectedFactory}日報`;
  document.getElementById('checkboxLabel').textContent = `${selectedFactory}検査`;
  document.getElementById('hidden設備').value = selectedValue;
  document.getElementById('hidden工場').value = selectedFactory;
  LoadList(selectedValue);
}

// Load and populate dynamic dropdown list
function LoadList(selectedValue) {
  fetchSubDropdownData(selectedValue);
}

function fetchSubDropdownData(selectedValue) {
  fetch(`${dbURL}?filterE=${selectedValue}`)
    .then(response => response.json())
    .then(data => {
      const subDropdown = document.getElementById('sub-dropdown');
      subDropdown.innerHTML = '<option value=""></option>'; // Clear existing options and add default

      data.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        subDropdown.appendChild(opt);
      });

      subDropdown.addEventListener('change', () => {
        const selectedValue = subDropdown.value;
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
      });
    })
    .catch(error => console.error('Error fetching sub-dropdown options:', error));
}

// Send request to NC cutter's PC
function sendtoNC() {
  const ipAddress = document.getElementById('ipInfo').value;
  const currentSebanggo = document.getElementById('sub-dropdown').value;
  const url = `http://${ipAddress}:5000/request?filename=${currentSebanggo}.pce`;

  const newTab = window.open(url, '_blank');
  setTimeout(() => newTab.close(), 5000);
}

document.getElementById('sendtoNC').addEventListener('click', sendtoNC);

// QR Code button listener
// QR Code button listener
document.getElementById('scan-button').addEventListener('click', () => {
    const popup = window.open('popup.html', 'QR Scanner', 'width=400,height=300');
  
    window.addEventListener('message', event => {
      if (event.origin === window.location.origin) {
        document.getElementById('材料ロット').value = event.data;
      }
    });
  });
  
  // Information fetching functions
  function fetchAndUpdate(url, elementId) {
    fetch(url)
      .then(response => response.json())
      .then(data => document.getElementById(elementId).textContent = data)
      .catch(error => console.error(`Error fetching ${elementId} info:`, error));
  }
  
  function productNumberInfo(productNumber) {
    fetchAndUpdate(`${dbURL}?filter=${productNumber}&type=number`, 'product-number-info');
  }
  
  function modelInfo(productNumber) {
    fetchAndUpdate(`${dbURL}?filter=${productNumber}&type=model`, 'model-info');
  }
  
  function shapeInfo(productNumber) {
    fetchAndUpdate(`${dbURL}?filter=${productNumber}&type=shape`, 'shape-info');
  }
  
  function RLInfo(productNumber) {
    fetchAndUpdate(`${dbURL}?filter=${productNumber}&type=RL`, 'RL-info');
  }
  
  function materialInfo(productNumber) {
    fetchAndUpdate(`${dbURL}?filter=${productNumber}&type=material`, 'material-info');
  }
  
  function materialCodeInfo(productNumber) {
    fetchAndUpdate(`${dbURL}?filter=${productNumber}&type=materialCode`, 'material-code-info');
  }
  
  function materialColorInfo(productNumber) {
    fetchAndUpdate(`${dbURL}?filter=${productNumber}&type=materialColor`, 'material-color-info');
  }
  
  function picLINK(productNumber) {
    fetchAndUpdate(`${picURL}?filter=${productNumber}`, 'pic-info');
  }
  
  function printerCode(productNumber) {
    fetchAndUpdate(`${printerCodeURL}?filter=${productNumber}`, 'printer-code-info');
  }
  
  function getIP() {
    fetchAndUpdate(ipURL, 'ip-info');
  }