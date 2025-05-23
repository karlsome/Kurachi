const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";

// Original CSV Uploader Functions
function handleFile() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    if (!file) {
        alert("ファイルを選択してください。");
        return;
    }
    
    const reader = new FileReader();
    reader.readAsText(file, "Shift_JIS"); // Specify Shift_JIS encoding
    reader.onload = function(event) {
        const csvData = event.target.result;
        processCSV(csvData);
    };
    reader.onerror = function() {
        alert('ファイルの読み込みに失敗しました。文字コードがShift_JISであることを確認してください。');
    };
}

function processCSV(csvData) {
    const lines = csvData.split(/\r\n|\n/); 
    if (lines.length < 1) {
        alert("CSVデータが空です。");
        return;
    }
    const headers = lines[0].split(",").map(header => header.trim().replace(/"/g, ''));
    let data = [];

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === "") continue; 

        const values = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(val => val.trim().replace(/"/g, ''));

        if (values.length !== headers.length) {
            console.warn(`Skipping line ${i+1}: Mismatched number of columns. Expected ${headers.length}, got ${values.length}. Line: ${lines[i]}`);
            continue;
        }
        let row = {};
        headers.forEach((header, index) => row[header] = values[index]);
        
        if (row["生産順番"] && parseInt(row["生産順番"]) > 0) { 
            let formattedRow = {
                "生産順番": row["生産順番"],
                "作業時間": row["作業時間"],
                "生産数": row["生産数"],
                "幅": row["幅"],
                "型番": row["型番"],
                "人員数": row["人員数"],
                "加工条件管理番号": row["加工条件管理番号"],
                "品番": row["品番"],
                "納期": row["納期"],
                "材料品番": row["材料品番"],
                "作業日": row["作業日"],
                "材料背番号": row["ラベル品番"], 
            };
            data.push(formattedRow);
        }
    }

    if (data.length === 0) {
        alert("有効なデータ行が見つかりませんでした。「生産順番」が0より大きいことを確認してください。");
        document.getElementById("previewTable").style.display = "none";
        document.getElementById("insertButton").style.display = "none";
        return;
    }
    displayTable(data);
    window.filteredData = data; 
}

function displayTable(data) {
    const table = document.getElementById("previewTable");
    table.innerHTML = ""; 
    
    if (!data || data.length === 0) {
        table.style.display = "none";
        document.getElementById("insertButton").style.display = "none";
        return;
    }
    
    table.style.display = "table";
    
    let header = table.createTHead();
    let headerRow = header.insertRow();
    Object.keys(data[0]).forEach(key => {
        let th = document.createElement("th");
        th.textContent = key;
        headerRow.appendChild(th);
    });

    let tbody = table.createTBody();
    data.forEach(rowData => {
        let rowElement = tbody.insertRow();
        Object.values(rowData).forEach(value => {
            let cell = rowElement.insertCell();
            cell.textContent = value;
        });
    });
    
    document.getElementById("insertButton").style.display = "block";
}

async function insertData() {
    if (!window.filteredData || window.filteredData.length === 0) {
        alert("挿入するデータがありません。");
        return;
    }

    const insertButton = document.getElementById("insertButton");
    insertButton.disabled = true;
    insertButton.textContent = "挿入中...";

    try {
        const response = await fetch(`${serverURL}/queries`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                dbName: "submittedDB",
                collectionName: "materialRequestDB",
                insertData: window.filteredData 
            })
        });

        const result = await response.json();
        if (response.ok && (result.insertedCount || result.insertedId)) {
             const count = result.insertedCount || (result.insertedId ? 1 : 0);
            alert(`データが正常に挿入されました: ${count} 件`);
            document.getElementById('csvFile').value = ''; 
            document.getElementById("previewTable").style.display = "none";
            document.getElementById("insertButton").style.display = "none";
            window.filteredData = [];

        } else {
            alert(`データの挿入に失敗しました: ${result.message || result.error || '不明なエラー'}`);
        }
    } catch (error) {
        alert("サーバーエラー: データの挿入に失敗しました。");
        console.error("Error inserting data:", error);
    } finally {
        insertButton.disabled = false;
        insertButton.textContent = "データを挿入";
    }
}


