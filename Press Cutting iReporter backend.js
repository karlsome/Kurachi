
const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";

// link for pictures database
const picURL = 'https://script.google.com/macros/s/AKfycbwHUW1ia8hNZG-ljsguNq8K4LTPVnB6Ng_GLXIHmtJTdUgGGd2WoiQo9ToF-7PvcJh9bA/exec';


// Auto-resize textarea based on content
function autoResizeTextarea(textarea) {
  if (!textarea) return;
  
  // Reset height to recalculate
  textarea.style.height = 'auto';
  
  // Set height based on scroll height
  const newHeight = Math.max(38, textarea.scrollHeight);
  textarea.style.height = newHeight + 'px';
}


//this code listens to incoming parameters passed
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}
const selectedFactory = getQueryParam('filter');
if (selectedFactory){
  document.getElementById('selected工場').value = selectedFactory;
  document.getElementById('nippoTitle').textContent=selectedFactory + "日報";
  console.log("kojo changed to: " + selectedFactory);
}




// Select all input, select, and button elements
const inputs = document.querySelectorAll('input, select, button,textarea');
const selected工場 = document.getElementById('selected工場').value; // Get the current factory value
const pageName = location.pathname.split('/').pop(); // Get the current HTML file name
const uniquePrefix = `${pageName}_${selected工場}_`;



// Save the value of each input to localStorage on change
inputs.forEach(input => {
    input.addEventListener('input', () => {
        const key = `${uniquePrefix}${input.id || input.name}`; // Prefix key with pageName and selected工場
        if (key) {
            localStorage.setItem(key, input.value);
        }
    });

    if (input.type === 'checkbox' || input.type === 'radio') {
        input.addEventListener('change', () => {
            const key = `${uniquePrefix}${input.id || input.name}`;
            if (key) {
                localStorage.setItem(key, input.checked); // Save checkbox/radio state
            }
        });
    }
});



// Restore the values of input fields, images, and textContent from localStorage on page load
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('uploadingModal').style.display = 'none'; // this turns off the uploading modal
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
      if (key.startsWith(`${uniquePrefix}`)) {
          const savedValue = localStorage.getItem(key);

          if (savedValue !== null) {
              // Match each input with its respective localStorage key
              inputs.forEach(input => {
                  const inputKey = `${uniquePrefix}${input.id || input.name}`;
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
                                  checkProcessCondition();
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
                  const textKey = `${uniquePrefix}${element.id}.textContent`;
                  if (key === textKey) {
                      element.textContent = savedValue; // Restore textContent
                      console.log(`Restored textContent for ${element.id}:`, savedValue);
                  }
              });

              // Restore image sources dynamically
              images.forEach(image => {
                  const imageKey = `${uniquePrefix}${image.id || image.name}.src`;
                  if (key === imageKey) {
                      image.src = savedValue; // Restore the image source
                      image.style.display = 'block'; // Ensure the image is visible
                      console.log(`Restored ${image.id || image.name} image src:`, savedValue);
                      
                      // Update button color to green if image exists
                      if (savedValue && savedValue !== '') {
                        if (image.id === 'hatsumonoPic') {
                          const hatsumonoButton = document.getElementById('hatsumonoButton');
                          if (hatsumonoButton) hatsumonoButton.classList.add('has-photo');
                        } else if (image.id === 'atomonoPic') {
                          const atomonoButton = document.getElementById('atomonoButton');
                          if (atomonoButton) atomonoButton.classList.add('has-photo');
                        }
                      }
                  }
              });
              updateTotal();
              
          }
      }
  });
  
  // Auto-resize material textarea after restoration
  const materialField = document.getElementById('material');
  if (materialField) {
    autoResizeTextarea(materialField);
  }

  // Log the restored value for debugging (Optional)
  if (processElement) {
      console.log('Process value after restoration:', processElement.value); // Debugging the restored process value
  }
});



//helper function to determine if a second scan is currently required based on factory and process
function isSecondScanCurrentlyRequired(factory, process) {
    // --- CONFIGURATION FLAG ---
    // Set to false for TEMPORARY logic (only 第二工場 needs 2nd scan)
    // Set to true for FULL future logic
    const ENABLE_FULL_SECOND_SCAN_LOGIC = false; 
    // --- END CONFIGURATION FLAG ---

    if (ENABLE_FULL_SECOND_SCAN_LOGIC) {
        // === FULL FUTURE LOGIC ===
        if (factory === "第二工場") return false;
        if (factory === "肥田瀬") return true;
        if (factory === "SCNA") return true; // SCNA will require it
        if (factory === "NFH" && process !== "RLC") return true;
        
        // Default for full logic: if not listed above, or if NFH and RLC, second scan is not required.
        return false;
    } else {
        // === TEMPORARY LOGIC ===  
        // Only 第二工場 requires a second scan for now.
        return false;
    }
}





// this function fetches setsubi list (process.value)
async function fetchSetsubiList() {
  const factory = document.getElementById("selected工場").value;
  
  if (factory === '肥田瀬' || factory ==='第二工場') {
    disableInputs();
    console.log("this is runned");
  }

  try {
    // Fetch data for the process dropdown
    const response = await fetch(`${serverURL}/getSetsubiList?factory=${encodeURIComponent(factory)}`);
    const data = await response.json();
    

    // Get unique values of `設備`
    const uniqueSetsubi = [...new Set(data.map(item => item.設備))];
    
    // Select the process dropdown element
    const processDropdown = document.getElementById("process");

    if (!processDropdown) {
      console.error("Process dropdown with id 'process' not found.");
      return;
    }

    // Clear any existing options
    processDropdown.innerHTML = "";

    // Populate the process dropdown with unique 設備 values
    uniqueSetsubi.forEach(equipment => {
      const option = document.createElement("option");
      option.value = equipment;
      option.textContent = equipment;
      processDropdown.appendChild(option);
    });

    console.log("Process dropdown populated with options.");

    // Automatically call fetchSebanggo to populate the sub-dropdown
    fetchSebanggo();
    checkProcessCondition();

  } catch (error) {
    console.error("Error fetching data:", error);
  }
}


// this function fetches sebanggo list
// async function fetchSebanggo() {
//   // Get the selected process from the process dropdown
//   const 工場 = document.getElementById("selected工場").value;
//   blankInfo();

//   try {
//     // Fetch 背番号 values from the server based on the selected process
//     const response = await fetch(`${serverURL}/getSeBanggoListPress?工場=${encodeURIComponent(工場)}`);
//     const data = await response.json();
//     data.sort((a, b) => a.localeCompare(b, 'ja')); // 'ja' for Japanese sorting if needed // sort alphabetically

//     // Get the sub-dropdown element
//     const subDropdown = document.getElementById("sub-dropdown");

//     // Clear any existing options in the sub-dropdown
//     subDropdown.innerHTML = "";

//     // Add a blank option at the top
//     const blankOption = document.createElement("option");
//     blankOption.value = "";
//     blankOption.textContent = "Select 背番号";
//     subDropdown.appendChild(blankOption);

//     // Populate the sub-dropdown with new options based on the 背番号 values
//     data.forEach(item => {
//       const option = document.createElement("option");
//       option.value = item;
//       option.textContent = item;
//       subDropdown.appendChild(option);
//     });

//     console.log("Sub-dropdown populated with 背番号 options:", data);
    
//   } catch (error) {
//     console.error("Error fetching 背番号 data:", error);
//   }
// }

// // Call fetchSetsubiList when the page loads
// document.addEventListener("DOMContentLoaded", fetchSetsubiList);

// Function to fetch 背番号 and 品番 list
async function fetchSebanggo() {
  // Get the selected 工場 from the dropdown
  const 工場 = document.getElementById("selected工場").value;
  blankInfo();

  try {
    // Fetch 背番号 and 品番 values from the server
    const response = await fetch(`${serverURL}/getSeBanggoListPressAndHinban?工場=${encodeURIComponent(工場)}`);
    const data = await response.json();
    console.log(data);

    // Separate 背番号 and 品番 into different arrays
    const sebanggoList = data.map(item => item.背番号).filter(Boolean); // Remove null/undefined
    const hinbanList = data.map(item => item.品番).filter(Boolean); // Remove null/undefined

    // Sort both lists alphabetically
    sebanggoList.sort((a, b) => a.localeCompare(b, 'ja')); // 'ja' for Japanese sorting
    hinbanList.sort((a, b) => a.localeCompare(b, 'ja'));

    // Get the sub-dropdown element
    const subDropdown = document.getElementById("sub-dropdown");

    // Clear any existing options in the sub-dropdown
    subDropdown.innerHTML = "";

    // Add a blank option at the top
    const blankOption = document.createElement("option");
    blankOption.value = "";
    blankOption.textContent = "Select 背番号 / 品番";
    subDropdown.appendChild(blankOption);

    // Populate the sub-dropdown with 背番号 values first
    sebanggoList.forEach(sebanggo => {
      const option = document.createElement("option");
      option.value = sebanggo;
      option.textContent = sebanggo;
      subDropdown.appendChild(option);
    });

    // Add a separator (optional)
    if (hinbanList.length > 0) {
      const separatorOption = document.createElement("option");
      separatorOption.disabled = true; // Make it unselectable
      separatorOption.textContent = "------ 品番 ------";
      subDropdown.appendChild(separatorOption);
    }

    // Populate the sub-dropdown with 品番 values at the bottom
    hinbanList.forEach(hinban => {
      const option = document.createElement("option");
      option.value = hinban;
      option.textContent = hinban;
      subDropdown.appendChild(option);
    });

    console.log("Sub-dropdown populated with 背番号 and 品番 options:", { sebanggoList, hinbanList });

  } catch (error) {
    console.error("Error fetching 背番号 and 品番 data:", error);
  }
}

// Call fetchSetsubiList when the page loads
document.addEventListener("DOMContentLoaded", fetchSetsubiList);


//blanks the info page
function blankInfo() {
  // Clear the value of the label with id "SRScode"
  //document.getElementById("SRScode").textContent = "";

  // Clear the values of all input fields
  document.getElementById("product-number").value = "";
  document.getElementById("model").value = "";
  document.getElementById("shape").value = "";
  document.getElementById("R-L").value = "";
  
  const materialField = document.getElementById("material");
  materialField.value = "";
  autoResizeTextarea(materialField);
  
  document.getElementById("material-code").value = "";
  document.getElementById("material-color").value = "";
  document.getElementById("送りピッチ").value = "";
  const expectedBoardDataInputElement = document.getElementById("expectedBoardDataQR");
    if (expectedBoardDataInputElement) {
        expectedBoardDataInputElement.value = "";
    }
}



// this function is to disable or enable input fields
function disableInputs() {
  inputs.forEach(input => {
      if (
          input.id !== 'scan-button' && 
          input.id !== 'sub-dropdown' && 
          input.id !== 'process' && 
          input.id !== 'reset-button'&& // Specifically exclude the reset button
          input.id !== "selectBluetooth"&&
          input.id !== "selectCamera"
      ) {
          input.disabled = true;
      }
  });
}


function enableInputs() {
  inputs.forEach(input => {
      if (input.id !== 'sub-dropdown') { // Keep sub-dropdown enabled
          input.disabled = false;
      }
  });
}



// // Function to fetch product details based on 背番号 or 品番
// async function fetchProductDetails() {
//   checkProcessCondition();
//   enableInputs(); // Delete this in production

//   const subDropdown = document.getElementById("sub-dropdown");
//   const serialNumber = subDropdown.value;
//   const factory = document.getElementById("selected工場").value;
//   const dynamicImage = document.getElementById("dynamicImage");
//   dynamicImage.src = "";

//   if (!serialNumber) {
//     console.error("Please select a valid 背番号 or 品番.");
//     blankInfo();
//     return;
//   }

//   try {
//     // Step 1: Try query by 背番号
//     let response = await fetch(`${serverURL}/queries`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         dbName: "Sasaki_Coating_MasterDB",
//         collectionName: "masterDB",
//         query: { 背番号: serialNumber },
//       }),
//     });

//     let result = await response.json();

//     // Step 2: If not found, try query by 品番
//     if (!result || result.length === 0) {
//       const altRes = await fetch(`${serverURL}/queries`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           dbName: "Sasaki_Coating_MasterDB",
//           collectionName: "masterDB",
//           query: { 品番: serialNumber },
//         }),
//       });

//       const altResult = await altRes.json();

//       if (altResult.length > 0) {
//         const matched = altResult[0];
//         if (matched.背番号) {
//           subDropdown.value = matched.背番号; // Update dropdown to 背番号
//         }
//         result = [matched];
//       }
//     }

//     // Step 3: Still no result
//     if (!result || result.length === 0) {
//       console.error("No matching product found.");
//       blankInfo();
//       return;
//     }

//     const product = result[0];

//     // Step 4: Display image from imageURL (Firebase)
//     if (product.imageURL) {
//       dynamicImage.src = product.imageURL;
//       dynamicImage.alt = "Product Image";
//       dynamicImage.style.display = "block";
//     } else {
//       dynamicImage.src = "";
//       dynamicImage.alt = "No Image Available";
//       dynamicImage.style.display = "none";
//     }

//     // Step 5: Populate product fields
//     document.getElementById("product-number").value = product.品番 || "";
//     document.getElementById("model").value = product.モデル || "";
//     document.getElementById("shape").value = product.形状 || "";
//     document.getElementById("R-L").value = product["R/L"] || "";
//     document.getElementById("material").value = product.材料 || "";
//     document.getElementById("material-code").value = product.材料背番号 || "";
//     document.getElementById("material-color").value = product.色 || "";
//     document.getElementById("kataban").value = product.型番 || "";
//     document.getElementById("収容数").value = product.収容数 || "";
//     document.getElementById("送りピッチ").textContent = "送りピッチ: " + (product.送りピッチ || "");
//     document.getElementById("SRS").value = product.SRS || "";

//   } catch (error) {
//     console.error("Error fetching product details:", error);
//   }
// }

// // Trigger on change
// document.getElementById("sub-dropdown").addEventListener("change", fetchProductDetails);

// Function to fetch product details based on 背番号 or 品番
// Function to fetch product details based on 背番号 or 品番
// async function fetchProductDetails() {
//     //const currenFactory = document.getElementById("selected工場").value;
//     // if(currenFactory === '第二工場') {
//     //   checkProcessCondition(); // Consider if this is needed here or better handled by the calling function's flow

//     // }
//     // // checkProcessCondition(); // Consider if this is needed here or better handled by the calling function's flow

//     // if (currenFactory !=="第二工場"){
//     //   enableInputs(); // Delete this in production - Input enabling should be managed by the overall scan logic
//     // }
    

//     const subDropdown = document.getElementById("sub-dropdown");
//     const serialNumber = subDropdown.value;
//     const factory = document.getElementById("selected工場").value; // Keep if needed for other logic
//     const dynamicImage = document.getElementById("dynamicImage");
//     const expectedBoardDataInputElement = document.getElementById("expectedBoardDataQR"); // Get the element once

//     // Clear previous data first
//     blankInfo(); // Assuming blankInfo() clears all relevant product fields
//     if (expectedBoardDataInputElement) {
//         expectedBoardDataInputElement.value = ""; // Explicitly clear here too
//     }
//     if (dynamicImage) {
//         dynamicImage.src = "";
//         dynamicImage.alt = "Loading image...";
//         dynamicImage.style.display = "none";
//     }

//     if (!serialNumber) {
//         console.warn("[fetchProductDetails] No serialNumber (from sub-dropdown) selected.");
//         return false; // Indicate failure
//     }

//     console.log("[fetchProductDetails] Fetching for serialNumber:", serialNumber);

//     try {
//         // Step 1: Try query by 背番号
//         let response = await fetch(`${serverURL}/queries`, {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({
//                 dbName: "Sasaki_Coating_MasterDB",
//                 collectionName: "masterDB",
//                 query: { 背番号: serialNumber },
//             }),
//         });

//         let result = await response.json();
//         let querySource = "背番号";

//         // Step 2: If not found, try query by 品番
//         if (!result || result.length === 0) {
//             console.log("[fetchProductDetails] Not found by 背番号, trying by 品番:", serialNumber);
//             querySource = "品番";
//             response = await fetch(`${serverURL}/queries`, { // Re-assign response
//                 method: "POST",
//                 headers: { "Content-Type": "application/json" },
//                 body: JSON.stringify({
//                     dbName: "Sasaki_Coating_MasterDB",
//                     collectionName: "masterDB",
//                     query: { 品番: serialNumber },
//                 }),
//             });
//             result = await response.json(); // Re-assign result
//         }

//         // Step 3: Still no result
//         if (!result || result.length === 0) {
//             console.error(`[fetchProductDetails] No matching product found by ${querySource} for:`, serialNumber);
//             return false; // Indicate failure
//         }

//         const product = result[0];
//         console.log("[fetchProductDetails] Product found:", product);

//         // Step 4: Display image
//         if (dynamicImage) {
//             if (product.imageURL) {
//                 dynamicImage.src = product.imageURL;
//                 dynamicImage.alt = "Product Image";
//                 dynamicImage.style.display = "block";
//             } else {
//                 dynamicImage.src = "";
//                 dynamicImage.alt = "No Image Available";
//                 dynamicImage.style.display = "none";
//             }
//         }

//         // Step 5: Populate product fields
//         document.getElementById("product-number").value = product.品番 || "";
//         document.getElementById("model").value = product.モデル || "";
//         document.getElementById("shape").value = product.形状 || "";
//         document.getElementById("R-L").value = product["R/L"] || "";
//         document.getElementById("material").value = product.材料 || "";
//         document.getElementById("material-code").value = product.材料背番号 || "";
//         document.getElementById("material-color").value = product.色 || "";
//         document.getElementById("kataban").value = product.型番 || "";
//         document.getElementById("収容数").value = product.収容数 || "";
//         const 送りピッチElement = document.getElementById("送りピッチ");
//         if (送りピッチElement) {
//             送りピッチElement.textContent = "送りピッチ: " + (product.送りピッチ || "N/A");
//         }
//         document.getElementById("SRS").value = product.SRS || "";

//         // Step 6: Process and store boardData for the second QR scan (HANDLES BOTH STRING AND ARRAY)
//         let boardDataStringForQR = null;

//         if (product.boardData) {
//             if (Array.isArray(product.boardData)) {
//                 if (product.boardData.length > 0) {
//                     boardDataStringForQR = product.boardData.join(',');
//                     console.log("[fetchProductDetails] 'boardData' (Array type) processed to:", `"${boardDataStringForQR}"`);
//                 } else {
//                     console.warn("[fetchProductDetails] 'boardData' is an empty array. Product:", product);
//                 }
//             } else if (typeof product.boardData === 'string') {
//                 if (product.boardData.trim() !== '') {
//                     boardDataStringForQR = product.boardData;
//                     console.log("[fetchProductDetails] 'boardData' (String type) used directly:", `"${boardDataStringForQR}"`);
//                 } else {
//                     console.warn("[fetchProductDetails] 'boardData' is an empty string. Product:", product);
//                 }
//             } else {
//                 console.warn("[fetchProductDetails] 'boardData' exists but is neither a valid array nor a string. Product:", product);
//             }
//         } else {
//             console.warn("[fetchProductDetails] 'boardData' not found in product. Product:", product);
//         }

//         // Now set the input field and determine return value based on boardDataStringForQR
//         if (expectedBoardDataInputElement) {
//             if (boardDataStringForQR !== null) {
//                 expectedBoardDataInputElement.value = boardDataStringForQR;
//                 console.log("[fetchProductDetails] Successfully set hidden 'expectedBoardDataQR' to:", `"${boardDataStringForQR}"`);
//                 return true; // Successfully prepared for QR comparison
//             } else {
//                 // boardDataStringForQR is null (boardData was missing, empty, or invalid type)
//                 expectedBoardDataInputElement.value = ""; // Ensure it's cleared
//                 console.warn("[fetchProductDetails] 'expectedBoardDataQR' is cleared as 'boardData' was invalid/missing/empty.");

//                 // Check if this is a fatal error for the function's purpose
//                 const currentFactory = document.getElementById("selected工場")?.value;
//                 const currentProcess = document.getElementById("process")?.value;
//                 const isNFH_RLC_scenario = currentFactory === "NFH" && currentProcess === "RLC";

//                 if (!isNFH_RLC_scenario) {
//                     // If a second scan is normally expected, and we couldn't get boardData,
//                     // this is a failure to prepare for that second scan.
//                     console.error("[fetchProductDetails] boardData is missing/invalid, and this is NOT an NFH+RLC scenario. Second scan preparation failed.");
//                     return false;
//                 } else {
//                     // For NFH+RLC, the second scan is skipped. Missing boardData might be acceptable.
//                     // The function still successfully fetched the product's other details.
//                     console.log("[fetchProductDetails] boardData is missing/invalid, but this IS an NFH+RLC scenario. Returning true as product was fetched.");
//                     return true;
//                 }
//             }
//         } else {
//             console.error("[fetchProductDetails] Critical: Hidden input 'expectedBoardDataQR' not found in DOM!");
//             return false; // Cannot proceed without the input field
//         }

//     } catch (error) {
//         console.error("[fetchProductDetails] Error during fetch operation or processing:", error);
//         return false; // Indicate failure
//     }
// }

