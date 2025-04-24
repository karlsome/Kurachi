const serverURL = "https://kurachi.onrender.com";
//const serverURL = "http://localhost:3000";
function handleFile() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    if (!file) {
        alert("ファイルを選択してください。");
        return;
    }
    
    const reader = new FileReader();
    reader.readAsText(file, "Shift_JIS");
    reader.onload = function(event) {
        const csvData = event.target.result;
        processCSV(csvData);
    };
}

function processCSV(csvData) {
    const lines = csvData.split("\n");
    const headers = lines[0].split(",").map(header => header.trim());
    let data = [];

    for (let i = 1; i < lines.length; i++) {
        let values = lines[i].split(",").map(val => val.trim());
        if (values.length !== headers.length) continue;
        let row = {};
        headers.forEach((header, index) => row[header] = values[index]);
        
        // Ensure only relevant fields are included and "生産順番" > 0
        if (parseInt(row["生産順番"]) > 0) { 
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

    displayTable(data);
    window.filteredData = data;
}

function displayTable(data) {
    const table = document.getElementById("previewTable");
    table.innerHTML = "";
    
    if (data.length === 0) {
        alert("データがありません。");
        return;
    }
    
    table.style.display = "table";
    
    let headerRow = table.insertRow();
    Object.keys(data[0]).forEach(header => {
        let cell = headerRow.insertCell();
        cell.textContent = header;
    });
    
    data.forEach(row => {
        let rowElement = table.insertRow();
        Object.values(row).forEach(value => {
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

    try {
        const response = await fetch(`${serverURL}/queries`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                dbName: "submittedDB",
                collectionName: "materialRequestDB",
                insertData: window.filteredData // Corrected structure
            })
        });

        const result = await response.json();
        if (result.insertedCount) {
            alert(`データが正常に挿入されました: ${result.insertedCount} 件`);
        } else {
            alert("データの挿入に失敗しました。");
        }
    } catch (error) {
        alert("サーバーエラー: データの挿入に失敗しました。");
        console.error("Error inserting data:", error);
    }
}