// --- EDIT FUNCTIONALITY ---
document.addEventListener('DOMContentLoaded', () => {
    const fetchByNokiButton = document.getElementById('fetchByNokiButton');
    const nokiDateCalendarInput = document.getElementById('nokiDateCalendarInput'); 
    const nokiDateInput = document.getElementById('nokiDateInput'); 
    
    const nokiResultsTableHost = document.getElementById('nokiResultsTableHost'); 
    const noNokiResults = document.getElementById('noNokiResults');
    
    const editSidebar = document.getElementById('editSidebar');
    const closeEditSidebarBtn = document.getElementById('closeEditSidebarBtn');
    const editFormContainer = document.getElementById('editFormContainer');
    const editRecordIdInput = document.getElementById('editRecordId');

    const sidebarEditButton = document.getElementById('sidebarEditButton');
    const sidebarSaveButton = document.getElementById('sidebarSaveButton');
    const sidebarCancelButton = document.getElementById('sidebarCancelButton');

    let currentNokiRecords = []; 
    let originalRecordData = null; 

    // Fields that will be displayed in the sidebar and results table
    const editableFields = [ 
        "生産順番", "作業時間", "生産数", "幅", "型番",
        "人員数", "加工条件管理番号", "品番", "納期",
        "材料品番", "作業日", "材料背番号"
    ];

    // Calendar Input Logic
    if (nokiDateCalendarInput) {
        nokiDateCalendarInput.addEventListener('change', function() {
            if (this.value) { 
                const dateParts = this.value.split('-');
                if (dateParts.length === 3) {
                    const year = dateParts[0].slice(-2); 
                    const month = dateParts[1];         
                    const day = dateParts[2];           
                    nokiDateInput.value = `${year}${month}${day}`;
                } else {
                    nokiDateInput.value = ''; 
                }
            } else {
                nokiDateInput.value = '';
            }
        });
    }

    if (fetchByNokiButton) {
        fetchByNokiButton.addEventListener('click', async () => {
            const sagyoubiYYMMDD = nokiDateInput.value.trim(); 
            if (!sagyoubiYYMMDD) {
                alert("カレンダーから作業日を選択するか、YYMMDD形式で入力してください。");
                return;
            }
            if (!/^\d{6}$/.test(sagyoubiYYMMDD)) {
                 alert("作業日はYYMMDD形式である必要があります。");
                 return;
            }
            await fetchRecordsBySagyoubi(sagyoubiYYMMDD); // Changed function name
        });
    }

    async function fetchRecordsBySagyoubi(sagyoubiYYMMDD) { // Changed function name
        nokiResultsTableHost.innerHTML = ''; 
        noNokiResults.style.display = 'none';
        currentNokiRecords = [];

        const loadingP = document.createElement('p');
        loadingP.textContent = '検索中...';
        loadingP.style.color = '#ffffff'; 
        nokiResultsTableHost.appendChild(loadingP);

        try {
            const response = await fetch(`${serverURL}/queries`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    dbName: "submittedDB",
                    collectionName: "materialRequestDB", 
                    query: { "作業日": sagyoubiYYMMDD } // Search by "作業日"
                })
            });
            
            nokiResultsTableHost.innerHTML = ''; 

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.error || `サーバーエラー: ${response.status}`);
            }

            const records = await response.json();
            currentNokiRecords = records; 

            if (records.length === 0) {
                noNokiResults.style.display = 'block';
            } else {
                displayNokiResultsInTable(records); 
            }
        } catch (error) {
            nokiResultsTableHost.innerHTML = ''; 
            console.error("Error fetching records by 作業日:", error); // Updated log
            alert(`データの取得に失敗しました: ${error.message}`);
            noNokiResults.style.display = 'block';
        }
    }

    function displayNokiResultsInTable(records) {
        nokiResultsTableHost.innerHTML = ''; 
        noNokiResults.style.display = 'none';

        const table = document.createElement('table');
        table.id = 'nokiResultsTable';
        
        const headersToDisplay = editableFields; 

        let thead = table.createTHead();
        let headerRow = thead.insertRow();
        headersToDisplay.forEach(headerText => {
            let th = document.createElement('th');
            th.textContent = headerText;
            headerRow.appendChild(th);
        });

        let tbody = table.createTBody();
        records.forEach(record => {
            let row = tbody.insertRow();
            row.dataset.recordId = record._id;
            row.addEventListener('click', () => openEditSidebar(record._id));
            
            headersToDisplay.forEach(headerKey => {
                let cell = row.insertCell();
                cell.textContent = record[headerKey] !== undefined && record[headerKey] !== null ? record[headerKey] : '';
            });
        });
        nokiResultsTableHost.appendChild(table);
    }

    // --- Sidebar logic ---
    function openEditSidebar(recordId) {
        const record = currentNokiRecords.find(r => r._id === recordId);
        if (!record) return;

        originalRecordData = { ...record }; 
        editFormContainer.innerHTML = ''; 
        editRecordIdInput.value = record._id;

        for (const key of editableFields) {
            const value = record[key] !== undefined && record[key] !== null ? record[key] : '';
            const group = document.createElement('div');
            group.className = 'form-group-sidebar';
            const label = document.createElement('label');
            label.htmlFor = `edit_${key}`;
            label.textContent = `${key}:`;
            const input = document.createElement('input');
            // Define which fields should be numeric
            const isNumericField = ["生産順番", "作業時間", "生産数", "人員数"].includes(key);
            input.type = isNumericField ? 'number' : 'text';
            input.id = `edit_${key}`;
            input.name = key;
            input.value = value;
            input.readOnly = true; // Initially read-only
            group.appendChild(label);
            group.appendChild(input);
            editFormContainer.appendChild(group);
        }
        
        sidebarEditButton.style.display = 'inline-block';
        sidebarSaveButton.style.display = 'none';
        sidebarCancelButton.style.display = 'none';
        editSidebar.style.width = '400px'; // Or your desired width
    }

    if (closeEditSidebarBtn) {
        closeEditSidebarBtn.addEventListener('click', closeAndResetSidebar);
    }
    
    function closeAndResetSidebar() {
        editSidebar.style.width = '0';
        originalRecordData = null;
        // Inputs will be reset to readonly when sidebar is opened next time or on cancel/save
    }

    if (sidebarEditButton) {
        sidebarEditButton.addEventListener('click', () => {
            const formInputs = editFormContainer.querySelectorAll('input');
            formInputs.forEach(input => input.readOnly = false); // Make inputs editable
            sidebarEditButton.style.display = 'none';          
            sidebarSaveButton.style.display = 'inline-block'; 
            sidebarCancelButton.style.display = 'inline-block';
        });
    }

    if (sidebarCancelButton) {
        sidebarCancelButton.addEventListener('click', () => {
            if (originalRecordData) { 
                const formInputs = editFormContainer.querySelectorAll('input');
                formInputs.forEach(input => {
                    input.value = originalRecordData[input.name] !== undefined && originalRecordData[input.name] !== null ? originalRecordData[input.name] : '';
                    input.readOnly = true; // Make inputs readonly again
                });
            }
            sidebarEditButton.style.display = 'inline-block'; 
            sidebarSaveButton.style.display = 'none';      
            sidebarCancelButton.style.display = 'none';   
        });
    }

    if (sidebarSaveButton) {
        sidebarSaveButton.addEventListener('click', async () => {
            sidebarSaveButton.disabled = true;
            sidebarSaveButton.textContent = "保存中...";

            const recordId = editRecordIdInput.value;
            const updatedData = {};
            const formInputs = editFormContainer.querySelectorAll('input');
            
            formInputs.forEach(input => {
                // Refined: Added "作業時間" to numeric fields
                const isNumericField = ["生産順番", "作業時間", "生産数", "人員数"].includes(input.name);
                if (isNumericField) {
                    // Ensure empty strings for numbers become null or handle as 0 if preferred
                    updatedData[input.name] = input.value.trim() === '' ? null : Number(input.value);
                } else {
                    updatedData[input.name] = input.value;
                }
            });

            try {
                const usernameForUpdate = "CSVEditUser"; // Placeholder

                const response = await fetch(`${serverURL}/queries`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        dbName: "submittedDB",
                        collectionName: "materialRequestDB",
                        query: { "_id": recordId }, 
                        update: { "$set": updatedData },
                        username: usernameForUpdate 
                    })
                });

                if (!response.ok) {
                    const errorResult = await response.json();
                    throw new Error(errorResult.message || errorResult.error || `サーバーエラー: ${response.status}`);
                }

                const result = await response.json();
                if (result.modifiedCount > 0) {
                    alert("データが正常に更新されました。");
                    closeAndResetSidebar();
                    if (nokiDateInput.value) { // Refresh list if a date was searched
                        await fetchRecordsBySagyoubi(nokiDateInput.value.trim()); // Use the correct function
                    }
                } else if (result.matchedCount > 0 && result.modifiedCount === 0) {
                    alert("変更はありませんでした。");
                     // Still reset sidebar to view mode
                    const allFormInputs = editFormContainer.querySelectorAll('input');
                    allFormInputs.forEach(input => input.readOnly = true);
                    sidebarEditButton.style.display = 'inline-block';
                    sidebarSaveButton.style.display = 'none';
                    sidebarCancelButton.style.display = 'none';
                } else {
                     alert("更新対象のデータが見つかりませんでした。");
                }
            } catch (error) {
                console.log("Error updating record:", error);
                alert(`データの更新に失敗しました: ${error.message}`);
            } finally {
                sidebarSaveButton.disabled = false;
                sidebarSaveButton.textContent = "保存";
                // Ensure buttons are reset even if no changes were made or error occurred,
                // but only if sidebar isn't closed by success
                if (editSidebar.style.width !== '0px') { // Check if sidebar is still open
                    const allFormInputs = editFormContainer.querySelectorAll('input');
                    allFormInputs.forEach(input => input.readOnly = true);
                    sidebarEditButton.style.display = 'inline-block';
                    sidebarSaveButton.style.display = 'none';
                    sidebarCancelButton.style.display = 'none';
                }
            }
        });
    }
}); // End of DOMContentLoaded for edit functionality