// Function to fetch product details based on 背番号 or 品番
async function fetchProductDetails() {
    // REMOVED initial checkProcessCondition and enableInputs calls for better central control.
    // Let the calling functions (handleQRScan, DOMContentLoaded for restore) manage UI state updates
    // after fetchProductDetails completes its primary job.

    const subDropdown = document.getElementById("sub-dropdown");
    const serialNumber = subDropdown.value;
    // const factory = document.getElementById("selected工場").value; // 'factory' variable not used elsewhere in this scope
    const dynamicImage = document.getElementById("dynamicImage");
    const expectedBoardDataInputElement = document.getElementById("expectedBoardDataQR");

    blankInfo();
    if (expectedBoardDataInputElement) {
        expectedBoardDataInputElement.value = "";
    }
    if (dynamicImage) {
        dynamicImage.src = "";
        dynamicImage.alt = "Loading image...";
        dynamicImage.style.display = "none";
    }

    if (!serialNumber) {
        console.warn("[fetchProductDetails] No serialNumber (from sub-dropdown) selected.");
        // Since this function is often called from event listeners, ensure calling code handles 'false'
        if (document.getElementById("selected工場").value === '第二工場' || isSecondScanCurrentlyRequired(document.getElementById("selected工場").value, document.getElementById("process")?.value)) {
             // If a factory that might need 2 scans has its product details cleared due to no serial number,
             // ensure inputs are disabled.
             // disableInputs(); // Consider if disableInputs() is appropriate here or rely on checkProcessCondition
        }
        return false;
    }

    console.log("[fetchProductDetails] Fetching for serialNumber:", serialNumber);

    try {
        let response = await fetch(`${serverURL}/queries`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                dbName: "Sasaki_Coating_MasterDB",
                collectionName: "masterDB",
                query: { 背番号: serialNumber },
            }),
        });
        let result = await response.json();
        let querySource = "背番号";

        if (!result || result.length === 0) {
            console.log("[fetchProductDetails] Not found by 背番号, trying by 品番:", serialNumber);
            querySource = "品番";
            response = await fetch(`${serverURL}/queries`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    dbName: "Sasaki_Coating_MasterDB",
                    collectionName: "masterDB",
                    query: { 品番: serialNumber },
                }),
            });
            result = await response.json();
            
            // If found by 品番 and 背番号 exists, update dropdown to 背番号
            if (result && result.length > 0) {
                const matched = result[0];
                if (matched.背番号) {
                    console.log("[fetchProductDetails] Found by 品番, updating dropdown to 背番号:", matched.背番号);
                    subDropdown.value = matched.背番号;
                    // Update localStorage as well to maintain consistency
                    localStorage.setItem(`${uniquePrefix}sub-dropdown`, matched.背番号);
                }
            }
        }

        if (!result || result.length === 0) {
            console.error(`[fetchProductDetails] No matching product found by ${querySource} for:`, serialNumber);
            return false;
        }

        const product = result[0];
        console.log("[fetchProductDetails] Product found:", product);

        if (dynamicImage) {
            if (product.imageURL) {
                dynamicImage.src = product.imageURL;
                dynamicImage.alt = "Product Image";
                dynamicImage.style.display = "block";
            } else {
                dynamicImage.src = "";
                dynamicImage.alt = "No Image Available";
                dynamicImage.style.display = "none";
            }
        }

        document.getElementById("product-number").value = product.品番 || "";
        document.getElementById("model").value = product.モデル || "";
        document.getElementById("shape").value = product.形状 || "";
        document.getElementById("R-L").value = product["R/L"] || "";
        
        // Set material value and auto-resize textarea
        const materialField = document.getElementById("material");
        materialField.value = product.材料 || "";
        autoResizeTextarea(materialField);
        
        document.getElementById("material-code").value = product.材料背番号 || "";
        document.getElementById("material-color").value = product.色 || "";
        document.getElementById("kataban").value = product.型番 || "";
        document.getElementById("収容数").value = product.収容数 || "";
        const 送りピッチElement = document.getElementById("送りピッチ");
        if (送りピッチElement) {
            送りピッチElement.textContent = "送りピッチ: " + (product.送りピッチ || "N/A");
        }
        document.getElementById("SRS").value = product.SRS || "";

        let boardDataStringForQR = null;
        if (product.boardData) {
            if (Array.isArray(product.boardData)) {
                if (product.boardData.length > 0) {
                    boardDataStringForQR = product.boardData.join(',');
                    console.log("[fetchProductDetails] 'boardData' (Array type) processed to:", `"${boardDataStringForQR}"`);
                } else {
                    console.warn("[fetchProductDetails] 'boardData' is an empty array. Product:", product);
                }
            } else if (typeof product.boardData === 'string') {
                if (product.boardData.trim() !== '') {
                    boardDataStringForQR = product.boardData;
                    console.log("[fetchProductDetails] 'boardData' (String type) used directly:", `"${boardDataStringForQR}"`);
                } else {
                    console.warn("[fetchProductDetails] 'boardData' is an empty string. Product:", product);
                }
            } else {
                console.warn("[fetchProductDetails] 'boardData' exists but is neither a valid array nor a string. Product:", product);
            }
        } else {
            console.warn("[fetchProductDetails] 'boardData' not found in product. Product:", product);
        }

        if (expectedBoardDataInputElement) {
            if (boardDataStringForQR !== null) {
                expectedBoardDataInputElement.value = boardDataStringForQR;
                console.log("[fetchProductDetails] Successfully set hidden 'expectedBoardDataQR' to:", `"${boardDataStringForQR}"`);
                return true;
            } else {
                expectedBoardDataInputElement.value = "";
                console.warn("[fetchProductDetails] 'expectedBoardDataQR' is cleared as 'boardData' was invalid/missing/empty.");
                
                const currentFactory = document.getElementById("selected工場")?.value;
                const currentProcess = document.getElementById("process")?.value;

                if (isSecondScanCurrentlyRequired(currentFactory, currentProcess)) {
                    console.error(`[fetchProductDetails] boardData is missing/invalid, and a second scan IS required for Factory: ${currentFactory}, Process: ${currentProcess}. Preparation failed.`);
                    return false;
                } else {
                    console.log(`[fetchProductDetails] boardData is missing/invalid, but a second scan is NOT currently required for Factory: ${currentFactory}, Process: ${currentProcess}. Returning true as product was fetched.`);
                    return true;
                }
            }
        } else {
            console.error("[fetchProductDetails] Critical: Hidden input 'expectedBoardDataQR' not found in DOM!");
            return false;
        }

    } catch (error) {
        console.error("[fetchProductDetails] Error during fetch operation or processing:", error);
        return false;
    }
}

document.getElementById("sub-dropdown").addEventListener("change", async () => {
    await fetchProductDetails();
    checkProcessCondition(); // Update input states after fetching product details
});


// Function to fetch image link from Google Sheets
function picLINK(背番号, 品番 = null) {
  // Try 背番号 first
  fetchImageFromSheet(背番号)
    .then(link => {
      if (!link || link.includes("not found")) {
        // Try 品番 as fallback
        if (品番) {
          return fetchImageFromSheet(品番);
        } else {
          throw new Error("Image not found and no 品番 to fallback.");
        }
      }
      return link;
    })
    .then(finalLink => {
      if (finalLink && !finalLink.includes("not found")) {
        updateImageSrc(finalLink);
      } else {
        console.warn("No valid image link found for 背番号 or 品番.");
      }
    })
    .catch(error => {
      console.error("Image loading error:", error);
    });
}

// Helper function to call the App Script API
function fetchImageFromSheet(headerValue) {
  return fetch(`${picURL}?link=${headerValue}`)
    .then(response => {
      if (!response.ok) {
        throw new Error("Network error: " + response.statusText);
      }
      return response.text();
    })
    .then(data => {
      return data.replace(/"/g, ''); // Clean the returned URL
    });
}


function updateImageSrc(link) {
  const imageElement = document.getElementById('dynamicImage');

  if (imageElement) {
    // Clean redirect-based URL
    const cleanedLink = link.replace(/.*\/d\/(.*?)\/.*/, 'https://drive.google.com/uc?export=view&id=$1');

    imageElement.src = cleanedLink;
    imageElement.alt = "Product Image";
    imageElement.style.display = "block";
  } else {
    console.error("Error: Image element not found!");
  }
}




// when time is pressed
// Set current time as default when time is pressed
function setDefaultTime(input) {
  

  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeValue = `${hours}:${minutes}`;
  input.value = timeValue;

  // Save the time to local storage with unique prefix
  localStorage.setItem(`${uniquePrefix}${input.id}`, timeValue);
}



// When date is pressed or on page load, set current date as default
// Set current date as default when date is pressed or on page load
function setDefaultDate(input) {

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateValue = `${year}-${month}-${day}`;
  input.value = dateValue;

  // Save the date to local storage with unique prefix
  localStorage.setItem(`${uniquePrefix}${input.id}`, dateValue);
}

// Set current date as default on page load
document.addEventListener("DOMContentLoaded", function() {
  const dateInput = document.getElementById("Lot No.");
  setDefaultDate(dateInput);
});



//Get worker list
// document.addEventListener("DOMContentLoaded", async function() {
//   const selectedFactory = document.getElementById("selected工場").value;

//   if (selectedFactory) {
//     try {
//       const response = await fetch(`${serverURL}/getWorkerNames?selectedFactory=${encodeURIComponent(selectedFactory)}`);
//       if (!response.ok) throw new Error("Failed to fetch worker names");

//       const workerNames = await response.json();
//       const dataList = document.getElementById("machine-operator-suggestions");
//       dataList.innerHTML = ""; // Clear any existing options

//       workerNames.forEach(name => {
//         const option = document.createElement("option");
//         option.value = name;
//         dataList.appendChild(option);
//       });
//     } catch (error) {
//       console.error("Error fetching worker names:", error);
//     }
//   }
// });

//Get worker list
document.addEventListener("DOMContentLoaded", async function() {
  // It's good practice to define serverURL if it's not already globally available.
  // For this example, I'll assume it's defined elsewhere.
  // const serverURL = "YOUR_SERVER_URL_HERE"; // Example: "http://localhost:3000" or "https://your-api.com"

  const selectedFactoryInput = document.getElementById("selected工場");
  const selectedFactory = selectedFactoryInput.value;

  const machineOperatorDatalist = document.getElementById("machine-operator-suggestions");
  const kensaDropdown = document.getElementById("kensa-dropdown");

  // Clear previous options in case this function is called multiple times
  machineOperatorDatalist.innerHTML = "";
  kensaDropdown.innerHTML = "";

  // Add a default/placeholder option for the kensa-dropdown
  const defaultKensaOption = document.createElement("option");
  defaultKensaOption.value = "";
  defaultKensaOption.textContent = "作業者を選択"; // "Select Worker" or your preferred placeholder
  kensaDropdown.appendChild(defaultKensaOption);

  if (selectedFactory) {
    try {
      const response = await fetch(`${serverURL}/getWorkerNames?selectedFactory=${encodeURIComponent(selectedFactory)}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to fetch worker names. Status:", response.status, "Response:", errorText);
        // Display a user-friendly error, e.g., by setting textContent of an error display element
        // kensaDropdown.options[0].textContent = "作業者読込失敗"; // "Failed to load workers"
        throw new Error(`Failed to fetch worker names. Status: ${response.status}`);
      }

      const workerNames = await response.json();

      if (workerNames && workerNames.length > 0) {
        workerNames.forEach(name => {
          // Populate the datalist for machine operator suggestions
          const datalistOption = document.createElement("option");
          datalistOption.value = name;
          machineOperatorDatalist.appendChild(datalistOption);

          // Populate the select dropdown for kensa-dropdown
          const dropdownOption = document.createElement("option");
          dropdownOption.value = name; // Set the value of the option
          dropdownOption.textContent = name; // Set the display text of the option
          kensaDropdown.appendChild(dropdownOption);
        });
      } else {
        // Handle case where workerNames might be empty or undefined
        console.warn("No worker names returned for the selected factory or an issue with the response format.");
        // kensaDropdown.options[0].textContent = "作業者なし"; // "No workers available"
      }

    } catch (error) {
      console.error("Error fetching or processing worker names:", error);
      // Update placeholder to indicate error
      // kensaDropdown.options[0].textContent = "作業者読込エラー"; // "Error loading workers"
    }
  } else {
    console.warn("Selected factory ('selected工場') is not set. Worker names will not be fetched.");
    // Optionally, provide feedback in the dropdown if no factory is selected.
    // The default "作業者を選択" might still be appropriate, or you could change it.
    // kensaDropdown.options[0].textContent = "工場を選択してください"; // "Please select a factory"
  }
});

//function for plus minus button
function incrementCounter(counterId) {
  

  const counterElement = document.getElementById(`counter-${counterId}`);
  let currentValue = parseInt(counterElement.value, 10);
  currentValue += 1;
  counterElement.value = currentValue;

  // Save the updated value to local storage with the unique prefix
  localStorage.setItem(`${uniquePrefix}counter-${counterId}`, currentValue);

  updateTotal();
}

function decrementCounter(counterId) {
  

  const counterElement = document.getElementById(`counter-${counterId}`);
  let currentValue = parseInt(counterElement.value, 10);
  if (currentValue > 0) {
      currentValue -= 1;
      counterElement.value = currentValue;

      // Save the updated value to local storage with the unique prefix
      localStorage.setItem(`${uniquePrefix}counter-${counterId}`, currentValue);

      updateTotal();
  }
}


function updateTotal() {
  // Get the value of Process Quantity
  const processQuantity = parseInt(document.getElementById('ProcessQuantity').value, 10) || 0;

  // Get the values of the counters
  const counter18 = parseInt(document.getElementById('counter-18').value, 10) || 0;
  const counter19 = parseInt(document.getElementById('counter-19').value, 10) || 0;
  const counter20 = parseInt(document.getElementById('counter-20').value, 10) || 0;

  // Calculate Total_NG
  const totalNG = counter18 + counter19 + counter20;

  // Update the Total_NG field
  document.getElementById('Total_NG').value = totalNG;

  // Calculate Total
  const total = processQuantity - totalNG;

  // Update the Total field
  document.getElementById('total').value = total;
}

// Attach updateTotal to relevant events
document.getElementById('ProcessQuantity').addEventListener('input', updateTotal);





// Helper function to handle alert modal display
function showAlert(message) {
  const alertSound = document.getElementById('alert-sound');
  const scanAlertModal = document.getElementById('scanAlertModal');
  document.getElementById('scanAlertText').innerText = message;
  scanAlertModal.style.display = 'block';

  if (alertSound) {
      alertSound.muted = false; // Unmute to alert user
      alertSound.volume = 1; // Set full volume
      alertSound.play().catch(error => console.error("Failed to play alert sound:", error));
  }

  document.body.classList.add('flash-red');

  const closeScanModalButton = document.getElementById('closeScanModalButton');
  closeScanModalButton.onclick = function () {
      scanAlertModal.style.display = 'none';
      alertSound.pause();
      alertSound.currentTime = 0; // Reset sound to the beginning
      alertSound.muted = true; // Mute again for next time
      document.body.classList.remove('flash-red');
  };
}





// // Submit Button
// document.querySelector('form[name="contact-form"]').addEventListener('submit', async (event) => {
//   event.preventDefault();
//   // Show uploading modal
//   document.getElementById('uploadingModal').style.display = 'flex';

//   const alertSound = document.getElementById('alert-sound');
//   const scanAlertModal = document.getElementById('scanAlertModal');
//   const scanAlertText = document.getElementById('scanAlertText');

//   try {
//     const hatsumono = document.getElementById("hatsumonoLabel").textContent;
//     const atomono = document.getElementById("atomonoLabel").textContent;

//     if (hatsumono === "FALSE" || atomono === "FALSE") {
//       showAlert("初物/終物確認してください / Please do Hatsumono and Atomono");
//       return;
//     }

//     updateCycleTime();

//     const formData = {
//       品番: document.getElementById('product-number').value,
//       背番号: document.getElementById('sub-dropdown').value,
//       設備: document.getElementById('process').value,
//       Total: parseInt(document.getElementById('total').value, 10) || 0,
//       工場: document.getElementById('selected工場').value,
//       Worker_Name: document.getElementById('Machine Operator').value,
//       Process_Quantity: parseInt(document.getElementById('ProcessQuantity').value, 10) || 0,
//       Date: document.getElementById('Lot No.').value,
//       Time_start: document.getElementById('Start Time').value,
//       Time_end: document.getElementById('End Time').value,
//       材料ロット: document.getElementById('材料ロット').value,
//       疵引不良: parseInt(document.getElementById('counter-18').value, 10) || 0,
//       加工不良: parseInt(document.getElementById('counter-19').value, 10) || 0,
//       その他: parseInt(document.getElementById('counter-20').value, 10) || 0,
//       Total_NG: parseInt(document.getElementById('Total_NG').value, 10) || 0,
//       Spare: parseInt(document.getElementById('spare').value, 10) || 0,
//       Comment: document.querySelector('textarea[name="Comments1"]').value,
//       Cycle_Time: parseFloat(document.getElementById('cycleTime').value) || 0,
//       ショット数: parseInt(document.getElementById('shot').value, 10) || 0,
//     };

//     if (!formData.背番号) {
//       showAlert('背番号が必要です。 / Sebanggo is required.');
//       return;
//     }

//     // Collect base64 images
//     formData.images = await collectImagesForUpload();

//     // Submit form data
//     const response = await fetch(`${serverURL}/submitTopressDBiReporter`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(formData),
//     });

//     if (!response.ok) {
//       const errorData = await response.json();
//       throw new Error(errorData.error || 'Failed to save data');
//     }

//     // Success handling
//     scanAlertText.innerText = 'Form submitted successfully / 保存しました';
//     scanAlertModal.style.display = 'block';
//     document.body.classList.add('flash-green');

//     document.getElementById('closeScanModalButton').onclick = function () {
//       scanAlertModal.style.display = 'none';
//       document.body.classList.remove('flash-green');
//       // Hide uploading modal after success
//       document.getElementById('uploadingModal').style.display = 'none';
//       window.location.reload();
//       resetForm();
//     };

//   } catch (error) {
//     document.getElementById('uploadingModal').style.display = 'none';
//     console.error('Submission error:', error);
//     showAlert('An error occurred. Please try again.');
//   }
// });


//Submit Button
document.querySelector('form[name="contact-form"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  document.getElementById('uploadingModal').style.display = 'flex';

  const alertSound = document.getElementById('alert-sound');
  const scanAlertModal = document.getElementById('scanAlertModal');
  const scanAlertText = document.getElementById('scanAlertText');

  try {
    const hatsumono = document.getElementById("hatsumonoLabel").textContent;
    const atomono = document.getElementById("atomonoLabel").textContent;
    const markerlabel = document.getElementById("makerLabel").textContent;

    // Validate Hatsumono, Atomono, and Material Label
    if (hatsumono === "FALSE" || atomono === "FALSE") {
      showAlert("初物/終物確認してください / Please do Hatsumono and Atomono");
      document.getElementById('uploadingModal').style.display = 'none';
      return;
    }

    // Check material label - either new multi-photo system or legacy single photo
    if (materialLabelPhotos.length === 0) {
      const makerPic = document.getElementById('材料ラベル');
      if (!makerPic || !makerPic.src || makerPic.src === '' || makerPic.src === 'data:,' || makerPic.style.display === 'none') {
        console.error("材料ラベル validation failed - no photos in either system");
        showAlert("材料ラベルの写真を撮影してください / Please capture the 材料ラベル image");
        document.getElementById('uploadingModal').style.display = 'none';
        return;
      }
    }

    updateCycleTime();

    const formData = {
      品番: document.getElementById('product-number').value,
      背番号: document.getElementById('sub-dropdown').value,
      設備: document.getElementById('process').value,
      Total: parseInt(document.getElementById('total').value, 10) || 0,
      工場: document.getElementById('selected工場').value,
      Worker_Name: document.getElementById('Machine Operator').value,
      Process_Quantity: parseInt(document.getElementById('ProcessQuantity').value, 10) || 0,
      Date: document.getElementById('Lot No.').value,
      Time_start: document.getElementById('Start Time').value,
      Time_end: document.getElementById('End Time').value,
      材料ロット: document.getElementById('材料ロット').value,
      疵引処理数: parseInt(document.getElementById('counter-27').value, 10) || 0,
      疵引不良: parseInt(document.getElementById('counter-18').value, 10) || 0,
      加工不良: parseInt(document.getElementById('counter-19').value, 10) || 0,
      その他: parseInt(document.getElementById('counter-20').value, 10) || 0,
      Total_NG: parseInt(document.getElementById('Total_NG').value, 10) || 0,
      Spare: parseInt(document.getElementById('spare').value, 10) || 0,
      Comment: document.querySelector('textarea[name="Comments1"]').value,
      Cycle_Time: parseFloat(document.getElementById('cycleTime').value) || 0,
      ショット数: parseInt(document.getElementById('shot').value, 10) || 0,
    };

    if (!formData.背番号) {
      showAlert('背番号が必要です。 / Sebanggo is required.');
      document.getElementById('uploadingModal').style.display = 'none';
      return;
    }

    // ==================== VALIDATION SECTION ====================
    // Validate all required fields before submission

    // 1. Check required fields
    if (!formData.品番 || formData.品番.trim() === '') {
      showAlert('品番が必要です / Product Number is required');
      document.getElementById('uploadingModal').style.display = 'none';
      document.getElementById('product-number').focus();
      return;
    }

    if (!formData.工場 || formData.工場.trim() === '') {
      showAlert('工場が必要です / Factory is required');
      document.getElementById('uploadingModal').style.display = 'none';
      document.getElementById('selected工場').focus();
      return;
    }

    if (!formData.設備 || formData.設備.trim() === '') {
      showAlert('設備が必要です / Equipment is required');
      document.getElementById('uploadingModal').style.display = 'none';
      document.getElementById('process').focus();
      return;
    }

    if (!formData.Process_Quantity || formData.Process_Quantity <= 0) {
      showAlert('加工数（良品）が必要です / Process Quantity is required and must be greater than 0');
      document.getElementById('uploadingModal').style.display = 'none';
      document.getElementById('ProcessQuantity').focus();
      return;
    }

    if (!formData.Worker_Name || formData.Worker_Name.trim() === '') {
      showAlert('作業者名が必要です / Worker Name is required');
      document.getElementById('uploadingModal').style.display = 'none';
      document.getElementById('Machine Operator').focus();
      return;
    }

    if (!formData.Date || formData.Date.trim() === '') {
      showAlert('加工日が必要です / Work Date is required');
      document.getElementById('uploadingModal').style.display = 'none';
      document.getElementById('Lot No.').focus();
      return;
    }

    if (!formData.材料ロット || formData.材料ロット.trim() === '') {
      showAlert('材料ロットが必要です / Material Lot is required');
      document.getElementById('uploadingModal').style.display = 'none';
      document.getElementById('材料ロット').focus();
      return;
    }

    if (!formData.ショット数 || formData.ショット数 < 1) {
      showAlert('ショット数 (Shot Count) is required and must be at least 1.');
      document.getElementById('uploadingModal').style.display = 'none';
      document.getElementById('shot').focus();
      return;
    }

    // 2. Validate Time fields
    if (!formData.Time_start || formData.Time_start.trim() === '') {
      showAlert('加工開始時間が必要です / Start Time is required');
      document.getElementById('uploadingModal').style.display = 'none';
      document.getElementById('Start Time').focus();
      return;
    }

    if (!formData.Time_end || formData.Time_end.trim() === '') {
      showAlert('加工終了時間が必要です / End Time is required');
      document.getElementById('uploadingModal').style.display = 'none';
      document.getElementById('End Time').focus();
      return;
    }

    // 3. Validate Time_start < Time_end and Time_start ≠ Time_end
    const startTimeDate = new Date(`2000-01-01T${formData.Time_start}:00`);
    const endTimeDate = new Date(`2000-01-01T${formData.Time_end}:00`);

    if (formData.Time_start === formData.Time_end) {
      showAlert('加工開始時間と加工終了時間は同じにできません\n\nStart Time and End Time cannot be the same\n\n開始: ' + formData.Time_start + '\n終了: ' + formData.Time_end);
      document.getElementById('uploadingModal').style.display = 'none';
      document.getElementById('End Time').focus();
      return;
    }

    if (startTimeDate >= endTimeDate) {
      showAlert('加工開始時間は加工終了時間より前である必要があります\n\nStart Time must be before End Time\n\n開始: ' + formData.Time_start + '\n終了: ' + formData.Time_end);
      document.getElementById('uploadingModal').style.display = 'none';
      document.getElementById('End Time').focus();
      return;
    }

    console.log('✅ All required fields validated successfully');
    // ==================== END VALIDATION SECTION ====================

    // Collect Break Time Data
    const breakTimeData = {
      break1: { 
        start: document.getElementById('break1-start')?.value || '', 
        end: document.getElementById('break1-end')?.value || '' 
      },
      break2: { 
        start: document.getElementById('break2-start')?.value || '', 
        end: document.getElementById('break2-end')?.value || '' 
      },
      break3: { 
        start: document.getElementById('break3-start')?.value || '', 
        end: document.getElementById('break3-end')?.value || '' 
      },
      break4: { 
        start: document.getElementById('break4-start')?.value || '', 
        end: document.getElementById('break4-end')?.value || '' 
      }
    };

    formData.Break_Time_Data = breakTimeData;

    const totalBreakMinutes = calculateTotalBreakTime();
    const totalBreakHours = totalBreakMinutes / 60;
    formData.Total_Break_Hours = totalBreakHours;

    const totalTroubleMinutes = calculateTotalMachineTroubleTime();
    const totalTroubleHours = totalTroubleMinutes / 60;

    // Prepare maintenance images data
    const maintenanceImages = [];
    
    if (maintenanceRecords.length > 0) {
      console.log(`📸 Preparing ${maintenanceRecords.length} maintenance records for submission...`);
      
      maintenanceRecords.forEach(record => {
        if (record.photos && record.photos.length > 0) {
          record.photos.forEach(photo => {
            if (photo.base64 && photo.id && photo.timestamp) {
              maintenanceImages.push({
                base64: photo.base64,
                id: photo.id,
                timestamp: photo.timestamp,
                maintenanceRecordId: record.id
              });
            }
          });
        }
      });
      
      console.log(`📊 Prepared ${maintenanceImages.length} maintenance images for upload`);
    }

    // Prepare maintenance data structure (without photos - they'll be added by server)
    const maintenanceDataForSubmission = {
      records: maintenanceRecords.map(record => ({
        id: record.id,
        startTime: record.startTime,
        endTime: record.endTime,
        comment: record.comment,
        timestamp: record.timestamp
        // photos will be populated by the server after upload
      })),
      totalMinutes: totalTroubleMinutes,
      totalHours: totalTroubleHours
    };

    formData.Maintenance_Data = maintenanceDataForSubmission;

    console.log("📊 Maintenance data prepared for submission:", {
      recordCount: maintenanceDataForSubmission.records.length,
      totalImages: maintenanceImages.length,
      totalMinutes: totalTroubleMinutes
    });

    // Calculate Total Work Hours = Time_end - Time_start - Total_Break_Hours - Total_Trouble_Hours
    let totalWorkHours = 0;
    if (formData.Time_start && formData.Time_end) {
      const startWork = new Date(`2000-01-01T${formData.Time_start}:00`);
      const endWork = new Date(`2000-01-01T${formData.Time_end}:00`);
      if (endWork > startWork) {
        const workDiffMs = endWork - startWork;
        const totalMinutes = Math.floor(workDiffMs / (1000 * 60));
        const totalHours = totalMinutes / 60;
        totalWorkHours = totalHours - totalBreakHours - totalTroubleHours;
      }
    }
    formData.Total_Work_Hours = Math.max(0, totalWorkHours); // Ensure non-negative

    // Prepare material label images for upload
    const materialLabelImagesForUpload = [];
    if (materialLabelPhotos.length > 0) {
      console.log(`📸 Preparing ${materialLabelPhotos.length} material label photos for submission...`);
      materialLabelPhotos.forEach((photo, index) => {
        if (photo.base64) {
          materialLabelImagesForUpload.push({
            base64: photo.base64,
            timestamp: photo.timestamp,
            index: index
          });
        }
      });
    }

    formData.materialLabelImageCount = materialLabelPhotos.length;

    //  Generate uniqueID for duplication check
    formData.uniqueID = `${formData.背番号}_${formData.Date}_${formData.Time_start}_${formData.Worker_Name}_${formData.設備}`;

    //  Check for duplicate on server first
    const duplicateCheck = await fetch(`${serverURL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectionName: "pressDB",
        query: { uniqueID: formData.uniqueID }
      })
    });

    const duplicateResult = await duplicateCheck.json();

    if (duplicateResult.length > 0) {
      document.getElementById('uploadingModal').style.display = 'none';
      showAlert("この作業は既に登録されています。 / This record has already been submitted.");
      return;
    }

    // Collect base64 images (hatsumono, atomono)
    formData.images = await collectImagesForUpload();

    // Add maintenance images to submission
    formData.maintenanceImages = maintenanceImages;

    // Add material label images to submission
    formData.materialLabelImages = materialLabelImagesForUpload;

    console.log('📦 Final submission data:', {
      breakTimeData: formData.Break_Time_Data,
      totalBreakHours: formData.Total_Break_Hours,
      maintenanceRecordCount: formData.Maintenance_Data.records.length,
      maintenanceImageCount: maintenanceImages.length,
      materialLabelImageCount: materialLabelImagesForUpload.length,
      totalWorkHours: formData.Total_Work_Hours
    });

    const response = await fetch(`${serverURL}/submitTopressDBiReporter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save data');
    }

    scanAlertText.innerText = 'Form submitted successfully / 保存しました';
    scanAlertModal.style.display = 'block';
    document.body.classList.add('flash-green');

    document.getElementById('closeScanModalButton').onclick = function () {
      scanAlertModal.style.display = 'none';
      document.body.classList.remove('flash-green');
      document.getElementById('uploadingModal').style.display = 'none';
      window.location.reload();
      resetForm(true); // Skip confirmation dialog after successful submission
    };

  } catch (error) {
    document.getElementById('uploadingModal').style.display = 'none';
    console.error('Submission error:', error);
    showAlert('An error occurred. Please try again.');
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


// // Global function to check process conditions
// function checkProcessCondition() {
//   const subDropdown = document.getElementById('sub-dropdown');
//   const processDropdown = document.getElementById("process");
//   const selected工場 = document.getElementById("selected工場").value;
//   const processValue = processDropdown ? processDropdown.value : ""; // Ensure processDropdown exists
//   const firstScanValue = document.getElementById("firstScanValue").value;
//   const secondScanValue = document.getElementById("secondScanValue").value;

//   if (
//       (selected工場 === "肥田瀬" || selected工場 === "第二工場") || 
//       (selected工場 === "NFH" && processValue !== "RLC")
//   ) {
//       if (!firstScanValue || !secondScanValue) {
//           console.log("Inputs disabled: Factory requires 2 QR scans.");
//           disableInputs();
//       } else {
//           console.log("Inputs enabled: 2 QR scans completed.");
//           enableInputs();
//       }
//   } else {
//       console.log("NFH with process 'RLC' detected. Inputs stay enabled.");
//       enableInputs();
//   }
// }




// let html5QrCode; // Declare globally or in a shared scope
// let firstScanValue = localStorage.getItem(`${uniquePrefix}firstScanValue`) || "";
// let secondScanValue = localStorage.getItem(`${uniquePrefix}secondScanValue`) || "";

// //temporary scan button
// document.addEventListener('DOMContentLoaded', () => {
//   const subDropdown = document.getElementById('sub-dropdown');
//   const processDropdown = document.getElementById("process");
//   let firstScanValue = localStorage.getItem(`${uniquePrefix}firstScanValue`) || "";
//   let secondScanValue = localStorage.getItem(`${uniquePrefix}secondScanValue`) || "";
//   let lastScanMethod = localStorage.getItem(`${uniquePrefix}scannerChoice`) || ""; // Empty if not set

//   console.log("Initial firstScanValue:", firstScanValue);
//   console.log("Initial secondScanValue:", secondScanValue);
//   console.log("Last scan method:", lastScanMethod);

//   if (subDropdown && firstScanValue && secondScanValue) {
//     setTimeout(() => {
//       subDropdown.value = firstScanValue;
//       fetchProductDetails();
//     }, 1000);
//   }

//   checkProcessCondition();
//     // Add event listener to "process" dropdown
//   processDropdown.addEventListener("change", checkProcessCondition);

//   // Open Scanner Selection Modal
//   function openScannerSelectionModal() {
//     document.getElementById('scannerSelectionModal').style.display = 'block';
//   }

//   function closeScannerSelectionModal() {
//     document.getElementById('scannerSelectionModal').style.display = 'none';
//   }

//   // Open Scanner Selection Modal
// function handleQRScan(qrCodeMessage) {
//     console.log("Scanned QR (Raw):", qrCodeMessage);

//     const factoryValue = document.getElementById("selected工場")?.value || "";
//     const processValue = document.getElementById("process")?.value || "";

//     // ✅ Check if factory is "NFH" and process is "RLC" BEFORE scanning
//     const isNFH_RLC = factoryValue === "NFH" && processValue === "RLC";
//     console.log(`Factory: ${factoryValue}, Process: ${processValue}, NFH + RLC Condition: ${isNFH_RLC}`);

//     // ✅ If NFH + RLC, mark second scan as skipped BEFORE scanning
//     if (isNFH_RLC) {
//         console.log("NFH + RLC detected before scanning. Second scan will be skipped.");
//         localStorage.setItem(`${uniquePrefix}secondScanValue`, "SKIPPED");
//     }

//     if (!firstScanValue) {
//         // ✅ If a comma is present in the first scan, take only the part before it
//         let cleanedQR = qrCodeMessage.includes(",") ? qrCodeMessage.split(",")[0] : qrCodeMessage;
//         console.log("First Scan Processed QR:", cleanedQR);

//         const options = [...subDropdown.options].map(option => option.value);

//         if (options.includes(cleanedQR)) {
//             firstScanValue = cleanedQR;
//             localStorage.setItem(`${uniquePrefix}firstScanValue`, firstScanValue);
//             subDropdown.value = firstScanValue;
//             localStorage.setItem(`${uniquePrefix}sub-dropdown`, firstScanValue);

//             fetchProductDetails();

//             // ✅ If NFH + RLC, enable inputs and close modal immediately
//             if (isNFH_RLC) {
//                 enableInputs();
//                 console.log("Skipping second scan. Inputs enabled.");

//                 // Close modal immediately
//                 if (lastScanMethod === "bluetooth") {
//                     document.getElementById('bluetoothScannerModal').style.display = 'none';
//                 } else {
//                     if (html5QrCode && typeof html5QrCode.stop === "function") {
//                         html5QrCode.stop().then(() => {
//                             document.getElementById('qrScannerModal').style.display = 'none';
//                         }).catch(err => console.error("Error stopping camera scanner:", err));
//                     }
//                 }
//             } else {
//                 window.alert("Please scan the TOMSON BOARD.");
//             }
//         } else {
//             showAlert("背番号が存在しません。 / Sebanggo does not exist.");
//         }
//     } else if (!isNFH_RLC) { // ✅ Second scan only required if NOT NFH + RLC
//         console.log("Second Scan Processed QR:", qrCodeMessage);
//         fetchProductDetails();

//         const expectedModel = document.getElementById("model").value;
//         const expectedShape = document.getElementById("shape").value;
//         const expectedRL = document.getElementById("R-L").value;
//         const expectedSecondValue = `${expectedModel},${expectedShape},${expectedRL}`;
//         console.log("Expected Tomson Board QR:", expectedSecondValue);

//         if (qrCodeMessage === expectedSecondValue) {
//             secondScanValue = expectedSecondValue;
//             localStorage.setItem(`${uniquePrefix}secondScanValue`, secondScanValue);
//             subDropdown.value = firstScanValue;
//             enableInputs();

//             // ✅ Both scans are done, delete scanner choice
//             localStorage.removeItem(`${uniquePrefix}scannerChoice`);

//             // ✅ Close the modal based on the last scanning method
//             if (lastScanMethod === "bluetooth") {
//                 document.getElementById('bluetoothScannerModal').style.display = 'none';
//             } else {
//                 if (html5QrCode && typeof html5QrCode.stop === "function") {
//                     html5QrCode.stop().then(() => {
//                         document.getElementById('qrScannerModal').style.display = 'none';
//                         console.log("Camera scanner stopped after second scan.");
//                     }).catch(err => console.error("Error stopping camera scanner:", err));
//                 }
//             }
//         } else {
//             showAlert(`Second QR code does not match the expected value (${expectedSecondValue}).`);
//         }
//     }
// }





//   // 🔹 Bluetooth Scanner Handling (Keyboard Input Mode)
//   document.addEventListener('keydown', (event) => {
//     if (lastScanMethod === "bluetooth") {
//         if (!window.scannedBluetoothCode) {
//             window.scannedBluetoothCode = ""; // Initialize if not set
//         }

//         // Check for valid characters (A-Z, a-z, 0-9)
//         if (/^[a-zA-Z0-9\-,._ ]$/.test(event.key)) {
//             window.scannedBluetoothCode += event.key; // Accumulate valid characters
//         }

//         // When Enter is pressed, finalize the scanned value
//         if (event.key === "Enter") {
//             let cleanedQR = window.scannedBluetoothCode.replace(/Shift/g, ''); // Remove unwanted "Shift" text
//             console.log("Final Scanned QR:", cleanedQR);

//             handleQRScan(cleanedQR); // Process the cleaned QR code
//             window.scannedBluetoothCode = ""; // Reset for next scan
//         }
//     }
// });


//   function startCameraScanner() {
//   lastScanMethod = "camera";
//   localStorage.setItem(`${uniquePrefix}scannerChoice`, lastScanMethod);
//   closeScannerSelectionModal();

//   const qrScannerModal = document.getElementById('qrScannerModal');
//   html5QrCode = new Html5Qrcode("qrReader"); // Use global variable
//   qrScannerModal.style.display = 'block';

//   html5QrCode.start(
//     { facingMode: "environment" },
//     { fps: 10, qrbox: { width: 300, height: 300 } },
//     qrCodeMessage => {
//       handleQRScan(qrCodeMessage);
//     }
//   ).catch(err => {
//     console.error("Failed to start scanning:", err);
//   });

//   document.getElementById('closeQRScannerModal').onclick = function () {
//     html5QrCode.stop().then(() => {
//       qrScannerModal.style.display = 'none';
//     });
//   };
// }

//   function startBluetoothScanner() {
//     lastScanMethod = "bluetooth";
//     localStorage.setItem(`${uniquePrefix}scannerChoice`, lastScanMethod);
//     closeScannerSelectionModal();

//     const bluetoothScannerModal = document.getElementById('bluetoothScannerModal');
//     bluetoothScannerModal.style.display = 'block';
//     document.getElementById('bluetoothScannerInstruction').textContent = 
//       firstScanValue ? "Please scan the TOMSON BOARD QR code." : "Please scan the first QR code (Sebanggo).";
//   }

//   // 🔹 Scan Button Click (Opens modal if first scan is missing)
//   document.getElementById('scan-button').addEventListener('click', function () {
//     const factoryValue = document.getElementById("selected工場")?.value || "";
//     const processValue = document.getElementById("process")?.value || "";

//     // ✅ Check if NFH + RLC when scan button is clicked
//     const isNFH_RLC = factoryValue === "NFH" && processValue === "RLC";
//     console.log(`Scan Button Clicked - Factory: ${factoryValue}, Process: ${processValue}, NFH + RLC Condition: ${isNFH_RLC}`);

//     // ✅ If NFH + RLC, mark second scan as skipped BEFORE scanning
//     if (isNFH_RLC) {
//         console.log("NFH + RLC detected before scanning. Second scan will be skipped.");
//         localStorage.setItem(`${uniquePrefix}secondScanValue`, "SKIPPED");
//     }

//     if (firstScanValue && !secondScanValue) {
//         // If first scan is done, auto-select the last used method
//         if (lastScanMethod === "bluetooth") {
//             startBluetoothScanner();
//         } else {
//             startCameraScanner();
//         }
//     } else {
//         // Ask the user to choose scanning method
//         openScannerSelectionModal();
//     }
// });


//   // Attach event listeners to modal buttons
//   document.getElementById('selectCamera').addEventListener('click', startCameraScanner);
//   document.getElementById('selectBluetooth').addEventListener('click', startBluetoothScanner);

//   // 🔹 Auto-switch to last used scanning method if first scan is done
//   if (firstScanValue && !secondScanValue) {
//     if (lastScanMethod === "bluetooth") {
//       startBluetoothScanner();
//     } else {
//       startCameraScanner();
//     }
//   }

//   // 🔹 Close Bluetooth Modal
//   document.getElementById('closeBluetoothScannerModal').addEventListener('click', () => {
//     document.getElementById('bluetoothScannerModal').style.display = 'none';
//   });

//   // 🔹 Close Selection Modal on Outside Click
//   window.onclick = function(event) {
//     const scannerSelectionModal = document.getElementById('scannerSelectionModal');
//     const bluetoothScannerModal = document.getElementById('bluetoothScannerModal');
//     if (event.target == scannerSelectionModal) {
//       closeScannerSelectionModal();
//     }
//     if (event.target == bluetoothScannerModal) {
//       bluetoothScannerModal.style.display = 'none';
//     }
//   };

// });


// Global function to check process conditions
// function checkProcessCondition() {
//   const subDropdown = document.getElementById('sub-dropdown'); // Ensure this ID is correct
//   const processDropdown = document.getElementById("process");
//   const selected工場Element = document.getElementById("selected工場"); // Get the element
//   const selected工場 = selected工場Element ? selected工場Element.value : ""; // Get value if element exists
//   const processValue = processDropdown ? processDropdown.value : "";
//   const firstScanVal = localStorage.getItem(`${uniquePrefix}firstScanValue`) || document.getElementById("firstScanValue").value; // Check both localStorage and input
//   const secondScanVal = localStorage.getItem(`${uniquePrefix}secondScanValue`) || document.getElementById("secondScanValue").value;

//   // It's safer to check if elements exist before accessing their value
//   const firstScanActualValue = document.getElementById("firstScanValue") ? document.getElementById("firstScanValue").value : "";
//   const secondScanActualValue = document.getElementById("secondScanValue") ? document.getElementById("secondScanValue").value : "";


//   if (
//       (selected工場 === "肥田瀬" || selected工場 === "第二工場") ||
//       (selected工場 === "NFH" && processValue !== "RLC")
//   ) {
//       // For these conditions, two scans are required.
//       // Use the actual input field values for enabling/disabling.
//       if (!firstScanActualValue || !secondScanActualValue || secondScanActualValue === "SKIPPED_PLACEHOLDER_FOR_NFH_RLC_FIRST_SCAN_UI") {
//            // If NFH+RLC, secondScanValue might be "SKIPPED". Treat this as "not done" for disabling inputs
//            // unless it's truly done.
//            // Let's refine: if secondScanValue is "SKIPPED" (meaning NFH+RLC completed its one scan), inputs should be enabled.
//           if (localStorage.getItem(`${uniquePrefix}secondScanValue`) === "SKIPPED") {
//             console.log("Inputs enabled: NFH+RLC one scan completed.");
//             enableInputs();
//           } else if (!firstScanActualValue || !secondScanActualValue) {
//             console.log("Inputs disabled: Factory requires 2 QR scans (or first scan pending).");
//             //disableInputs(); <- need to disable comment if production
//           } else {
//             console.log("Inputs enabled: 2 QR scans completed.");
//             enableInputs();
//           }
//       } else {
//           console.log("Inputs enabled: 2 QR scans completed.");
//           enableInputs();
//       }
//   } else {
//       // This case is for NFH + RLC (one scan is enough) OR other factories not needing 2 scans.
//       console.log("Factory/Process condition allows inputs to be enabled (e.g., NFH + RLC).");
//       enableInputs();
//   }
// }

function checkProcessCondition() {
    const subDropdown = document.getElementById('sub-dropdown');
    const processDropdown = document.getElementById("process");
    const selected工場Element = document.getElementById("selected工場");
    
    const currentFactory = selected工場Element ? selected工場Element.value : "";
    const currentProcess = processDropdown ? processDropdown.value : "";
    
    const firstScanActualValue = document.getElementById("firstScanValue") ? document.getElementById("firstScanValue").value : "";
    // For secondScanActualValue, consider localStorage "SKIPPED" as "done" if only 1 scan is needed.
    let secondScanConsideredDone = false;
    const storedSecondScan = localStorage.getItem(`${uniquePrefix}secondScanValue`);
    const inputSecondScan = document.getElementById("secondScanValue") ? document.getElementById("secondScanValue").value : "";

    if (storedSecondScan === "SKIPPED") {
        secondScanConsideredDone = true;
    } else if (inputSecondScan && inputSecondScan !== "SKIPPED_PLACEHOLDER_FOR_NFH_RLC_FIRST_SCAN_UI") { // Assuming you might use such a placeholder
        secondScanConsideredDone = true;
    }


    if (isSecondScanCurrentlyRequired(currentFactory, currentProcess)) {
        // --- This configuration REQUIRES TWO SCANS ---
        // Inputs should be enabled only if both firstScanActualValue and a valid secondScanValue are present.
        // (A "SKIPPED" value for secondScanValue means it wasn't actually scanned, so it's not 'done' in a 2-scan scenario)
        const actualSecondScanValue = document.getElementById("secondScanValue").value; // Get the direct input value
        if (firstScanActualValue && actualSecondScanValue && actualSecondScanValue !== "SKIPPED") { // Ensure second scan is not just the placeholder "SKIPPED"
            console.log(`Inputs enabled: 2 QR scans completed for a 2-scan required process (Factory: ${currentFactory}, Process: ${currentProcess}).`);
            enableInputs();
        } else {
            console.log(`Inputs disabled: 2 QR scans required, but not both completed yet (Factory: ${currentFactory}, Process: ${currentProcess}). First: '${firstScanActualValue}', Second: '${actualSecondScanValue}'`);
             //disableInputs(); // UNCOMMENT FOR PRODUCTION
        }
    } else {
        // --- This configuration requires ONLY ONE SCAN (or second is skipped) ---
        // Inputs should be enabled if the first scan is done OR if dropdown has a value selected.
        const subDropdownValue = subDropdown ? subDropdown.value : "";
        if (firstScanActualValue || subDropdownValue) { // If first scan is done OR dropdown selection exists, that's enough for a 1-scan process
            console.log(`Inputs enabled: Single scan requirement met or second scan not needed (Factory: ${currentFactory}, Process: ${currentProcess}).`);
            enableInputs();
        } else {
            console.log(`Inputs disabled: First scan pending for a single-scan/skipped-second-scan process (Factory: ${currentFactory}, Process: ${currentProcess}).`);
             //disableInputs(); // UNCOMMENT FOR PRODUCTION
        }
    }
}


let html5QrCode; // Declare globally
// Retrieve from localStorage on load, these will be updated by scans
let firstScanValue = localStorage.getItem(`${uniquePrefix}firstScanValue`) || "";
let secondScanValue = localStorage.getItem(`${uniquePrefix}secondScanValue`) || "";

document.addEventListener('DOMContentLoaded', () => {
  const subDropdown = document.getElementById('sub-dropdown');
  const processDropdown = document.getElementById("process");
  // Initialize from localStorage again to ensure consistency within this scope
  firstScanValue = localStorage.getItem(`${uniquePrefix}firstScanValue`) || "";
  secondScanValue = localStorage.getItem(`${uniquePrefix}secondScanValue`) || "";
  let lastScanMethod = localStorage.getItem(`${uniquePrefix}scannerChoice`) || "";

  // Update input fields from localStorage if values exist
  if (document.getElementById("firstScanValue")) {
      document.getElementById("firstScanValue").value = firstScanValue;
  }
  if (document.getElementById("secondScanValue")) {
      // If secondScanValue was "SKIPPED", you might want to display something else or leave it blank
      // For now, just set it. It helps checkProcessCondition
      document.getElementById("secondScanValue").value = (secondScanValue === "SKIPPED") ? "" : secondScanValue;
      // If it was SKIPPED, perhaps a visual indicator could be set elsewhere.
  }


  console.log("Initial firstScanValue from localStorage:", firstScanValue);
  console.log("Initial secondScanValue from localStorage:", secondScanValue);
  console.log("Last scan method:", lastScanMethod);

  if (subDropdown && firstScanValue) { // Only need firstScanValue to attempt fetch
    // If firstScanValue exists, populate dropdown and fetch details.
    // This handles page reloads where data was already scanned.
    subDropdown.value = firstScanValue;
    // fetchProductDetails will populate model, shape, R-L, and the hidden expectedBoardDataQR
    fetchProductDetails();
    // If secondScanValue also exists and is not SKIPPED, inputs should be enabled.
    // If secondScanValue is SKIPPED, inputs should be enabled.
    // checkProcessCondition will handle this.
  }


  checkProcessCondition(); // Initial check

  if (processDropdown) { // Add event listener only if processDropdown exists
    processDropdown.addEventListener("change", checkProcessCondition);
  }
  const selected工場Dropdown = document.getElementById("selected工場");
  if (selected工場Dropdown && selected工場Dropdown.tagName === "SELECT") {
      selected工場Dropdown.addEventListener("change", checkProcessCondition);
  }


  function openScannerSelectionModal() {
    document.getElementById('scannerSelectionModal').style.display = 'block';
  }

  function closeScannerSelectionModal() {
    document.getElementById('scannerSelectionModal').style.display = 'none';
  }

//   function handleQRScan(qrCodeMessage) {
//     console.log("Scanned QR (Raw):", qrCodeMessage);

//     const factoryValue = document.getElementById("selected工場")?.value || "";
//     const processValue = document.getElementById("process")?.value || "";
//     const isNFH_RLC = factoryValue === "NFH" && processValue === "RLC";
//     console.log(`Factory: ${factoryValue}, Process: ${processValue}, isNFH_RLC: ${isNFH_RLC}`);

//     if (!firstScanValue) { // ---- FIRST SCAN LOGIC ----
//         let cleanedQR = qrCodeMessage.includes(",") ? qrCodeMessage.split(",")[0] : qrCodeMessage;
//         console.log("First Scan Processed QR:", cleanedQR);

//         const options = [...subDropdown.options].map(option => option.value);
//         if (options.includes(cleanedQR)) {
//             firstScanValue = cleanedQR;
//             localStorage.setItem(`${uniquePrefix}firstScanValue`, firstScanValue);
//             document.getElementById("firstScanValue").value = firstScanValue; // Update hidden input
//             subDropdown.value = firstScanValue;
//             localStorage.setItem(`${uniquePrefix}sub-dropdown`, firstScanValue);

//             // CRITICAL: fetchProductDetails() must:
//             // 1. Fetch product data (model, shape, R-L, and boardData array).
//             // 2. Populate display fields (model, shape, R-L).
//             // 3. Create boardData string: const boardDataString = product.boardData.join(',');
//             // 4. Store it: document.getElementById('expectedBoardDataQR').value = boardDataString;
//             fetchProductDetails();

//             if (isNFH_RLC) {
//                 secondScanValue = "SKIPPED"; // Mark second scan as effectively done
//                 localStorage.setItem(`${uniquePrefix}secondScanValue`, "SKIPPED");
//                 document.getElementById("secondScanValue").value = ""; // Clear visible input if any, or set placeholder
//                 enableInputs();
//                 console.log("NFH + RLC: First scan successful. Second scan skipped. Inputs enabled.");
//                 // Close scanner modal
//                 if (lastScanMethod === "bluetooth") {
//                     document.getElementById('bluetoothScannerModal').style.display = 'none';
//                 } else if (html5QrCode && typeof html5QrCode.stop === "function") {
//                     html5QrCode.stop().then(() => {
//                         document.getElementById('qrScannerModal').style.display = 'none';
//                     }).catch(err => console.error("Error stopping camera scanner:", err));
//                 }
//             } else {
//                 // Prompt for second scan
//                 const instructionElement = document.getElementById('bluetoothScannerInstruction');
//                 const alertMessage = "Please scan the TOMSON BOARD (Board Data QR).";
//                 if (lastScanMethod === "bluetooth" && instructionElement && document.getElementById('bluetoothScannerModal').style.display === 'block') {
//                     instructionElement.textContent = alertMessage;
//                 } else {
//                     // For camera, modal usually closes/reopens or relies on user seeing the next step
//                     window.alert(alertMessage);
//                 }
//                 // Do not enable inputs yet
//                 disableInputs();
//             }
//         } else {
//             showAlert("背番号が存在しません。 / Sebanggo does not exist.");
//             firstScanValue = ""; // Reset to allow re-scan of first QR
//             localStorage.removeItem(`${uniquePrefix}firstScanValue`);
//             document.getElementById("firstScanValue").value = "";
//             // Potentially clear related fields like model, shape, R-L, expectedBoardDataQR
//             document.getElementById("model").value = "";
//             document.getElementById("shape").value = "";
//             document.getElementById("R-L").value = "";
//             if(document.getElementById("expectedBoardDataQR")) { // Clear expected board data if first scan fails
//                  document.getElementById("expectedBoardDataQR").value = "";
//             }
//         }
//     } else if (secondScanValue !== "SKIPPED") { // ---- SECOND SCAN LOGIC ----
//         // This block executes if firstScanValue is present AND secondScanValue is not "SKIPPED"

//         // Retrieve the expected boardData QR string populated by fetchProductDetails()
//         const expectedBoardDataQR = document.getElementById("expectedBoardDataQR") ? document.getElementById("expectedBoardDataQR").value : "";
//         console.log("Second Scan Processed QR:", qrCodeMessage);
//         console.log("Expected Tomson Board QR (from boardData):", expectedBoardDataQR);

//         if (!expectedBoardDataQR && !isNFH_RLC) { // If expected data is missing and it's not a skipped scan scenario
//             showAlert("Error: Expected Board Data for the second scan is missing. Please re-scan the first QR or check product details.");
//             // Optionally, allow user to restart by clearing firstScanValue
//             // firstScanValue = ""; localStorage.removeItem(`${uniquePrefix}firstScanValue`);
//             // document.getElementById("firstScanValue").value = "";
//             // subDropdown.value = "";
//             // disableInputs(); // Ensure inputs are disabled
//             return; // Stop further processing for this scan
//         }

//         if (qrCodeMessage === expectedBoardDataQR) {
//             secondScanValue = qrCodeMessage; // Use actual scanned value
//             localStorage.setItem(`${uniquePrefix}secondScanValue`, secondScanValue);
//             document.getElementById("secondScanValue").value = secondScanValue; // Update hidden input
//             enableInputs();
//             console.log("Second scan successful. Inputs enabled.");

//             localStorage.removeItem(`${uniquePrefix}scannerChoice`); // Both scans done
//             // Close scanner modal
//             if (lastScanMethod === "bluetooth") {
//                 document.getElementById('bluetoothScannerModal').style.display = 'none';
//             } else if (html5QrCode && typeof html5QrCode.stop === "function") {
//                 html5QrCode.stop().then(() => {
//                     document.getElementById('qrScannerModal').style.display = 'none';
//                 }).catch(err => console.error("Error stopping camera scanner:", err));
//             }
//         } else {
//             showAlert(`Second QR code does not match expected Board Data. Scanned: ${qrCodeMessage}, Expected: ${expectedBoardDataQR}`);
//             // Do not clear secondScanValue here, allows retrying the second scan
//             // Do not clear firstScanValue either
//         }
//     } else {
//         console.log("All scans completed or second scan was skipped (NFH+RLC). Inputs should be enabled.");
//         enableInputs(); // Ensure inputs are enabled if this state is reached
//     }
//     checkProcessCondition(); // Re-evaluate conditions after scan attempt
// }

// Helper function to compare parts, special handling for Bluetooth
function comparePartsConsideringBluetooth(expectedPart, scannedPart, isBluetooth) {
    expectedPart = expectedPart.trim();
    scannedPart = scannedPart.trim();

    if (isBluetooth) {
        // Regex to find the first Japanese character (Hiragana, Katakana, CJK Ideographs, Full-width forms)
        const japaneseCharRegex = /[\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/;
        const matchInExpected = expectedPart.match(japaneseCharRegex);

        if (matchInExpected && matchInExpected.index > -1) {
            // Japanese characters ARE present in the expected part.
            // Extract the ASCII prefix from the expected part.
            const expectedAsciiPrefix = expectedPart.substring(0, matchInExpected.index);

            // For the scanned part from Bluetooth, we assume it might have the same ASCII prefix
            // followed by garbled characters (like your "A424524247343360" for "Aピラー").
            // So, we check if the scanned part *starts with* this expected ASCII prefix.
            if (scannedPart.startsWith(expectedAsciiPrefix)) {
                console.log(`[BT Compare] Part "${expectedPart}" vs "${scannedPart}": Matched on ASCII prefix "${expectedAsciiPrefix}".`);
                return true;
            } else {
                // If the scanned part doesn't even start with the expected ASCII prefix, it's a mismatch.
                console.log(`[BT Compare] Part "${expectedPart}" vs "${scannedPart}": Mismatched. Expected ASCII prefix: "${expectedAsciiPrefix}", Scanned doesn't start with it.`);
                return false;
            }
        } else {
            // No Japanese characters in the expected part, so it should be a direct ASCII match.
            const directMatch = (expectedPart === scannedPart);
            console.log(`[BT Compare] Part "${expectedPart}" vs "${scannedPart}" (expected no Japanese): Direct comparison result: ${directMatch}.`);
            return directMatch;
        }
    } else {
        // Not Bluetooth, or no special handling needed: direct comparison
        return expectedPart === scannedPart;
    }
}


// --- Updated section in handleQRScan ---
// (Make sure the rest of handleQRScan and other functions are as per previous responses)
async function handleQRScan(qrCodeMessage) {
    console.log("Scanned QR (Raw):", qrCodeMessage);

    const subDropdown = document.getElementById('sub-dropdown');
    const factoryValue = document.getElementById("selected工場")?.value || "";
    const processValue = document.getElementById("process")?.value || "";
    const isNFH_RLC = factoryValue === "NFH" && processValue === "RLC";
    // Ensure lastScanMethod is up-to-date from localStorage or a global variable
    // const currentLastScanMethod = localStorage.getItem(`${uniquePrefix}scannerChoice`) || lastScanMethod;
    // Using the global lastScanMethod which is updated by startCameraScanner/startBluetoothScanner

    console.log(`Factory: ${factoryValue}, Process: ${processValue}, isNFH_RLC: ${isNFH_RLC}, Scan Method: ${lastScanMethod}`);

    if (!firstScanValue) { // ---- FIRST SCAN LOGIC ----
        let cleanedQR = qrCodeMessage.includes(",") ? qrCodeMessage.split(",")[0] : qrCodeMessage;
        console.log("First Scan Processed QR:", cleanedQR);

        const options = subDropdown ? [...subDropdown.options].map(option => option.value) : [];
        if (subDropdown && options.includes(cleanedQR)) {
            firstScanValue = cleanedQR;
            localStorage.setItem(`${uniquePrefix}firstScanValue`, firstScanValue);
            document.getElementById("firstScanValue").value = firstScanValue;
            subDropdown.value = firstScanValue;
            localStorage.setItem(`${uniquePrefix}sub-dropdown`, firstScanValue);

            // ---- MODIFICATION: Stop camera scanner immediately after first successful scan ----
            if (lastScanMethod === "camera") {
                if (html5QrCode && typeof html5QrCode.stop === "function") {
                    try {
                        await html5QrCode.stop(); // Stop the camera
                        console.log("Camera scanner stopped after first successful scan.");
                        const cameraModal = document.getElementById('qrScannerModal');
                        if (cameraModal) cameraModal.style.display = 'none'; // Hide modal too
                    } catch (err) {
                        console.warn("Error stopping camera scanner after first scan (might be already stopped):", err);
                        const cameraModal = document.getElementById('qrScannerModal');
                        if (cameraModal) cameraModal.style.display = 'none'; // Still hide modal
                    }
                }
                // For Bluetooth, the modal is typically still open, and input is processed on "Enter".
                // The closeActiveScannerModal() will be called later if all scans complete or for NFH_RLC.
            }
            // ---- END MODIFICATION ----

            const detailsFetchedSuccessfully = await fetchProductDetails();

            if (detailsFetchedSuccessfully) {
                // Get current factory and process to pass to the helper function
                const currentFactoryForCheck = document.getElementById("selected工場")?.value || "";
                const currentProcessForCheck = document.getElementById("process")?.value || "";

                if (!isSecondScanCurrentlyRequired(currentFactoryForCheck, currentProcessForCheck)) {
                    // If second scan is NOT required by current rules (temporary or future)
                    secondScanValue = "SKIPPED";
                    localStorage.setItem(`${uniquePrefix}secondScanValue`, "SKIPPED");
                    document.getElementById("secondScanValue").value = ""; // Or a placeholder like "N/A"
                    enableInputs();
                    console.log(`Second scan SKIPPED based on current rules for Factory: ${currentFactoryForCheck}, Process: ${currentProcessForCheck}. Inputs enabled.`);
                    
                    // If Bluetooth modal was open and is the active method, close it as the sequence is done.
                    if (lastScanMethod === "bluetooth" && document.getElementById('bluetoothScannerModal').style.display === 'block') {
                        closeActiveScannerModal();
                    }
                    // Camera modal would have already been closed after a successful first scan.
                } else {
                    // Second scan IS required by current rules
                    const instructionMessage = "1st QR Success! Scan Tomson Board.\n成功！トムソンボードをスキャンしてください。";
                    
                    if (lastScanMethod === "bluetooth") {
                        const instructionElement = document.getElementById('bluetoothScannerInstruction');
                        const bluetoothModal = document.getElementById('bluetoothScannerModal');
                        if (instructionElement && bluetoothModal && bluetoothModal.style.display === 'block') {
                            instructionElement.textContent = instructionMessage;
                            console.log("Updated Bluetooth scanner instruction for Tomson Board scan.");
                        } else {
                            console.warn("Bluetooth modal not visible or instruction element not found when trying to update for 2nd scan.");
                            // Potentially show a general non-intrusive modal as a fallback
                            // showInstructionModal(instructionMessage, 'info', 7000); // Example
                        }
                    } else { // Camera or other methods where a general prompt might be needed
                        console.log("First scan success. Tomson board scan required. Prompting user (e.g. via general modal or relying on next scan action).");
                        // If you had a general instruction modal like showInstructionModal we discussed, you could call it here.
                        // showInstructionModal(instructionMessage, 'info', 7000); 
                    }
                }
            } else {
                showAlert("Failed to retrieve product data after first scan. Please try the first scan again.");
                firstScanValue = "";
                localStorage.removeItem(`${uniquePrefix}firstScanValue`);
                document.getElementById("firstScanValue").value = "";
                if (subDropdown) subDropdown.value = "";
                blankInfo();
                disableInputs();
            }
        } else {
            showAlert("背番号が存在しません。 / Sebanggo does not exist.");
            firstScanValue = ""; // Reset so user can try first scan again
            localStorage.removeItem(`${uniquePrefix}firstScanValue`);
            document.getElementById("firstScanValue").value = "";
            blankInfo();
            disableInputs();
            // If camera was scanning, it might be good to stop it here too if an invalid first QR was scanned
            if (lastScanMethod === "camera" && html5QrCode && typeof html5QrCode.stop === "function") {
                 try { await html5QrCode.stop(); console.log("Camera stopped due to invalid first QR."); } catch(e){}
                 const cameraModal = document.getElementById('qrScannerModal');
                 if (cameraModal) cameraModal.style.display = 'none';
            }
        }
    } else if (secondScanValue !== "SKIPPED") { // ---- SECOND SCAN LOGIC ----
        // (The rest of your second scan logic remains the same)
        // ...
        // ... ensure closeActiveScannerModal() is called upon successful second scan ...
        const expectedBoardDataQR_original = document.getElementById("expectedBoardDataQR") ? document.getElementById("expectedBoardDataQR").value : "";
        let scannedQrMessageForComparison = qrCodeMessage;

        console.log("Second Scan Processed QR (Raw from scanner):", `"${scannedQrMessageForComparison}"`);
        console.log("Expected Tomson Board QR (Original from DB):", `"${expectedBoardDataQR_original}"`);

        if (!expectedBoardDataQR_original && !isNFH_RLC) {
            showAlert("Error: Expected Board Data for the second scan is missing. Product details might not have loaded. Please try rescanning the first QR.");
            return;
        }

        let comparisonResult = false;
        const isBluetoothScan = (lastScanMethod === "bluetooth");

        if (isBluetoothScan) {
            console.log("[Bluetooth Mode] Applying special comparison logic.");
            const expectedParts = expectedBoardDataQR_original.split(',');
            const scannedParts = scannedQrMessageForComparison.split(',');

            if (expectedParts.length === scannedParts.length) {
                comparisonResult = true;
                for (let i = 0; i < expectedParts.length; i++) {
                    if (!comparePartsConsideringBluetooth(expectedParts[i], scannedParts[i], true)) {
                        comparisonResult = false;
                        break;
                    }
                }
            } else {
                console.log("[Bluetooth Mode] Part count mismatch. Expected:", expectedParts.length, "Scanned:", scannedParts.length);
                comparisonResult = false;
            }
        } else {
            console.log("[Non-Bluetooth Mode] Applying direct comparison logic.");
            comparisonResult = (scannedQrMessageForComparison.trim() === expectedBoardDataQR_original.trim());
        }

        if (comparisonResult) {
            secondScanValue = qrCodeMessage;
            localStorage.setItem(`${uniquePrefix}secondScanValue`, secondScanValue);
            document.getElementById("secondScanValue").value = secondScanValue;
            enableInputs();
            console.log("Second scan successful (comparison logic applied). Inputs enabled.");
            localStorage.removeItem(`${uniquePrefix}scannerChoice`); // Clear choice after successful sequence
            closeActiveScannerModal(); // This will stop camera if it was used for 2nd scan
        } else {
            let alertMessage = `Second QR code does not match.`;
            let displayExpected = expectedBoardDataQR_original;
            if (isBluetoothScan) {
                displayExpected = expectedBoardDataQR_original.split(',')
                    .map(part => {
                        const japaneseCharRegex = /[\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/;
                        const matchInExpected = part.match(japaneseCharRegex);
                        return (matchInExpected && matchInExpected.index > -1) ? part.substring(0, matchInExpected.index) : part;
                    })
                    .join(',');
            }
            alertMessage += `\nScanned (raw): ${scannedQrMessageForComparison}\nExpected (effectively, for this scan type): ${displayExpected}`;
            showAlert(alertMessage);
            // If camera was used for second scan and failed, stop it to allow user to re-evaluate/re-present QR
            if (lastScanMethod === "camera") {
                closeActiveScannerModal(); // This will stop the camera and hide modal
                showAlert(alertMessage + "\n\nCamera stopped. Click 'Scan' to try the second scan again.");
            }
        }
    } else {
        console.log("Scan handling: All scans appear complete or second was skipped.");
        enableInputs();
    }
    checkProcessCondition();
}







// Ensure html5QrCode is declared in a scope accessible by this function
// let html5QrCode; // If not already global or in a shared module scope

function closeActiveScannerModal() {
    // Ensure lastScanMethod is up-to-date from localStorage or a global variable
    const currentLastScanMethod = localStorage.getItem(`${uniquePrefix}scannerChoice`) || lastScanMethod; // Or however you maintain lastScanMethod state

    if (currentLastScanMethod === "bluetooth") {
        const bluetoothModal = document.getElementById('bluetoothScannerModal');
        if (bluetoothModal) {
            bluetoothModal.style.display = 'none';
            console.log("Bluetooth scanner modal closed.");
        }
        // Reset any accumulated Bluetooth input if that's managed globally or accessible here
        if (typeof accumulatedBluetoothInput !== 'undefined') {
            accumulatedBluetoothInput = "";
        }
    } else if (currentLastScanMethod === "camera") {
        const cameraModal = document.getElementById('qrScannerModal');
        if (html5QrCode && typeof html5QrCode.stop === "function") {
            html5QrCode.stop()
                .then(() => {
                    if (cameraModal) {
                        cameraModal.style.display = 'none';
                    }
                    console.log("Camera scanner stopped and modal closed.");
                })
                .catch(err => {
                    console.warn("Error stopping camera scanner (it might have already been stopped or not started):", err);
                    // Still try to hide the modal
                    if (cameraModal) {
                        cameraModal.style.display = 'none';
                    }
                });
        } else {
            // If html5QrCode object isn't available or stop isn't a function, just hide modal
            if (cameraModal) {
                cameraModal.style.display = 'none';
                console.log("Camera scanner modal closed (scanner object not available to stop).");
            }
        }
    } else {
        console.log("No active scanner method recognized to close specific modal, or no method set.");
        // You might want to hide all scanner modals as a fallback if state is unclear
        const bluetoothModal = document.getElementById('bluetoothScannerModal');
        const cameraModal = document.getElementById('qrScannerModal');
        if(bluetoothModal) bluetoothModal.style.display = 'none';
        if(cameraModal) cameraModal.style.display = 'none';
    }
    // After closing a scanner, reset the choice so user is prompted again if needed
    // localStorage.removeItem(`${uniquePrefix}scannerChoice`); // Or handle this elsewhere in your logic
}




  // Bluetooth Scanner Handling (Keyboard Input Mode)
  let accumulatedBluetoothInput = ""; // Use a dedicated variable for accumulation
  document.addEventListener('keydown', (event) => {
    const activeModal = document.getElementById('bluetoothScannerModal');
    if (lastScanMethod === "bluetooth" && activeModal && activeModal.style.display === 'block') { // Only listen if bluetooth modal is active
        if (event.key === "Enter") {
            if (accumulatedBluetoothInput) { // Process only if there's accumulated input
                let cleanedQR = accumulatedBluetoothInput.replace(/Shift/g, '');
                console.log("Bluetooth Scanned QR (Enter pressed):", cleanedQR);
                handleQRScan(cleanedQR);
                accumulatedBluetoothInput = ""; // Reset after processing
            }
            event.preventDefault(); // Prevent form submission or other default Enter behavior
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
             // Accumulate printable characters, allow comma, dash, period, space, underscore
            if (/^[a-zA-Z0-9\-,._ ()/]$/.test(event.key)) {
                accumulatedBluetoothInput += event.key;
            }
        } else if (event.key === "Shift") {
            // Ignore shift key itself, but allow its effect on other keys
        }
        // You might want to add a timeout to reset accumulatedBluetoothInput if Enter isn't pressed
        // For example, after a few seconds of inactivity.
    }
  });

  function startCameraScanner() {
    lastScanMethod = "camera";
    localStorage.setItem(`${uniquePrefix}scannerChoice`, lastScanMethod);
    closeScannerSelectionModal();

    const qrScannerModal = document.getElementById('qrScannerModal');
    html5QrCode = new Html5Qrcode("qrReader");
    qrScannerModal.style.display = 'block';

    html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 300, height: 300 } },
      qrCodeMessage => { handleQRScan(qrCodeMessage); }
    ).catch(err => {
      console.error("Failed to start camera scanning:", err);
      showAlert("Failed to start camera. Please check permissions.");
    });

    document.getElementById('closeQRScannerModal').onclick = function () {
      if (html5QrCode && typeof html5QrCode.stop === "function") {
        html5QrCode.stop().then(() => {
          qrScannerModal.style.display = 'none';
        }).catch(err => {
            console.warn("Error stopping QR scanner (might already be stopped):", err);
            qrScannerModal.style.display = 'none'; // Ensure modal closes
        });
      } else {
        qrScannerModal.style.display = 'none';
      }
    };
  }

  function startBluetoothScanner() {
    lastScanMethod = "bluetooth";
    localStorage.setItem(`${uniquePrefix}scannerChoice`, lastScanMethod);
    closeScannerSelectionModal();
    accumulatedBluetoothInput = ""; // Reset any previous input

    const bluetoothScannerModal = document.getElementById('bluetoothScannerModal');
    bluetoothScannerModal.style.display = 'block';
    const instructionElement = document.getElementById('bluetoothScannerInstruction');
    if (instructionElement) {
        instructionElement.textContent =
        firstScanValue && secondScanValue !== "SKIPPED" ? "Please scan the TOMSON BOARD (Board Data QR)." : "Please scan the first QR code (Sebanggo).";
    }
  }

  document.getElementById('scan-button').addEventListener('click', function () {
    const factoryValue = document.getElementById("selected工場")?.value || "";
    const processValue = document.getElementById("process")?.value || "";
    const isNFH_RLC = factoryValue === "NFH" && processValue === "RLC";
    console.log(`Scan Button Clicked - Factory: ${factoryValue}, Process: ${processValue}, isNFH_RLC: ${isNFH_RLC}`);

    // No need to set secondScanValue to "SKIPPED" here.
    // It will be set after a successful *first* scan if isNFH_RLC is true.

    if (firstScanValue && (secondScanValue !== "SKIPPED" && !secondScanValue)) {
        // First scan done, second scan pending (and not skipped)
        if (lastScanMethod === "bluetooth") {
            startBluetoothScanner();
        } else if (lastScanMethod === "camera") {
            startCameraScanner();
        } else { // No last method known, or starting fresh for second scan
            openScannerSelectionModal();
        }
    } else if (!firstScanValue) {
        // First scan not done yet
        openScannerSelectionModal();
    } else {
        // All scans done or second was skipped
        console.log("Scan button clicked, but scans appear complete or second scan was skipped.");
        showAlert("All required scans are complete.");
    }
  });

  document.getElementById('selectCamera').addEventListener('click', startCameraScanner);
  document.getElementById('selectBluetooth').addEventListener('click', startBluetoothScanner);

  // Auto-switch logic seems complex if modals are managed carefully.
  // The scan button click logic should correctly guide the user.
  // Removing the auto-switch here to simplify, rely on scan button or explicit choice.
  /*
  if (firstScanValue && !secondScanValue && secondScanValue !== "SKIPPED") {
    if (lastScanMethod === "bluetooth") {
      startBluetoothScanner();
    } else if (lastScanMethod === "camera") { // Default to camera if not bluetooth
      startCameraScanner();
    }
  }
  */

  document.getElementById('closeBluetoothScannerModal').addEventListener('click', () => {
    document.getElementById('bluetoothScannerModal').style.display = 'none';
    accumulatedBluetoothInput = ""; // Clear input when modal is closed manually
  });

  window.onclick = function(event) {
    const scannerSelectionModal = document.getElementById('scannerSelectionModal');
    const bluetoothScannerModal = document.getElementById('bluetoothScannerModal');
    const qrScannerModal = document.getElementById('qrScannerModal');

    if (event.target == scannerSelectionModal) {
      closeScannerSelectionModal();
    }
    if (event.target == bluetoothScannerModal) {
      bluetoothScannerModal.style.display = 'none';
      accumulatedBluetoothInput = ""; // Clear input
    }
    // Closing QR scanner modal by clicking outside is usually handled by its own close button
    // to ensure html5QrCode.stop() is called.
  };
});


function showSuccessPrompt(message, duration = 3500) {
    const feedbackArea = document.getElementById('scan-feedback-area');
    // NO SOUND for this success prompt

    if (feedbackArea) {
        feedbackArea.textContent = message;
        // 1. Apply base success styles and make it visible
        feedbackArea.className = 'feedback-success-base'; // Remove any other animation/type classes
        feedbackArea.style.display = 'block';

        // 2. Add the flash animation class
        feedbackArea.classList.add('animate-flash-green');

        // 3. Remove the animation class after it has played (0.5s)
        //    This prevents the animation from re-triggering if other attributes change.
        //    The element remains visible with .feedback-success-base style.
        const animationDuration = 500; // Matches your 0.5s animation
        setTimeout(() => {
            if (feedbackArea.style.display === 'block') { // Only if still visible
                feedbackArea.classList.remove('animate-flash-green');
            }
        }, animationDuration + 50); // Remove slightly after animation ends

        // 4. Hide the entire message after the total specified duration
        setTimeout(() => {
            feedbackArea.style.display = 'none';
            feedbackArea.className = ''; // Reset all classes
        }, duration);
    } else {
        window.alert(message); // Fallback
    }
}








// Function to reset everything and reload the page
function resetForm(skipConfirmation = false) {
  // Show confirmation dialog only if not skipped
  if (!skipConfirmation) {
    const userConfirmed = confirm(
      "すべてのデータが削除されます。本当にリセットしますか？\n\nAll data will be deleted. Are you sure you want to reset?"
    );
    
    // If user clicks "Cancel", exit the function
    if (!userConfirmed) {
      return;
    }
  }

  const excludedInputs = ['process']; // IDs or names of inputs to exclude from reset

  // Clear all form inputs with unique prefix except excluded ones
  const inputs = document.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
      const key = `${uniquePrefix}${input.id || input.name}`;
      if (!excludedInputs.includes(input.id) && !excludedInputs.includes(input.name)) {
          localStorage.removeItem(key);
          input.value = ''; // Reset input value
      }
  });

  // Clear counters with unique prefix
  for (let i = 18; i <= 20; i++) {
      const key = `${uniquePrefix}counter-${i}`;
      localStorage.removeItem(key);
      const counterElement = document.getElementById(`counter-${i}`);
      if (counterElement) {
          counterElement.value = '0'; // Reset counter display
      }
  }

  // Reset all textContent elements
  const textContentElements = document.querySelectorAll('[id]'); // Select all elements with an ID
  textContentElements.forEach(element => {
      const textKey = `${uniquePrefix}${element.id}.textContent`;
      if (localStorage.getItem(textKey)) {
          localStorage.removeItem(textKey); // Remove from localStorage
          element.textContent = ''; // Reset to default empty textContent
          console.log(`Reset textContent for element with ID: ${element.id}`);
      }
  });

  // Reset all <img> elements
  const images = document.querySelectorAll('img'); // Get all <img> elements
  images.forEach(image => {
      const imageKey = `${uniquePrefix}${image.id || image.name}.src`;
      localStorage.removeItem(imageKey); // Remove image source from localStorage
      image.src = ''; // Reset the image source
      image.style.display = 'none'; // Hide the image
      console.log(`Reset image ${image.id || image.name}`);
  });
  
  // Reset button colors to red (remove green class)
  const hatsumonoButton = document.getElementById('hatsumonoButton');
  const atomonoButton = document.getElementById('atomonoButton');
  const makerLabelButton = document.getElementById('makerLabelButton');
  
  if (hatsumonoButton) hatsumonoButton.classList.remove('has-photo');
  if (atomonoButton) atomonoButton.classList.remove('has-photo');
  if (makerLabelButton) makerLabelButton.classList.remove('has-photos');

  localStorage.removeItem(`${uniquePrefix}scannerChoice`); // clear choice

  // Clear maintenance records
  const maintenanceKey = `${uniquePrefix}maintenanceRecords`;
  localStorage.removeItem(maintenanceKey);
  console.log('Cleared maintenance records from localStorage');
  
  // Clear material label photos
  const materialPhotosKey = `${uniquePrefix}materialLabelPhotos`;
  localStorage.removeItem(materialPhotosKey);
  console.log('Cleared material label photos from localStorage');
  
  // Clear break times
  for (let i = 1; i <= 4; i++) {
    localStorage.removeItem(`${uniquePrefix}break${i}-start`);
    localStorage.removeItem(`${uniquePrefix}break${i}-end`);
  }
  console.log('Cleared break times from localStorage');

  // Reload the page
  window.location.reload();
}





// Print label using "Smooth Print" app for mobile devices
// function printLabel() {
//   const alertSound = document.getElementById('alert-sound');
//   const scanAlertModal = document.getElementById('scanAlertModal');
//   const scanAlertText = document.getElementById('scanAlertText');
//   const 背番号 = document.getElementById("sub-dropdown").value;
  
  
//   if (selectedFactory === "肥田瀬"){
//     printLabelHidase();
//     return;
//   }

//   // Preload the alert sound without playing it
//   if (alertSound) {
//     alertSound.muted = true; // Mute initially to preload
//     alertSound.loop = false; // Disable looping
//     alertSound.load(); // Preload the audio file
//   }

//   // Check if 背番号 is selected
//   if (!背番号) {
//     // Show alert modal
//     scanAlertText.innerText = '背番号が必要です。 / Sebanggo is required.';
//     scanAlertModal.style.display = 'block';

//     // Play alert sound
//     if (alertSound) {
//       alertSound.muted = false; // Unmute to alert user
//       alertSound.volume = 1; // Set full volume
//       alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
//     }

//     // Add blinking red background
//     document.body.classList.add('flash-red');

//     // Close modal on button click
//     const closeScanModalButton = document.getElementById('closeScanModalButton');
//     closeScanModalButton.onclick = function () {
//       scanAlertModal.style.display = 'none';
//       alertSound.pause();
//       alertSound.currentTime = 0; // Reset sound to the beginning
//       alertSound.muted = true; // Mute again for next time
//       document.body.classList.remove('flash-red');
//     };

//     return; // Stop the submission process
//   }

//   // List of 背番号 values requiring 収容数 selection
//   const specialValues = [
//   "E701", "E702", "E703", "E704", "E705", "E706", "E707", "E708",
//   "MDLB", "MDLS", "MDRB", "MDRS",
//   "P01K", "P02K", "P03K", "P04K", "P05K", "P06K", "P07K", "P08K",
//   "P09K", "P10K", "P11K", "P12K", "P13K", "P14K", "P15K", "P16K",
//   "P17K", "P18K", "P19K", "P20K",
//   "UFS1", "UFS2", "UFS3", "UFS4", "UFS5", "UFS6", "UFS7", "UFS8",
//   "URB1", "URB2", "URB3", "URB4", "URB5", "URB6", "URB7", "URB8"
//   ];

//   // Check if 背番号 matches special values
//   if (specialValues.includes(背番号)) {
//     // Create and show a modal for 収容数 selection
//     const modal = document.createElement('div');
//     modal.classList.add('modal');
//     modal.style.display = 'flex';
//     modal.style.position = 'fixed';
//     modal.style.top = '50%';
//     modal.style.left = '50%';
//     modal.style.transform = 'translate(-50%, -50%)';
//     modal.style.flexDirection = 'column';
//     modal.style.justifyContent = 'center';
//     modal.style.alignItems = 'center';
//     modal.style.padding = '30px';
//     modal.style.backgroundColor = 'white';
//     modal.style.boxShadow = '0 0 15px rgba(0, 0, 0, 0.5)';
//     modal.style.borderRadius = '10px';

//     const message = document.createElement('p');
//     message.innerText = '収容数を選んでください / Please choose the value for Quantity';
//     message.style.fontSize = '24px';
//     message.style.textAlign = 'center';
//     message.style.marginBottom = '20px';
//     modal.appendChild(message);

//     const button50 = document.createElement('button');
//     button50.innerText = '50';
//     button50.style.margin = '10px';
//     button50.style.padding = '15px 30px';
//     button50.style.fontSize = '20px';
//     button50.style.cursor = 'pointer';
//     button50.style.borderRadius = '5px';
//     button50.onclick = () => {
//       redirectWith収容数(50);
//     };
//     modal.appendChild(button50);

//     const button100 = document.createElement('button');
//     button100.innerText = '100';
//     button100.style.margin = '10px';
//     button100.style.padding = '15px 30px';
//     button100.style.fontSize = '20px';
//     button100.style.cursor = 'pointer';
//     button100.style.borderRadius = '5px';
//     button100.onclick = () => {
//       redirectWith収容数(100);
//     };
//     modal.appendChild(button100);

//     const button200 = document.createElement('button');
//     button200.innerText = '200';
//     button200.style.margin = '10px';
//     button200.style.padding = '15px 30px';
//     button200.style.fontSize = '20px';
//     button200.style.cursor = 'pointer';
//     button200.style.borderRadius = '5px';
//     button200.onclick = () => {
//       redirectWith収容数(200);
//     };
//     modal.appendChild(button200);

//     document.body.appendChild(modal);

//     function redirectWith収容数(value) {
//       document.body.removeChild(modal); // Remove modal

//       // Retrieve dynamic values from the form
//       const 品番 = document.getElementById("product-number").value;
//       const 車型 = document.getElementById("model").value;
//       const R_L = document.getElementById("R-L").value;
//       const 材料 = document.getElementById("material").value;
//       const 色 = document.getElementById("material-color").value;
//       const extension = document.getElementById("Labelextension").value;
//       const Date2 = document.getElementById('Lot No.').value;
//       const 品番収容数 = `${品番},${value}`;
//       const SRS = document.getElementById("SRS").value;
//       let filename = "";

//       const Date = extension ? `${Date2} - ${extension}` : Date2;

//       // Smooth Print URL scheme
//       if (SRS === "有り"){
//           filename = "SRS3.lbx";
//       } else if (背番号 === "NC2"){
//           filename = "NC21.lbx"
//       } else {
//         filename = "sample6.lbx";
//       }
//       const size = "RollW62";
//       const copies = 1;
//       const url =
//         `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=${encodeURIComponent(copies)}` +
//         `&text_品番=${encodeURIComponent(品番)}` +
//         `&text_車型=${encodeURIComponent(車型)}` +
//         `&text_収容数=${encodeURIComponent(value)}` +
//         `&text_背番号=${encodeURIComponent(背番号)}` +
//         `&text_RL=${encodeURIComponent(R_L)}` +
//         `&text_材料=${encodeURIComponent(材料)}` +
//         `&text_色=${encodeURIComponent(色)}` +
//         `&text_DateT=${encodeURIComponent(Date)}` +
//         `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

//       console.log(Date);
//       window.location.href = url; // Redirect to Smooth Print
//     }

//     return; // Stop the submission process until user chooses 収容数
//   }

//   // Default process for other 背番号 values
//   const 品番 = document.getElementById("product-number").value;
//   const 車型 = document.getElementById("model").value;
//   const 収容数 = document.getElementById("収容数").value;
//   const R_L = document.getElementById("R-L").value;
//   const 材料 = document.getElementById("material").value;
//   const 色 = document.getElementById("material-color").value;
//   const extension = document.getElementById("Labelextension").value;
//   const Date2 = document.getElementById('Lot No.').value;
//   const 品番収容数 = `${品番},${収容数}`;
//   const SRS = document.getElementById("SRS").value;
//   let filename = "";

//   const Date = extension ? `${Date2} - ${extension}` : Date2;

//   if (SRS === "有り"){
//     filename = "SRS3.lbx";
//   } else if (背番号 === "NC2"){
//       filename = "NC21.lbx"
//   } else {
//     filename = "sample6.lbx";
//   }
  
//   const size = "RollW62";
//   const copies = 1;
//   const url =
//     `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=${encodeURIComponent(copies)}` +
//     `&text_品番=${encodeURIComponent(品番)}` +
//     `&text_車型=${encodeURIComponent(車型)}` +
//     `&text_収容数=${encodeURIComponent(収容数)}` +
//     `&text_背番号=${encodeURIComponent(背番号)}` +
//     `&text_RL=${encodeURIComponent(R_L)}` +
//     `&text_材料=${encodeURIComponent(材料)}` +
//     `&text_色=${encodeURIComponent(色)}` +
//     `&text_DateT=${encodeURIComponent(Date)}` +
//     `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

//   console.log(Date);
//   window.location.href = url;
// }


// new label printing function with async/await and error handling
// added 2TN4.lbx printing function
async function printLabel() {
  const alertSound = document.getElementById('alert-sound');
  const scanAlertModal = document.getElementById('scanAlertModal');
  const scanAlertText = document.getElementById('scanAlertText');
  const 背番号 = document.getElementById("sub-dropdown").value;

  // Function to check if the device is iOS
  function isIOS() {
    // More robust iOS detection
    return [
      'iPad Simulator',
      'iPhone Simulator',
      'iPod Simulator',
      'iPad',
      'iPhone',
      'iPod'
    ].includes(navigator.platform)
    // iPad on iOS 13 detection
    || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
  }

  // Function to handle the actual printing (platform-dependent)
  async function executePrint(url, isIOSDevice) {
    if (isIOSDevice) {
      window.location.href = url;
    } else {
      // Android or desktop: use fetch to send request
      try {
        const response = await Promise.race([
          fetch(url).then(res => {
            if (!res.ok) {
              throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.text();
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout after 7 seconds")), 7000))
        ]);

        if (response.includes("<result>SUCCESS</result>")) {
          console.log("Print success.");
          // flashGreen(); // Assuming you have a function like flashGreen()
          alert("Print command sent successfully!"); // Or some other user feedback
        } else {
          console.error("Printing failed. Response:", response);
          alert("Printing failed. Check printer status or server response: " + response);
        }
      } catch (error) {
        console.error("Error sending print command:", error);
        alert("Error sending print command: " + error.message);
      }
    }
  }


  if (typeof selectedFactory !== 'undefined' && selectedFactory === "肥田瀬") {
    // Assuming printLabelHidase also needs to be async if it uses similar logic,
    // or handle its own platform detection if different.
    // For now, calling it directly. If it needs platform specific URL, it should be updated too.
    printLabelHidase(); // Make sure printLabelHidase is defined
    return;
  }

  // Preload the alert sound without playing it
  if (alertSound) {
    alertSound.muted = true; // Mute initially to preload
    alertSound.loop = false; // Disable looping
    alertSound.load(); // Preload the audio file
  }

  // Check if 背番号 is selected
  if (!背番号) {
    // Show alert modal
    if (scanAlertText) scanAlertText.innerText = '背番号が必要です。 / Sebanggo is required.';
    if (scanAlertModal) scanAlertModal.style.display = 'block';

    // Play alert sound
    if (alertSound) {
      alertSound.muted = false; // Unmute to alert user
      alertSound.volume = 1; // Set full volume
      alertSound.play().catch(error => console.error('Failed to play alert sound:', error));
    }

    // Add blinking red background
    document.body.classList.add('flash-red');

    // Close modal on button click
    const closeScanModalButton = document.getElementById('closeScanModalButton');
    if (closeScanModalButton) {
        closeScanModalButton.onclick = function () {
        if (scanAlertModal) scanAlertModal.style.display = 'none';
        if (alertSound) {
            alertSound.pause();
            alertSound.currentTime = 0; // Reset sound to the beginning
            alertSound.muted = true; // Mute again for next time
        }
        document.body.classList.remove('flash-red');
        };
    }
    return; // Stop the submission process
  }

  // List of 背番号 values requiring 収容数 selection
  const specialValues = [
    "E701", "E702", "E703", "E704", "E705", "E706", "E707", "E708",
    "MDLB", "MDLS", "MDRB", "MDRS",
    "P01K", "P02K", "P03K", "P04K", "P05K", "P06K", "P07K", "P08K",
    "P09K", "P10K", "P11K", "P12K", "P13K", "P14K", "P15K", "P16K",
    "P17K", "P18K", "P19K", "P20K",
    "UFS1", "UFS2", "UFS3", "UFS4", "UFS5", "UFS6", "UFS7", "UFS8",
    "URB1", "URB2", "URB3", "URB4", "URB5", "URB6", "URB7", "URB8"
  ];

  // Function to determine filename based on 背番号 and SRS
  function getFilename(currentSebanggo, currentSRS) {
    const amPattern = /^AM0[1-9]$/; // Matches AM01 to AM09
    if (amPattern.test(currentSebanggo)) {
      return "2TN5.lbx";
    } else if (currentSRS === "有り") {
      return "SRS3.lbx";
    } else if (currentSebanggo === "NC2") {
      return "NC21.lbx";
    } else {
      return "sample6.lbx";
    }
  }

  // Check if 背番号 matches special values that require quantity selection
  if (specialValues.includes(背番号)) {
    // Create and show a modal for 収容数 selection
    const modal = document.createElement('div');
    modal.classList.add('modal');
    modal.style.display = 'flex';
    modal.style.position = 'fixed';
    modal.style.zIndex = '1000'; // Ensure modal is on top
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.flexDirection = 'column';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.padding = '30px';
    modal.style.backgroundColor = 'white';
    modal.style.boxShadow = '0 0 15px rgba(0, 0, 0, 0.5)';
    modal.style.borderRadius = '10px';

    const message = document.createElement('p');
    message.innerText = '収容数を選んでください / Please choose the value for Quantity';
    message.style.fontSize = '24px';
    message.style.textAlign = 'center';
    message.style.marginBottom = '20px';
    modal.appendChild(message);

    const createButton = (value) => {
      const button = document.createElement('button');
      button.innerText = String(value);
      button.style.margin = '10px';
      button.style.padding = '15px 30px';
      button.style.fontSize = '20px';
      button.style.cursor = 'pointer';
      button.style.borderRadius = '5px';
      button.onclick = async () => {
        await redirectWith収容数(value);
      };
      modal.appendChild(button);
    };

    createButton(50);
    createButton(100);
    createButton(200);

    document.body.appendChild(modal);

    async function redirectWith収容数(selectedQuantity) {
      if (document.body.contains(modal)) {
          document.body.removeChild(modal);
      }

      const 品番 = document.getElementById("product-number").value;
      const 車型 = document.getElementById("model").value;
      const R_L = document.getElementById("R-L").value;
      const 材料 = document.getElementById("material").value;
      const 色 = document.getElementById("material-color").value;
      const extension = document.getElementById("Labelextension").value;
      const Date2 = document.getElementById('Lot No.').value;
      const 品番収容数 = `${品番},${selectedQuantity}`;
      const SRS = document.getElementById("SRS").value;
      
      const filename = getFilename(背番号, SRS); // Use the helper function

      const DateStr = extension ? `${Date2} - ${extension}` : Date2; // Renamed 'Date' to 'DateStr' to avoid conflict

      const currentIsIOS = isIOS();
      const baseURL = currentIsIOS
        ? "brotherwebprint://print"
        : "http://localhost:8088/print";

      const size = "RollW62";
      const copies = 1;
      const url =
        `${baseURL}?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=${encodeURIComponent(copies)}` +
        `&text_品番=${encodeURIComponent(品番)}` +
        `&text_車型=${encodeURIComponent(車型)}` +
        `&text_収容数=${encodeURIComponent(selectedQuantity)}` +
        `&text_背番号=${encodeURIComponent(背番号)}` +
        `&text_RL=${encodeURIComponent(R_L)}` +
        `&text_材料=${encodeURIComponent(材料)}` +
        `&text_色=${encodeURIComponent(色)}` +
        `&text_DateT=${encodeURIComponent(DateStr)}` +
        `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

      console.log("Sending print request (via modal):", url);
      await executePrint(url, currentIsIOS);
    }
    return; // Stop the submission process until user chooses 収容数
  }

  // Default process for other 背番号 values (not in specialValues)
  const 品番 = document.getElementById("product-number").value;
  const 車型 = document.getElementById("model").value;
  const 収容数 = document.getElementById("収容数").value;
  const R_L = document.getElementById("R-L").value;
  const 材料 = document.getElementById("material").value;
  const 色 = document.getElementById("material-color").value;
  const extension = document.getElementById("Labelextension").value;
  const Date2 = document.getElementById('Lot No.').value;
  const 品番収容数 = `${品番},${収容数}`;
  const SRS = document.getElementById("SRS").value;
  
  const filename = getFilename(背番号, SRS); // Use the helper function

  const DateStr = extension ? `${Date2} - ${extension}` : Date2; // Renamed 'Date' to 'DateStr'

  const currentIsIOS = isIOS();
  const baseURL = currentIsIOS
    ? "brotherwebprint://print"
    : "http://localhost:8088/print";

  const size = "RollW62";
  const copies = 1;
  const url =
    `${baseURL}?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=${encodeURIComponent(copies)}` +
    `&text_品番=${encodeURIComponent(品番)}` +
    `&text_車型=${encodeURIComponent(車型)}` +
    `&text_収容数=${encodeURIComponent(収容数)}` +
    `&text_背番号=${encodeURIComponent(背番号)}` +
    `&text_RL=${encodeURIComponent(R_L)}` +
    `&text_材料=${encodeURIComponent(材料)}` +
    `&text_色=${encodeURIComponent(色)}` +
    `&text_DateT=${encodeURIComponent(DateStr)}` +
    `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

  console.log("Sending print request (default):", url);
  await executePrint(url, currentIsIOS);
}





async function printLabelHidase() {
  const selectedFactory = document.getElementById("selected工場").value;
  const 品番Raw = document.getElementById("product-number").value;
  const kensaName = document.getElementById("kensa-dropdown").value;
  console.log("kensaName:", kensaName);

  if (selectedFactory !== "肥田瀬") {
    console.warn("Not in 肥田瀬 factory. Printing normally...");
    return;
  }

  try {
    const response = await fetch(`${serverURL}/getCapacityBySeBanggo?seBanggo=${encodeURIComponent(品番Raw)}`);
    const data = await response.json();

    if (data.length === 0) {
      alert("No data found for the selected 品番");
      return;
    }

    let lowValue = data[0].収容数;
    let highValue = data[0].収容数;

    if (data.length > 1) {
      const values = data.map(item => parseInt(item.収容数, 10));
      lowValue = Math.min(...values);
      highValue = Math.max(...values);
    }

    showHidaseLabelButtons({
      品番: 品番Raw,
      収容数Low: lowValue,
      収容数High: highValue
    });

  } catch (error) {
    console.error('Error fetching 収容数:', error);
  }
}

function showHidaseLabelButtons({ 品番, 収容数Low, 収容数High }) {
  const container = document.getElementById("hidase-label-buttons");
  container.innerHTML = ''; // Clear old buttons

  const extension = document.getElementById("Labelextension").value;
  const dateRaw = document.getElementById('Lot No.').value;
  const date = extension ? `${dateRaw} - ${extension}` : dateRaw;

  // Create BOX button
  const boxButton = document.createElement('button');
  boxButton.type = "button"; // Prevent form submission
  boxButton.innerText = `Print BOX Label / 外用 (${収容数High})`;
  boxButton.onclick = () => {
    printHidaseLabel({
      品番,
      収容数: 収容数High,
      filename: 'hidaselabel6.lbx',
      modifyHinban: false,
      date
    });
  };

  // Create PRODUCT button
  const productButton = document.createElement('button');
  productButton.type = "button"; // Prevent form submission
  productButton.innerText = `Print Product Label / 製品用 (${収容数Low})`;
  productButton.onclick = () => {
    printHidaseLabel({
      品番,
      収容数: 収容数Low,
      filename: 'hidaselabel7inner.lbx',
      modifyHinban: true,
      date
    });
  };

  container.appendChild(boxButton);
  container.appendChild(productButton);
}


// Function to print the label using Smooth Print
async function printHidaseLabel({ 品番, 収容数, filename, modifyHinban, date }) {
  const selectedFactory = document.getElementById("selected工場").value;
  const kensaName = document.getElementById("kensa-dropdown").value;

  // Special Hinban modification
  if (selectedFactory === "肥田瀬" && 品番 === "146696-5630ESH-5" && modifyHinban) {
    品番 = "146696-5630";
  }

  const 品番収容数 = `${品番},${収容数}`;
  const size = "RollW62";

  // Determine base URL depending on platform
  const baseURL = isIOS()
    ? "brotherwebprint://print"
    : "http://localhost:8088/print";

  const url =
    `${baseURL}?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=1` +
    `&text_品番=${encodeURIComponent(品番)}` +
    `&text_収容数=${encodeURIComponent(収容数)}` +
    `&text_DateT=${encodeURIComponent(date)}` +
    `&text_kensa=${encodeURIComponent(kensaName)}` +
    `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

  console.log("Sending print request:", url);

  // On iOS, use location.href to launch brotherwebprint
  if (isIOS()) {
    window.location.href = url;
    return;
  }

  // Android or desktop: use fetch to send request
  try {
    const response = await Promise.race([
      fetch(url).then(res => res.text()),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout after 7 seconds")), 7000))
    ]);

    if (response.includes("<result>SUCCESS</result>")) {
      console.log("Print success.");
      flashGreen();
    } else {
      alert("Printing failed. Check printer status.");
    }
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Function to flash the background green
function flashGreen() {
  const body = document.body;

  // Remove class if it already exists to restart animation
  body.classList.remove("flash-green");

  // Trigger reflow to reset the animation
  void body.offsetWidth;

  // Add the class to start animation
  body.classList.add("flash-green");

  // Optional: remove class after animation ends
  setTimeout(() => {
    body.classList.remove("flash-green");
  }, 500); // match the duration of your animation
}




window.addEventListener("DOMContentLoaded", () => {
  const savedKensa = localStorage.getItem(`${uniquePrefix}kensa-dropdown`);
  const addKensaBtn = document.querySelector('.addKensa');
  const kensaDropdownContainer = document.querySelector('.kensaDropdown');
  const kensaDropdown = document.getElementById("kensa-dropdown");

  if (savedKensa && savedKensa !== "") {
    addKensaBtn.style.display = 'none';
    kensaDropdownContainer.style.display = 'block';
    if (kensaDropdown) kensaDropdown.value = savedKensa;
  }
});

//function to reset kensa dropdown list
function ResetKensaDropDown() {
  const kensaDropdown = document.getElementById("kensa-dropdown");
  
  if (kensaDropdown) {
    kensaDropdown.value = ""; // Reset to default
    localStorage.removeItem(`${uniquePrefix}kensa-dropdown`); // Remove from localStorage
    console.log("Kensa dropdown reset and localStorage cleared.");
  } else {
    console.warn("Kensa dropdown not found.");
  }

  // Optionally hide the dropdown again and show the "Add Kensa" button
  document.querySelector('.kensaDropdown').style.display = 'none';
  document.querySelector('.addKensa').style.display = 'block';
}

//function to add kensa dropdown
function AddKensa(){
    document.querySelector('.addKensa').style.display = 'none';
    document.querySelector('.kensaDropdown').style.display = 'block';
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
    buttonId: 'atomonoButton',
    labelId: 'atomonoLabel',
    imgId: 'atomonoPic',
    labelText: '終物チェック',
  },
  {
    buttonId: 'makerLabelButton',
    labelId: 'makerLabel',
    imgId: '材料ラベル',
    labelText: '材料ラベル',
  },
];

let currentButtonId = null;

buttonMappings.forEach(({ buttonId }) => {
  const button = document.getElementById(buttonId);
  button.addEventListener('click', () => {
    const subDropdown = document.getElementById('sub-dropdown');
    const selectedValue = subDropdown?.value;

    if (!selectedValue) {
      // Trigger modal message instead of alert
      const scanAlertModal = document.getElementById('scanAlertModal');
      const scanAlertText = document.getElementById('scanAlertText');
      const alertSound = document.getElementById('alert-sound');

      scanAlertText.innerText = '背番号を選択してください / Please select a Sebanggo first.';
      scanAlertModal.style.display = 'block';

      // Flash body and sub-dropdown
      document.body.classList.add('flash-red');
      subDropdown.classList.add('flash-red-border');

      // Play alert sound
      if (alertSound) {
        alertSound.muted = false;
        alertSound.volume = 1;
        alertSound.play().catch(err => console.error("Failed to play sound:", err));
      }

      // Set modal close behavior
      const closeScanModalButton = document.getElementById('closeScanModalButton');
      closeScanModalButton.onclick = function () {
        scanAlertModal.style.display = 'none';
        document.body.classList.remove('flash-red');
        subDropdown.classList.remove('flash-red-border');

        if (alertSound) {
          alertSound.pause();
          alertSound.currentTime = 0;
          alertSound.muted = true;
        }
      };

      return; // stop further action
    }

    // If value is selected, proceed
    currentButtonId = buttonId;
    window.open('captureImage.html', 'Capture Image', 'width=900,height=900');
  });
});



// Handle the message from the popup window
window.addEventListener('message', function (event) {
  if (event.origin === window.location.origin) {
    const data = event.data;

    if (data.image && currentButtonId) {
      // Handle material label photos separately using the multi-photo system
      if (currentButtonId === 'makerLabelButton') {
        console.log('Processing material label photo from popup window');
        
        // Add to material label photos array
        const added = addMaterialLabelPhoto(data.image);
        
        if (added) {
          console.log('Successfully added material label photo');
          
          // Update the legacy single image element for compatibility
          updateMaterialLabelElement();
          
          // Force render thumbnails
          setTimeout(() => {
            renderMaterialPhotoThumbnails();
            console.log('Forced thumbnail render after photo addition');
          }, 100);
        } else {
          console.error('Failed to add material label photo');
        }
        
        // Reset current button ID
        currentButtonId = null;
        return;
      }
      
      // Handle other buttons with single-photo system
      const mapping = buttonMappings.find(({ buttonId }) => buttonId === currentButtonId);

      if (mapping) {
        const { labelId, imgId, buttonId } = mapping;

        // Update photo preview
        const photoPreview = document.getElementById(imgId);
        photoPreview.src = data.image;
        photoPreview.style.display = 'block';

        // Update the associated label to TRUE
        const label = document.getElementById(labelId);
        label.textContent = 'TRUE';
        
        // Toggle button color to green when photo is captured
        const button = document.getElementById(buttonId);
        if (button) {
          button.classList.add('has-photo');
        }

        // Save label textContent to localStorage
        const labelKey = `${uniquePrefix}${labelId}.textContent`;
        localStorage.setItem(labelKey, label.textContent);

        // Save image source to localStorage
        const photoPreviewKey = `${uniquePrefix}${imgId}.src`;
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




// // Upload Photo Function for multiple images
// function uploadPhotou() {
//   const selectedSebanggo = document.getElementById("sub-dropdown").value;
//   const currentDate = document.getElementById("Lot No.").value;
//   const selectedWorker = document.getElementById("Machine Operator").value;
//   const selectedFactory = document.getElementById("selected工場").value;
//   const selectedMachine = document.getElementById("process").value;

//   // Mapping of images to their respective IDs
//   const imageMappings = [
//     { imgId: 'hatsumonoPic', label: '初物チェック' },
//     { imgId: 'atomonoPic', label: '終物チェック' },
//     { imgId: '材料ラベル', label: '材料ラベル' },
//   ];

//   imageMappings.forEach(({ imgId, label }) => {
//     const photoPreview = document.getElementById(imgId);

//     if (!photoPreview || !photoPreview.src) {
//       console.error(`No photo preview available for ${label}`);
//       return;
//     }

//     // Convert the image to a blob
//     fetch(photoPreview.src)
//       .then(response => response.blob())
//       .then(blob => {
//         const reader = new FileReader();
//         reader.onloadend = function () {
//           const base64data = reader.result.split(',')[1]; // Get the base64 encoded string

//           const formData = new FormData();
//           formData.append('imageBlob', base64data);
//           formData.append(
//             'fileName',
//             `${selectedSebanggo}_${currentDate}_${selectedWorker}_${selectedFactory}_${selectedMachine}_${label}.jpg`
//           );
//           formData.append('mimeType', blob.type);
//           formData.append('selectedFactory', selectedFactory);

//           // Send the blob to Apps Script via POST request
//           fetch(
//             'https://script.google.com/macros/s/AKfycbxDWa2RTdI2_aHBgzq9GA9GtQx5MrwqaRnW4F26VZdoptwJ1Pg_Enr_xI3vw1t7WHYbTw/exec',
//             {
//               method: 'POST',
//               body: formData,
//             }
//           )
//             .then((response) => response.text()) // Fetch raw text response
//             .then((text) => {
//               console.log(`Raw response for ${label}:`, text); // Log the raw response
//               try {
//                 const data = JSON.parse(text); // Attempt to parse JSON
//                 if (data.status === 'success') {
//                   console.log(`File uploaded successfully for ${label}: ` + data.fileUrl);
//                 } else {
//                   console.error(`Upload failed for ${label}: ` + data.message);
//                 }
//               } catch (error) {
//                 console.error(`Error parsing JSON for ${label}:`, error);
//               }
//             })
//             .catch((error) => {
//               console.error(`Error uploading file for ${label}: `, error);
//             });
//         };
//         reader.readAsDataURL(blob);
//       })
//       .catch((error) => console.error(`Error converting image to blob for ${label}: `, error));
//   });
// }

     
async function uploadPhotou() {
  const selectedSebanggo = document.getElementById("sub-dropdown").value;
  const currentDate = document.getElementById("Lot No.").value;
  const selectedWorker = document.getElementById("Machine Operator").value;
  const selectedFactory = document.getElementById("selected工場").value;
  const selectedMachine = document.getElementById("process").value;

  const imageMappings = [
    { imgId: 'hatsumonoPic', label: '初物チェック' },
    { imgId: 'atomonoPic', label: '終物チェック' },
    { imgId: '材料ラベル', label: '材料ラベル' },
  ];

  const uploadedImageURLs = {};

  for (const { imgId, label } of imageMappings) {
    const photoPreview = document.getElementById(imgId);
    if (!photoPreview || !photoPreview.src) continue;

    const response = await fetch(photoPreview.src);
    const blob = await response.blob();
    const fileName = `${selectedSebanggo}_${currentDate}_${selectedWorker}_${selectedFactory}_${selectedMachine}_${label}.jpg`;

    const { ref, uploadBytes, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/11.7.1/firebase-storage.js");
    const storageRef = ref(window.firebaseStorage, `firstCycleCheck/${selectedFactory}/${fileName}`);

    try {
      const snapshot = await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(snapshot.ref);

      uploadedImageURLs[label] = downloadURL;

      // Optionally save to a separate imageUploads collection
      await fetch(`${serverURL}/saveImageURL`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: downloadURL,
          label,
          factory: selectedFactory,
          machine: selectedMachine,
          worker: selectedWorker,
          date: currentDate,
          sebanggo: selectedSebanggo
        })
      });
    } catch (error) {
      console.error(`Failed to upload ${label}`, error);
    }
  }

  return uploadedImageURLs;
}


async function collectImagesForUpload() {
  const selectedSebanggo = document.getElementById("sub-dropdown").value;
  const currentDate = document.getElementById("Lot No.").value;
  const selectedWorker = document.getElementById("Machine Operator").value;
  const selectedFactory = document.getElementById("selected工場").value;
  const selectedMachine = document.getElementById("process").value;

  const imageMappings = [
    { imgId: 'hatsumonoPic', label: '初物チェック' },
    { imgId: 'atomonoPic', label: '終物チェック' },
    { imgId: '材料ラベル', label: '材料ラベル' },
  ];

  const imagesToUpload = [];

  for (const { imgId, label } of imageMappings) {
    const photoPreview = document.getElementById(imgId);
    if (!photoPreview || !photoPreview.src) continue;

    const response = await fetch(photoPreview.src);
    const blob = await response.blob();
    const base64Data = await blobToBase64(blob);

    imagesToUpload.push({
      base64: base64Data,
      label,
      factory: selectedFactory,
      machine: selectedMachine,
      worker: selectedWorker,
      date: currentDate,
      sebanggo: selectedSebanggo,
    });
  }

  return imagesToUpload;
}

// Utility to convert blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}


//for dynamic process link from nav
document.addEventListener("DOMContentLoaded", function () {
  const selectedFactory = document.getElementById("selected工場")?.value;
  const processLink = document.getElementById("process-link");

  if (selectedFactory && processLink) {
    processLink.href = `machine.html?selected=${encodeURIComponent(selectedFactory)}`;
  }
});

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isAndroid() {
  return /Android/.test(navigator.userAgent);
}


// ===== NUMERIC KEYPAD FUNCTIONALITY =====

// Define direct keypad functions in the global scope
window.openDirectNumericKeypad = function(inputId) {
  window.currentDirectInputId = inputId;
  const modal = document.getElementById('numericKeypadModalDirect');
  const display = document.getElementById('numericDisplayDirect');
  const currentInput = document.getElementById(inputId);
  
  if (modal && display && currentInput) {
    display.value = currentInput.value || '';
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    // Update keypad title based on which input field was clicked
    const keypadTitle = modal.querySelector('h2');
    if (keypadTitle) {
      if (inputId === 'shot') {
        keypadTitle.textContent = 'ショット数を入力';
      } else if (inputId === '材料ロット') {
        keypadTitle.textContent = '材料ロットを入力';
      } else if (inputId === 'ProcessQuantity') {
        keypadTitle.textContent = '加工数を入力';
      }
    }
    
    // Show/hide the hyphen button based on input field
    const hyphenButton = document.getElementById('hyphenButton');
    if (hyphenButton) {
      if (inputId === '材料ロット') {
        hyphenButton.style.display = 'block';
      } else {
        hyphenButton.style.display = 'none';
      }
    }
    
    // Setup keyboard event handling for the keypad
    window.directKeypadKeydownHandler = function(event) {
      if (modal.style.display === 'block') {
        event.preventDefault(); // Prevent default keyboard behavior
        
        if (event.key >= '0' && event.key <= '9') {
          window.addToDirectNumericDisplay(event.key);
        } else if (event.key === 'Backspace') {
          window.backspaceDirectNumericDisplay();
        } else if (event.key === 'Enter') {
          window.confirmDirectNumericInput();
        } else if (event.key === 'Escape') {
          window.closeDirectNumericKeypad();
        } else if (event.key === 'Delete' || event.key.toLowerCase() === 'c') {
          window.clearDirectNumericDisplay();
        } else if (event.key === '-' && inputId === '材料ロット') {
          window.addToDirectNumericDisplay('-');
        } else if (event.key === ' ') {
          window.addToDirectNumericDisplay(' ');
        }
      }
    };
    
    // Add the keyboard event listener
    document.addEventListener('keydown', window.directKeypadKeydownHandler);
  }
};

window.closeDirectNumericKeypad = function() {
  const modal = document.getElementById('numericKeypadModalDirect');
  if (modal) {
    modal.style.display = 'none';
    window.currentDirectInputId = null;
    document.body.style.overflow = 'auto';
    
    // Remove the keyboard event handler
    if (window.directKeypadKeydownHandler) {
      document.removeEventListener('keydown', window.directKeypadKeydownHandler);
      window.directKeypadKeydownHandler = null;
    }
  }
};

window.addToDirectNumericDisplay = function(digit) {
  const display = document.getElementById('numericDisplayDirect');
  if (display) {
    display.value += digit;
  }
};

window.clearDirectNumericDisplay = function() {
  const display = document.getElementById('numericDisplayDirect');
  if (display) {
    display.value = '';
  }
};

window.backspaceDirectNumericDisplay = function() {
  const display = document.getElementById('numericDisplayDirect');
  if (display) {
    display.value = display.value.slice(0, -1);
  }
};

window.confirmDirectNumericInput = function() {
  if (!window.currentDirectInputId) return;
  
  const display = document.getElementById('numericDisplayDirect');
  const targetInput = document.getElementById(window.currentDirectInputId);
  
  if (display && targetInput) {
    const value = display.value;
    
    // Different validation based on input type
    if (window.currentDirectInputId === '材料ロット') {
      // For material lot, allow numbers, hyphens, spaces, and blank values
      if (value !== '' && !/^[0-9\-\s]*$/.test(value)) {
        if (typeof showAlert === 'function') {
          showAlert('数字、ハイフン、スペースのみを入力してください');
        } else {
          window.alert('数字、ハイフン、スペースのみを入力してください');
        }
        return;
      }
      // Allow blank value - no validation needed
    } else if (window.currentDirectInputId === 'shot' || window.currentDirectInputId === 'ProcessQuantity') {
      // For shot count and process quantity, allow numbers, spaces, and blank values
      // If not blank, validate as a number (after removing spaces)
      if (value !== '') {
        const numericValue = value.replace(/\s/g, '');
        if (numericValue !== '' && (isNaN(numericValue) || parseInt(numericValue) < 0)) {
          if (typeof showAlert === 'function') {
            showAlert('有効な数字を入力してください');
          } else {
            window.alert('有効な数字を入力してください');
          }
          return;
        }
      }
      // Allow blank value - no validation needed
    } else {
      // For other inputs, allow blank values and positive numbers
      if (value !== '' && (isNaN(value) || parseInt(value) < 0)) {
        if (typeof showAlert === 'function') {
          showAlert('有効な数字を入力してください');
        } else {
          window.alert('有効な数字を入力してください');
        }
        return;
      }
    }
    
    // Set the value to the target input
    targetInput.value = value;
    
    // Get the current uniquePrefix for localStorage
    const pageName = location.pathname.split('/').pop();
    const selected工場 = document.getElementById('selected工場')?.value;
    const uniquePrefix = `${pageName}_${selected工場}_`;
    
    // Save to localStorage with the unique key format
    const key = `${uniquePrefix}${targetInput.id}`;
    localStorage.setItem(key, value);
    
    // Trigger the input event to handle any event listeners
    const event = new Event('input', { bubbles: true });
    targetInput.dispatchEvent(event);
    
    window.closeDirectNumericKeypad();
  }
};

// Run initialization after page is fully loaded
window.addEventListener('load', function() {
  // Create the keypad modal HTML
  const modalHTML = `
    <div id="numericKeypadModalDirect" style="
      display: none;
      position: fixed;
      z-index: 10000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.7);
    ">
      <div style="
        background-color: #fefefe;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 20px;
        border: 1px solid #888;
        width: 320px;
        max-width: 90%;
        border-radius: 10px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: bold; color: #333;">ショット数を入力</h2>
          <span onclick="window.closeDirectNumericKeypad()" style="color: #aaa; float: right; font-size: 28px; font-weight: bold; cursor: pointer;">&times;</span>
        </div>
        
        <div style="margin-bottom: 15px;">
          <input type="text" id="numericDisplayDirect" readonly style="
            width: 100%;
            padding: 12px;
            font-size: 28px;
            text-align: right;
            border: 2px solid #007bff;
            border-radius: 5px;
            margin-bottom: 15px;
            background-color: #f8f9fa;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
          ">
        </div>
        
        <div id="keypadContainerDirect" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
          <!-- Number buttons will be added via JavaScript -->
        </div>
        
        <button onclick="window.confirmDirectNumericInput()" style="
          width: 100%;
          padding: 15px;
          margin-top: 15px;
          font-size: 20px;
          font-weight: bold;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          transition: background-color 0.2s;
        ">確認</button>
      </div>
    </div>
  `;
  
  // Inject the HTML directly into the body
  const modalContainer = document.createElement('div');
  modalContainer.innerHTML = modalHTML;
  document.body.appendChild(modalContainer.firstElementChild);
  
  // Add number buttons dynamically
  const keypadContainer = document.getElementById('keypadContainerDirect');
  if (keypadContainer) {
    // Add number buttons 1-9
    for (let i = 1; i <= 9; i++) {
      const btn = document.createElement('button');
      btn.textContent = i.toString();
      const digit = i.toString(); // Capture the current value in a closure
      btn.onclick = function() { window.addToDirectNumericDisplay(digit); };
      btn.style.cssText = `
        padding: 15px;
        font-size: 24px;
        background-color: #f1f1f1;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        transition: background-color 0.2s;
      `;
      // Add touch feedback
      btn.addEventListener('touchstart', function() {
        this.style.backgroundColor = '#d0d0d0';
      });
      btn.addEventListener('touchend', function() {
        this.style.backgroundColor = '#f1f1f1';
      });
      keypadContainer.appendChild(btn);
    }
    
    // Add C, 0, and backspace buttons
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'C';
    clearBtn.onclick = function() { window.clearDirectNumericDisplay(); };
    clearBtn.style.cssText = `
      padding: 15px;
      font-size: 24px;
      background-color: #ffcccc;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
    `;
    // Add touch feedback
    clearBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#ff9999';
    });
    clearBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#ffcccc';
    });
    
    const zeroBtn = document.createElement('button');
    zeroBtn.textContent = '0';
    zeroBtn.onclick = function() { window.addToDirectNumericDisplay('0'); };
    zeroBtn.style.cssText = `
      padding: 15px;
      font-size: 24px;
      background-color: #f1f1f1;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
    `;
    // Add touch feedback
    zeroBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#d0d0d0';
    });
    zeroBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#f1f1f1';
    });
    
    const backBtn = document.createElement('button');
    backBtn.innerHTML = '&#9003;';
    backBtn.onclick = function() { window.backspaceDirectNumericDisplay(); };
    backBtn.style.cssText = `
      padding: 15px;
      font-size: 24px;
      background-color: #f1f1f1;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
    `;
    // Add touch feedback
    backBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#d0d0d0';
    });
    backBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#f1f1f1';
    });
    
    // Create hyphen button for material lot input
    const hyphenBtn = document.createElement('button');
    hyphenBtn.textContent = '-';
    hyphenBtn.id = 'hyphenButton';
    hyphenBtn.onclick = function() { window.addToDirectNumericDisplay('-'); };
    hyphenBtn.style.cssText = `
      padding: 15px;
      font-size: 24px;
      background-color: #e0e0ff;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
      display: none;
    `;
    // Add touch feedback
    hyphenBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#c0c0ff';
    });
    hyphenBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#e0e0ff';
    });
    
    // Create space button
    const spaceBtn = document.createElement('button');
    spaceBtn.textContent = 'Space';
    spaceBtn.id = 'spaceButton';
    spaceBtn.onclick = function() { window.addToDirectNumericDisplay(' '); };
    spaceBtn.style.cssText = `
      padding: 15px;
      font-size: 20px;
      background-color: #e0ffec;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
    `;
    // Add touch feedback
    spaceBtn.addEventListener('touchstart', function() {
      this.style.backgroundColor = '#c0ffd8';
    });
    spaceBtn.addEventListener('touchend', function() {
      this.style.backgroundColor = '#e0ffec';
    });
    
    // Append all buttons
    keypadContainer.appendChild(clearBtn);
    keypadContainer.appendChild(zeroBtn);
    keypadContainer.appendChild(backBtn);
    keypadContainer.appendChild(hyphenBtn); // Add hyphen button to the keypad
    keypadContainer.appendChild(spaceBtn); // Add space button to the keypad
  }
  
  // Configure the shot input with the direct keypad
  const shotInput = document.getElementById('shot');
  if (shotInput) {
    shotInput.readOnly = true;
    
    // Use a more robust event attachment
    if (shotInput.addEventListener) {
      shotInput.addEventListener('click', function() {
        window.openDirectNumericKeypad('shot');
      });
    } else {
      // Fallback for older browsers
      shotInput.onclick = function() {
        window.openDirectNumericKeypad('shot');
      };
    }
    
    // Style the input
    shotInput.style.cssText = `
      cursor: pointer;
      background-color: #f0f8ff;
      border: 2px solid #007bff;
      border-radius: 5px;
      padding: 8px 10px;
      font-size: 16px;
      width: 100%;
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="%23007bff"><path d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 4h4v4H5V6zm0 6h4v4H5v-4zm6-6h4v4h-4V6zm6 0h2v4h-2V6zm-6 6h4v4h-4v-4zm6 0h2v4h-2v-4z"/></svg>');
      background-repeat: no-repeat;
      background-position: right 8px center;
      background-size: 16px 16px;
      padding-right: 30px;
    `;
    
    console.log('Shot input configured with direct keypad');
  }
  
  // Configure material lot input to use the same keypad
  const materialLotInput = document.getElementById('材料ロット');
  if (materialLotInput) {
    materialLotInput.readOnly = true;
    
    // Use a more robust event attachment
    if (materialLotInput.addEventListener) {
      materialLotInput.addEventListener('click', function() {
        window.openDirectNumericKeypad('材料ロット');
      });
    } else {
      // Fallback for older browsers
      materialLotInput.onclick = function() {
        window.openDirectNumericKeypad('材料ロット');
      };
    }
    
    // Style the input
    materialLotInput.style.cssText = `
      cursor: pointer;
      background-color: #f0f8ff;
      border: 2px solid #007bff;
      border-radius: 5px;
      padding: 8px 10px;
      font-size: 16px;
      width: 100%;
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="%23007bff"><path d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 4h4v4H5V6zm0 6h4v4H5v-4zm6-6h4v4h-4V6zm6 0h2v4h-2V6zm-6 6h4v4h-4v-4zm6 0h2v4h-2v-4z"/></svg>');
      background-repeat: no-repeat;
      background-position: right 8px center;
      background-size: 16px 16px;
      padding-right: 30px;
    `;
    
    console.log('Material lot input configured with direct keypad');
  }
  
  // Configure Process Quantity input with the direct keypad
  const processQuantityInput = document.getElementById('ProcessQuantity');
  if (processQuantityInput) {
    processQuantityInput.readOnly = true;
    
    // Use a more robust event attachment
    if (processQuantityInput.addEventListener) {
      processQuantityInput.addEventListener('click', function() {
        window.openDirectNumericKeypad('ProcessQuantity');
      });
    } else {
      // Fallback for older browsers
      processQuantityInput.onclick = function() {
        window.openDirectNumericKeypad('ProcessQuantity');
      };
    }
    
    // Style the input
    processQuantityInput.style.cssText = `
      cursor: pointer;
      background-color: #f0f8ff;
      border: 2px solid #007bff;
      border-radius: 5px;
      padding: 8px 10px;
      font-size: 16px;
      width: 100%;
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="%23007bff"><path d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 4h4v4H5V6zm0 6h4v4H5v-4zm6-6h4v4h-4V6zm6 0h2v4h-2V6zm-6 6h4v4h-4v-4zm6 0h2v4h-2v-4z"/></svg>');
      background-repeat: no-repeat;
      background-position: right 8px center;
      background-size: 16px 16px;
      padding-right: 30px;
    `;
    
    console.log('Process Quantity input configured with direct keypad');
  }
});

// ===== END OF NUMERIC KEYPAD FUNCTIONALITY =====


// ===== BREAK TIME, MAINTENANCE, AND MATERIAL LABEL MULTI-PHOTO FUNCTIONALITY =====

// Break Time Functions
function calculateTotalBreakTime() {
  let totalMinutes = 0;

  for (let i = 1; i <= 4; i++) {
    const startInput = document.getElementById(`break${i}-start`);
    const endInput = document.getElementById(`break${i}-end`);

    if (startInput && endInput) {
      const startTime = startInput.value;
      const endTime = endInput.value;

      if (startTime && endTime) {
        const start = new Date(`2000-01-01T${startTime}:00`);
        const end = new Date(`2000-01-01T${endTime}:00`);

        if (end > start) {
          const diffMs = end - start;
          const diffMinutes = Math.floor(diffMs / (1000 * 60));
          totalMinutes += diffMinutes;
        }
      }
    }
  }

  // Update the display
  const totalDisplay = document.getElementById('total-break-display');
  const breaktimeMins = document.getElementById('breaktime-mins');

  if (totalDisplay) {
    totalDisplay.textContent = `${totalMinutes}分`;
  }
  if (breaktimeMins) {
    breaktimeMins.value = totalMinutes;
  }

  // Save to localStorage with proper prefix
  const pageName = location.pathname.split('/').pop();
  const selected工場 = document.getElementById('selected工場')?.value;

  if (pageName && selected工場) {
    const prefix = `${pageName}_${selected工場}_`;
    localStorage.setItem(`${prefix}breaktime-mins`, totalMinutes);
    localStorage.setItem(`${prefix}total-break-display`, `${totalMinutes}分`);
  }
  return totalMinutes; // Return total minutes for calculation in submit
}

// Reset a specific break time
function resetBreakTime(breakNumber) {
  const startInput = document.getElementById(`break${breakNumber}-start`);
  const endInput = document.getElementById(`break${breakNumber}-end`);
  
  if (startInput) startInput.value = '';
  if (endInput) endInput.value = '';
  
  calculateTotalBreakTime();
  
  // Save to localStorage
  const pageName = location.pathname.split('/').pop();
  const selected工場 = document.getElementById('selected工場')?.value;
  
  if (pageName && selected工場) {
    const prefix = `${pageName}_${selected工場}_`;
    localStorage.setItem(`${prefix}break${breakNumber}-start`, '');
    localStorage.setItem(`${prefix}break${breakNumber}-end`, '');
  }
}

// Dynamic Maintenance Time System
let maintenanceRecords = [];
let currentEditingIndex = -1;
let maintenancePhotos = []; // Array to store multiple photos for current maintenance
const MAX_MAINTENANCE_PHOTOS = 5; // Maximum photos per maintenance record

// Material Label Photo System
let materialLabelPhotos = []; // Array to store multiple material label photos
const MAX_MATERIAL_PHOTOS = 5; // Maximum number of photos allowed

// Load maintenance records from localStorage
function loadMaintenanceRecords() {
  const prefix = `${location.pathname.split('/').pop()}_${document.getElementById('selected工場')?.value}_`;
  const saved = localStorage.getItem(`${prefix}maintenanceRecords`);
  if (saved) {
    maintenanceRecords = JSON.parse(saved);
    renderMaintenanceRecords();
    calculateTotalMachineTroubleTime();
  }
}

// Save maintenance records to localStorage
function saveMaintenanceRecords() {
  const prefix = `${location.pathname.split('/').pop()}_${document.getElementById('selected工場')?.value}_`;
  localStorage.setItem(`${prefix}maintenanceRecords`, JSON.stringify(maintenanceRecords));
}

// Clear maintenance photos
function clearMaintenancePhotos() {
  maintenancePhotos = [];
  renderMaintenancePhotoThumbnails();
}

// Add photo to maintenance photos
function addMaintenancePhoto(base64Data) {
  if (maintenancePhotos.length >= MAX_MAINTENANCE_PHOTOS) {
    showAlert(`最大${MAX_MAINTENANCE_PHOTOS}枚まで撮影できます / Maximum ${MAX_MAINTENANCE_PHOTOS} photos allowed`);
    return false;
  }
  
  if (!base64Data || base64Data.length === 0) {
    console.error('❌ addMaintenancePhoto ERROR: Empty base64 data');
    showAlert('無効な画像データです。再試行してください。');
    return false;
  }
  
  console.log(`🔍 addMaintenancePhoto: Received ${base64Data.length} bytes of base64 data`);
  
  const photoData = {
    base64: base64Data,
    timestamp: Date.now(),
    id: `maintenance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    uploaded: false
  };
  
  maintenancePhotos.push(photoData);
  console.log(`📷 Photo added: ID=${photoData.id}, base64Length=${base64Data.length}`);
  
  renderMaintenancePhotoThumbnails();
  return true;
}

// Remove photo from maintenance photos
function removeMaintenancePhoto(index) {
  if (index >= 0 && index < maintenancePhotos.length) {
    maintenancePhotos.splice(index, 1);
    renderMaintenancePhotoThumbnails();
  }
}

// Render maintenance photo thumbnails in modal
function renderMaintenancePhotoThumbnails() {
  const container = document.getElementById('maintenance-photo-thumbnails');
  const countDisplay = document.getElementById('maintenance-photo-count');
  
  if (!container) return;
  
  container.innerHTML = '';
  
  if (countDisplay) {
    countDisplay.textContent = `${maintenancePhotos.length}/${MAX_MAINTENANCE_PHOTOS}`;
  }
  
  if (maintenancePhotos.length === 0) {
    container.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">写真がありません / No photos</p>';
    return;
  }
  
  maintenancePhotos.forEach((photo, index) => {
    const thumbItem = document.createElement('div');
    thumbItem.style.cssText = `
      position: relative;
      display: inline-block;
      margin: 5px;
      border: 2px solid #ddd;
      border-radius: 5px;
      overflow: hidden;
      background: #f9f9f9;
    `;
    
    const img = document.createElement('img');
    // Use firebaseUrl if uploaded, otherwise use base64 data
    let imageSrc;
    if (photo.firebaseUrl && photo.uploaded) {
      imageSrc = photo.firebaseUrl;
    } else if (photo.base64) {
      // Use clean base64 data with proper data URL prefix for display
      imageSrc = `data:image/jpeg;base64,${photo.base64}`;
    } else {
      console.warn('Photo has no displayable source:', photo);
      imageSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjQwIiB5PSI0NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5Ij5JbWFnZTwvdGV4dD4KPC9zdmc+';
    }
    
    img.src = imageSrc;
    img.style.cssText = `
      width: 80px;
      height: 80px;
      object-fit: cover;
      cursor: pointer;
      display: block;
    `;
    
    // Add click event to show preview
    img.onclick = () => showMaintenancePhotoPreview(imageSrc);
    
    // Add error handling for failed image loads
    img.onerror = () => {
      console.error('Failed to load maintenance photo:', imageSrc);
      img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjQwIiB5PSI0NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5Ij5GYWlsZWQ8L3RleHQ+CjwvdGV4dD4KPC9zdmc+';
    };
    
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '×';
    deleteBtn.style.cssText = `
      position: absolute;
      top: 2px;
      right: 2px;
      background: #ff4444;
      color: white;
      border: none;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      font-size: 12px;
      cursor: pointer;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      removeMaintenancePhoto(index);
    };
    
    thumbItem.appendChild(img);
    thumbItem.appendChild(deleteBtn);
    container.appendChild(thumbItem);
  });
}

// Show full size photo preview
function showMaintenancePhotoPreview(imageDataURL) {
  // Create a modal for full preview
  const previewModal = document.createElement('div');
  previewModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10001;
  `;
  
  const img = document.createElement('img');
  img.src = imageDataURL;
  img.style.cssText = `
    max-width: 90%;
    max-height: 90%;
    object-fit: contain;
  `;
  
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.style.cssText = `
    position: absolute;
    top: 20px;
    right: 20px;
    background: #ff4444;
    color: white;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    font-size: 20px;
    cursor: pointer;
  `;
  
  closeBtn.onclick = () => document.body.removeChild(previewModal);
  previewModal.onclick = (e) => {
    if (e.target === previewModal) document.body.removeChild(previewModal);
  };
  
  previewModal.appendChild(img);
  previewModal.appendChild(closeBtn);
  document.body.appendChild(previewModal);
}

// Show maintenance modal
function showMaintenanceModal(editIndex = -1) {
  currentEditingIndex = editIndex;
  const isEditing = editIndex >= 0;
  
  // Clear or load existing photos
  if (isEditing && maintenanceRecords[editIndex] && maintenanceRecords[editIndex].photos) {
    maintenancePhotos = [...maintenanceRecords[editIndex].photos];
  } else {
    maintenancePhotos = [];
  }
  
  // Create modal
  const modal = document.createElement('div');
  modal.id = 'maintenanceModal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    padding: 30px;
    border-radius: 10px;
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
  `;

  let existingRecord = {};
  if (isEditing && maintenanceRecords[editIndex]) {
    existingRecord = maintenanceRecords[editIndex];
  }

  modalContent.innerHTML = `
    <h2 style="margin-top: 0; text-align: center;">
      ${isEditing ? '機械故障時間編集' : '機械故障時間追加'} / ${isEditing ? 'Edit Maintenance' : 'Add Maintenance'}
    </h2>
    
    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">開始時間 / Start Time:</label>
      <input type="time" id="maintenance-start" value="${existingRecord.startTime || ''}" 
             style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 5px;">
    </div>
    
    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">終了時間 / End Time:</label>
      <input type="time" id="maintenance-end" value="${existingRecord.endTime || ''}"
             style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 5px;">
    </div>
    
    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">理由・説明 / Reason/Comment:</label>
      <textarea id="maintenance-comment" rows="4" placeholder="機械故障の理由を入力してください..."
                style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 5px; resize: vertical;">${existingRecord.comment || ''}</textarea>
    </div>
    
    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 10px; font-weight: bold;">
        写真 / Photos (<span id="maintenance-photo-count">0/${MAX_MAINTENANCE_PHOTOS}</span>):
      </label>
      <div style="margin-bottom: 10px;">
        <button type="button" id="take-maintenance-photo" 
                style="padding: 8px 16px; background: #007cba; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px; font-size: 14px;">
          📷 写真を撮る / Take Photo
        </button>
        <button type="button" id="clear-maintenance-photos" 
                style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
          🗑️ 全削除 / Clear All
        </button>
      </div>
      <div id="maintenance-photo-thumbnails" style="border: 1px solid #ddd; border-radius: 5px; padding: 10px; min-height: 60px; background: #f9f9f9;">
        <!-- Photo thumbnails will be rendered here -->
      </div>
    </div>
    
    <div style="display: flex; gap: 10px; justify-content: flex-end;">
      <button type="button" id="cancel-maintenance" 
              style="padding: 10px 20px; background: #ccc; color: black; border: none; border-radius: 5px; cursor: pointer;">
        キャンセル / Cancel
      </button>
      ${isEditing ? `
        <button type="button" id="delete-maintenance" 
                style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
          削除 / Delete
        </button>
      ` : ''}
      <button type="button" id="save-maintenance" 
              style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer;">
        保存 / Save
      </button>
    </div>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  renderMaintenancePhotoThumbnails();

  // Make time inputs touch-friendly - set current time on click/touch if empty
  const startTimeInput = modal.querySelector('#maintenance-start');
  const endTimeInput = modal.querySelector('#maintenance-end');
  
  // Add touch/click handlers to set current time if empty
  [startTimeInput, endTimeInput].forEach(input => {
    input.addEventListener('focus', function() {
      // Set current time if the input is empty
      if (!this.value) {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        this.value = `${hours}:${minutes}`;
      }
      // Try to show the picker (works on some browsers)
      setTimeout(() => {
        this.showPicker && this.showPicker();
      }, 100);
    });
    
    input.addEventListener('click', function() {
      // Set current time if the input is empty
      if (!this.value) {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        this.value = `${hours}:${minutes}`;
      }
    });
  });

  // Add event listeners
  const takePhotoBtn = modal.querySelector('#take-maintenance-photo');
  const clearPhotosBtn = modal.querySelector('#clear-maintenance-photos');
  const saveBtn = modal.querySelector('#save-maintenance');
  const cancelBtn = modal.querySelector('#cancel-maintenance');
  const deleteBtn = modal.querySelector('#delete-maintenance');

  takePhotoBtn.addEventListener('click', async () => {
    if (maintenancePhotos.length >= MAX_MAINTENANCE_PHOTOS) {
      showAlert(`最大${MAX_MAINTENANCE_PHOTOS}枚まで撮影できます / Maximum ${MAX_MAINTENANCE_PHOTOS} photos allowed`);
      return;
    }
    
    await openMaintenanceCamera();
  });

  clearPhotosBtn.addEventListener('click', () => {
    if (maintenancePhotos.length > 0) {
      if (confirm('すべての写真を削除しますか？ / Delete all photos?')) {
        clearMaintenancePhotos();
      }
    }
  });

  saveBtn.addEventListener('click', () => {
    const startTime = modal.querySelector('#maintenance-start').value;
    const endTime = modal.querySelector('#maintenance-end').value;
    const comment = modal.querySelector('#maintenance-comment').value;

    if (!startTime || !endTime) {
      showAlert('開始時間と終了時間を入力してください / Please enter start and end times');
      return;
    }

    if (!comment.trim()) {
      showAlert('理由・説明を入力してください / Please enter a reason/comment');
      return;
    }

    const record = {
      id: currentEditingIndex >= 0 ? maintenanceRecords[currentEditingIndex].id : Date.now(),
      startTime,
      endTime,
      comment: comment.trim(),
      photos: [...maintenancePhotos],
      timestamp: currentEditingIndex >= 0 ? maintenanceRecords[currentEditingIndex].timestamp : new Date().toISOString()
    };

    if (currentEditingIndex >= 0) {
      maintenanceRecords[currentEditingIndex] = record;
    } else {
      maintenanceRecords.push(record);
    }

    saveMaintenanceRecords();
    renderMaintenanceRecords();
    calculateTotalMachineTroubleTime();
    
    maintenancePhotos = [];
    document.body.removeChild(modal);
  });

  cancelBtn.addEventListener('click', () => {
    maintenancePhotos = [];
    document.body.removeChild(modal);
  });

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (confirm('この機械故障記録を削除しますか？ / Delete this maintenance record?')) {
        maintenanceRecords.splice(currentEditingIndex, 1);
        saveMaintenanceRecords();
        renderMaintenanceRecords();
        calculateTotalMachineTroubleTime();
        
        maintenancePhotos = [];
        document.body.removeChild(modal);
      }
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      maintenancePhotos = [];
      document.body.removeChild(modal);
    }
  });
}

// Render maintenance records list
function renderMaintenanceRecords() {
  const container = document.getElementById('maintenance-records-container');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (maintenanceRecords.length === 0) {
    container.innerHTML = '<p style="color: #999; text-align: center; padding: 10px;">記録なし / No records</p>';
    return;
  }
  
  maintenanceRecords.forEach((record, index) => {
    const recordElement = document.createElement('div');
    recordElement.style.cssText = `
      background: #f8f9fa;
      padding: 10px;
      margin-bottom: 10px;
      border-radius: 5px;
      cursor: pointer;
      border: 1px solid #dee2e6;
    `;
    recordElement.onclick = () => showMaintenanceModal(index);
    
    const duration = calculateDuration(record.startTime, record.endTime);
    
    recordElement.innerHTML = `
      <div style="font-weight: bold;">${record.startTime} - ${record.endTime} (${duration}分)</div>
      <div style="color: #666; font-size: 14px; margin-top: 5px;">${record.comment}</div>
      <div style="color: #999; font-size: 12px; margin-top: 5px;">写真: ${record.photos ? record.photos.length : 0}枚</div>
    `;
    
    container.appendChild(recordElement);
  });
}

// Calculate duration in minutes
function calculateDuration(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  
  const start = new Date(`2000-01-01T${startTime}:00`);
  const end = new Date(`2000-01-01T${endTime}:00`);
  
  if (end > start) {
    const diffMs = end - start;
    return Math.floor(diffMs / (1000 * 60));
  }
  
  return 0;
}

// Calculate total machine trouble time
function calculateTotalMachineTroubleTime() {
  let totalMinutes = 0;
  
  maintenanceRecords.forEach(record => {
    totalMinutes += calculateDuration(record.startTime, record.endTime);
  });
  
  const totalDisplay = document.getElementById('total-trouble-display');
  const maintenanceMins = document.getElementById('maintenance-mins');
  
  if (totalDisplay) {
    totalDisplay.textContent = `${totalMinutes}分 (${(totalMinutes / 60).toFixed(2)}時間)`;
  }
  if (maintenanceMins) {
    maintenanceMins.value = totalMinutes;
  }
  
  return totalMinutes;
}

// === Material Label Photo Functions ===
function clearMaterialLabelPhotos() {
  materialLabelPhotos = [];
  renderMaterialPhotoThumbnails();
  updateMaterialPhotoCount();
}

function addMaterialLabelPhoto(photoDataURL) {
  if (materialLabelPhotos.length >= MAX_MATERIAL_PHOTOS) {
    showAlert(`最大${MAX_MATERIAL_PHOTOS}枚まで撮影できます / Maximum ${MAX_MATERIAL_PHOTOS} photos allowed`);
    return false;
  }
  
  console.log('Adding material label photo:', typeof photoDataURL, photoDataURL ? photoDataURL.substring(0, 50) + '...' : 'undefined');
  
  let base64Data = photoDataURL;
  let displayURL;
  
  if (typeof photoDataURL === 'string') {
    if (photoDataURL.startsWith('data:image')) {
      displayURL = photoDataURL;
      base64Data = photoDataURL.split(',')[1];
      console.log('Extracted base64 data from data URL');
    } else {
      displayURL = `data:image/jpeg;base64,${photoDataURL}`;
      console.log('Created display URL from base64 data');
    }
  } else {
    console.error('Invalid photo data provided to addMaterialLabelPhoto');
    return false;
  }

  const photoData = {
    base64: base64Data,
    timestamp: new Date().toISOString(),
    displayURL: displayURL
  };

  materialLabelPhotos.push(photoData);
  console.log(`Added material label photo #${materialLabelPhotos.length}`);
  
  renderMaterialPhotoThumbnails();
  updateMaterialPhotoCount();
  updateMaterialLabelElement();
  
  const prefix = `${location.pathname.split('/').pop()}_${document.getElementById('selected工場')?.value}_`;
  localStorage.setItem(`${prefix}materialLabelPhotos`, JSON.stringify(materialLabelPhotos));
  console.log('Saved material label photos to localStorage');
  
  return true;
}

function removeMaterialLabelPhoto(index) {
  if (index >= 0 && index < materialLabelPhotos.length) {
    materialLabelPhotos.splice(index, 1);
    const prefix = `${location.pathname.split('/').pop()}_${document.getElementById('selected工場')?.value}_`;
    localStorage.setItem(`${prefix}materialLabelPhotos`, JSON.stringify(materialLabelPhotos));
    renderMaterialPhotoThumbnails();
    updateMaterialPhotoCount();
    updateMaterialLabelElement();
  }
}

function updateMaterialPhotoCount() {
  const photoCount = document.getElementById('material-photo-count');
  if (photoCount) {
    photoCount.textContent = materialLabelPhotos.length;
  }
  
  const makerLabel = document.getElementById('makerLabel');
  const makerLabelButton = document.getElementById('makerLabelButton');
  
  if (makerLabel) {
    makerLabel.textContent = materialLabelPhotos.length > 0 ? 'TRUE' : 'FALSE';
  }
  
  // Toggle button color based on whether photos exist
  if (makerLabelButton) {
    if (materialLabelPhotos.length > 0) {
      makerLabelButton.classList.add('has-photos');
    } else {
      makerLabelButton.classList.remove('has-photos');
    }
  }
}

function updateMaterialLabelElement() {
  updateMaterialPhotoCount();
}

function renderMaterialPhotoThumbnails() {
  console.log('Rendering material photo thumbnails');
  
  let container = document.getElementById('material-photo-thumbnails');
  let photosContainer = document.getElementById('material-label-photos-container');
  
  if (!photosContainer) {
    console.log('Creating material label photos container');
    const mainForm = document.querySelector('form') || document.body;
    
    const photoSection = document.createElement('div');
    photoSection.id = 'material-label-photos-container';
    photoSection.style.cssText = 'margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px; display: none; background-color: #f9f9f9;';
    
    const header = document.createElement('div');
    header.innerHTML = '<strong>材料ラベル Photos (<span id="material-photo-count">0</span>):</strong>';
    
    const thumbnailsDiv = document.createElement('div');
    thumbnailsDiv.id = 'material-photo-thumbnails';
    thumbnailsDiv.style.cssText = 'display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px;';
    
    photoSection.appendChild(header);
    photoSection.appendChild(thumbnailsDiv);
    
    // Insert after the legacy 材料ラベル image element
    const legacyImg = document.getElementById('材料ラベル');
    if (legacyImg && legacyImg.nextSibling) {
      // Insert right after the img element
      legacyImg.parentNode.insertBefore(photoSection, legacyImg.nextSibling);
    } else if (legacyImg) {
      // If no next sibling, append after
      legacyImg.parentNode.appendChild(photoSection);
    } else {
      // Fallback: try to insert after makerLabelButton
      const makerLabelButton = document.getElementById('makerLabelButton');
      if (makerLabelButton && makerLabelButton.nextSibling) {
        makerLabelButton.parentNode.insertBefore(photoSection, makerLabelButton.nextSibling);
      } else {
        mainForm.appendChild(photoSection);
      }
    }
    
    container = document.getElementById('material-photo-thumbnails');
    photosContainer = document.getElementById('material-label-photos-container');
  }
  
  if (!container) {
    console.error('Failed to find or create material-photo-thumbnails container');
    return;
  }
  
  container.innerHTML = '';
  
  const photoCount = document.getElementById('material-photo-count');
  if (photoCount) {
    photoCount.textContent = materialLabelPhotos.length;
  }
  
  if (materialLabelPhotos.length === 0) {
    photosContainer.style.display = 'none';
    console.log('No material label photos to display');
  } else {
    photosContainer.style.display = 'block';
    console.log(`Rendering ${materialLabelPhotos.length} material label photos`);
    
    materialLabelPhotos.forEach((photo, index) => {
      const thumbItem = document.createElement('div');
      thumbItem.style.cssText = 'position: relative; display: inline-block; margin: 5px;';
      
      const img = document.createElement('img');
      
      let imageSrc;
      if (photo.displayURL) {
        imageSrc = photo.displayURL;
      } else if (photo.firebaseURL) {
        imageSrc = photo.firebaseURL;
      } else if (photo.base64) {
        imageSrc = `data:image/jpeg;base64,${photo.base64}`;
      } else {
        imageSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjQwIiB5PSI0NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5Ij5JbWFnZTwvdGV4dD4KPHR0ZXh0IHg9IjQwIiB5PSI1NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEwIiBmaWxsPSIjOTk5Ij5FcnJvcjwvdGV4dD4KPC9zdmc+';
      }
      
      img.src = imageSrc;
      img.style.cssText = `
        width: 80px;
        height: 80px;
        object-fit: cover;
        cursor: pointer;
        display: block;
        border: 2px solid #ddd;
        border-radius: 5px;
      `;
      
      img.onerror = () => {
        console.error('Failed to load material label photo:', imageSrc);
        img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjQwIiB5PSI0NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5Ij5FcnJvcjwvdGV4dD4KPC9zdmc+';
      };
      
      // Add click handler to show full-size preview
      img.onclick = () => {
        showMaterialPhotoPreview(imageSrc);
      };
      
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '×';
      deleteBtn.style.cssText = `
        position: absolute;
        top: -5px;
        right: -5px;
        background: #ff4444;
        color: white;
        border: none;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        font-size: 14px;
        cursor: pointer;
        line-height: 1;
      `;
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('この写真を削除しますか？ / Delete this photo?')) {
          removeMaterialLabelPhoto(index);
        }
      };
      
      thumbItem.appendChild(img);
      thumbItem.appendChild(deleteBtn);
      container.appendChild(thumbItem);
    });
  }
}

// Show full-size preview of material label photo
function showMaterialPhotoPreview(imageSrc) {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10003;
    cursor: pointer;
  `;
  
  // Create image element
  const img = document.createElement('img');
  img.src = imageSrc;
  img.style.cssText = `
    max-width: 90%;
    max-height: 90%;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  `;
  
  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.style.cssText = `
    position: absolute;
    top: 20px;
    right: 20px;
    background: rgba(255, 255, 255, 0.9);
    color: #333;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    font-size: 28px;
    cursor: pointer;
    line-height: 1;
    font-weight: bold;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    transition: background 0.2s;
  `;
  
  closeBtn.onmouseover = () => {
    closeBtn.style.background = 'rgba(255, 255, 255, 1)';
  };
  
  closeBtn.onmouseout = () => {
    closeBtn.style.background = 'rgba(255, 255, 255, 0.9)';
  };
  
  // Close modal function
  const closeModal = () => {
    document.body.removeChild(modal);
  };
  
  // Close on background click
  modal.onclick = closeModal;
  
  // Close on close button click
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    closeModal();
  };
  
  // Prevent closing when clicking on image
  img.onclick = (e) => {
    e.stopPropagation();
  };
  
  // Close on ESC key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
  
  // Add elements to modal
  modal.appendChild(img);
  modal.appendChild(closeBtn);
  document.body.appendChild(modal);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  loadMaintenanceRecords();
  
  // Load material label photos from localStorage
  const prefix = `${location.pathname.split('/').pop()}_${document.getElementById('selected工場')?.value}_`;
  const savedPhotos = localStorage.getItem(`${prefix}materialLabelPhotos`);
  if (savedPhotos) {
    try {
      materialLabelPhotos = JSON.parse(savedPhotos);
      renderMaterialPhotoThumbnails();
      updateMaterialPhotoCount();
    } catch (e) {
      console.error('Failed to load material label photos:', e);
    }
  }
  
  // Setup break time change listeners
  for (let i = 1; i <= 4; i++) {
    const startInput = document.getElementById(`break${i}-start`);
    const endInput = document.getElementById(`break${i}-end`);
    
    if (startInput) {
      startInput.addEventListener('change', calculateTotalBreakTime);
    }
    if (endInput) {
      endInput.addEventListener('change', calculateTotalBreakTime);
    }
  }
  
  // Setup add maintenance button
  const addMaintenanceBtn = document.getElementById('add-maintenance-btn');
  if (addMaintenanceBtn) {
    addMaintenanceBtn.addEventListener('click', () => showMaintenanceModal());
  }
  
  // Calculate initial totals
  calculateTotalBreakTime();
  calculateTotalMachineTroubleTime();
});

// ===== MAINTENANCE CAMERA FUNCTIONALITY =====
let maintenanceCameraStream = null;

// Open camera in modal for maintenance photos
async function openMaintenanceCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showAlert("カメラ機能はこのブラウザではサポートされていません。(Camera features are not supported in this browser.)", true);
    return;
  }

  // Create camera modal
  const cameraModal = document.createElement('div');
  cameraModal.id = 'maintenanceCameraModal';
  cameraModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10002;
  `;

  const cameraContent = document.createElement('div');
  cameraContent.style.cssText = `
    background: white;
    padding: 20px;
    border-radius: 10px;
    text-align: center;
    max-width: 90%;
    max-height: 90%;
  `;

  cameraContent.innerHTML = `
    <h3 style="margin-top: 0;">機械故障写真撮影 / Maintenance Photo Capture</h3>
    <video id="maintenanceVideoFeed" autoplay playsinline style="max-width: 100%; max-height: 400px; border: 2px solid #ddd; border-radius: 5px;"></video>
    <br><br>
    <button id="maintenanceCaptureBtn" style="padding: 15px 30px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px; font-size: 16px;">📷 撮影 / Capture</button>
    <button id="maintenanceCloseCameraBtn" style="padding: 15px 30px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">閉じる / Close</button>
    <canvas id="maintenanceCaptureCanvas" style="display: none;"></canvas>
  `;

  cameraModal.appendChild(cameraContent);
  document.body.appendChild(cameraModal);

  const videoFeed = document.getElementById('maintenanceVideoFeed');
  const captureBtn = document.getElementById('maintenanceCaptureBtn');
  const closeCameraBtn = document.getElementById('maintenanceCloseCameraBtn');
  const captureCanvas = document.getElementById('maintenanceCaptureCanvas');

  // Camera constraints
  const constraints = {
    video: { 
      facingMode: { ideal: "environment" }, 
      width: { ideal: 1280 }, 
      height: { ideal: 720 } 
    },
    audio: false
  };

  try {
    maintenanceCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    console.warn("Environment camera failed, trying user camera:", e);
    constraints.video.facingMode = { ideal: "user" };
    try {
      maintenanceCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.error("Error accessing camera: ", err);
      showAlert("カメラにアクセスできませんでした。設定を確認してください。", true);
      document.body.removeChild(cameraModal);
      return;
    }
  }

  if (maintenanceCameraStream && videoFeed) {
    videoFeed.srcObject = maintenanceCameraStream;
    videoFeed.onloadedmetadata = () => {
      captureCanvas.width = videoFeed.videoWidth;
      captureCanvas.height = videoFeed.videoHeight;
      console.log(`🔍 Canvas initialized: ${captureCanvas.width}x${captureCanvas.height}`);
    };
  }

  // Capture button functionality
  captureBtn.addEventListener('click', () => {
    if (!maintenanceCameraStream || !videoFeed) {
      console.error("Stream or video not ready for snapshot");
      closeMaintenanceCamera(cameraModal);
      return;
    }

    if (maintenancePhotos.length >= MAX_MAINTENANCE_PHOTOS) {
      showAlert(`最大${MAX_MAINTENANCE_PHOTOS}枚までです。(Max ${MAX_MAINTENANCE_PHOTOS} photos allowed.)`, false);
      closeMaintenanceCamera(cameraModal);
      return;
    }

    // Validate video before capture
    if (videoFeed.readyState !== videoFeed.HAVE_ENOUGH_DATA) {
      console.warn("⚠️ Video feed not ready for capture");
      showAlert("カメラの準備ができていません。しばらく待ってから再試行してください。", false);
      return;
    }

    // Create a fresh canvas for each capture
    const freshCanvas = document.createElement('canvas');
    freshCanvas.width = videoFeed.videoWidth;
    freshCanvas.height = videoFeed.videoHeight;
    
    console.log(`🔍 Fresh canvas created: ${freshCanvas.width}x${freshCanvas.height} (video: ${videoFeed.videoWidth}x${videoFeed.videoHeight})`);

    const context = freshCanvas.getContext('2d');
    if (!context) {
      console.error("Failed to get 2D context from fresh canvas.");
      closeMaintenanceCamera(cameraModal);
      return;
    }

    context.drawImage(videoFeed, 0, 0, freshCanvas.width, freshCanvas.height);
    
    const imageDataURL = freshCanvas.toDataURL('image/jpeg', 0.8);
    console.log(`🔍 Canvas capture:`, {
      canvasSize: `${freshCanvas.width}x${freshCanvas.height}`,
      videoSize: `${videoFeed.videoWidth}x${videoFeed.videoHeight}`,
      dataURLLength: imageDataURL.length,
      startsWithDataURL: imageDataURL.startsWith('data:image/jpeg;base64,')
    });
    
    // Validate data URL format
    if (!imageDataURL.startsWith('data:image/jpeg;base64,')) {
      console.error('❌ Invalid data URL format:', imageDataURL.substring(0, 100));
      showAlert('画像キャプチャに失敗しました。再試行してください。', false);
      closeMaintenanceCamera(cameraModal);
      return;
    }
    
    // Extract clean base64 data WITHOUT the data URL prefix
    const base64Data = imageDataURL.split(',')[1];
    console.log(`🔍 Extracted clean base64 length: ${base64Data.length}`);
    
    // Validate base64 data
    if (!base64Data || base64Data.length === 0) {
      console.error('❌ Empty base64 data');
      showAlert('画像データが無効です。再試行してください。', false);
      closeMaintenanceCamera(cameraModal);
      return;
    }

    // Client-side validation
    try {
      const buffer = atob(base64Data);
      console.log(`🔍 Client validation: Successfully decoded ${buffer.length} bytes`);
      
      // Check JPEG headers
      const firstByte = buffer.charCodeAt(0);
      const secondByte = buffer.charCodeAt(1);
      console.log(`🔍 JPEG header check: [${firstByte}, ${secondByte}] (should be [255, 216])`);
      
      if (firstByte !== 255 || secondByte !== 216) {
        console.warn('⚠️ WARNING: Invalid JPEG header detected!');
      } else {
        console.log('✅ Valid JPEG header confirmed');
      }
    } catch (error) {
      console.error('❌ ERROR: Invalid base64 data - ' + error.message);
      showAlert('画像データが無効です。再試行してください。', false);
      closeMaintenanceCamera(cameraModal);
      return;
    }

    // Add photo with clean base64 data
    const success = addMaintenancePhoto(base64Data);
    
    if (success) {
      console.log('✅ Photo successfully added to maintenance photos');
      // Close camera after successful capture
      closeMaintenanceCamera(cameraModal);
    } else {
      showAlert('写真の追加に失敗しました。', false);
    }
  });

  // Close camera button functionality
  closeCameraBtn.addEventListener('click', () => {
    closeMaintenanceCamera(cameraModal);
  });

  // Close on background click
  cameraModal.addEventListener('click', (e) => {
    if (e.target === cameraModal) {
      closeMaintenanceCamera(cameraModal);
    }
  });
}

// Close maintenance camera and cleanup
function closeMaintenanceCamera(cameraModal) {
  if (maintenanceCameraStream) {
    maintenanceCameraStream.getTracks().forEach(track => track.stop());
    maintenanceCameraStream = null;
  }
  
  const videoFeed = document.getElementById('maintenanceVideoFeed');
  if (videoFeed) {
    videoFeed.srcObject = null;
  }
  
  if (cameraModal && cameraModal.parentNode) {
    document.body.removeChild(cameraModal);
  }
}

// ===== END OF BREAK TIME, MAINTENANCE, AND MATERIAL LABEL FUNCTIONALITY =====